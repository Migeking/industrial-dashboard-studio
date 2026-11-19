"""Model transport fixture, NOT real model inference: the production AI conversation UI."""
import json,os,socket,subprocess,tempfile,threading,time
from pathlib import Path
from urllib.request import urlopen
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"works/scada-model-acceptance";OUT.mkdir(parents=True,exist_ok=True)

class Model(BaseHTTPRequestHandler):
    calls=[]
    def log_message(self,*args):pass
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers["Content-Length"])));Model.calls.append(body)
        request=next(json.loads(m["content"]) for m in reversed(body["messages"]) if m["content"].startswith('{"request":'))
        prompt=request["request"];context=request["context"]
        if "取消" in prompt:time.sleep(2)
        if "接口失败" in prompt:
            self.send_response(503);self.end_headers();return
        nodes=[{"key":"mix","symbol":"tank","title":"TK101 快速混合池","x":400,"y":300,"w":220,"h":300,"bindings":{}},{"key":"recycle","symbol":"pump","title":"P301 污泥回流泵","x":1000,"y":700,"w":170,"h":160,"bindings":{}}]
        links=[{"from":"recycle","to":"mix","fromPort":"left","toPort":"bottom","title":"回流管","vertices":[{"x":850,"y":780},{"x":510,"y":780}]}]
        if "绑定" in prompt:
            nodes=context["nodes"];links=[]
            for n in nodes:n["bindings"]={"value":"TK101.level"} if n["symbol"]=="tank" else {"run":"P301.run","fault":"P301.fault","value":"P301.hz"}
        if "非法点" in prompt:nodes[0]["bindings"]={"value":"NOT-ALLOWED"}
        result={"summary":"模拟模型响应："+("绑定现有测点" if "绑定" in prompt else "补图与回流管道"),"questions":[],"nodes":nodes,"links":links}
        if "澄清" in prompt:result={"summary":"需要明确设备身份","questions":["请给出要补的设备名称"],"nodes":[],"links":[]}
        if "等待期间" in prompt:time.sleep(1)
        content=json.dumps(result,ensure_ascii=False)
        if body.get('stream'):
            half=len(content)//2
            data=('\n'.join(json.dumps({'message':{'content':part},'done':i==1},ensure_ascii=False) for i,part in enumerate([content[:half],content[half:]]))+'\n').encode('utf-8')
        else:data=json.dumps({"message":{"content":content}}).encode()
        try:self.send_response(200);self.send_header("Content-Type","application/json");self.end_headers();self.wfile.write(data)
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass

