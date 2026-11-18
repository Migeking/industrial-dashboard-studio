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
OUT = ROOT / "works/scene05-blank-acceptance"
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
        add("HEADER.flowing", "回流母管有流量", "boolean", cls.mode != "zero")
        add("LT-101.PV", "集泥井液位", "number", 3.24, "m")
        add("LT-101.SP", "液位设定参考值", "number", 3.20, "m")
        add("FT-101.PV", "回流总管流量", "number", 0 if cls.mode == "zero" else 684, "m³/h")
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
    page.goto(base)
    expect(page.locator(".screen-empty")).to_be_visible()
    initial = page.request.get(base + "/api/draft").json()
    assert initial["format"] == "screen-document" and not initial["nodes"] and not initial["pipes"]
    page.screenshot(path=str(OUT / "00-blank.png"))
    page.get_by_label("画面主题", exact=True).select_option("cockpit-dark")
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

    text_label("标题", "污泥回流泵站   /   05 工艺监控", 40, 25, 950, 35)
    text_label("数据说明", "本地模拟数据   /   只读监视", 1460, 25, 400)
    place("rect", "管网分区", 40, 245, 1840, 610)
    text_label("管网标题", "工艺总览   /   二沉池 → 回流母管 → 好氧池", 66, 257, 950)
    level = place("readout", "LT-101 · 实际液位", 40, 88, 310, 140)
    setpoint = place("readout", "LIC-101 · 液位设定参考值", 375, 88, 310, 140)
    headflow = place("readout", "回流总管流量", 710, 88, 310, 140)
    well = place("tank", "二沉池集泥井", 75, 355, 285, 395)
    field("液位上限", 6)
    flowmeter = place("readout", "FT-101", 1370, 523, 245, 106)
    page.get_by_role("tab", name="元素定义", exact=True).click()
    for index, side in [(1, "left"), (2, "right")]:
        page.get_by_role("button", name="添加连接点", exact=True).click()
        page.get_by_label(f"连接点 {index} 位置", exact=True).select_option(side)
        field(f"连接点 {index} 名称", "流量计入口" if side == "left" else "流量计出口")
    meter_ports = page.locator("[data-port-definition]").evaluate_all("(items) => items.map(n => n.dataset.portDefinition)")
    text_label("出水方向", "去生化好氧池 →", 1640, 517, 225)
    events = place("events", "报警与事件 · 本地模拟", 40, 880, 1840, 160)

    rows = [345, 490, 635, 780]
    suction, delivery, pumps, valves = [], [], [], []
    for i, y in enumerate(rows, start=1):
        suction.append(place("junction", f"吸水分支 {i}", 405, y - 10, 20, 20))
        delivery.append(place("junction", f"汇流分支 {i}", 1150, y - 10, 20, 20))
        pumps.append(place("pump", f"P-0{i}", 620, y - 62, 132, 124))
        valves.append(place("checkValve", f"CV-0{i} · 止回阀", 930, y - 25, 100, 50))
        text_label(f"CV-0{i} 标签", f"CV-0{i}", 951, y + 18, 130, 17)

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

    tank_pipe = segment(well, "right", suction[1], "left", "HEADER.flowing")
    for i in range(3):
        segment(suction[i + 1], "top", suction[i], "bottom", "HEADER.flowing" if i == 0 else None)
        segment(delivery[i], "bottom", delivery[i + 1], "top", "HEADER.flowing")
    for i in range(4):
        signal = f"P-0{i+1}.flow"
        segment(suction[i], "right", pumps[i], "left", signal)
        segment(pumps[i], "right", valves[i], "left", signal)
        segment(valves[i], "right", delivery[i], "left", signal)
    bend = segment(delivery[-1], "right", flowmeter, meter_ports[0], "HEADER.flowing")
    outlet = segment(flowmeter, meter_ports[1], None, (1810, 576), "HEADER.flowing")

    select(bend)
    page.locator(".screen-inspector summary").get_by_text("转折点", exact=False).click()
    for i, (x, y) in enumerate([(1260, 780), (1260, 576)], start=1):
        page.get_by_role("button", name="添加转折点", exact=True).click()
        field(f"转折 {i} X", x)
        field(f"转折 {i} Y", y)
    field("转折 2 X", 2100)
    expect(page.get_by_label("转折 2 X", exact=True)).to_have_value("1260")
    expect(page.locator(".screen-inspector [role=alert]")).to_contain_text("画布范围")
    field("图元名称", "回流母管至 FT-101")
    select(outlet)
    page.get_by_label("管道箭头", exact=True).select_option("forward")
    field("终点 Y", 576)
    layer_search = page.get_by_label("查找画布对象", exact=True)
    expect(page.locator(f'[data-layer="{tank_pipe}"]')).to_contain_text("二沉池集泥井 → 吸水分支 2")
    layer_search.fill("集泥井 → 吸水分支 2")
    expect(page.locator(f'[data-layer="{tank_pipe}"]')).to_be_visible()
    layer_search.fill("")

    # Add extra data slots through the inspector, then build the shared point table.
    for id in pumps:
        select(id, "元素定义")
        for index, (name, kind) in enumerate([("工作模式", "text"), ("电机电流", "number")], start=4):
            page.get_by_role("button", name="添加数据槽位", exact=True).click()
            field(f"槽位 {index} 名称", name)
            page.get_by_label(f"槽位 {index} 类型", exact=True).select_option(kind)
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
    bind(well, {"液位": "LT-101.PV"})
    for id, tag in [(level, "LT-101.PV"), (setpoint, "LT-101.SP"),
                    (headflow, "FT-101.PV"), (flowmeter, "FT-101.PV")]:
        bind(id, {"显示数值": tag})
    bind(events, {"事件数据": "alarm.events"})
    select(events)
    page.get_by_role("button", name="从样本生成列", exact=True).click()
    field("列 3 名称", "级别")
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
    assert next(p["vertices"] for p in doc["pipes"] if p["id"] == bend) == [{"x": 1260, "y": 780}, {"x": 1260, "y": 576}]
    page.reload()
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
    expect(cell(tank_pipe).locator(".screen-pipe-flow")).to_have_count(1)
    page.screenshot(path=str(OUT / "02-published.png"))
    cell(pumps[0]).click()
    detail = page.get_by_role("dialog", name="P-01 设备详情")
    expect(detail).to_contain_text("18.2 A")
    expect(detail).to_contain_text("自动")
    assert detail.get_by_role("button").count() == 1
    page.screenshot(path=str(OUT / "03-pump-details.png"))
    detail.get_by_role("button", name="关闭详情").click()

    Source.mode = "fault"
    expect(cell(pumps[1])).to_have_attribute("data-state", "故障")
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
    expect(local.locator(f'[data-cell-id="{flowmeter}"]')).to_contain_text("684.00 m³/h")
    assert not requests and not errors, (requests, errors)
    local.close()

    original = browser.new_page(viewport={"width": 1920, "height": 1080})
    original.goto(ORIGINAL.as_uri())
    expect(original.locator(".schematic-svg .pump-shell")).to_have_count(4)
    original.screenshot(path=str(OUT / "reference-original.png"))
    reference = original.locator(".schematic-svg").text_content()
    original.locator(".schematic-svg .device-interactive").nth(1).click()
    original.screenshot(path=str(OUT / "reference-pump-panel.png"))
    original.close()

    # Keep the UI-authored geometry portable after this temporary fixture exits.
    doc["source"] = {"kind": "json", "data": json.dumps({"points": Source.points()}, ensure_ascii=False),
                     "url": "", "pollMs": 1000, "maxAgeMs": 10000, "demo": True}
    for mapping in doc["mappings"]:
        mapping["timePath"] = ""
        mapping["fallbackTimePath"] = ""
    (OUT / "scene05-project.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2), "utf-8")
    result = {"nodes": dict(Counter(n["symbol"] for n in doc["nodes"])),
              "pipes": len(doc["pipes"]), "pipeBindings": len(flow_bindings),
              "mappedPoints": len(doc["mappings"]),
              "bindings": sum(len(n["bindings"]) for n in doc["nodes"] + doc["pipes"]),
              "statesVerified": ["running", "stopped", "fault", "zero", "bad", "recovered"],
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
