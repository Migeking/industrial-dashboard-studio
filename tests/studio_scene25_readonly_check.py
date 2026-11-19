"""Publish the authored 25 screen with a disposable, read-only REST source."""
import argparse
import copy
import json
import os
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright


def serve_snapshot(points, state):
    class Snapshot(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            state["writeRequests"] += 1
            self.send_error(405)

        def do_GET(self):
            if self.path != "/snapshot":
                self.send_error(404)
                return
            state["samples"] += 1
            mode = state["mode"]
            if mode == "offline":
                self.send_error(503)
                return
            rows = copy.deepcopy(points)
            indexed = {row["id"]: row for row in rows}
            indexed["plant.events"]["value"][0]["deviceRef"] = "unknown-equipment"
            if mode in ("fault", "second-fault"):
                tag, line = ("DC101", "一号") if mode == "fault" else ("DC102", "二号")
                indexed[tag+".fault"]["value"] = True
                indexed[tag+".run"]["value"] = False
                indexed["plant.events"]["value"][0].update({
                    "级别 / 设备": "故障 · " + tag, "事件内容": line + "脱水机故障",
                    "确认状态": "待确认", "deviceRef": "DC-" + tag[2:],
                })
            if mode == "recovered":
                indexed["plant.events"]["value"][0].update({
                    "级别 / 设备": "恢复 · DC101", "事件内容": "一号脱水机已恢复",
                    "确认状态": "已恢复",
                })
            now = int(time.time() * 1000)
            for row in rows:
                row["receivedAt"] = now
            body = json.dumps({"points": rows}, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Snapshot


def publish(page, base=None):
    if base:
        page.goto(base)
    page.get_by_role("button", name="预览发布", exact=True).click()
    page.get_by_role("button", name="发布", exact=True).click()
    expect(page.locator(".status-message")).to_contain_text("已发布")


def exercise(browser, base, doc, state, out):
    editor = browser.new_page(viewport={"width": 1440, "height": 900})
    viewer = browser.new_page(viewport={"width": 1366, "height": 768})
    errors, source_requests = [], []
    for page in (editor, viewer):
        page.on("pageerror", lambda error: errors.append(str(error)))
    viewer.on("request", lambda request: source_requests.append((request.method, request.url))
              if request.method not in ("GET", "HEAD") else None)
    editor.goto(base)
    equipment_nodes = [
        next(node for node in doc["nodes"] if node["symbol"] == "decanterCentrifuge" and
             node["bindings"].get("fault") == tag + ".fault")
        for tag in ("DC101","DC102")
    ]
    for index, node in enumerate(equipment_nodes, 101):
        editor.get_by_role("tab", name="图层", exact=False).click()
        editor.locator(f'[data-layer="{node["id"]}"]').click()
        editor.get_by_role("tab", name="交互", exact=True).click()
        code = f"DC-{index}"
        field = editor.get_by_label("设备编号",exact=True)
        field.fill(code)
        field.press("Tab")
        node["params"]["equipmentCode"] = code
    events_node = next(node for node in doc["nodes"] if node["symbol"] == "events")
    editor.get_by_role("tab", name="图层", exact=False).click()
    editor.locator(f'[data-layer="{events_node["id"]}"]').click()
    editor.get_by_role("tab", name="外观", exact=True).click()
    field = editor.get_by_label("告警定位字段", exact=True)
    field.fill("deviceRef")
    field.press("Tab")
    events_node["params"]["deviceRefField"] = "deviceRef"
    publish(editor)
    assert editor.request.get(base + "/api/published").json() == doc
    first_version = editor.request.get(base + "/api/versions").json()
    assert first_version["versions"][0]["documentMatches"]
    viewer.goto(base + "/view")
    expect(viewer.locator(".x6-node")).to_have_count(len(doc["nodes"]))
    expect(viewer.locator(".x6-edge")).to_have_count(len(doc["pipes"]))

    def bound(symbol, key, value):
        node = next(n for n in doc["nodes"]
                    if n["symbol"] == symbol and n["bindings"].get(key) == value)
        return viewer.locator(f'[data-cell-id="{node["id"]}"]')

    flow = bound("readout", "value", "plant.flow")
    equipment = bound("decanterCentrifuge", "fault", "DC101.fault")
    other_equipment = bound("decanterCentrifuge", "fault", "DC102.fault")
    events = bound("events", "value", "plant.events")
    expect(events.get_by_role("button")).to_have_count(0)
    expect(equipment).to_have_attribute("data-state", "运行")
    expect(viewer.get_by_role("button", name="PAM 投加配比 · +", exact=True)).to_be_disabled()
    expect(viewer.get_by_role("button", name="演示工况 · 常规运行", exact=True)).to_be_disabled()
    chart = bound("trend", "value", "plant.history").locator(".screen-chart-host")
    chart_handle = chart.element_handle()
    for label, count in [("8 h", 9), ("24 h", 25)]:
        option = viewer.get_by_role("button", name="趋势时间 · " + label, exact=True)
        option.click()
        expect(option).to_have_attribute("aria-pressed", "true")
        viewer.wait_for_function(
            """({chart, count}) => {
                const series = echarts.getInstanceByDom(chart)?.getOption()?.series;
                return series?.length === 2 && series.every(s => s.data.length === count)
            }""",
            arg={"chart": chart_handle, "count": count},
        )
    chart_handle.dispose()
    state["mode"] = "fault"
    expect(equipment).to_have_attribute("data-state", "故障")
    expect(events).to_contain_text("一号脱水机故障")
    expect(events).to_contain_text("待确认")
    expect(other_equipment).to_have_attribute("data-state", "运行")

    def open_alarm_device(index, screenshot):
        title = equipment_nodes[index]["title"]
        events.get_by_role("button", name="查看设备 " + title, exact=True).click()
        details = viewer.get_by_role("dialog", name=title + " 设备详情", exact=True)
        expect(details).to_contain_text("只读监视")
        expect(details).to_contain_text("故障")
        expect(details).to_contain_text(f"DC-{101+index}")
        viewer.screenshot(path=str(out / screenshot))
        details.get_by_role("button", name="关闭详情", exact=True).click()

    open_alarm_device(0, "alarm-device.png")
    viewer.screenshot(path=str(out / "fault.png"))
    state["mode"] = "second-fault"
    expect(other_equipment).to_have_attribute("data-state", "故障")
    expect(equipment).to_have_attribute("data-state", "运行")
    expect(events).to_contain_text("二号脱水机故障")
    open_alarm_device(1, "alarm-device-second.png")
    start = time.monotonic()
    state["mode"] = "offline"
    expect(flow).to_contain_text("离线")
    expect(events).not_to_contain_text("二号脱水机故障")
    detection = round((time.monotonic() - start) * 1000)
    viewer.screenshot(path=str(out / "disconnected.png"))
    start = time.monotonic()
    state["mode"] = "recovered"
    expect(equipment).to_have_attribute("data-state", "运行")
    expect(other_equipment).to_have_attribute("data-state", "运行")
    expect(events).to_contain_text("一号脱水机已恢复")
    recovery = round((time.monotonic() - start) * 1000)
    viewer.screenshot(path=str(out / "recovered.png"))

    updated = {**doc, "title": doc["title"] + " · 二版"}
    assert editor.request.post(base + "/api/draft", data=updated).ok
    publish(editor, base)
    editor.get_by_role("button", name="版本", exact=True).click()
    editor.get_by_role("button", name="回退至此版", exact=True).click()
    dialog = editor.get_by_role("dialog", name="发布版本")
    active = dialog.get_by_role("button", name="当前展示", exact=True)
    expect(active.locator("..")).not_to_contain_text("二版")
    dialog.get_by_role("button", name="关闭", exact=True).click()
    expect(editor.locator(".status-message")).to_contain_text("展示端已切换版本")
    expect(editor.locator(".publish-success")).to_have_count(0)
    assert editor.request.get(base + "/api/versions").json()["active"] == first_version["active"]
    assert editor.request.get(base + "/api/published").json() == doc
    viewer.reload()
    expect(events).to_contain_text("一号脱水机已恢复")
    assert set(source_requests) == {("POST", base + "/api/sample")}, source_requests
    assert state["writeRequests"] == 0 and not errors, (state, errors)
    return {"detectionMs": detection, "recoveryMs": recovery, "release": first_version["active"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path("works/scene25-refinement/project.json"))
    parser.add_argument("--out", type=Path, default=Path("works/scene25-readonly-acceptance"))
    args = parser.parse_args()
    doc = json.loads(args.project.read_text("utf-8-sig"))
    if doc["source"]["kind"] != "json" or doc["source"].get("demo") is not True:
        raise ValueError("Use the authored 25 local demo source as the fixture")
    payload = json.loads(doc["source"]["data"])
    points = payload["points"]
    args.out.mkdir(parents=True, exist_ok=True)
    labels = {
        "demo": "工艺监视 · 只读",
        "kpi-note0": "两路浓缩池进泥汇总",
        "kpi-note1": "浓缩池出泥",
        "kpi-note2": "脱水出料",
        "kpi-note3": "本日干固体累计",
        "kpi-note4": "脱水机组统计",
        "bin-note": "料位来自测点反馈",
        "trend-title": "工艺历史趋势",
    }
    for node in doc["nodes"]:
        if node["symbol"] == "text" and node["title"] in labels:
            node["text"] = labels[node["title"]]
    events = next(point for point in points if point["id"] == "plant.events")
    events["value"] = [
        {("事件时间" if key == "模拟时刻" else key): value for key, value in row.items()}
        for row in events["value"]
    ]
    demo_title, demo_mappings = doc["title"], copy.deepcopy(doc["mappings"])
    demo_source = {**doc["source"], "data": json.dumps(payload,ensure_ascii=False)}
    state = {"mode": "normal", "samples": 0, "writeRequests": 0}
    upstream = ThreadingHTTPServer(("127.0.0.1", 0), serve_snapshot(points, state))
    threading.Thread(target=upstream.serve_forever, daemon=True).start()
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    doc["title"] = "25 污泥脱水工段 · 本机只读台架"
    doc["source"] = {
        "kind": "rest", "url": f"http://127.0.0.1:{upstream.server_port}/snapshot",
        "pollMs": 500, "maxAgeMs": 4000,
    }
    for point in doc["mappings"]:
        point["timePath"] = "receivedAt"
    try:
        with tempfile.TemporaryDirectory() as data:
            (Path(data) / "project.json").write_text(json.dumps({
                "draft": doc, "versions": [], "active": None,
            }), "utf-8")
            server = subprocess.Popen(
                ["node", "apps/scada-designer/server.mjs"],
                env={**os.environ, "STUDIO_ENTRY": "editor", "STUDIO_DATA_DIR": data,
                     "STUDIO_PORT": str(port), "STUDIO_API_ORIGIN": ""},
            )
            try:
                for _ in range(60):
                    try:
                        urlopen(base + "/api/draft", timeout=1).close()
                        break
                    except OSError:
                        time.sleep(.15)
                else:
                    raise TimeoutError("Studio did not start")
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch()
                    try:
                        observations = exercise(browser, base, doc, state, args.out)
                    finally:
                        browser.close()
            finally:
                server.terminate()
                server.wait(timeout=15)
    finally:
        upstream.shutdown()
        upstream.server_close()
    result = {"scope": "scene 25 with loopback synthetic REST data",
              "nodes": len(doc["nodes"]), "pipes": len(doc["pipes"]), "points": len(points),
              "samples": state["samples"], "upstreamWriteRequests": state["writeRequests"],
              "verified": ["publish with original bindings", "read-only controls", "8/24 hour history",
                           "independent faults and lookup by device code on both centrifuges",
                            "offline and recovery", "rollback"],
              **observations}
    demo_doc = {**doc, "title": demo_title, "source": demo_source, "mappings": demo_mappings}
    (args.out / "scene25-demo-project.json").write_text(json.dumps(demo_doc, ensure_ascii=False, indent=2), "utf-8")
    (args.out / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
