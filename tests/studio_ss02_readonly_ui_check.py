"""Author an SS-02 discharge mini-section through the UI and exercise read-only monitoring."""
import argparse
import json
import os
import re
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright
from studio_ui import project_action, publish

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "SS-02 污水厂输送总管 · 只读台架"
FAULT = "示范支路 · 输送泵故障"
PUMP = "输送泵 · 示范支路"
PRESSURE = "PET-11"
FLOW = "FT-11"


class Snapshot(BaseHTTPRequestHandler):
    mode = "normal"
    reads = 0
    writes = 0

    def log_message(self, *_):
        pass

    def do_GET(self):
        Snapshot.reads += 1
        mode = self.mode
        if mode == "offline":
            self.send_error(503)
            return
        now = int(time.time() * 1000)
        bad = mode == "fault"

        def point(id, label, kind, value, unit=""):
            return {"id": id, "label": label, "kind": kind, "value": value, "unit": unit,
                    "quality": "good", "timestamp": now, "receivedAt": now}

        rows = [
            point("pump.run", "示范支路运行反馈", "boolean", not bad),
            point("pump.fault", "示范支路故障反馈", "boolean", bad),
            point("valve.open", "出水蝶阀开到位", "boolean", True),
            point(FLOW, "总管流量", "number", 0 if bad else .85, "m³/s"),
            point(PRESSURE, "总管压力", "number", 3999 if bad else 12000, "MPa"),
            point("pressure.history", "总管压力历史", "dataset", [
                {"time": now - 2000, "value": .15, "quality": "good"},
                {"time": now - 14000, "value": .112, "quality": "good"},
                {"time": now - 12000, "value": .117, "quality": "good"},
                {"time": now - 10000, "value": .12, "quality": "good"},
                {"time": now - 8000, "value": 99, "quality": "bad"},
                {"time": now - 6000, "value": .136, "quality": "good"},
                {"time": now - 4000, "value": .143, "quality": "good"},
            ], "MPa"),
            point("header.alarms", "工段告警", "dataset", [
                {"time": now - 18000, "level": "预警", "message": "出口压力信号恢复", "state": "已恢复"},
                *([{"time": now, "level": "故障", "message": FAULT,
                   "state": "活动 · 待确认", "device": PUMP}] if bad else []),
            ]),
        ]
        payload = json.dumps({"points": rows}, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        Snapshot.writes += 1
        self.send_error(405)


def author(page, base, source, out):
    page.goto(base)
    expect(page.get_by_role("heading", name="项目管理", exact=True)).to_be_visible()
    page.get_by_role("button", name="新建工程", exact=False).click()
    page.get_by_label("工程名称", exact=True).fill(PROJECT)
    page.get_by_role("button", name="创建并打开", exact=True).click()
    expect(page.locator(".studio-header .project-title")).to_have_text(PROJECT)
    project = parse_qs(urlsplit(page.url).query)["project"][0]
    urls = {route: base + "/api/" + route + "?project=" + project
            for route in ("draft", "published", "versions")}
    assert not page.request.get(urls["draft"]).json()["nodes"]
    page.screenshot(path=str(out / "blank.png"))

    page.get_by_role("button", name="数据连接", exact=True).click()
    dialog = page.get_by_role("dialog", name="数据连接与点位")
    dialog.get_by_label("来源", exact=True).select_option("rest")
    dialog.get_by_label("接口 URL", exact=True).fill(source)
    dialog.get_by_role("button", name="读取样本", exact=True).click()
    dialog.get_by_role("button", name="从桥接点表生成映射", exact=True).click()
    dialog.get_by_label("测点", exact=True).select_option(label="总管压力 · PET-11")
    dialog.get_by_label("换算方式", exact=True).select_option("raw420")
    dialog.get_by_label("工程下限", exact=True).fill("0")
    dialog.get_by_label("工程上限", exact=True).fill("0.30")
    readback = dialog.get_by_label("点位试读结果", exact=True)
    expect(readback).to_contain_text("12000")
    expect(readback).to_contain_text("0.15 MPa")
    dialog.get_by_label("测点", exact=True).select_option(label="总管流量 · FT-11")
    dialog.get_by_label("换算方式", exact=True).select_option("identity")
    expect(readback).to_contain_text("0.85 m³/s")
    dialog.get_by_role("button", name="应用数据配置", exact=True).click()
    expect(dialog).not_to_be_visible()

    palette = page.get_by_role("complementary", name="场景与组件")
    board = page.locator(".board")
    cells = {}

    def field(label, value):
        control = page.get_by_label(label, exact=True)
        control.fill(str(value))
        control.press("Tab")

    def xy(x, y):
        b = board.bounding_box()
        return b["x"] + x * b["width"] / 1920, b["y"] + y * b["height"] / 1080

    def cell(key):
        return page.locator('[data-cell-id="' + cells[key] + '"]')

    def place(key, kind, x, y, w, h, title):
        palette.get_by_role("tab", name="图元与工具", exact=True).click()
        palette.get_by_label("组件分类", exact=True).select_option("all")
        palette.get_by_label("搜索组件", exact=True).fill(kind)
        nodes = page.locator(".x6-node")
        before = set(nodes.evaluate_all("(items) => items.map(n => n.dataset.cellId)"))
        palette.locator('[data-symbol="' + kind + '"]').click()
        page.mouse.click(*xy(x + 2, y + 2))
        expect(nodes).to_have_count(len(before) + 1)
        cells[key], = set(nodes.evaluate_all("(items) => items.map(n => n.dataset.cellId)")) - before
        page.get_by_role("tab", name="外观", exact=True).click()
        field("图元名称", title)
        for label, value in [("位置 X", x), ("位置 Y", y), ("宽度", w), ("高度", h)]:
            field(label, value)

    def caption(key, x, y, w, h, text, size, align="left"):
        place(key, "text", x, y, w, h, text)
        field("文字内容", text)
        field("字号", size)
        page.get_by_label("字重", exact=True).select_option("600")
        page.get_by_label("文字对齐", exact=True).select_option(align)

    def bind(slots):
        page.get_by_role("tab", name="动态与测点", exact=True).click()
        for label, point in slots.items():
            page.get_by_label(label + " · 绑定测点", exact=True).select_option(point)

    place("panel", "rect", 36, 118, 1848, 375, "污水厂输送工艺区")
    field("填充颜色", "#edf1f5")
    field("边线颜色", "#9aaeb7")
    caption("title", 36, 25, 1180, 66, "SS-02  /  污水厂输送出水总管", 42)
    caption("mode", 1430, 38, 414, 45, "本机台架 · 只读监视", 24, "right")
    caption("section", 66, 141, 940, 45, "出水总管 · 单支路组态", 24)
    caption("outlet", 1550, 280, 286, 40, "送污水厂", 24)
    place("pump", "pump", 244, 295, 178, 110, PUMP)
    page.get_by_label("外观预设", exact=True).select_option("classic")
    bind({"运行反馈": "pump.run", "故障反馈": "pump.fault"})
    place("valve", "valve", 540, 308, 136, 84, "V-01 出水蝶阀")
    page.get_by_label("外观预设", exact=True).select_option("classic")
    bind({"开到位反馈": "valve.open"})
    place("flow_tap", "junction", 990, 340, 20, 20, "流量取样位置")
    place("pressure_tap", "junction", 1320, 340, 20, 20, "压力取样位置")
    for key, tag, x in [("flow", FLOW, 890), ("pressure", PRESSURE, 1220)]:
        place(key, "pidInstrument", x, 212, 220, 70, tag)
        bind({"过程值": tag})
    place("trend", "trend", 36, 520, 1080, 485, "总管压力 · 历史趋势")
    field("序列 1 名称", "PET-11 (MPa)")
    bind({"趋势数据": "pressure.history"})
    place("events", "events", 1140, 520, 744, 485, "报警与事件")
    field("告警定位字段", "device")
    bind({"事件数据": "header.alarms"})
    page.get_by_role("tab", name="外观", exact=True).click()
    page.get_by_role("button", name="从样本生成列", exact=True).click()
    for index, name in enumerate(("时间", "级别", "告警", "状态"), 1):
        field(f"列 {index} 名称", name)
    page.get_by_label("列 1 格式", exact=True).select_option("time")
    field("列表排序字段", "time")
    page.get_by_label("列表排序方向", exact=True).select_option("desc")

    def terminal(end):
        if isinstance(end[0], int):
            return xy(*end)
        key, port = end
        b = cell(key).locator('circle[port="' + port + '"]').bounding_box()
        return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2

    def connect(source, target, color):
        page.locator('[data-tool="pipe"]').click()
        edges = page.locator(".x6-edge")
        before = set(edges.evaluate_all("(items) => items.map(n => n.dataset.cellId)"))
        page.mouse.move(*terminal(source))
        page.mouse.down()
        page.mouse.move(*terminal(target), steps=14)
        page.mouse.up()
        expect(edges).to_have_count(len(before) + 1)
        edge, = set(edges.evaluate_all("(items) => items.map(n => n.dataset.cellId)")) - before
        page.get_by_role("tab", name="图层", exact=False).click()
        page.locator('[data-layer="' + edge + '"]').click()
        page.get_by_role("tab", name="外观", exact=True).click()
        field("管道颜色", color)

    for source, target in [
        ((125, 350), ("pump", "left")),
        (("pump", "right"), ("valve", "left")),
        (("valve", "right"), ("flow_tap", "left")),
        (("flow_tap", "right"), ("pressure_tap", "left")),
        (("pressure_tap", "right"), (1780, 350)),
    ]:
        connect(source, target, "#5d4037")
    for key, x in [("flow_tap", 1000), ("pressure_tap", 1330)]:
        connect((key, "top"), (x, 282), "#617786")
    page.locator('[data-tool="select"]').click()
    page.screenshot(path=str(out / "editor.png"))
    publish(page)
    expect(page.get_by_role("status")).to_contain_text("已发布")
    published = page.request.get(urls["published"]).json()
    assert len(published["pipes"]) == 7 and len(published["mappings"]) == 7
    assert any(not p["source"].get("nodeId") and p["target"] == {
        "nodeId": cells["pump"], "portId": "left",
    } for p in published["pipes"]), "The branch inlet must remain attached to the pump"
    pressure = next(m for m in published["mappings"] if m["id"] == PRESSURE)
    assert pressure["conversion"] == {"mode": "raw420", "engineeringMin": 0, "engineeringMax": .30}
    return project, cells, urls, published


def observe(editor, viewer, base, project, cells, urls, published, out):
    location = base + "/view?project=" + project
    viewer.goto(location)

    def cell(key, page=viewer):
        return page.locator('[data-cell-id="' + cells[key] + '"]')

    def normal(page=viewer):
        expect(cell("pump", page)).to_have_attribute("data-state", "运行")
        expect(cell("pressure", page)).to_contain_text(re.compile(r"0\.15\s*MPa"))
        expect(cell("flow", page)).to_contain_text(re.compile(r"0\.85\s*m³/s"))
        expect(cell("events", page)).to_contain_text("出口压力信号恢复")

    normal()
    viewer.wait_for_function("""id => {
        const host = document.querySelector('[data-cell-id="' + id + '"] .screen-chart-host');
        const data = host && echarts.getInstanceByDom(host)?.getOption()?.series[0]?.data;
        return data?.length === 7 && data[2][1] === .12 && data[3][1] === null && data[6][1] === .15;
    }""", arg=cells["trend"])
    viewer.screenshot(path=str(out / "published-1366.png"))

    Snapshot.mode = "fault"
    try:
        expect(cell("pump")).to_have_attribute("data-state", "故障")
        expect(cell("pressure")).to_have_attribute("data-state", "无效")
        expect(cell("flow")).to_contain_text(re.compile(r"0\.00\s*m³/s"))
        events = cell("events")
        expect(events).to_contain_text(FAULT)
        events.get_by_role("button", name="查看设备 " + PUMP, exact=True).click()
        details = viewer.get_by_role("dialog", name=PUMP + " 设备详情")
        expect(details).to_contain_text("故障")
        details.get_by_role("button", name="关闭详情", exact=True).click()
        viewer.get_by_role("button", name="测点诊断", exact=True).click()
        diagnostics = viewer.get_by_role("dialog", name="测点诊断")
        expect(diagnostics).to_contain_text("原值 3999")
        expect(diagnostics).to_contain_text("原值超出输入量程")
        viewer.screenshot(path=str(out / "fault-diagnostics.png"))
        diagnostics.get_by_role("button", name="关闭", exact=True).click()
    finally:
        Snapshot.mode = "normal"
    normal()

    started = time.monotonic()
    Snapshot.mode = "offline"
    try:
        expect(cell("pressure")).to_have_attribute("data-state", "离线")
        expect(cell("events")).not_to_contain_text("出口压力信号恢复")
        lost_ms = round((time.monotonic() - started) * 1000)
    finally:
        Snapshot.mode = "normal"
    started = time.monotonic()
    normal()
    recovered_ms = round((time.monotonic() - started) * 1000)

    editor.reload()
    original_version = editor.request.get(urls["versions"]).json()["active"]
    editor.get_by_label("名称", exact=True).fill(PROJECT + " v2")
    publish(editor)
    expect(editor.get_by_role("status")).to_contain_text("已发布")
    assert editor.request.get(urls["published"]).json()["title"] == PROJECT + " v2"
    editor.get_by_role("button", name="版本", exact=True).click()
    with editor.expect_response(lambda response: "/api/rollback" in response.url) as rollback:
        editor.get_by_role("button", name="回退至此版", exact=True).click()
    assert rollback.value.ok, rollback.value.text()
    assert editor.request.get(urls["versions"]).json()["active"] == original_version
    assert editor.request.get(urls["published"]).json() == published
    viewer.reload()
    normal()

    editor.goto(base + "/editor?project=" + project)
    expect(editor.locator('[data-cell-id="' + cells["pressure"] + '"]')).to_contain_text(re.compile(r"0\.15\s*MPa"))
    editor.get_by_label("名称", exact=True).fill(PROJECT)
    with editor.expect_download() as dl:
        project_action(editor, "导出离线演示")
    offline = out / "SS-02-readonly-demo.html"
    dl.value.save_as(offline)
    viewer.set_viewport_size({"width": 1920, "height": 1080})
    offline_requests = []
    viewer.on("request", lambda req: offline_requests.append(req.url) if req.url.startswith("http") else None)
    viewer.goto(offline.as_uri())
    normal()
    assert not offline_requests, offline_requests
    viewer.screenshot(path=str(out / "offline-1920.png"))
    return {"disconnectMs": lost_ms, "recoveryMs": recovered_ms, "activeRelease": original_version,
            "offlineHttpRequests": len(offline_requests)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "works/ss02-readonly-trial")
    out = parser.parse_args().out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    upstream = ThreadingHTTPServer(("127.0.0.1", 0), Snapshot)
    threading.Thread(target=upstream.serve_forever, daemon=True).start()
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    source = f"http://127.0.0.1:{upstream.server_port}/snapshot"
    try:
        with tempfile.TemporaryDirectory() as store:
            process = subprocess.Popen(
                ["node", "apps/scada-designer/server.mjs"], cwd=ROOT,
                env={**os.environ, "STUDIO_PORT": str(port), "STUDIO_DATA_DIR": store, "STUDIO_ENTRY": "projects"},
            )
            try:
                for _ in range(80):
                    try:
                        urlopen(base + "/api/projects", timeout=1).close()
                        break
                    except OSError:
                        time.sleep(.1)
                else:
                    raise RuntimeError("Studio did not start")
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch()
                    editor = browser.new_page(viewport={"width": 1920, "height": 1080})
                    viewer = browser.new_page(viewport={"width": 1366, "height": 768})
                    errors = []
                    requests = []
                    for page in (editor, viewer):
                        page.set_default_timeout(8000)
                        page.on("pageerror", lambda err: errors.append(str(err)))
                    viewer.on("request", lambda req: requests.append(req) if req.url.startswith("http") else None)
                    try:
                        started = time.monotonic()
                        project, cells, urls, published = author(editor, base, source, out)
                        authored_ms = round((time.monotonic() - started) * 1000)
                        readback = observe(editor, viewer, base, project, cells, urls, published, out)
                        assert not errors, errors
                        assert all(req.method == "GET" or req.url == base + "/api/sample" for req in requests)
                        assert Snapshot.reads > 0 and Snapshot.writes == 0
                        backup = editor.request.get(base + "/api/project-backup?project=" + project)
                        assert backup.ok, backup.text()
                        (out / "SS-02-readonly-backup.json").write_text(backup.text(), "utf-8")
                    except Exception:
                        editor.screenshot(path=str(out / "editor-failure.png"))
                        viewer.screenshot(path=str(out / "viewer-failure.png"))
                        raise
                    finally:
                        browser.close()
            finally:
                process.terminate()
                process.wait(timeout=15)
    finally:
        upstream.shutdown()
        upstream.server_close()
    result = {
        "scope": "SS-02 discharge mini-section, UI authoring, synthetic loopback input",
        "nodes": len(published["nodes"]), "pipes": len(published["pipes"]),
        "points": len(published["mappings"]), "browserAuthoringMs": authored_ms,
        "upstreamReads": Snapshot.reads, "upstreamWrites": Snapshot.writes,
        **readback,
    }
    (out / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
