"""Exercise the complete 2.5D equipment workflow on the production blank editor."""
import json
import time
from pathlib import Path
from playwright.sync_api import expect
import studio_process_tools_check as process

OUT=process.ROOT/"works/scada-depth-acceptance"
OUT.mkdir(parents=True,exist_ok=True)
process.OUT=OUT
class DepthSource(process.Source):
    def do_GET(self):
        rows=[]
        for key,kind,value,unit in [
            ("pump.run","boolean",self.mode!="zero",""),
            ("pump.fault","boolean",self.mode=="fault",""),
            ("valve.position","number",0 if self.mode=="zero" else 38.5,"%"),
            ("valve.fault","boolean",self.mode=="fault",""),
            ("tank.level","number",3.2,"m")]:
            rows.append(dict(id=key,label=key,kind=kind,value=value,unit=unit,
                             quality="bad" if self.mode=="bad" else "good",receivedAt=int(time.time()*1000)))
        body=json.dumps({"points":rows}).encode()
        self.send_response(200);self.send_header("Content-Type","application/json");self.end_headers();self.wfile.write(body)

process.Source=DepthSource
original_exercise=process.exercise


def exercise(page,base,url,browser):
    original_exercise(page,base,url,browser)
    errors=[]
    page.on("pageerror",lambda e:errors.append(str(e)))
    def save():
        with page.expect_response(lambda r:r.url==base+"/api/draft" and r.request.method=="POST") as result:
            page.get_by_role("button",name="保存草稿",exact=True).click()
        assert result.value.ok,result.value.text()
        return page.request.get(base+"/api/draft").json()
    def select(id):
        page.get_by_role("tab",name="图层",exact=False).click()
        page.locator(f'[data-layer="{id}"]').click()
        page.get_by_role("tab",name="外观",exact=True).click()
    def tools():
        page.get_by_role("tab",name="图元与工具",exact=True).click()
    def node(id):return page.locator(f'[data-cell-id="{id}"]')
    before=save()
    pump=next(n for n in before["nodes"] if n["symbol"]=="pump")
    fan=next(n for n in before["nodes"] if n["symbol"]=="fan")
    valve=next(n for n in before["nodes"] if n["symbol"]=="valve")
    tank=next(n for n in before["nodes"] if n["symbol"]=="tank")
    picture=next(n for n in before["nodes"] if n["symbol"]=="checkValve")
    tools()
    page.locator(".screen-page-appearance summary").click()
    page.get_by_label("绘图外观",exact=True).select_option("depth")
    page.get_by_role("button",name="应用到本页",exact=True).click()
    depth=save()
    for old,new in zip(before["nodes"],depth["nodes"],strict=True):
        if old["params"].get("appearance")=="picture":assert old==new
        elif old["symbol"] in ["pump","fan","tank","valve","readout","junction"]:
            assert new=={**old,"params":{**old["params"],"appearance":"depth"}}
    for old,new in zip(before["pipes"],depth["pipes"],strict=True):
        assert new=={**old,"style":{**old["style"],"appearance":"depth"}}
    # Whole appearance operation occupies exactly one undo step.
    page.keyboard.press("Control+z")
    assert save()["nodes"]==before["nodes"]
    assert save()["pipes"]==before["pipes"]
    tools();page.get_by_role("button",name="应用到本页",exact=True).click()
    # Individually override the deliberately preserved user-supplied image.
    select(picture["id"])
    page.get_by_label("外观预设",exact=True).select_option("depth")
    expect(node(picture["id"]).locator("image")).to_have_attribute("visibility","visible")
    # A newly placed device inherits the drawing appearance; then remove it.
    tools();page.locator('[data-symbol="fan"]').click()
    board=page.locator(".board").bounding_box()
    page.mouse.click(board["x"]+board["width"]*.77,board["y"]+board["height"]*.72)
    inherited=save()["nodes"][-1]
    assert inherited["symbol"]=="fan" and inherited["params"]["appearance"]=="depth"
    page.keyboard.press("Delete")
    # Repeated pointer moves must not overwrite inherited pipe styling.
    tools();page.locator('[data-tool="pipe"]').click()
    board=page.locator(".board").bounding_box()
    def point(x,y):return board["x"]+x*board["width"]/1920,board["y"]+y*board["height"]/1080
    page.mouse.move(*point(400,950));page.mouse.down();page.mouse.move(*point(1000,950),steps=15);page.mouse.up()
    expect(page.locator(".x6-edge")).to_have_count(len(before["pipes"])+1)
    inherited_pipe=save()["pipes"][-1]
    assert inherited_pipe["style"]["appearance"]=="depth"
    page.keyboard.press("Control+z")
    expect(page.locator(".x6-edge")).to_have_count(len(before["pipes"]))
    # Selected-only switching does not affect any other object or the links.
    select(pump["id"]);tools()
    page.get_by_label("绘图外观",exact=True).select_option("classic")
    page.get_by_role("button",name="应用到选中",exact=True).click()
    selected=save()
    assert next(n for n in selected["nodes"] if n["id"]==pump["id"])["params"]["appearance"]=="classic"
    assert next(n for n in selected["nodes"] if n["id"]==fan["id"])["params"]["appearance"]=="depth"
    tools();page.get_by_label("绘图外观",exact=True).select_option("depth")
    page.get_by_role("button",name="应用到选中",exact=True).click()
    # Copy/library instances retain the built-in skin and clear bindings as usual.
    select(fan["id"])
    page.get_by_role("tab",name="我的图元",exact=True).click()
    page.get_by_label("我的图元名称",exact=True).fill("2.5D 风机")
    page.get_by_role("button",name="保存选中为图元",exact=True).click()
    with page.expect_download() as download:
        page.get_by_role("button",name="导出图元",exact=True).click()
    download.value.save_as(OUT/"depth-fan.symbol.json")
    symbol=json.loads((OUT/"depth-fan.symbol.json").read_text("utf-8"))
    assert symbol["nodes"][0]["params"]["appearance"]=="depth"
    assert not symbol["nodes"][0]["bindings"]
    # Reopening must retain all variants and the same geometry and point assignments.
    final=save();page.reload()
    for n in [pump,fan,valve,picture]:expect(node(n["id"]).locator("image")).to_have_attribute("visibility","visible")
    for theme in ["process-gray","cockpit-dark","monitor-light"]:
        page.get_by_label("画面主题",exact=True).select_option(theme)
        expect(node(pump["id"])).to_have_attribute("data-state","运行")
        page.screenshot(path=str(OUT/(theme+"-editor.png")))
    page.get_by_label("画面主题",exact=True).select_option("cockpit-dark")
    final=save()
    page.get_by_role("button",name="预览发布",exact=True).click()
    page.get_by_role("button",name="发布",exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("已发布")
    page.goto(base+"/view")
    for mode,state in [("normal","运行"),("zero","停止"),("fault","故障"),("bad","未知"),("normal","运行")]:
        process.Source.mode=mode
        for n in [pump,fan]:expect(node(n["id"])).to_have_attribute("data-state",state)
    for mode,state in [("zero","关闭"),("normal","开启"),("fault","故障"),("bad","未知"),("normal","开启")]:
        process.Source.mode=mode;expect(node(valve["id"])).to_have_attribute("data-state",state)
    for width,height in [(1920,1080),(1366,768)]:
        page.set_viewport_size({"width":width,"height":height})
        page.screenshot(path=str(OUT/f"published-{width}.png"))
    page.goto(base);page.locator(".project-menu summary").click()
    with page.expect_download() as download:page.get_by_role("button",name="导出离线演示",exact=True).click()
    offline=OUT/"depth-offline.html";download.value.save_as(offline)
    local=browser.new_page(viewport={"width":1920,"height":1080});requests=[]
    local.on("request",lambda r:requests.append(r.url) if r.url.startswith("http") else None)
    local.on("pageerror",lambda e:errors.append(str(e)))
    local.goto(offline.as_uri())
    expect(local.locator('image[visibility="visible"]')).to_have_count(4)
    assert local.evaluate("""async()=>{
      const pictures=[...document.querySelectorAll('image[visibility=visible]')];
      return (await Promise.all(pictures.map(async el=>{const img=new Image();img.src=el.getAttribute('href')||el.getAttributeNS('http://www.w3.org/1999/xlink','href');await img.decode();return img.naturalWidth>0}))).every(Boolean);
    }""")
    assert not requests and not errors,(requests,errors)
    local.close()
    page.goto(base)
    page.get_by_role("button",name="新建画面",exact=True).click()
    expect(page.locator(".screen-empty")).to_be_visible()
    page.get_by_role("tab",name="我的图元",exact=True).click()
    page.get_by_label("导入我的图元",exact=True).set_input_files(OUT/"depth-fan.symbol.json")
    page.get_by_role("button",name="放置 2.5D 风机",exact=True).last.click()
    board=page.locator(".board").bounding_box()
    page.mouse.click(board["x"]+board["width"]*.35,board["y"]+board["height"]*.4)
    expect(page.locator(".x6-node")).to_have_count(1)
    reused=save()["pages"][-1]["nodes"][0]
    assert reused["params"]["appearance"]=="depth" and not reused["bindings"]
    select(reused["id"])
    page.get_by_role("tab",name="动态与测点",exact=True).click()
    page.get_by_label("运行反馈 · 绑定测点",exact=True).select_option("pump.run")
    page.get_by_label("故障反馈 · 绑定测点",exact=True).select_option("pump.fault")
    page.get_by_role("button",name="预览发布",exact=True).click()
    page.get_by_role("button",name="发布",exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("已发布")
    project=page.request.get(base+"/api/published").json()
    page.goto(base+"/view?page="+project["pages"][-1]["id"])
    expect(node(reused["id"])).to_have_attribute("data-state","运行")
    expect(node(reused["id"]).locator("image")).to_have_attribute("visibility","visible")
    assert not errors,errors
    (OUT/"results-depth.json").write_text(json.dumps({"verified":["bulk appearance and undo","custom image preserved","selected only","new device and continuously drawn pipe defaults","library export and blank-page rebinding","three themes","states and quality","publish","two screen sizes","offline image decode"],"offlineRequests":requests,"errors":errors},ensure_ascii=False,indent=2),"utf-8")
    process.checks.append("2.5D 全设备、批量/选中外观、撤销、新图元默认、三主题、图元库、故障质量与离线实解码")


if __name__=="__main__":
    process.exercise=exercise
    process.main()
