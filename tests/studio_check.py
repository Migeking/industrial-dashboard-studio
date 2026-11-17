"""Studio browser regression in an isolated project. Run with python -X utf8."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

def exercise(page, base, folder):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base)
    expect(page.locator(".number").first).to_have_text("820.00")
    page.get_by_label("切换模板").select_option("05")
    expect(page.locator(".number").first).to_have_text("3.82")
    panel = page.locator(".panel").first
    title = panel.locator("h3").bounding_box()
    start = panel.bounding_box()
    page.mouse.move(title["x"]+10, title["y"]+8)
    page.mouse.down()
    page.mouse.move(title["x"]+52, title["y"]+28, steps=5)
    page.mouse.up()
    assert abs(panel.bounding_box()["x"]-start["x"]-42)<2
    handle = panel.locator(".handle").bounding_box()
    page.mouse.move(handle["x"]+4,handle["y"]+4)
    page.mouse.down()
    page.mouse.move(handle["x"]+34,handle["y"]+20,steps=4)
    page.mouse.up()
    assert panel.bounding_box()["width"]>start["width"]+20
    page.get_by_role("button",name="复制",exact=True).click()
    expect(page.locator(".panel")).to_have_count(8)
    page.get_by_role("button",name="撤销",exact=True).click()
    expect(page.locator(".panel")).to_have_count(7)
    page.get_by_role("button",name="数据连接",exact=True).click()
    data = json.loads(page.get_by_label("样本内容").input_value())
    data["otherLevel"]=0
    page.get_by_label("样本内容").fill(json.dumps(data))
    page.get_by_role("button",name="读取样本").click()
    page.get_by_label("测点",exact=True).select_option("3")
    page.get_by_label("数值路径",exact=False).fill("otherLevel")
    page.get_by_role("button",name="应用数据配置").click()
    expect(page.locator(".number").first).to_have_text("0.00")
    page.get_by_role("button",name="发布",exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("已发布")
    page.reload()
    expect(page.locator(".number").first).to_have_text("0.00")
    page.get_by_label("名称",exact=True).fill("第二版")
    page.get_by_role("button",name="保存草稿").click()
    assert page.request.get(base+"/api/published").json()["title"]!="第二版"
    page.get_by_role("button",name="发布",exact=True).click()
    page.get_by_role("button",name="版本",exact=True).click()
    page.get_by_role("button",name="回退至此版").click()
    expect(page.locator(".dialog button:disabled")).to_have_count(1)
    page.get_by_role("button",name="关闭",exact=True).click()
    page.goto(base+"/view")
    expect(page.locator("h1")).to_have_text("污泥回流泵站监视")
    for w,h in [(1366,768),(1920,1080),(3840,2160)]:
        page.set_viewport_size({"width":w,"height":h})
        box=page.locator(".board").bounding_box()
        page.wait_for_function("Math.abs(document.querySelector('.board').getBoundingClientRect().width - Math.min(innerWidth,innerHeight*16/9))<2")
    page.goto(base)
    page.get_by_label("切换模板").select_option("30")
    expect(page.locator(".host canvas")).to_have_count(1,timeout=20000)
    page.get_by_role("button",name="导出离线演示").wait_for()
    with page.expect_download() as result:
        page.get_by_role("button",name="导出离线演示").click()
    dest=Path(folder)/"offline.html"
    result.value.save_as(dest)
    requests=[]
    page.on("request",lambda r: requests.append(r.url) if r.url.startswith("http") else None)
    page.goto(dest.as_uri())
    expect(page.locator(".host canvas")).to_have_count(1,timeout=20000)
    expect(page.locator(".board-title small")).to_have_text("离线演示快照")
    assert not requests and not errors,(requests,errors)

def source_recovery(page, base):
    """Exercise a shared REST loop, missing values, stale data and WebSocket reconnect."""
    page.goto(base)
    draft=page.request.get(base+"/api/draft").json()
    draft["source"].update(kind="rest",url="http://127.0.0.1:1/test",pollMs=250,maxAgeMs=1500)
    draft["mappings"]=[dict(id="level",kind="number",label="Level",path="v",timePath="time",scale=1,offset=0,precision=1)]
    n=dict(id="a",type="kpi",binding="level",title="A",x=10,y=130,w=400,h=220)
    draft["nodes"]=[n,{**n,"id":"b","x":450}]
    assert page.request.post(base+"/api/draft",data=draft).ok
    mode=["good"]; calls=[]
    def rest(route):
        calls.append(time.monotonic())
        if mode[0]=="offline":
            route.fulfill(status=503,json={"error":"fixture unavailable"})
        else:
            route.fulfill(json={"v":None if mode[0]=="missing" else 0,
                                "time":int(1000*time.time())-(5000 if mode[0]=="stale" else 0)})
    page.route("**/api/sample",rest)
    page.reload()
    expect(page.locator(".number").first).to_have_text("0.0")
    page.wait_for_timeout(850)
    assert 2<=len(calls)<=5,len(calls)
    for value,label in [("stale","过期"),("missing","无效"),("offline","离线"),("good","有效")]:
        mode[0]=value
        expect(page.locator(".widget footer").last).to_contain_text(label)
        expect(page.locator(".number").first).to_have_text("0.0" if value=="good" else "—")
    draft["source"].update(kind="ws",url="ws://127.0.0.1:19473/feed")
    ws=[]
    def opened(route):
        ws.append(route)
        route.send(json.dumps({"v":len(ws),"time":int(time.time()*1000)}))
    page.route_web_socket("**/feed",opened)
    assert page.request.post(base+"/api/draft",data=draft).ok
    page.reload()
    expect(page.locator(".number").first).to_have_text("1.0")
    ws[0].close(code=1000)
    expect(page.locator(".number").first).to_have_text("2.0")
    expect(page.locator(".widget footer").first).to_contain_text("过期")
    ws[-1].send(json.dumps({"v":0,"time":int(time.time()*1000)}))
    expect(page.locator(".number").last).to_have_text("0.0")
    for i in range(6):
        draft["title"]="revision "+str(i)
        assert page.request.post(base+"/api/publish",data=draft).ok
    info=page.request.get(base+"/api/versions").json()
    assert len(info["versions"])==5 and info["versions"][-1]["title"]=="revision 1"
    assert page.request.post(base+"/api/publish",data={**draft,"schemaVersion":2}).status==400
    assert page.request.get(base+"/api/published").json()["title"]=="revision 5"

def main():
    with tempfile.TemporaryDirectory() as folder:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            port=sock.getsockname()[1]
        base=f"http://127.0.0.1:{port}"
        proc=subprocess.Popen(["node","apps/scada-designer/server.mjs"],cwd=ROOT,
                              env={**os.environ,"STUDIO_PORT":str(port),"STUDIO_DATA_DIR":folder})
        try:
            for _ in range(50):
                try:
                    urlopen(base,timeout=1).close()
                    break
                except OSError:
                    time.sleep(.1)
            with sync_playwright() as pw:
                browser=pw.chromium.launch(executable_path=CHROME if Path(CHROME).exists() else None)
                exercise(browser.new_page(viewport={"width":1440,"height":900}),base,folder)
                source_recovery(browser.new_page(),base)
                browser.close()
        finally:
            proc.terminate()
            proc.wait()
    print("PASS: editor, mapping, save, publish, rollback, three viewports, campus and offline viewer")

if __name__=="__main__":
    main()