def main():
    model=ThreadingHTTPServer(("127.0.0.1",0),Model);threading.Thread(target=model.serve_forever,daemon=True).start()
    blank=json.loads(subprocess.check_output(["node","--input-type=module","-e","import {scene13Blank} from './tests/studio_model_fixture.mjs'; console.log(JSON.stringify(scene13Blank()))"],cwd=ROOT))
    with socket.socket() as s:s.bind(("127.0.0.1",0));port=s.getsockname()[1]
    base=f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="studio-model-ui-") as temp:
        Path(temp,"project.json").write_text(json.dumps({"draft":blank,"versions":[],"active":None}),"utf-8")
        server=subprocess.Popen(["node","apps/scada-designer/server.mjs"],cwd=ROOT,env={**os.environ,"STUDIO_PORT":str(port),"STUDIO_DATA_DIR":temp},creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        try:
            for _ in range(100):
                try:urlopen(base+"/api/draft",timeout=1).close();break
                except OSError:time.sleep(.1)
            with sync_playwright() as p:
                browser=p.chromium.launch();page=browser.new_page(viewport={"width":1920,"height":1080});page.set_default_timeout(12000)
                errors=[];page.on("pageerror",lambda e:errors.append(str(e)))
                try:
                    page.goto(base);entry=page.get_by_role("button",name="AI 画图",exact=True);expect(entry).to_be_visible();entry.click()
                    panel=page.get_by_role("region",name="辅助设计")
                    expect(panel.get_by_label("设计需求",exact=True)).to_be_visible()
                    panel.locator(".assistant-model summary").click();panel.get_by_label("模型接口地址",exact=True).fill(f"http://127.0.0.1:{model.server_port}/v1")
                    panel.get_by_role("button",name="保存模型设置",exact=True).click();expect(panel.get_by_text("模型设置已保存到本机",exact=True)).to_be_visible()
                    panel.locator(".assistant-model summary").click()
                    page.screenshot(path=str(OUT/"01-ai-entry.png"))
                    def save():
                        with page.expect_response(lambda r:r.url==base+"/api/draft" and r.request.method=="POST") as response:page.get_by_role("button",name="保存草稿",exact=True).click()
                        assert response.value.ok,response.value.text()
                        return page.request.get(base+"/api/draft").json()
                    def ask(text):
                        panel.get_by_label("设计需求",exact=True).fill(text)
                        with page.expect_response(lambda r:r.url==base+"/api/assistant/propose") as response:panel.get_by_role("button",name="生成设计预演",exact=True).click()
                        return response.value
                    assert ask("画一个混合池和回流泵，连接回流管道").ok
                    expect(page.locator(".x6-node")).to_have_count(2);expect(page.locator(".x6-edge")).to_have_count(1)
                    expect(panel.get_by_role("status")).to_contain_text("2 个槽位待选点")
                    panel.locator('.assistant-connections summary').click()
                    expect(panel.locator('.assistant-connections')).to_contain_text('P301 污泥回流泵 · 左口 → TK101 快速混合池 · 底部')
                    assert page.request.get(base+"/api/draft").json()==blank
                    expect(page.get_by_role("button",name="保存草稿",exact=True)).to_be_disabled()
                    page.screenshot(path=str(OUT/"02-model-fixture-preview.png"))
                    panel.get_by_role("button",name="确认应用到画布",exact=True).click();first=save()
                    expect(panel.get_by_label("设计需求",exact=True)).to_be_visible()
                    page.get_by_role("button",name="撤销",exact=True).click();assert save()==blank
                    page.get_by_role("button",name="重做",exact=True).click();assert save()==first
                    # Close/reopen retains conversation. Allow real current point IDs before binding.
                    panel.get_by_role("button",name="关闭助手",exact=True).click();entry.click()
                    expect(panel.locator(".assistant-chat")).to_contain_text("模拟模型响应")
                    panel.get_by_role("button",name="使用当前点表（25 个）",exact=True).click()
                    assert ask("将允许点表绑定到已有设备，不新增设备").ok
                    expect(panel.get_by_role("status")).to_contain_text("0 个槽位待选点")
                    assert page.request.get(base+"/api/draft").json()==first
                    panel.get_by_role("button",name="确认应用到画布",exact=True).click();bound=save()
                    assert len(bound["nodes"])==2 and sum(len(n["bindings"]) for n in bound["nodes"])==4
                    assert [n["id"] for n in first["nodes"]]==[n["id"] for n in bound["nodes"]]
                    page.get_by_role("button",name="撤销",exact=True).click();assert save()==first
                    page.get_by_role("button",name="重做",exact=True).click();assert save()==bound
                    panel.get_by_label("设计需求",exact=True).fill("等待期间先不要应用")
                    with page.expect_response(lambda r:r.url==base+"/api/assistant/propose"):
                        panel.get_by_role("button",name="生成设计预演",exact=True).click()
                        page.get_by_role("button",name="撤销",exact=True).click()
                    expect(panel.get_by_role("alert")).to_contain_text("生成期间画面已变化")
                    assert save()==first
                    page.get_by_role("button",name="重做",exact=True).click();assert save()==bound
                    assert ask("先澄清缺少信息的需求").ok
                    expect(panel.locator(".assistant-chat")).to_contain_text("请给出要补的设备名称")
                    expect(panel.get_by_role("button",name="确认应用到画布",exact=True)).to_have_count(0)
                    bad=ask("非法点");assert not bad.ok;expect(panel.get_by_role("alert")).to_contain_text("3 次校验仍未通过")
                    assert save()==bound
                    bad=ask("本批只补7个图元");assert not bad.ok;expect(panel.get_by_role("alert")).to_contain_text("新增 7 个图元")
                    assert save()==bound
                    bad=ask("本批只新增12条管道");assert not bad.ok;expect(panel.get_by_role("alert")).to_contain_text("新增 12 条管道")
                    assert save()==bound
                    bad=ask("接口失败");assert bad.status==400;expect(panel.get_by_role("alert")).to_contain_text("HTTP 503")
                    assert panel.get_by_label("设计需求",exact=True).input_value()=="接口失败"
                    # Cancellation does not apply a late result.
                    panel.get_by_label("设计需求",exact=True).fill("取消这一批生成")
                    panel.get_by_role("button",name="生成设计预演",exact=True).click();panel.get_by_role("button",name="取消生成",exact=True).click();page.wait_for_timeout(2400)
                    expect(page.locator(".x6-node")).to_have_count(2);assert save()==bound
                    panel.get_by_role("button",name="关闭助手",exact=True).click()
                    page.get_by_role("button",name="预览发布",exact=True).click();page.get_by_role("button",name="发布",exact=True).click();expect(page.get_by_role("status")).to_contain_text("已发布")
                    page.goto(base+"/view");expect(page.locator(".x6-node")).to_have_count(2);expect(page.locator('[data-state="运行"]')).to_have_count(1)
                    page.set_viewport_size({"width":1366,"height":768});expect(page.locator(".x6-node")).to_have_count(2)
                    page.goto(base);page.locator(".project-menu summary").click()
                    with page.expect_download() as dl:page.get_by_role("button",name="导出离线演示",exact=True).click()
                    artifact=OUT/"model-fixture-offline.html";dl.value.save_as(artifact)
                    requests=[];local=browser.new_page();local.on("request",lambda r:requests.append(r.url) if r.url.startswith("http") else None);local.on("pageerror",lambda e:errors.append(str(e)))
                    local.goto(artifact.as_uri());expect(local.locator(".x6-node")).to_have_count(2);assert not requests;assert not errors,errors
                    assert all(c["format"]["required"]==["summary","questions","nodes","links"] for c in Model.calls)
                    assert all('"source"' not in c["messages"][1]["content"] and '"data"' not in c["messages"][1]["content"] for c in Model.calls)
                    result={"kind":"transport fixture, not live inference","verified":["visible AI entry and natural language input","model configuration saved","preview has no draft writes","apply stays in conversation","atomic undo and redo","conversation retained on reopen","bind existing nodes without duplication","reject unallowed point after bounded repairs","provider failure feedback","cancel ignores late result","publish at two sizes","offline no HTTP","sanitized context"],"errors":errors}
                    (OUT/"ui-fixture-results.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),"utf-8");print(json.dumps(result,ensure_ascii=False))
                except Exception:page.screenshot(path=str(OUT/"ui-failure.png"));raise
                finally:browser.close()
        finally:server.terminate();server.wait(timeout=15);model.shutdown()

if __name__=="__main__":main()
