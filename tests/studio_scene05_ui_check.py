"""Rebuild scene 05 through the production blank-canvas editor and publish locally."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "works/scene05-visual-acceptance"
ORIGINAL = next((ROOT / "scenarios/water-treatment").glob("05-*.html"))


class Source(BaseHTTPRequestHandler):
    mode = "normal"

    @classmethod
    def points(cls):
        rows = []
        stamp = int(time.time() * 1000)

        def add(key, label, kind, value, unit=""):
            rows.append(dict(id=key, label=label, kind=kind, value=value, unit=unit,
                             receivedAt=stamp, quality="bad" if cls.mode == "bad" else "good"))

        for index in range(1, 5):
            key = f"P-0{index}"
            running = index <= 2 and cls.mode != "zero"
            add(f"{key}.run", f"{key} 运行反馈", "boolean", running)
            add(f"{key}.fault", f"{key} 故障反馈", "boolean", cls.mode == "fault" and index == 2)
            add(f"{key}.hz", f"{key} 频率", "number", 38.5 if running else 0, "Hz")
            add(f"{key}.mode", f"{key} 工作模式", "text", "自动")
            add(f"{key}.amps", f"{key} 电流", "number", {1: 18.2, 2: 18.0}.get(index, 0) if running else 0, "A")
            add(f"{key}.flow", f"{key} 支路有流量", "boolean", running and not (cls.mode == "fault" and index == 2))
        add("P-01.interlock", "P-01 保护联锁", "boolean", False)
        add("HEADER.flowing", "回流母管有流量", "boolean", cls.mode != "zero")
        add("station.runningCount", "运行泵数（模拟）", "number", 0 if cls.mode == "zero" else 2, "台")
        add("LT-101.PV", "集泥井液位", "number", 3.24, "m")
        add("LT-101.SP", "液位设定参考值", "number", 3.20, "m")
        add("FT-101.PV", "回流总管流量", "number", 0 if cls.mode == "zero" else 684, "m³/h")
        add("station.permissions", "控制许可反馈（模拟）", "dataset", [
            {"检查项": "井位高于低限", "反馈": "正常"},
            {"检查项": "吸入蝶阀 V-in", "反馈": "全开到位"},
            {"检查项": "出水闸阀 V-out", "反馈": "全开到位"},
            {"检查项": "停机保护时间锁", "反馈": "倒计时 0 s"},
            {"检查项": "急停与过载保护", "反馈": "无动作"},
        ])
        add("alarm.summary", "当前报警说明", "text", "预警  ·  P-02 轴承温度偏高（演示）")
        add("alarm.events", "演示报警", "dataset",
            [{"时间": "16:10:20", "设备": "P-02", "level": "预警", "描述": "轴承温度偏高（示例）"}])
        return rows

    def log_message(self, *_):
        pass

    def do_GET(self):
        body = json.dumps({"points": self.points()}, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)


def exercise(page, base, source_url, browser):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" and "Failed to load resource" not in message.text else None)
    page.goto(base)
    expect(page.locator(".screen-empty")).to_be_visible()
    initial = page.request.get(base + "/api/draft").json()
    assert initial["format"] == "screen-document" and not initial["nodes"] and not initial["pipes"]
    page.screenshot(path=str(OUT / "00-blank.png"))
    page.get_by_label("画面主题", exact=True).select_option("cockpit-dark")
    page.get_by_label("画布背景", exact=True).fill("#080f16")
    page.get_by_label("名称", exact=True).fill("05 污泥回流泵站 · 通用图元实测")

    def field(label, value):
        control = page.get_by_label(label, exact=True)
        control.fill(str(value))
        control.press("Tab")

    def point(x, y):
        board = page.locator(".board").bounding_box()
        return board["x"] + x * board["width"] / 1920, board["y"] + y * board["height"] / 1080

    def cell(id):
        return page.locator(f'[data-cell-id="{id}"]')

    def tools():
        page.get_by_role("tab", name="图元与工具", exact=True).click()

    def select(id, tab="外观"):
        page.get_by_role("tab", name="图层", exact=False).click()
        page.get_by_label("查找画布对象", exact=True).fill("")
        page.locator(f'[data-layer="{id}"]').click()
        page.get_by_role("tab", name=tab, exact=True).click()

    def place(kind, title, x, y, width, height):
        tools()
        visible = page.locator(".x6-node")
        ids = set(visible.evaluate_all("(nodes) => nodes.map(n => n.dataset.cellId)"))
        selector = "data-tool" if kind in {"text", "rect"} else "data-symbol"
        page.locator(f'[{selector}="{kind}"]').click()
        page.mouse.click(*point(x + 2, y + 2))
        expect(visible).to_have_count(len(ids) + 1)
        new_id = (set(visible.evaluate_all("(nodes) => nodes.map(n => n.dataset.cellId)")) - ids).pop()
        field("图元名称", title)
        for label, value in [("宽度", width), ("高度", height), ("位置 X", x), ("位置 Y", y)]:
            field(label, value)
        return new_id

    def text_label(title, text, x, y, width, fontsize=22):
        element = place("text", title, x, y, width, 50)
        field("文字内容", text)
        field("字号", fontsize)
        page.get_by_label("文字对齐", exact=True).select_option("left")
        return element

    text_label("标题", "污泥回流泵站 SCADA 监控", 24, 9, 670, 29)
    text_label("数据说明", "本地模拟   /   只读监视", 1510, 9, 378, 21)
    place("rect", "报警条底色", 20, 57, 1880, 31)
    page.get_by_label("填充颜色", exact=True).fill("#2f1922")
    page.get_by_label("边线颜色", exact=True).fill("#713941")
    alarm = text_label("当前报警", "", 32, 49, 1300, 21)
    page.get_by_label("文字颜色", exact=True).fill("#ffbdbe")
    page.get_by_role("tab", name="元素定义", exact=True).click()
    page.get_by_role("button", name="添加数据槽位", exact=True).click()
    field("槽位 1 名称", "报警文字")
    page.get_by_label("槽位 1 类型", exact=True).select_option("text")
    page.get_by_label("槽位 1 用途", exact=True).select_option("text")
    place("rect", "回路参数分区", 20, 103, 298, 783)
    page.get_by_label("填充颜色", exact=True).fill("#0d1d29")
    place("rect", "工艺管网分区", 330, 103, 1210, 783)
    page.get_by_label("填充颜色", exact=True).fill("#080f16")
    text_label("回路参数标题", "控制回路参数", 39, 109, 250, 17)
    text_label("工艺标题", "工艺管网   /   二沉池回流", 350, 119, 720, 17)
    level = place("readout", "集泥井液位 PV", 33, 154, 134, 76)
    setpoint = place("readout", "设定参考 SP", 174, 154, 132, 76)
    frequency = place("readout", "主泵运行频率", 33, 240, 134, 76)
    field("小数位", 1)
    running = place("readout", "运行泵数", 174, 240, 132, 76)
    field("小数位", 0)
    text_label("操作提示", "点击设备查看读数和质量", 37, 319, 255, 15)
    permissions = place("table", "控制许可反馈 · 模拟", 1552, 103, 348, 783)
    well = place("tank", "二沉池集泥井", 338, 220, 252, 516)
    field("液位上限", 6)
    page.get_by_label("外观预设", exact=True).select_option("monitor")
    page.get_by_role("tab", name="元素定义", exact=True).click()
    for port_index in [4, 3, 1]:
        page.get_by_role("button", name=f"移除连接点 {port_index}", exact=True).click()
    field("连接点 1 Y", 76)
    flowmeter = place("readout", "FT-101", 1286, 409, 136, 114)
    page.get_by_label("外观预设", exact=True).select_option("monitor")
    page.get_by_role("tab", name="元素定义", exact=True).click()
    for index, side in [(1, "left"), (2, "right")]:
        page.get_by_role("button", name="添加连接点", exact=True).click()
        page.get_by_label(f"连接点 {index} 位置", exact=True).select_option(side)
        field(f"连接点 {index} 名称", "流量计入口" if side == "left" else "流量计出口")
    meter_ports = page.locator("[data-port-definition]").evaluate_all("(items) => items.map(n => n.dataset.portDefinition)")
    text_label("出水方向", "去生化池 →", 1410, 410, 126, 17)
    events = place("events", "报警与事件 · 本地模拟", 20, 900, 1880, 138)

    rows = [319, 417, 514, 612]
    suction, delivery, pumps, valves = [], [], [], []
    for i, y in enumerate(rows, start=1):
        suction.append(place("junction", f"吸水分支 {i}", 638, y - 10, 20, 20))
        page.get_by_label("外观预设", exact=True).select_option("detailed")
        page.get_by_label("填充颜色", exact=True).fill("#173141")
        delivery.append(place("junction", f"汇流分支 {i}", 1150, y - 10, 20, 20))
        page.get_by_label("外观预设", exact=True).select_option("detailed")
        page.get_by_label("填充颜色", exact=True).fill("#173141")
        pumps.append(place("pump", f"P-0{i}", 851, y - 58, 128, 116))
        page.get_by_label("外观预设", exact=True).select_option("monitor")
        field("小数位", 1)
        valves.append(place("checkValve", f"CV-0{i} · 止回阀", 1006, y - 22, 52, 44))
        page.get_by_label("外观预设", exact=True).select_option("picture")
        page.get_by_label("载入设备图片", exact=True).set_input_files(
            ROOT / "apps/scada-designer/examples/assets/check-valve.png"
        )
        expect(cell(valves[-1]).locator("image")).to_have_attribute("visibility", "visible")

    def port(id, name):
        bounds = cell(id).locator(f'circle[port="{name}"]').bounding_box()
        return bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2

    def connect(source, start, target, end):
        tools()
        page.locator("[data-tool=pipe]").click()
        edges = page.locator(".x6-edge")
        before = set(edges.evaluate_all("(items) => items.map(n => n.dataset.cellId)"))
        a = port(source, start)
        b = port(target, end) if target else point(*end)
        page.mouse.move(*a)
        page.mouse.down()
        page.mouse.move(*b, steps=12)
        page.mouse.up()
        expect(edges).to_have_count(len(before) + 1)
        return (set(edges.evaluate_all("(items) => items.map(n => n.dataset.cellId)")) - before).pop()

    expected_edges = {}
    flow_bindings = {}

    def segment(source, start, target, end, signal=None):
        edge = connect(source, start, target, end)
        expected_edges[edge] = (source, start, target, end)
        if signal:
            flow_bindings[edge] = signal
        return edge

    tank_pipe = segment(well, "right", suction[3], "left", "HEADER.flowing")
    for i in range(3):
        segment(suction[i + 1], "top", suction[i], "bottom", "HEADER.flowing")
        segment(delivery[i], "bottom", delivery[i + 1], "top", "HEADER.flowing")
    for i in range(4):
        signal = f"P-0{i+1}.flow"
        segment(suction[i], "right", pumps[i], "left", signal)
        segment(pumps[i], "right", valves[i], "left", signal)
        segment(valves[i], "right", delivery[i], "left", signal)
    bend = segment(delivery[-1], "right", flowmeter, meter_ports[0], "HEADER.flowing")
    outlet = segment(flowmeter, meter_ports[1], None, (1522, 466), "HEADER.flowing")

    select(bend)
    page.locator(".screen-inspector summary").get_by_text("转折点", exact=False).click()
    for i, (x, y) in enumerate([(1280, 612), (1280, 466)], start=1):
        page.get_by_role("button", name="添加转折点", exact=True).click()
        field(f"转折 {i} X", x)
        field(f"转折 {i} Y", y)
    field("转折 2 X", 2100)
    expect(page.get_by_label("转折 2 X", exact=True)).to_have_value("1280")
    expect(page.locator(".screen-inspector [role=alert]")).to_contain_text("画布范围")
    field("图元名称", "回流母管至 FT-101")
    select(outlet)
    page.get_by_label("管道箭头", exact=True).select_option("forward")
    field("终点 Y", 466)
    pipe_preset = page.get_by_label("管道外观", exact=True)
    expect(pipe_preset).to_have_value("detailed")
    pipe_preset.select_option("classic")
    expect(cell(outlet).locator('.screen-pipe-highlight')).to_have_attribute("stroke", "none")
    pipe_preset.select_option("detailed")
    layer_search = page.get_by_label("查找画布对象", exact=True)
    expect(page.locator(f'[data-layer="{tank_pipe}"]')).to_contain_text("二沉池集泥井 → 吸水分支 4")
    layer_search.fill("集泥井 → 吸水分支 4")
    expect(page.locator(f'[data-layer="{tank_pipe}"]')).to_be_visible()
    layer_search.fill("")

    # Add extra data slots through the inspector, then build the shared point table.
    for id in pumps:
        select(id, "元素定义")
        for index, (name, kind) in enumerate([("工作模式", "text"), ("电机电流", "number")], start=4):
            page.get_by_role("button", name="添加数据槽位", exact=True).click()
            field(f"槽位 {index} 名称", name)
            page.get_by_label(f"槽位 {index} 类型", exact=True).select_option(kind)
            if kind == "text":
                page.get_by_label(f"槽位 {index} 用途", exact=True).select_option("text")
    select(pumps[0], "元素定义")
    page.get_by_role("button", name="添加数据槽位", exact=True).click()
    field("槽位 6 名称", "保护联锁")
    page.get_by_label("槽位 6 类型", exact=True).select_option("boolean")
    select(pumps[0], "动态与测点")
    page.get_by_role("button", name="管理连接与点位", exact=True).click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("来源", exact=True).select_option("rest")
    dialog.get_by_label("接口 URL", exact=True).fill(source_url)
    dialog.get_by_label("刷新周期（ms）", exact=True).fill("250")
    dialog.get_by_role("button", name="读取样本", exact=True).click()
    dialog.get_by_role("button", name="从桥接点表生成映射", exact=True).click()
    dialog.get_by_role("button", name="应用数据配置", exact=True).click()
    expect(page.locator(".screen-inspector .inspector-heading b")).to_have_text("P-01")

    def bind(id, bindings):
        select(id, "动态与测点")
        for label, tag in bindings.items():
            page.get_by_label(label + " · 绑定测点", exact=True).select_option(tag)

    for i, id in enumerate(pumps, start=1):
        bind(id, {label: f"P-0{i}.{suffix}" for label, suffix in
                  [("运行反馈", "run"), ("故障反馈", "fault"), ("运行数值", "hz"),
                   ("工作模式", "mode"), ("电机电流", "amps")]})
    bind(pumps[0], {"保护联锁": "P-01.interlock"})
    bind(well, {"液位": "LT-101.PV"})
    for id, tag in [(level, "LT-101.PV"), (setpoint, "LT-101.SP"),
                    (frequency, "P-01.hz"), (running, "station.runningCount"), (flowmeter, "FT-101.PV")]:
        bind(id, {"显示数值": tag})
    bind(alarm, {"报警文字": "alarm.summary"})
    bind(permissions, {"表格数据": "station.permissions"})
    bind(events, {"事件数据": "alarm.events"})
    select(events)
    page.get_by_role("button", name="从样本生成列", exact=True).click()
    field("列 3 名称", "级别")
    page.get_by_label("列 1 格式", exact=True).select_option("text")
    for id, tag in flow_bindings.items():
        bind(id, {"流动状态": tag})
    tools()
    page.screenshot(path=str(OUT / "01-editor.png"))

    with page.expect_response(lambda r: r.url == base + "/api/draft" and r.request.method == "POST") as saved:
        page.get_by_role("button", name="保存草稿", exact=True).click()
    assert saved.value.ok, saved.value.text()
    doc = page.request.get(base + "/api/draft").json()
    assert Counter(n["symbol"] for n in doc["nodes"])["pump"] == 4
    assert len(doc["pipes"]) == len(expected_edges) == 21
    for pipe in doc["pipes"]:
        source, start, target, end = expected_edges[pipe["id"]]
        assert pipe["source"] == {"nodeId": source, "portId": start}, pipe
        if target:
            assert pipe["target"] == {"nodeId": target, "portId": end}, pipe
        else:
            assert set(pipe["target"]) == {"x", "y"}, pipe
    assert next(p["vertices"] for p in doc["pipes"] if p["id"] == bend) == [{"x": 1280, "y": 612}, {"x": 1280, "y": 466}]
    assert all(p["style"]["appearance"] == "detailed" for p in doc["pipes"])
    page.reload()
    assert not errors, errors
    expect(page.locator(".x6-edge")).to_have_count(21)
    page.get_by_role("button", name="预览发布", exact=True).click()
    page.get_by_role("button", name="发布", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("已发布")
    assert page.request.get(base + "/api/published").json() == doc

    page.goto(base + "/view")
    expect(cell(pumps[0])).to_have_attribute("data-state", "运行")
    expect(cell(pumps[2])).to_have_attribute("data-state", "停止")
    expect(cell(flowmeter)).to_contain_text("684.00 m³/h")
    expect(cell(well)).to_contain_text("3.24 m")
    expect(cell(running)).to_contain_text("2 台")
    expect(cell(tank_pipe).locator('.screen-pipe-highlight')).to_have_attribute("stroke", "#ffffff")
    expect(cell(pumps[0])).to_contain_text("38.5 Hz")
    expect(cell(pumps[0])).to_contain_text("自动")
    expect(cell(permissions)).to_contain_text("停机保护时间锁")
    expect(cell(alarm)).to_contain_text("轴承温度偏高")
    expect(cell(valves[0]).locator("image")).to_have_attribute("visibility", "visible")
    expect(cell(tank_pipe).locator(".screen-pipe-flow")).to_have_count(1)
    inlet_height = cell(tank_pipe).locator("path").nth(2).evaluate("path => path.getBBox().height")
    assert inlet_height < .5, f"Nearly aligned ports should not produce a detour: {inlet_height}"
    expect(cell(events).locator("tbody")).to_contain_text("轴承温度偏高")
    assert cell(events).locator(".screen-table-host").evaluate(
        "host => host.scrollHeight <= host.clientHeight"
    ), "The single alarm row must fit without scrolling"
    bend_y = cell(bend).locator("path").nth(2).evaluate("path => path.getBBox().y")
    assert abs(bend_y - 466) < 0.5, f"The router overshot the fixed elbow: {bend_y}"
    page.screenshot(path=str(OUT / "02-published.png"))
    cell(pumps[0]).click()
    detail = page.get_by_role("dialog", name="P-01 设备详情")
    expect(detail).to_contain_text("18.2 A")
    expect(detail).to_contain_text("自动")
    expect(detail).to_contain_text("转动设备 · 只读监视")
    expect(detail.locator("dl > div").filter(has_text="保护联锁")).to_contain_text("无 有效")
    expect(detail).to_have_css("background-color", "rgb(13, 30, 43)")
    assert detail.get_by_role("button").count() == 1
    page.screenshot(path=str(OUT / "03-pump-details.png"))
    detail.get_by_role("button", name="关闭详情").click()

    Source.mode = "fault"
    expect(cell(pumps[1])).to_have_attribute("data-state", "故障")
    expect(cell(pumps[1])).to_contain_text("故障")
    for id, tag in flow_bindings.items():
        if tag == "P-02.flow":
            expect(cell(id).locator(".screen-pipe-flow")).to_have_count(0)
    Source.mode = "zero"
    expect(cell(pumps[0])).to_have_attribute("data-state", "停止")
    expect(cell(flowmeter)).to_contain_text("0.00 m³/h")
    expect(page.locator(".screen-pipe-flow")).to_have_count(0)
    Source.mode = "bad"
    expect(cell(pumps[0])).to_have_attribute("data-state", "未知")
    expect(cell(flowmeter)).to_contain_text("—")
    expect(page.locator(".screen-pipe-flow")).to_have_count(0)
    page.screenshot(path=str(OUT / "04-quality-bad.png"))
    Source.mode = "normal"
    expect(cell(pumps[0])).to_have_attribute("data-state", "运行")
    expect(cell(tank_pipe).locator(".screen-pipe-flow")).to_have_count(1)
    page.set_viewport_size({"width": 1366, "height": 768})
    expect(cell(flowmeter)).to_be_visible()
    caption = cell(level).get_by_text("集泥井液位 PV", exact=True)
    assert caption.bounding_box()["height"] >= 8, "Narrow cards need a readable caption"
    page.screenshot(path=str(OUT / "05-published-1366.png"))
    page.set_viewport_size({"width": 1920, "height": 1080})

    page.goto(base)
    expect(cell(flowmeter)).to_contain_text("684.00 m³/h")
    page.locator(".project-menu summary").click()
    with page.expect_download() as download:
        page.get_by_role("button", name="导出离线演示", exact=True).click()
    offline = OUT / "scene05-offline.html"
    download.value.save_as(offline)
    local = browser.new_page(viewport={"width": 1920, "height": 1080})
    requests = []
    local.on("request", lambda r: requests.append(r.url) if r.url.startswith("http") else None)
    local.on("pageerror", lambda error: errors.append(str(error)))
    local.goto(offline.as_uri())
    expect(local.locator(".x6-edge")).to_have_count(21)
    expect(local.locator(f'[data-cell-id="{valves[0]}"] image')).to_have_attribute("visibility", "visible")
    expect(local.locator(f'[data-cell-id="{pumps[0]}"]')).to_contain_text("自动")
    expect(local.locator(f'[data-cell-id="{flowmeter}"]')).to_contain_text("684.00 m³/h")
    assert not requests and not errors, (requests, errors)
    local.close()

    # Reuse an actual bound 05 branch, including the uploaded image, on a new page.
    select(pumps[0])
    page.locator(f'[data-layer="{valves[0]}"]').click(modifiers=["Shift"])
    page.get_by_role("tab", name="我的图元", exact=True).click()
    field("我的图元名称", "05 单泵出水支路")
    page.get_by_role("button", name="保存选中为图元", exact=True).click()
    with page.expect_download() as library_download:
        page.get_by_role("button", name="导出图元", exact=True).click()
    library_file = OUT / "pump-discharge.symbol.json"
    library_download.value.save_as(library_file)
    symbol = json.loads(library_file.read_text("utf-8"))
    assert len(symbol["nodes"]) == 2 and len(symbol["pipes"]) == 1
    assert all(not row["bindings"] for row in symbol["nodes"] + symbol["pipes"])
    assert next(row for row in symbol["nodes"] if row["symbol"] == "checkValve")["image"].startswith("data:image/png;")
    page.get_by_role("button", name="移除图元", exact=True).click()
    page.get_by_role("button", name="新建画面", exact=True).click()
    expect(page.locator(".screen-empty")).to_be_visible()
    page.get_by_role("tab", name="我的图元", exact=True).click()
    page.get_by_label("导入我的图元", exact=True).set_input_files(library_file)
    page.get_by_role("button", name="放置 05 单泵出水支路", exact=True).click()
    page.mouse.click(*point(600, 450))
    expect(page.locator(".x6-node")).to_have_count(2)
    expect(page.locator(".x6-edge")).to_have_count(1)
    with page.expect_response(lambda r: r.url == base + "/api/draft" and r.request.method == "POST") as reused_save:
        page.get_by_role("button", name="保存草稿", exact=True).click()
    child_draft = reused_save.value
    assert child_draft.ok, child_draft.text()
    child = page.request.get(base + "/api/draft").json()["pages"][-1]
    pump_copy = next(row for row in child["nodes"] if row["symbol"] == "pump")
    valve_copy = next(row for row in child["nodes"] if row["symbol"] == "checkValve")
    pipe_copy = child["pipes"][0]
    assert pump_copy["id"] != pumps[0] and valve_copy["id"] != valves[0]
    assert not pump_copy["bindings"] and not pipe_copy["bindings"]
    assert pipe_copy["source"] == {"nodeId": pump_copy["id"], "portId": "right"}
    assert pipe_copy["target"] == {"nodeId": valve_copy["id"], "portId": "left"}
    assert valve_copy["image"] == next(row for row in symbol["nodes"] if row["symbol"] == "checkValve")["image"]
    assert pump_copy["params"]["appearance"] == "monitor"
    page.get_by_role("tab", name="图层", exact=False).click()
    page.locator(f'[data-layer="{pump_copy["id"]}"]').click(modifiers=["Alt"])
    page.get_by_role("tab", name="动态与测点", exact=True).click()
    for label, suffix in [("运行反馈", "run"), ("故障反馈", "fault"), ("运行数值", "hz"), ("工作模式", "mode")]:
        page.get_by_label(label + " · 绑定测点", exact=True).select_option(f"P-03.{suffix}")
    bind(pipe_copy["id"], {"流动状态": "P-03.flow"})
    expect(cell(pump_copy["id"])).to_have_attribute("data-state", "停止")
    expect(cell(valve_copy["id"]).locator("image")).to_have_attribute("visibility", "visible")
    page.screenshot(path=str(OUT / "07-reused-pump-branch.png"))
    page.get_by_role("button", name="预览发布", exact=True).click()
    page.get_by_role("button", name="发布", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("已发布")
    page.goto(base + "/view?page=" + child["id"])
    expect(cell(pump_copy["id"])).to_have_attribute("data-state", "停止")
    expect(cell(valve_copy["id"]).locator("image")).to_have_attribute("visibility", "visible")
    expect(page.locator(".x6-edge")).to_have_count(1)
    assert not errors, errors

    original = browser.new_page(viewport={"width": 1920, "height": 1080})
    original.goto(ORIGINAL.as_uri())
    expect(original.locator(".schematic-svg .pump-shell")).to_have_count(4)
    original.screenshot(path=str(OUT / "reference-original.png"))
    reference = original.locator(".schematic-svg").text_content()
    original.locator(".schematic-svg .device-interactive").nth(1).click()
    original.screenshot(path=str(OUT / "reference-pump-panel.png"))
    original.close()

    # Change only appearances through the production inspector, then exercise the same network.
    page.goto(base)
    for id in pumps + [well] + valves:
        select(id)
        page.get_by_label("外观预设", exact=True).select_option("depth")
    for pipe in doc["pipes"]:
        select(pipe["id"])
        page.get_by_label("管道外观", exact=True).select_option("depth")
    page.get_by_role("button", name="保存草稿", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("已保存")
    depth_doc = page.request.get(base + "/api/draft").json()
    for old, new in zip(doc["nodes"], depth_doc["nodes"], strict=True):
        if old["id"] in pumps + [well] + valves:
            assert new["params"]["appearance"] == "depth"
            assert new == {**old, "params": {**old["params"], "appearance": "depth"}}
        else:
            assert new == old
    for old, new in zip(doc["pipes"], depth_doc["pipes"], strict=True):
        assert new == {**old, "style": {**old["style"], "appearance": "depth"}}
    page.reload()
    expect(cell(pumps[0]).locator("image")).to_have_attribute("visibility", "visible")
    page.get_by_role("button", name="预览发布", exact=True).click()
    page.get_by_role("button", name="发布", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("已发布")
    page.goto(base + "/view")
    expect(cell(pumps[0])).to_contain_text("运行 · 38.5 Hz")
    expect(cell(pumps[2])).to_have_attribute("data-state", "停止")
    expect(cell(well)).to_contain_text("3.24 m")
    expect(cell(well).locator(".screen-tank-shell")).to_have_attribute("visibility", "visible")
    expect(cell(tank_pipe).locator(".screen-pipe-rim")).to_have_attribute("stroke", "#233947")
    expect(cell(tank_pipe).locator(".screen-pipe-flow")).to_have_count(1)
    page.screenshot(path=str(OUT / "08-depth-published.png"))
    page.set_viewport_size({"width": 1366, "height": 768})
    expect(cell(pumps[0]).locator("image")).to_be_visible()
    page.screenshot(path=str(OUT / "09-depth-1366.png"))
    Source.mode = "fault"
    expect(cell(pumps[1])).to_have_attribute("data-state", "故障")
    Source.mode = "bad"
    expect(cell(pumps[0])).to_have_attribute("data-state", "未知")
    expect(cell(well)).to_contain_text("—")
    expect(page.locator(".screen-pipe-flow")).to_have_count(0)
    Source.mode = "normal"
    page.goto(base)
    expect(cell(pumps[0])).to_have_attribute("data-state", "运行")
    page.locator(".project-menu summary").click()
    with page.expect_download() as download:
        page.get_by_role("button", name="导出离线演示", exact=True).click()
    depth_html = OUT / "scene05-depth-offline.html"
    download.value.save_as(depth_html)
    local = browser.new_page(viewport={"width": 1920, "height": 1080})
    depth_requests = []
    local.on("request", lambda r: depth_requests.append(r.url) if r.url.startswith("http") else None)
    local.on("pageerror", lambda error: errors.append(str(error)))
    local.goto(depth_html.as_uri())
    expect(local.locator(f'[data-cell-id="{pumps[0]}"] image')).to_be_visible()
    assert local.evaluate("""async () => {
      const picture = document.querySelector('.x6-node image[visibility=visible][width="146"]');
      if (!picture) return false;
      const bitmap = new Image();
      bitmap.src = picture.getAttribute('href') || picture.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      await bitmap.decode();
      return bitmap.naturalWidth === 480;
    }""")
    expect(local.locator(".screen-pipe-rim[stroke='#233947']")).to_have_count(21)
    expect(local.locator(f'[data-cell-id="{well}"]')).to_contain_text("3.24 m")
    assert not depth_requests and not errors, (depth_requests, errors)
    local.close()

    # Keep the UI-authored geometry portable after this temporary fixture exits.
    doc["source"] = {"kind": "json", "data": json.dumps({"points": Source.points()}, ensure_ascii=False),
                     "url": "", "pollMs": 1000, "maxAgeMs": 10000, "demo": True}
    for mapping in doc["mappings"]:
        mapping["timePath"] = ""
        mapping["fallbackTimePath"] = ""
    depth_doc["source"] = doc["source"]
    depth_doc["mappings"] = doc["mappings"]
    (OUT / "scene05-depth-project.json").write_text(json.dumps(depth_doc, ensure_ascii=False, indent=2), "utf-8")
    (OUT / "scene05-project.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2), "utf-8")
    result = {"nodes": dict(Counter(n["symbol"] for n in doc["nodes"])),
              "pipes": len(doc["pipes"]), "pipeBindings": len(flow_bindings),
              "mappedPoints": len(doc["mappings"]),
              "bindings": sum(len(n["bindings"]) for n in doc["nodes"] + doc["pipes"]),
              "statesVerified": ["running", "stopped", "fault", "zero", "bad", "recovered"],
              "reusedBranch": {"nodes": 2, "pipes": 1, "retainedImage": True, "reboundTo": "P-03"},
              "depth": {"pumps": 4, "tanks": 1, "checkValves": 4, "pipes": 21, "offlineHttpRequests": depth_requests},
              "referenceSchematic": reference, "offlineHttpRequests": requests, "errors": errors}
    (OUT / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps(result, ensure_ascii=False))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    fixture = ThreadingHTTPServer(("127.0.0.1", 0), Source)
    threading.Thread(target=fixture.serve_forever, daemon=True).start()
    with socket.socket() as socket_for_port:
        socket_for_port.bind(("127.0.0.1", 0))
        port = socket_for_port.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="studio05-") as temp:
        server = subprocess.Popen(
            ["node", "apps/scada-designer/server.mjs"], cwd=ROOT,
            env={**os.environ, "STUDIO_PORT": str(port), "STUDIO_DATA_DIR": temp},
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        try:
            for _ in range(80):
                try:
                    urlopen(base + "/api/draft", timeout=1).close()
                    break
                except OSError:
                    time.sleep(.1)
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                page = browser.new_page(viewport={"width": 1920, "height": 1080})
                page.set_default_timeout(10000)
                try:
                    exercise(page, base, f"http://127.0.0.1:{fixture.server_port}/snapshot", browser)
                except Exception:
                    page.screenshot(path=str(OUT / "failure.png"))
                    raise
                finally:
                    browser.close()
        finally:
            server.terminate()
            server.wait(timeout=15)
            fixture.shutdown()


if __name__ == "__main__":
    main()
