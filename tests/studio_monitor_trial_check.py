"""Exercise a read-only upstream snapshot, historical quality, event order and rollback."""
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
from studio_ui import publish

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "works/hmi-monitor-acceptance"


class Snapshot(BaseHTTPRequestHandler):
    offline = False
    missing_events = False

    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.offline:
            self.send_response(503)
            self.end_headers()
            return
        stamp = int(time.time() * 1000)
        historical = [
            {"time": stamp - 2000, "value": 4.5, "quality": "good"},
            {"time": stamp - 4000, "value": 3, "quality": "good"},
            {"time": stamp - 3000, "value": 9999, "quality": "bad"},
        ]
        events = [
            {"occurredAt": "2026-11-19T14:04:00+08:00", "level": "警告",
             "state": "已恢复", "message": "原水液位恢复"},
            {"occurredAt": "2026-11-19T06:06:00Z", "level": "高",
             "state": "活动 · 待确认", "message": "格栅压差高"},
        ]
        points = [
            {"id": "level", "value": 16000, "kind": "number", "label": "进水液位", "unit": "m"},
            {"id": "history", "value": historical, "kind": "dataset", "label": "进水历史", "unit": "m"},
            {"id": "events", "value": events, "kind": "dataset", "label": "上游告警"},
        ]
        if self.missing_events:
            points = [point for point in points if point["id"] != "events"]
        for point in points:
            point.update(quality="good", receivedAt=stamp)
        data = json.dumps({"points": points}, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def make_doc(source):
    script = """
      import { blankScreen, screenNode } from './packages/runtime/studio/screen-model.mjs';
      import { protocolMappings } from './apps/scada-designer/studio/model.mjs';
      const doc = blankScreen(); doc.title = '预处理进水监视 · 本机台架';
      doc.canvas.theme = 'process-gray'; doc.canvas.purpose = 'process';
      doc.source = {kind:'rest', url:process.argv[1], pollMs:300, maxAgeMs:3000};
      doc.mappings = protocolMappings([
        {id:'level',label:'进水液位',kind:'number',unit:'m'},
        {id:'history',label:'进水历史',kind:'dataset',unit:'m'},
        {id:'events',label:'上游告警',kind:'dataset'},
      ], 'rest', []);
      doc.mappings[0].conversion = {mode:'raw420',engineeringMin:0,engineeringMax:6};
      for (const [symbol,id,title,x,y,w,h] of [
        ['readout','level','进水池液位',80,90,460,180],
        ['trend','history','进水池液位历史',80,320,850,450],
        ['events','events','预处理告警与事件',980,320,860,450],
      ]) {
        const n=screenNode(symbol,id,x,y); Object.assign(n,{title,w,h});
        n.bindings.value=id;
        doc.nodes.push(n);
      }
      const events=doc.nodes[2].params;
      events.columns=[
        {field:'occurredAt',title:'时间',format:'time',unit:''},
        {field:'message',title:'告警',format:'text',unit:''},
        {field:'state',title:'状态',format:'text',unit:''},
      ];
      events.sortField='occurredAt'; events.sortDirection='desc';
      console.log(JSON.stringify(doc));
    """
    return json.loads(subprocess.check_output(["node", "--input-type=module", "-e", script, source], cwd=ROOT))


def exercise(browser, base):
    editor = browser.new_page(viewport={"width": 1440, "height": 900})
    viewer = browser.new_page(viewport={"width": 1366, "height": 768})
    errors = []
    for page in (editor, viewer):
        page.on("pageerror", lambda error: errors.append(str(error)))
    editor.goto(base)
    editor.get_by_role("tab", name="图层", exact=False).click()
    editor.locator('[data-layer="history"]').click()
    editor.get_by_role("tab", name="外观", exact=True).click()
    expect(editor.locator('datalist[id="chart-fields-history"] option[value="quality"]')).to_have_count(1)
    field = editor.get_by_label("序列 1 质量字段", exact=True)
    field.fill("quality")
    field.press("Tab")
    Snapshot.missing_events = True
    try:
        editor.get_by_role("button", name="预览发布", exact=True).click()
        status = editor.locator("details.quality-note")
        expect(status.locator("summary")).to_have_text("1 个测点当前无有效读数")
        status.locator("summary").click()
        expect(status).to_contain_text("events · 样本缺少该测点记录")
        expect(editor.get_by_role("button", name="发布", exact=True)).to_be_enabled()
    finally:
        Snapshot.missing_events = False
    expect(status).to_have_count(0)
    editor.get_by_role("button", name="发布", exact=True).click()
    expect(editor.get_by_role("status")).to_contain_text("已发布")

    def runtime_ready():
        expect(viewer.locator('[data-cell-id="level"]')).to_contain_text("4.50 m", timeout=12000)
        viewer.wait_for_function("""() => {
            const host = document.querySelector(".screen-chart-host");
            const data = host && echarts.getInstanceByDom(host)?.getOption()?.series[0]?.data;
            return data?.length === 3 && String(data.map(p => p[1])) === "3,,4.5";
        }""")
        events = viewer.locator('[data-cell-id="events"]')
        expect(events).to_contain_text("活动 · 待确认")
        expect(events).to_contain_text("已恢复")
        messages = events.text_content()
        assert messages.index("格栅压差高") < messages.index("原水液位恢复")

    viewer.goto(base + "/view")
    runtime_ready()
    viewer.screenshot(path=str(OUT / "online.png"))
    disconnected_at = time.monotonic()
    Snapshot.offline = True
    try:
        expect(viewer.locator('[data-cell-id="level"]')).to_contain_text("离线", timeout=12000)
        expect(viewer.locator('[data-cell-id="events"]')).not_to_contain_text("格栅压差高")
        detection_ms = round((time.monotonic() - disconnected_at) * 1000)
        viewer.screenshot(path=str(OUT / "disconnected.png"))
    finally:
        Snapshot.offline = False
    reconnect_at = time.monotonic()
    runtime_ready()
    recovery_ms = round((time.monotonic() - reconnect_at) * 1000)

    original = editor.request.get(base + "/api/published").json()
    updated = {**original, "title": original["title"] + " · 二版"}
    assert editor.request.post(base + "/api/draft", data=updated).ok
    editor.goto(base)
    publish(editor)
    expect(editor.get_by_role("status")).to_contain_text("已发布")
    editor.get_by_role("button", name="版本", exact=True).click()
    editor.get_by_role("button", name="回退至此版", exact=True).click()
    assert editor.request.get(base + "/api/published").json() == original
    viewer.reload()
    runtime_ready()
    assert not errors, errors
    return {"detectionMs": detection_ms, "recoveryMs": recovery_ms}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    fixture = ThreadingHTTPServer(("127.0.0.1", 0), Snapshot)
    threading.Thread(target=fixture.serve_forever, daemon=True).start()
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with tempfile.TemporaryDirectory() as directory:
            doc = make_doc(f"http://127.0.0.1:{fixture.server_port}/snapshot")
            (Path(directory) / "project.json").write_text(json.dumps({"draft": doc, "versions": [], "active": None}), "utf-8")
            process = subprocess.Popen(
                ["node", "apps/scada-designer/server.mjs"], cwd=ROOT,
                env={**os.environ, "STUDIO_PORT": str(port), "STUDIO_DATA_DIR": directory, "STUDIO_ENTRY": "editor"},
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
                    try:
                        timings = exercise(browser, base)
                    finally:
                        browser.close()
            finally:
                process.terminate()
                process.wait(timeout=15)
    finally:
        fixture.shutdown()
        fixture.server_close()
    result = {"scope": "local read-only upstream fixture", **timings, "verified": [
        "sample field suggestions", "raw and engineering values", "history quality and order",
        "missing source records in publish review", "alarm lifecycle readback",
        "offline and recovery", "published version rollback",
    ]}
    (OUT / "results.json").write_text(json.dumps(result, indent=2), "utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
