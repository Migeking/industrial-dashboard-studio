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
from studio_campus_check import campus_flow
from studio_ui import choose_scene, open_data, publish, project_action
from studio_workflow_check import workflow_inspector

ROOT = Path(__file__).resolve().parents[1]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

def load_legacy(page, base, folder, key):
    """Keep exercising genuine V1 documents after the template gallery moves to V2."""
    source="import {legacyTemplate} from './apps/scada-designer/studio/model.mjs';process.stdout.write(JSON.stringify(legacyTemplate('"+key+"')));"
    data=subprocess.check_output(['node','--input-type=module','-e',source],cwd=ROOT)
    file=Path(folder)/('legacy-'+key+'.json')
    file.write_bytes(data)
    page.goto(base)
    menu=page.locator('.project-menu')
    if menu.get_attribute('open') is None:menu.locator('summary').click()
    menu.locator('input[type=file]').set_input_files(file)
    menu.locator('summary').click()
    expect(page.locator('.number').first).to_be_visible()

def exercise(page, base, folder):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    load_legacy(page,base,folder,'01')
    expect(page.locator(".number").first).to_have_text("820.00")
    load_legacy(page,base,folder,'05')
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
    open_data(page)
    data = json.loads(page.get_by_label("样本内容").input_value())
    data["otherLevel"]=0
    page.get_by_label("样本内容").fill(json.dumps(data))
    page.get_by_role("button",name="读取样本").click()
    page.get_by_label("测点",exact=True).select_option("3")
    page.get_by_label("数值路径",exact=False).fill("otherLevel")
    page.get_by_role("button",name="应用数据配置").click()
    expect(page.locator(".number").first).to_have_text("0.00")
    publish(page)
    expect(page.get_by_role("status")).to_contain_text("已发布")
    page.reload()
    expect(page.locator(".number").first).to_have_text("0.00")
    page.get_by_role("button",name="编辑画布",exact=True).click()
    page.get_by_label("名称",exact=True).fill("第二版")
    page.get_by_role("button",name="保存草稿").click()
    assert page.request.get(base+"/api/published").json()["title"]!="第二版"
    publish(page)
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
    choose_scene(page,"30")
    expect(page.locator(".host canvas")).to_have_count(1,timeout=20000)
    with page.expect_download() as result:
        project_action(page,"导出离线演示")
    dest=Path(folder)/"offline.html"
    result.value.save_as(dest)
    requests=[]
    page.on("request",lambda r: requests.append(r.url) if r.url.startswith("http") else None)
    page.goto(dest.as_uri())
    expect(page.locator(".host canvas")).to_have_count(1,timeout=20000)
    expect(page.locator(".board-title small")).to_have_text("离线演示快照")
    expect(page.locator(".board")).to_have_css("width","1920px")
    expect(page.locator(".board")).to_have_css("height","1080px")
    expect(page.locator('link[rel="stylesheet"]')).to_have_count(0)
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

def tag_browser_flow(page, base):
    def browse(route):
        req=route.request.post_data_json
        if not req.get('nodeId'):
            data={'nodes':[{'nodeId':'ns=2;s=Device','label':'设备一','folder':True}], 'nextOffset':None}
        elif req.get('offset'):
            data={'nodes':[{'nodeId':'ns=2;s=P101','label':'P101','kind':'boolean','dataType':'Boolean'}], 'nextOffset':None}
        else:
            data={'nodes':[{'nodeId':'ns=2;s=P001','label':'P001','kind':'boolean','dataType':'Boolean'},{'nodeId':'ns=2;s=P002','label':'P002','kind':'boolean','dataType':'Boolean'}], 'nextOffset':100}
        route.fulfill(json=data)
    page.route('**/api/opcua/browse',browse)
    page.goto(base)
    open_data(page)
    page.get_by_label('来源',exact=True).select_option('opcua')
    page.get_by_role('button',name='连接并浏览',exact=True).click()
    page.get_by_role('button',name='▸ 设备一',exact=True).click()
    page.get_by_label('全选当前标签').check()
    page.get_by_role('button',name='添加所选 →',exact=True).click()
    expect(page.locator('.tag-selected tbody tr')).to_have_count(2)
    assert page.get_by_label('选择标签 P001',exact=True).is_disabled()
    assert not page.get_by_label('全选当前标签').is_checked()
    page.get_by_role('button',name='加载更多',exact=True).click()
    page.get_by_label('搜索服务器标签').fill('P101')
    page.get_by_label('选择标签 P101',exact=True).check()
    page.get_by_role('button',name='添加所选 →',exact=True).click()
    expect(page.locator('.tag-selected tbody tr')).to_have_count(3)
    page.get_by_label('移除选择 P001',exact=True).check()
    page.get_by_role('button',name='移除',exact=True).click()
    expect(page.locator('.tag-selected tbody tr')).to_have_count(2)
    page.get_by_role('button',name='关闭',exact=True).click()

