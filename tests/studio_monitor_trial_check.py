"""Exercise a read-only upstream snapshot, point crosswalk and monitoring workflow."""
import csv
import hashlib
import json
import os
import re
import socket
import subprocess
import tempfile
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from playwright.sync_api import expect, sync_playwright
from studio_monitor_soak import observe
from studio_ui import publish

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "works/hmi-monitor-acceptance"


class Snapshot(BaseHTTPRequestHandler):
    offline = False
    missing_events = False
    frozen_at = None
    new_alarm = False
    new_alarm_seen = threading.Event()
    level_raw = 16000
    reads = 0
    read_lock = threading.Lock()
    read_delay = 0

    def log_message(self, *_):
        pass

    def do_GET(self):
        with self.read_lock:
            Snapshot.reads += 1
            sequence = Snapshot.reads
        if self.read_delay:
            time.sleep(self.read_delay)
        if self.offline:
            self.send_response(503)
            self.end_headers()
            return
        stamp = self.frozen_at if self.frozen_at is not None else int(time.time() * 1000)
        historical = [
            {"observedAt": stamp - 2000, "reading": "4.5", "quality": "good"},
            {"observedAt": stamp - 4000, "reading": 3, "quality": "good"},
            {"observedAt": stamp - 3000, "reading": 9999, "quality": "bad"},
        ]
        events = [
            {"occurredAt": "2026-11-19T14:04:00+08:00", "level": "警告",
             "state": "已恢复", "message": "原水液位恢复"},
            {"occurredAt": "2026-11-19T06:06:00Z", "level": "高",
             "state": "活动 · 待确认", "message": "格栅压差高"},
            {"occurredAt": "2026-11-19T06:02:00Z", "level": "警告",
             "state": "已恢复", "message": "历史进水液位高", "deviceRef": "level-tank"},
        ]
        for row in historical:
            row["equipment"] = {"id": "LT-101"}
        historical.append({"observedAt": stamp - 1500, "reading": 71, "quality": "good",
                           "equipment": {"id": "LT-102"}})
        for row in events:
            row["area"] = "预处理"
        events.append({"occurredAt": "2026-11-19T06:08:00Z", "level": "高",
                       "state": "活动 · 待确认", "message": "外区设备故障", "area": "外区"})
        new_alarm = self.new_alarm
        if new_alarm:
            events.append({"occurredAt": "2026-11-19T06:12:00Z", "level": "高",
                           "state": "活动 · 待确认", "message": "新到告警 流量偏低", "area": "预处理"})
        points = [
            {"id": "LT-101.PV", "value": self.level_raw, "kind": "number", "label": "进水液位", "unit": "原码"},
            {"id": "history", "value": historical, "kind": "dataset", "label": "进水历史", "unit": "m"},
            {"id": "events", "value": events, "kind": "dataset", "label": "上游告警"},
        ]
        if self.missing_events:
            points = [point for point in points if point["id"] != "events"]
        for point in points:
            point.update(quality="good", receivedAt=stamp)
        data = json.dumps({"points": points, "sequence": sequence}, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        if new_alarm:
            self.new_alarm_seen.set()


def verify_shared_reads(base, source):
    def read(reuse=None, url=source):
        payload = {"url": url}
        if reuse is not None:
            payload["reuseMs"] = reuse
        request = Request(base + "/api/sample", json.dumps(payload).encode(),
                          {"Content-Type": "application/json"})
        try:
            response = urlopen(request, timeout=8)
        except HTTPError as error:
            response = error
        with response:
            return response.code, response.headers.get("X-Studio-Received-At"), json.load(response)

    Snapshot.read_delay = .2
    gate = threading.Barrier(4)

    def simultaneous(_):
        gate.wait(timeout=5)
        return read()

    before = Snapshot.reads
    try:
        with ThreadPoolExecutor(4) as threads:
            results = list(threads.map(simultaneous, range(4)))
    finally:
        Snapshot.read_delay = 0
    assert Snapshot.reads - before == 1
    assert all(frame == results[0] for frame in results)
    assert results[0][0] == 200 and int(results[0][1]) > 0
    first = read(3000)
    assert read(3000) == first
    other = read(3000, source + "?other=1")
    assert other[2]["sequence"] == first[2]["sequence"] + 1
    assert read(3000) == first
    manual = read()
    assert manual[0] == 200 and manual[2]["sequence"] == other[2]["sequence"] + 1
    short = read(80)
    time.sleep(.12)
    Snapshot.offline = True
    try:
        failed = read(3000)
        count = Snapshot.reads
        assert failed[0] == 400 and failed[2]["error"] == "上游 HTTP 503"
        assert read(3000) == failed and Snapshot.reads == count
    finally:
        Snapshot.offline = False
    recovered = read()
    assert recovered[0] == 200 and recovered[2]["sequence"] == short[2]["sequence"] + 2


def make_doc():
    script = """
      import { blankScreen, screenNode } from './packages/runtime/studio/screen-model.mjs';
      import { screenSlots } from './packages/components/studio/screen-symbols.mjs';
      import { protocolMappings } from './apps/scada-designer/studio/model.mjs';
      const doc = blankScreen(); doc.title = '预处理进水监视 · 本机台架';
      doc.canvas.theme = 'process-gray'; doc.canvas.purpose = 'process';
      doc.source = {kind:'json', demo:true, pollMs:300, maxAgeMs:3000,
        data:JSON.stringify({points:[
          {id:'level',value:12000,quality:'good'},
          {id:'history',value:[],quality:'good'},
          {id:'events',value:[],quality:'good'},
        ]})};
      doc.mappings = protocolMappings([
        {id:'level',label:'进水液位',kind:'number',unit:'m'},
        {id:'history',label:'进水历史',kind:'dataset',unit:'m'},
        {id:'events',label:'上游告警',kind:'dataset'},
      ], 'rest', []);
      doc.mappings[0].conversion = {mode:'raw420',engineeringMin:0,engineeringMax:6};
      for (const m of doc.mappings) m.timePath = '';
      for (const [symbol,id,title,x,y,w,h] of [
        ['readout','level','进水池液位',80,90,460,180],
        ['trend','history','进水池液位历史',80,320,850,450],
        ['events','events','预处理告警与事件',980,320,860,450],
      ]) {
        const n=screenNode(symbol,id,x,y); Object.assign(n,{title,w,h});
        n.bindings.value=id;
        doc.nodes.push(n);
      }
      const [level, trend] = doc.nodes;
      level.dataSlots = [...screenSlots(level),
        {key:'history',label:'面板历史',role:'extra',kinds:['dataset'],required:false}];
      level.bindings.history = 'history';
      trend.params.xField = 'observedAt';
      const events=doc.nodes[2].params;
      events.columns=[
        {field:'occurredAt',title:'时间',format:'time',unit:''},
        {field:'message',title:'告警',format:'text',unit:''},
        {field:'state',title:'状态',format:'text',unit:''},
      ];
      events.sortField='occurredAt'; events.sortDirection='desc';
      events.limit=2; events.deviceRefField='deviceRef';
      const tank=screenNode('tank','level-tank',610,70);
      tank.title='进水池'; tank.w=180; tank.h=205; tank.bindings.value='level';
      doc.nodes.push(tank);
      const picture=screenNode('image','sample-image',1450,90);
      picture.w=160; picture.h=90;
      picture.image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM4sAAAAASUVORK5CYII=';
      doc.nodes.push(picture);
      console.log(JSON.stringify(doc));
    """
    return json.loads(subprocess.check_output(["node", "--input-type=module", "-e", script], cwd=ROOT))


def exercise(browser, base, source):
    editor = browser.new_page(viewport={"width": 1440, "height": 900})
    viewer = browser.new_page(viewport={"width": 1366, "height": 768})
    errors = []
    for page in (editor, viewer):
        page.on("pageerror", lambda error: errors.append(str(error)))
    editor.goto(base)
    editor.get_by_role("button", name="数据连接", exact=True).click()
    connection = editor.get_by_role("dialog")
    connection.get_by_label("来源", exact=True).select_option("rest")
    connection.get_by_label("接口 URL", exact=True).fill(source)
    connection.get_by_role("button", name="读取样本", exact=True).click()
    review = connection.get_by_role("button", name="对照现有点位", exact=True)
    expect(review).to_be_visible()
    connection.get_by_label("接口 URL", exact=True).fill(source + "?changed")
    expect(review).to_have_count(0)
    expect(connection.get_by_role("button", name="从桥接点表生成映射", exact=True)).to_have_count(0)
    connection.get_by_label("接口 URL", exact=True).fill(source)
    review.click()
    expect(connection.get_by_text("已对照 2 / 3 个。", exact=False)).to_be_visible()
    choice = connection.get_by_label("level 的接口测点", exact=True)
    assert choice.locator("option").evaluate_all("(rows) => rows.map(row => row.value)") == ["", "LT-101.PV"]
    with editor.expect_download() as download:
        connection.get_by_role("button", name="导出对照 CSV", exact=True).click()
    exported = Path(download.value.path()).read_bytes()
    assert exported.startswith(b"\xef\xbb\xbf")
    records = list(csv.DictReader(exported.decode("utf-8-sig").splitlines()))
    assert records[0]["画面业务位号"] == "level" and not records[0]["现场点位或字段"]
    assert {r["画面业务位号"] for r in records} == {"level", "history", "events"}
    picker = connection.get_by_label("导入对照 CSV", exact=True)
    picker.set_input_files({
        "name": "invalid.csv", "mimeType": "text/csv",
        "buffer": ("画面业务位号,现场点位或字段\r\nlevel,LT-101.PV\r\n"
                   "history,LT-101.PV\r\nmissing,events").encode("utf-8-sig"),
    })
    import_errors = connection.get_by_role("alert")
    expect(import_errors).to_contain_text("第 2 条记录 · history · 接口点 LT-101.PV 的数据类型不匹配")
    expect(import_errors).to_contain_text("第 3 条记录 · missing · 画面位号不存在")
    expect(import_errors).to_be_focused()
    expect(choice).to_have_value("")
    editor.screenshot(path=str(OUT / "crosswalk-rejected.png"))
    picker.set_input_files({
        "name": "point-crosswalk.csv", "mimeType": "text/csv",
        "buffer": ("画面业务位号,数据类型,现场来源,现场点位或字段\r\n"
                   "level,number,REST,LT-101.PV\r\nhistory,dataset,REST,").encode("utf-8-sig"),
    })
    expect(import_errors).to_have_count(0)
    expect(connection.get_by_text("已载入 1 个接口编号", exact=False)).to_be_visible()
    expect(choice).to_have_value("LT-101.PV")
    expect(connection.get_by_text("16000 → 4.50 m", exact=True)).to_be_visible()
    expect(connection.get_by_text("已对照 3 / 3 个。", exact=False)).to_be_visible()
    editor.screenshot(path=str(OUT / "point-review.png"))
    connection.get_by_role("button", name="采用对照结果", exact=True).click()
    points = connection.get_by_label("测点", exact=True)
    filtration = connection.get_by_role("group", name="数据集行筛选")

    def add_filter(index, field, value):
        points.select_option(index=index)
        filtration.get_by_role("button", name="添加行筛选").click()
        expect(filtration.get_by_role("status")).to_contain_text("请输入筛选字段")
        expect(filtration.locator(f'#dataset-filter-fields option[value="{field}"]')).to_have_count(1)
        filtration.get_by_label("筛选字段").fill(field)
        expect(filtration.locator(f'#dataset-filter-values option[value="{value}"]')).to_have_count(1)
        return filtration.get_by_label("筛选匹配值")

    matching_value = add_filter(1, "equipment.id", "LT-101")
    matching_value.fill("不存在的点")
    expect(filtration.get_by_role("status")).to_contain_text("命中 0 / 4 行")
    matching_value.fill("LT-101")
    expect(filtration.get_by_role("status")).to_contain_text("命中 3 / 4 行")
    expect(connection.get_by_role("button", name="应用数据配置", exact=True)).to_be_in_viewport()
    editor.screenshot(path=str(OUT / "dataset-filter-preview.png"))
    connection.get_by_role("button", name="复制数据集").click()
    expect(connection.locator("select[aria-label='测点'] option:checked")).to_contain_text("history.copy")
    expect(filtration.get_by_label("筛选字段")).to_have_value("equipment.id")
    matching_value.fill("LT-102")
    expect(filtration.get_by_role("status")).to_contain_text("命中 1 / 4 行")
    points.select_option(index=1)
    expect(matching_value).to_have_value("LT-101")
    points.select_option(index=3)
    filtration.get_by_role("button", name="清除行筛选").click()
    expect(filtration.get_by_role("button", name="添加行筛选")).to_be_visible()
    connection.get_by_role("button", name="移除测点").click()
    add_filter(2, "area", "预处理").fill("预处理")
    expect(filtration.get_by_role("status")).to_contain_text("命中 3 / 4 行")
    connection.get_by_role("button", name="应用数据配置", exact=True).click()
    expect(connection).to_have_count(0)
    editor.get_by_role("button", name="撤销", exact=True).click()
    expect(editor.locator('[data-cell-id="level"]')).to_contain_text("3.00 m")
    editor.get_by_role("button", name="重做", exact=True).click()
    expect(editor.locator('[data-cell-id="level"]')).to_contain_text("4.50 m")
    editor.get_by_role("tab", name="图层", exact=False).click()
    editor.locator('[data-layer="history"]').click()
    editor.get_by_role("tab", name="外观", exact=True).click()
    expect(editor.locator('datalist[id="chart-fields-history"] option[value="quality"]')).to_have_count(1)
    for label, value in [("序列 1 数值字段", "reading"), ("序列 1 质量字段", "quality")]:
        field = editor.get_by_label(label, exact=True)
        field.fill(value)
        field.press("Tab")
    editor.locator('[data-layer="level"]').click()
    editor.get_by_role("tab", name="交互", exact=True).click()
    editor.get_by_label("点击动作", exact=True).select_option("trend")
    editor.get_by_label("趋势面板槽位", exact=True).select_option("history")
    for label, value in [
        ("趋势面板时间字段", "observedAt"),
        ("趋势面板数值字段", "reading"),
        ("趋势面板质量字段", "quality"),
    ]:
        field = editor.get_by_label(label, exact=True)
        field.fill(value)
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

    def runtime_ready(page=viewer):
        expect(page.locator('[data-cell-id="level"]')).to_contain_text("4.50 m", timeout=12000)
        page.wait_for_function("""() => {
            const host = document.querySelector('[data-cell-id="history"] .screen-chart-host');
            const data = host && echarts.getInstanceByDom(host)?.getOption()?.series[0]?.data;
            return data?.length === 3 && String(data.map(p => p[1])) === "3,,4.5";
        }""")
        events = page.locator('[data-cell-id="events"]')
        expect(events).to_contain_text("活动 · 待确认")
        expect(events).to_contain_text("已恢复")
        expect(events).not_to_contain_text("外区设备故障")
        messages = events.text_content()
        assert messages.index("格栅压差高") < messages.index("原水液位恢复")

    viewer.goto(base + "/view")
    runtime_ready()
    viewer.screenshot(path=str(OUT / "online.png"))
    diagnostic_trigger = viewer.get_by_role("button", name="测点诊断", exact=True)
    diagnostic = viewer.get_by_role("dialog", name="测点诊断", exact=True)
    diagnostic_trigger.click()
    expect(diagnostic).to_contain_text("3 个画面测点 · 0 个异常")
    level_row = diagnostic.get_by_role("row", name="进水液位", exact=False)
    expect(level_row).to_contain_text("4.50 m")
    expect(level_row).to_contain_text("原值 16000")
    expect(level_row).to_contain_text("接收")
    viewer.keyboard.press("Escape")
    expect(diagnostic).not_to_be_visible()
    Snapshot.level_raw = 3999
    try:
        expect(diagnostic_trigger).to_have_text("1 个异常测点")
        diagnostic_trigger.click()
        expect(diagnostic.get_by_role("checkbox", name="仅显示异常")).to_be_checked()
        expect(diagnostic.locator("tbody tr")).to_have_count(1)
        expect(level_row).to_contain_text("原值 3999")
        expect(level_row).to_contain_text("原值超出输入量程")
        expect(level_row).not_to_contain_text("4.50 m")
        viewer.screenshot(path=str(OUT / "point-diagnostics.png"))
        level_row.get_by_role("button", name="定位 进水池", exact=True).click()
        expect(diagnostic).not_to_be_visible()
        expect(viewer.locator('[data-cell-id="level-tank"]')).to_have_class(
            re.compile(r"\bscreen-diagnostic-target\b"),
        )
        expect(viewer.get_by_role("status")).to_contain_text("已标出 进水池")
    finally:
        Snapshot.level_raw = 16000
    runtime_ready()
    expect(diagnostic_trigger).to_have_text("测点诊断")
    events = viewer.locator('[data-cell-id="events"]')
    pager = events.get_by_role("navigation", name="告警分页")
    expect(pager).to_contain_text("第 1 / 2 页")
    expect(events).not_to_contain_text("历史进水液位高")
    next_page = pager.get_by_role("button", name="下一页", exact=True)
    next_page.focus()
    next_page.press("Enter")
    expect(pager).to_contain_text("第 2 / 2 页 · 3 条 · 查阅快照")
    expect(events).to_contain_text("历史进水液位高")
    expect(pager.get_by_role("button", name="上一页", exact=True)).to_be_focused()
    Snapshot.new_alarm_seen.clear()
    Snapshot.new_alarm = True
    try:
        assert Snapshot.new_alarm_seen.wait(6), "浏览页未刷新实时告警"
        expect(pager).to_contain_text("第 2 / 2 页 · 3 条 · 查阅快照 · 实时列表有更新")
        expect(events).to_contain_text("历史进水液位高")
        expect(events).not_to_contain_text("原水液位恢复")
        viewer.screenshot(path=str(OUT / "event-page-two.png"))
        events.get_by_role("button", name="查看设备 进水池", exact=True).click()
        details = viewer.get_by_role("dialog", name="进水池 设备详情")
        expect(details).to_contain_text("只读监视")
        details.get_by_role("button", name="关闭详情").click()
        pager.get_by_role("button", name="返回实时").click()
        expect(pager).to_contain_text("第 1 / 2 页 · 4 条")
        expect(events).to_contain_text("新到告警 流量偏低")
    finally:
        Snapshot.new_alarm = False
    runtime_ready()
    level = viewer.locator('[data-cell-id="level"]')
    level.click()
    popup = viewer.get_by_role("dialog", name="进水池液位 设备详情")
    expect(popup).to_contain_text("上游历史数据")
    viewer.wait_for_function("""() => {
        const host = document.querySelector(".runtime-trend-host");
        const series = host && echarts.getInstanceByDom(host)?.getOption()?.series[0];
        const data = series?.data;
        return series?.connectNulls === false && data?.length === 3 &&
            data[0][1] === 3 && data[1][1] === null && data[2][1] === 4.5 &&
            data[0][0] < data[1][0] && data[1][0] < data[2][0];
    }""")
    viewer.screenshot(path=str(OUT / "history-panel.png"))
    Snapshot.frozen_at = int(time.time() * 1000)
    try:
        expect(level).to_contain_text("过期", timeout=12000)
        expect(popup).to_contain_text("过期")
        expect(viewer.get_by_text("已连接 · REST")).to_be_visible()
        expect(viewer.locator('[data-cell-id="events"]')).not_to_contain_text("格栅压差高")
        viewer.screenshot(path=str(OUT / "frozen.png"))
    finally:
        Snapshot.frozen_at = None
    expect(popup).to_contain_text("上游历史数据")
    popup.get_by_role("button", name="关闭详情").click()
    runtime_ready()
    next_page.click()
    expect(events).to_contain_text("历史进水液位高")
    disconnected_at = time.monotonic()
    Snapshot.offline = True
    try:
        expect(viewer.locator('[data-cell-id="level"]')).to_contain_text("离线", timeout=12000)
        expect(viewer.locator('[data-cell-id="events"]')).not_to_contain_text("格栅压差高")
        expect(events).not_to_contain_text("历史进水液位高")
        expect(pager).not_to_be_visible()
        detection_ms = round((time.monotonic() - disconnected_at) * 1000)
        viewer.screenshot(path=str(OUT / "disconnected.png"))
        diagnostic_trigger.click()
        expect(diagnostic).to_contain_text("3 个画面测点 · 3 个异常")
        expect(level_row).to_contain_text("离线")
        expect(level_row).to_contain_text("数据源连接中断")
        expect(level_row).to_contain_text("原值 16000")
        diagnostic.get_by_role("button", name="关闭", exact=True).click()
    finally:
        Snapshot.offline = False
    reconnect_at = time.monotonic()
    runtime_ready()
    expect(pager).to_contain_text("第 1 / 2 页")
    recovery_ms = round((time.monotonic() - reconnect_at) * 1000)

    expect(editor.locator(".screen-source-badge")).to_contain_text("已连接 · REST")
    editor.locator(".project-menu summary").click()
    with editor.expect_download() as download:
        editor.get_by_role("button", name="导出离线演示", exact=True).click()
    offline_path = OUT / "filtered-offline.html"
    download.value.save_as(offline_path)
    offline = browser.new_page(offline=True)
    network = []
    offline.on("pageerror", lambda error: errors.append(str(error)))
    offline.on("request", lambda request: network.append(request.url) if request.url.startswith("http") else None)
    try:
        offline.goto(offline_path.resolve().as_uri())
        runtime_ready(offline)
        assert not network, network
    finally:
        offline.close()

    original = editor.request.get(base + "/api/published").json()
    assert original["source"]["kind"] == "rest"
    assert {m["id"]: m["rowFilter"] for m in original["mappings"] if "rowFilter" in m} == {
        "history": {"field": "equipment.id", "value": "LT-101"},
        "events": {"field": "area", "value": "预处理"},
    }
    assert original["nodes"][0]["bindings"] == {"value": "level", "history": "history"}
    level_mapping = next(row for row in original["mappings"] if row["id"] == "level")
    assert level_mapping["keyValue"] == "LT-101.PV"
    assert level_mapping["conversion"] == {"mode": "raw420", "engineeringMin": 0, "engineeringMax": 6}
    recorded = editor.request.get(base + "/api/versions").json()
    first = recorded["versions"][0]
    receipt = first["manifest"]
    assert receipt["projectId"] == "local" and receipt["points"] == 3
    assert first["documentMatches"] and first["deploymentMatches"]
    assert receipt["assets"] == [{
        "symbol": "image", "version": None,
        "sha256": hashlib.sha256(original["nodes"][-1]["image"].encode()).hexdigest(),
    }]
    assert original["source"]["url"] not in json.dumps(receipt)
    updated = {**original, "title": original["title"] + " · 二版",
               "mappings": [{**m, "precision": 1} if m["id"] == "level" else m
                            for m in original["mappings"]]}
    assert editor.request.post(base + "/api/draft", data=updated).ok
    editor.goto(base)
    publish(editor)
    expect(editor.get_by_role("status")).to_contain_text("已发布")
    editor.get_by_role("button", name="版本", exact=True).click()
    editor.get_by_text("发布追溯", exact=True).first.click()
    expect(editor.get_by_role("dialog")).to_contain_text("当前部署文件 与发布时一致")
    versions = editor.request.get(base + "/api/versions").json()["versions"]
    assert versions[0]["manifest"]["mappingsSha256"] != receipt["mappingsSha256"]
    assert versions[1]["manifest"] == receipt
    editor.get_by_role("button", name="回退至此版", exact=True).click()
    assert editor.request.get(base + "/api/published").json() == original
    assert editor.request.get(base + "/api/versions").json()["active"] == recorded["active"]
    viewer.reload()
    runtime_ready()
    assert not errors, errors
    observer = browser.new_page()
    try:
        samples = []
        arguments = SimpleNamespace(view=base + "/view", seconds=4, interval_seconds=4,
                                    max_gap_seconds=6, release_check_seconds=60)
        observations = {"maxObservationGapSeconds": 0, "observations": 0,
                        "linkObservations": Counter(), "pointQualityObservations": Counter()}
        observe(observer, arguments, lambda event, **sample: samples.append(sample), observations)
        assert observations["observedSeconds"] >= 4
        assert len(samples[-1]["points"]) == 3
        assert all(p["quality"] == "good" for p in samples[-1]["points"])
        assert samples[-1]["trendSamples"] == [[3]]
    finally:
        observer.close()
    observer = browser.new_page()
    try:
        outage_samples = 0
        induced_outage = False

        def change_source(event, **sample):
            nonlocal induced_outage, outage_samples
            if not induced_outage and sample["link"] == "connected":
                induced_outage = True
                Snapshot.offline = True
            elif sample["link"] == "disconnected":
                outage_samples += 1
                if outage_samples == 2:
                    Snapshot.offline = False

        arguments = SimpleNamespace(view=base + "/view", scope="bench", seconds=4,
                                    interval_seconds=.2, max_gap_seconds=3, release_check_seconds=60)
        observed = {"maxObservationGapSeconds": 0, "observations": 0,
                    "linkObservations": Counter(), "pointQualityObservations": Counter()}
        observe(observer, arguments, change_source, observed)
        links = [window for window in observed["connectionWindows"] if window["link"] != "waiting"]
        assert [window["link"] for window in links] == ["connected", "disconnected", "connected"], links
        outage = links[1]
        assert outage["observations"] >= 2
        assert 0 < outage["observedSpanSeconds"] < outage["recoveryObservedSeconds"]
        assert outage["firstObservedAt"] <= outage["lastObservedAt"] < outage["transitionObservedAt"]
        assert observed["renderLoad"]["nodes"] == {"min": 5, "max": 5}
        assert observed["renderLoad"]["trendSamples"] == {"min": 0, "max": 3}
        assert observed["renderLoad"]["renderedEventRows"] == {"min": 0, "max": 2}
        for point in observed["pointStats"].values():
            assert point["qualityObservations"]["offline"] == outage["observations"]
            assert point["reasonObservations"]["disconnected"] == outage["observations"]
            assert point["lastGoodAt"] > point["lastAbnormalAt"]
            assert point["timeBasis"] == "source" and point["maxSourceAgeMs"] >= 0
            assert point["maxReceiveAgeMs"] >= 0
        (OUT / "soak-recovery-summary.json").write_text(json.dumps(observed, indent=2), "utf-8")
    finally:
        Snapshot.offline = False
        observer.close()
    return {"detectionMs": detection_ms, "recoveryMs": recovery_ms,
            "observedRecoverySeconds": outage["recoveryObservedSeconds"]}


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
            source = f"http://127.0.0.1:{fixture.server_port}/snapshot"
            doc = make_doc()
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
                verify_shared_reads(base, source)
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch()
                    try:
                        timings = exercise(browser, base, source)
                    finally:
                        browser.close()
            finally:
                process.terminate()
                process.wait(timeout=15)
    finally:
        fixture.shutdown()
        fixture.server_close()
    result = {"scope": "local read-only upstream fixture", **timings, "verified": [
        "shared concurrent REST reads, original arrival time, manual fresh reads and error recovery",
        "sample field suggestions", "raw and engineering values", "history quality and order",
        "dataset filter preview and copy, shared device history and alarm filtering through publish and offline export",
        "point crosswalk preserves canvas bindings and conversion with undo/redo",
        "CSV export round trip, row errors are atomic, blank entries preserve selections",
        "point diagnostics show raw out-of-range values, timestamps, device location and disconnect reason",
        "live polling stays active across observation intervals longer than the configured data age",
        "observation summary identifies disconnected intervals, affected points, recovery, and display load",
        "alarm pagination stays pinned during refresh, opens device and returns to live",
        "device trend custom fields and gaps", "stale values while transport stays connected",
        "missing source records in publish review", "alarm lifecycle readback",
        "offline and recovery", "published version rollback", "release manifest and snapshot trace",
    ]}
    (OUT / "results.json").write_text(json.dumps(result, indent=2), "utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
