"""Production blank 05: assistant preview, bind, apply, undo, partial completion, publish/offline."""
import json,os,socket,subprocess,tempfile,threading,time
from pathlib import Path
from urllib.request import urlopen
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
from studio_scene05_ui_check import Source
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"works/scada-agent-acceptance"
OUT.mkdir(parents=True,exist_ok=True)

def exercise(page,base,url,browser):
    errors=[];page.on("pageerror",lambda e:errors.append(str(e)))
    page.goto(base);expect(page.locator(".screen-empty")).to_be_visible()
    assert not page.request.get(base+"/api/draft").json()["nodes"]
    page.get_by_role("button",name="数据连接",exact=True).click()
    dialog=page.get_by_role("dialog")
    dialog.get_by_label("来源",exact=True).select_option("rest")
    dialog.get_by_label("接口 URL",exact=True).fill(url)
    dialog.get_by_label("刷新周期（ms）",exact=True).fill("250")
    dialog.get_by_role("button",name="读取样本",exact=True).click()
    dialog.get_by_role("button",name="从桥接点表生成映射",exact=True).click()
    dialog.get_by_role("button",name="应用数据配置",exact=True).click()
    page.get_by_label("画面主题",exact=True).select_option("cockpit-dark")
    def save():
        with page.expect_response(lambda r:r.url==base+"/api/draft" and r.request.method=="POST") as saved:
            page.get_by_role("button",name="保存草稿",exact=True).click()
        assert saved.value.ok,saved.value.text()
        return page.request.get(base+"/api/draft").json()
    blank=save()
    def open_assistant():
        entry=page.locator(".studio-header").get_by_role("button",name="AI 画图",exact=True)
        if entry.get_attribute("aria-expanded")!="true":entry.click()
        panel=page.get_by_role("region",name="辅助设计")
        if panel.locator(".assistant-guided").get_attribute("open") is None:panel.locator(".assistant-guided summary").click()
        return panel
    panel=open_assistant()
    panel.get_by_label("05 泵站规模",exact=True).select_option("4")
    panel.get_by_role("button",name="生成泵站预演",exact=True).click()
    expect(panel.get_by_role("status")).to_contain_text("34 个槽位待选点")
    expect(page.get_by_role("button",name="保存草稿",exact=True)).to_be_disabled()
    expect(page.get_by_role("button",name="预览发布",exact=True)).to_be_disabled()
    panel.get_by_role("button",name="确认应用到画布",exact=True).click()
    partial=save();assert all(not n["bindings"] for n in partial["nodes"]+partial["pipes"])
    page.get_by_role("button",name="撤销",exact=True).click();assert save()==blank
    panel=open_assistant();panel.get_by_label("05 泵站规模",exact=True).select_option("4")
    panel.get_by_role("button",name="使用当前点表（33 个）",exact=True).click()
    panel.get_by_role("button",name="生成泵站预演",exact=True).click()
    expect(page.locator(".x6-node")).to_have_count(18)
    expect(page.locator(".x6-edge")).to_have_count(20)
    expect(panel.get_by_role("status")).to_contain_text("0 个槽位待选点")
    assert page.request.get(base+"/api/draft").json()==blank
    page.screenshot(path=str(OUT/"01-preview.png"))
    panel.get_by_role("button",name="取消预演",exact=True).click()
    expect(page.locator(".x6-node")).to_have_count(0)
    panel.get_by_role("button",name="生成泵站预演",exact=True).click()
    # Editing one proposal binding re-renders the preview, without touching the draft.
    panel.get_by_label("辅助绑定 new-P-04 run",exact=True).select_option("")
    expect(panel.get_by_role("status")).to_contain_text("1 个槽位待选点")
    panel.get_by_label("辅助绑定 new-P-04 run",exact=True).select_option("P-04.run")
    expect(panel.get_by_role("status")).to_contain_text("0 个槽位待选点")
    panel.get_by_role("button",name="确认应用到画布",exact=True).click()
    applied=save();assert len(applied["nodes"])==18 and len(applied["pipes"])==20
    assert sum(len(n["bindings"]) for n in applied["nodes"]+applied["pipes"])==34
    page.get_by_role("button",name="撤销",exact=True).click()
    expect(page.locator(".x6-node")).to_have_count(0)
    assert save()==blank
    page.get_by_role("button",name="重做",exact=True).click()
    expect(page.locator(".x6-node")).to_have_count(18)
    restored=save();assert restored==applied
    # Existing geometry and bindings survive a supplementary design batch.
    pump=next(n for n in applied["nodes"] if n["title"]=="P-04")
    page.get_by_role("tab",name="图层",exact=False).click()
    page.locator(f'[data-layer="{pump["id"]}"]').click()
    page.keyboard.press("Delete")
    missing=save();assert len(missing["nodes"])==17
    panel=open_assistant();panel.get_by_label("05 泵站规模",exact=True).select_option("4")
    panel.get_by_role("button",name="使用当前点表（33 个）",exact=True).click()
    panel.get_by_role("button",name="生成泵站预演",exact=True).click()
    expect(page.locator(".x6-node")).to_have_count(18)
    panel.get_by_role("button",name="确认应用到画布",exact=True).click()
    completed=save()
    for n in missing["nodes"]:assert next(x for x in completed["nodes"] if x["id"]==n["id"])==n
    assert len(completed["pipes"])==20
    # The panel rejects an outdated batch after a real draft edit.
    panel=open_assistant()
    panel.locator("summary").filter(has_text="导入命令批次").click()
    panel.get_by_label("辅助设计命令").fill(json.dumps({"id":"stale","pageId":"main","baseRevision":"old","operations":[{"op":"moveNode","id":completed["nodes"][0]["id"],"x":10,"y":10}]}))
    panel.get_by_role("button",name="校验并预演命令",exact=True).click()
    expect(panel.get_by_role("alert")).to_contain_text("画面已变化")
    panel.get_by_role("button",name="关闭助手",exact=True).click()
    assert save()==completed
    page.reload();expect(page.locator(".x6-node")).to_have_count(18)
    page.get_by_role("button",name="预览发布",exact=True).click()
    page.get_by_role("button",name="发布",exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("已发布")
    page.goto(base+"/view")
    expect(page.get_by_text("P-01",exact=True)).to_be_visible()
    expect(page.get_by_text("3.24 m",exact=True)).to_be_visible()
    expect(page.get_by_text("684.00 m³/h",exact=True)).to_be_visible()
    Source.mode="bad"
    expect(page.locator('[data-state="未知"]')).to_have_count(4)
    expect(page.locator(".screen-pipe-flow")).to_have_count(0)
    Source.mode="normal"
    expect(page.locator('[data-state="运行"]')).to_have_count(2)
    page.screenshot(path=str(OUT/"02-published.png"))
    page.set_viewport_size({"width":1366,"height":768});page.screenshot(path=str(OUT/"03-published-1366.png"))
    page.goto(base);page.locator(".project-menu summary").click()
    with page.expect_download() as dl:page.get_by_role("button",name="导出离线演示",exact=True).click()
    offline=OUT/"scene05-agent-offline.html";dl.value.save_as(offline)
    local=browser.new_page();requests=[]
    local.on("request",lambda r:requests.append(r.url) if r.url.startswith("http") else None)
    local.on("pageerror",lambda e:errors.append(str(e)))
    local.goto(offline.as_uri());expect(local.locator(".x6-node")).to_have_count(18);expect(local.locator(".x6-edge")).to_have_count(20)
    assert not errors and not requests,(errors,requests);local.close()
    # Portable evidence uses clearly marked local simulated data after fixture exit.
    completed["source"]={"kind":"json","data":json.dumps({"points":Source.points()},ensure_ascii=False),"url":"","pollMs":1000,"maxAgeMs":10000,"demo":True}
    for m in completed["mappings"]:m["timePath"]="";m["fallbackTimePath"]=""
    (OUT/"scene05-agent-project.json").write_text(json.dumps(completed,ensure_ascii=False,indent=2),"utf-8")
    result={"blankNodes":0,"nodes":18,"pipes":20,"bindings":34,"verified":["draw first with pending bindings","preview leaves saved draft unchanged","cancel","edit proposed binding","apply","single undo and redo","supplement missing pump","stale rejection","save and reload","publish","bad quality and recovery","two sizes","offline"],"httpRequests":requests,"errors":errors}
    (OUT/"results.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),"utf-8");print(json.dumps(result,ensure_ascii=False))

def main():
    fixture=ThreadingHTTPServer(("127.0.0.1",0),Source);threading.Thread(target=fixture.serve_forever,daemon=True).start()
    with socket.socket() as s:s.bind(("127.0.0.1",0));port=s.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix="screen-agent-") as temp:
        server=subprocess.Popen(["node","apps/scada-designer/server.mjs"],cwd=ROOT,env={**os.environ,"STUDIO_PORT":str(port),"STUDIO_DATA_DIR":temp},creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        try:
            for _ in range(80):
                try:urlopen(f"http://127.0.0.1:{port}/api/draft",timeout=1).close();break
                except OSError:time.sleep(.1)
            with sync_playwright() as p:
                browser=p.chromium.launch();page=browser.new_page(viewport={"width":1920,"height":1080});page.set_default_timeout(12000)
                try:exercise(page,f"http://127.0.0.1:{port}",f"http://127.0.0.1:{fixture.server_port}/snapshot",browser)
                except Exception:page.screenshot(path=str(OUT/"failure.png"));raise
                finally:browser.close()
        finally:server.terminate();server.wait(timeout=15);fixture.shutdown()

if __name__=="__main__":main()