def template_workflow(page, base, folder):
    page.route("**/api/protocol/sample", lambda route: route.fulfill(json={
        "protocol":"modbus", "points":[
            {"id":"DI_10002","kind":"boolean","label":"运行反馈","value":False,"quality":"good","receivedAt":int(time.time()*1000)},
            {"id":"AI_30003","kind":"number","label":"液位原码","unit":"原码","value":17800,"quality":"good","receivedAt":int(time.time()*1000)}]}))
    page.goto(base)
    load_legacy(page,base,folder,'05')
    open_data(page)
    page.get_by_label("来源",exact=True).select_option("modbus")
    page.get_by_label("Modbus 主机").fill("127.0.0.1")
    file=Path(folder)/"mapping.json"
    file.write_text(json.dumps({"mappings":[
        dict(type="DI",address=10002,dataType="BOOL",point_alias="运行反馈",status="active"),
        dict(type="AI",address=30003,dataType="UINT16",point_alias="液位原码",status="active")]}),"utf8")
    page.get_by_label("导入北向 JSON 点表").set_input_files(file)
    page.get_by_role("button",name="试读点位",exact=True).click()
    expect(page.locator(".tag-selected")).to_contain_text("17800")
    page.locator(".tag-selected tbody tr").filter(has_text="液位原码").click()
    page.locator(".tag-properties").get_by_text("高级设置",exact=True).click()
    page.get_by_label("业务编号",exact=True).fill("levelRaw")
    page.get_by_role("button",name="完成并返回画布",exact=True).click()
    expect(page.get_by_role("dialog")).to_have_count(0)
    expect(page.get_by_role('button',name='数据绑定',exact=True)).to_have_attribute('aria-current','step')
    expect(page.locator('.navigator')).to_contain_text('1 / 7')
    page.locator('.studio-header').get_by_role('button',name='预览发布',exact=True).click()
    assert page.locator('.studio-header').get_by_role('button',name='发布',exact=True).is_disabled()
    page.get_by_role('button',name='检查数据绑定',exact=True).click()
    for id in ['n0','n1','n2','n4','n3','n5']:
        page.locator('[data-layer="'+id+'"]').click()
        select=page.get_by_label('当前组件测点',exact=True)
        if id in ['n3','n5']:
            assert '液位原码' not in select.inner_text()
            select.select_option('DI_10002')
        else:select.select_option('levelRaw')
    expect(page.locator('.binding-readback')).to_contain_text('停止')
    page.locator('[data-layer="n0"]').click()
    expect(page.locator('.binding-readback')).to_contain_text('17800 原码')
    publish(page)
    expect(page.get_by_role("status")).to_contain_text("已发布")
    expect(page.get_by_role("link",name="查看展示页面",exact=False)).to_be_visible()
    page.goto(base+"/view")
    expect(page.locator(".number").first).to_have_text("17800")
    expect(page.locator(".state")).to_have_text("停止")
    page.goto(base)
    choose_scene(page,"01")
    open_data(page)
    expect(page.get_by_label("来源",exact=True)).to_have_value("modbus")
    expect(page.get_by_label("Modbus 主机")).to_have_value("127.0.0.1")
    page.get_by_role("button",name="关闭",exact=True).click()

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
                tag_browser_flow(browser.new_page(),base)
                source_recovery(browser.new_page(),base)
                template_workflow(browser.new_page(),base,folder)
                campus_flow(browser.new_page(viewport={"width":1920,"height":1080}),base,folder)
                workflow_inspector(browser.new_page(viewport={"width":1920,"height":1080}),base)
                browser.close()
        finally:
            proc.terminate()
            proc.wait()
    print("PASS: editor, mapping, save, publish, rollback, three viewports, campus and offline viewer")

if __name__=="__main__":
    main()
