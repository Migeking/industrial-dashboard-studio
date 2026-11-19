"""Verify point commissioning, binding and publishing with a local read-only Modbus fixture."""
import json
import os
import socket
import struct
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from asyncua import ua
from asyncua.sync import Server as UaServer
from playwright.sync_api import expect, sync_playwright
from pymodbus.datastore import ModbusSequentialDataBlock, ModbusServerContext, ModbusSlaveContext
from pymodbus.server.sync import ModbusTcpServer
from studio_ui import publish

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "works/hmi-engineering-acceptance"


class PausableRegisters(ModbusSequentialDataBlock):
    def __init__(self, address, values):
        super().__init__(address, values)
        self.readable = threading.Event()
        self.readable.set()

    def getValues(self, address, count=1):
        self.readable.wait(5)
        return super().getValues(address, count)


def exercise(page, base, device_port, registers):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base)
    page.get_by_role("button", name="管理连接与点位", exact=True).click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("来源", exact=True).select_option("modbus")
    dialog.get_by_label("Modbus 主机", exact=True).fill("127.0.0.1")
    dialog.locator("label").filter(has_text="端口").locator("input").fill(str(device_port))
    scan = dialog.get_by_label("刷新周期（ms）", exact=True)
    assert "200 ms" not in scan.inner_text()
    scan.select_option("500")
    dialog.get_by_label("最大数据年龄（ms）", exact=True).fill("850")
    dialog.get_by_role("button", name="新建点位", exact=True).click()
    dialog.get_by_label("点位名称", exact=True).fill("液位 LT-101")
    dialog.get_by_label("点位单位", exact=True).fill("m")
    dialog.get_by_label("换算方式", exact=True).select_option("raw420")
    expect(dialog.get_by_text("输入原码 4000–20000", exact=True)).to_be_visible()
    dialog.get_by_label("工程下限", exact=True).fill("0")
    dialog.get_by_label("工程上限", exact=True).fill("6")
    dialog.get_by_role("button", name="新建点位", exact=True).click()
    dialog.get_by_label("点位名称", exact=True).fill("流量 FT-101")
    dialog.get_by_label("寄存器序号", exact=True).fill("2")
    dialog.get_by_label("数据格式", exact=True).select_option("float32")
    dialog.get_by_label("点位单位", exact=True).fill("m³/h")
    dialog.get_by_label("倍率", exact=True).fill("100")
    dialog.get_by_label("换算方式", exact=True).select_option("identity")
    dialog.get_by_role("button", name="新建点位", exact=True).click()
    dialog.get_by_label("点位名称", exact=True).fill("备用液位 LT-102")
    dialog.get_by_label("寄存器序号", exact=True).fill("4")
    dialog.get_by_role("button", name="试读点位", exact=True).click()

    def row(name):
        return dialog.locator(".tag-selected tbody tr").filter(has_text=name)

    expect(row("LT-101")).to_contain_text("3.00 m", timeout=15000)
    expect(row("LT-101")).to_contain_text("12000")
    expect(row("FT-101")).to_contain_text("18.25 m³/h")
    expect(row("FT-101")).to_contain_text("有效")
    row("LT-101").click()
    dialog.get_by_label("选择点位 备用液位 LT-102", exact=True).check()
    dialog.get_by_role("button", name="批量套用换算", exact=True).click()
    expect(dialog.get_by_role("region", name="批量换算差异")).to_contain_text("0–6 m")
    dialog.get_by_role("button", name="确认套用换算", exact=True).click()
    expect(row("LT-102")).to_contain_text("4.50 m")
    dialog.get_by_role("button", name="撤销批量换算", exact=True).click()
    expect(row("LT-102")).to_contain_text("16000.00")
    page.screenshot(path=str(OUT / "point-list.png"))
    dialog.get_by_label("工程上限", exact=True).fill("0")
    dialog.get_by_role("button", name="完成并返回画布", exact=True).click()
    expect(dialog.get_by_role("alert").filter(has_text="工程量程").first).to_be_visible()
    dialog.get_by_label("工程上限", exact=True).fill("6")
    dialog.get_by_role("button", name="完成并返回画布", exact=True).click()
    expect(dialog).to_have_count(0)

    def place(symbol, x, y):
        page.get_by_role("tab", name="图元与工具", exact=True).click()
        page.locator(f'[data-symbol="{symbol}"]').click()
        graph = page.locator(".board").bounding_box()
        page.mouse.click(graph["x"] + graph["width"] * x, graph["y"] + graph["height"] * y)
        node = page.locator(".x6-node").last
        expect(node).to_be_visible()
        return node.get_attribute("data-cell-id")

    def bind(symbol, x, y, field, name):
        item_id = place(symbol, x, y)
        page.get_by_role("tab", name="动态与测点", exact=True).click()
        selection = page.get_by_label(field + " · 绑定测点", exact=True)
        option = selection.get_by_role("option").filter(has_text=name)
        selection.select_option(value=option.get_attribute("value"))
        return item_id

    level = bind("readout", .21, .24, "显示数值", "液位 LT-101")
    flow = bind("readout", .56, .24, "显示数值", "流量 FT-101")
    bind("trend", .24, .55, "趋势数据", "液位 LT-101")
    publish(page)
    expect(page.get_by_role("status")).to_contain_text("已发布")
    saved = page.request.get(base + "/api/published").json()
    assert {m.get("conversion", {}).get("mode") for m in saved["mappings"]} == {"identity", "raw420", None}
    page.goto(base + "/view")
    liquid = page.locator(f'.x6-node[data-cell-id="{level}"]')
    flow_display = page.locator(f'.x6-node[data-cell-id="{flow}"]')
    expect(liquid).to_contain_text("3.00 m", timeout=12000)
    expect(flow_display).to_contain_text("18.25 m³/h")

    def trend_contains(value):
        page.wait_for_function(
            """value => {
                const host = document.querySelector(".screen-chart-host");
                const points = host && echarts.getInstanceByDom(host)?.getOption()?.series[0]?.data;
                return points?.some(point => point[1] === value);
            }""",
            arg=value, timeout=12000,
        )

    trend_contains(3)
    page.get_by_role("button", name="测点诊断", exact=True).click()
    diagnostics = page.get_by_role("dialog", name="测点诊断")
    liquid_diagnostics = diagnostics.get_by_role("row").filter(has_text="液位 LT-101")
    expect(liquid_diagnostics).to_have_attribute("data-monitor-quality", "good")
    registers.readable.clear()
    try:
        expect(diagnostics).to_contain_text("协议采样已停止更新", timeout=5000)
        expect(liquid_diagnostics).to_have_attribute("data-monitor-quality", "offline")
        expect(liquid_diagnostics).to_contain_text("原值 12000")
        expect(liquid).to_contain_text("离线")
        registers.setValues(0, [14000])
    finally:
        registers.readable.set()
    expect(liquid_diagnostics).to_have_attribute("data-monitor-quality", "good", timeout=12000)
    expect(liquid).to_contain_text("3.75 m")
    diagnostics.get_by_role("button", name="关闭", exact=True).click()
    for raw, display in [(4000, "0.00 m"), (16000, "4.50 m"), (20000, "6.00 m")]:
        registers.setValues(0, [raw])
        expect(liquid).to_contain_text(display, timeout=12000)
    trend_contains(6)
    registers.setValues(0, [3999])
    expect(liquid).to_contain_text("无效", timeout=12000)
    expect(flow_display).to_contain_text("18.25 m³/h")
    page.goto(base)
    page.get_by_role("button", name="管理连接与点位", exact=True).click()
    dialog.get_by_role("button", name="试读点位", exact=True).click()
    expect(row("LT-101")).to_contain_text("3999", timeout=15000)
    row("LT-101").click()
    expect(dialog.get_by_label("点位试读结果")).to_contain_text("原值超出输入量程")
    page.screenshot(path=str(OUT / "out-of-range.png"))
    assert not errors, errors


def verify_direct_business_links(page, base, port, registers):
    registers.setValues(0, [16000])
    created = page.request.post(base + "/api/projects", data={
        "action": "create", "name": "07 位号切换 · 本机台架", "purpose": "process",
    })
    assert created.ok
    project = created.json()["id"]
    query = "?project=" + project
    draft_url = base + "/api/draft" + query
    script = """
        import { blankScreen, screenNode } from './packages/runtime/studio/screen-model.mjs';
        const doc = blankScreen();
        doc.title = '原位号与现场读数';
        doc.source.data = JSON.stringify({lt:12000, ft:17.5, hist:[], events:[]});
        doc.source.demo = true;
        doc.mappings = [
          {id:'ana.level',label:'厌氧池液位',kind:'number',unit:'m',path:'lt',
           conversion:{mode:'raw420',engineeringMin:0,engineeringMax:6}},
          {id:'influent.flow',label:'进水流量',kind:'number',unit:'m³/h',path:'ft',conversion:{mode:'identity'}},
          {id:'alarm.history',label:'预处理历史',kind:'dataset',unit:'',path:'hist'},
          {id:'alarm.events',label:'预处理告警',kind:'dataset',unit:'',path:'events'},
        ].map(m => ({scale:1, offset:0, precision:2, ...m}));
        for (const [symbol,id,point,x,y] of [['readout','existing-level','ana.level',80,80],
          ['readout','existing-flow','influent.flow',440,80], ['trend','existing-history','alarm.history',80,300],
          ['events','existing-events','alarm.events',820,300]]) {
          const n=screenNode(symbol,id,x,y); n.bindings.value=point; doc.nodes.push(n);
        }
        console.log(JSON.stringify(doc));
    """
    original = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", script], cwd=ROOT))
    assert page.request.post(draft_url, data=original).ok
    page.goto(base + "/editor" + query)
    level = page.locator('[data-cell-id="existing-level"]')
    flow = page.locator('[data-cell-id="existing-flow"]')
    expect(level).to_contain_text("3.00 m")
    page.get_by_role("button", name="数据连接", exact=True).click()
    dialog = page.get_by_role("dialog", name="数据连接与点位")
    dialog.get_by_label("来源", exact=True).select_option("modbus")
    expect(dialog).to_contain_text("未关联 4 个画面位号")
    dialog.get_by_label("Modbus 主机", exact=True).fill("127.0.0.1")
    dialog.locator("label").filter(has_text="端口").locator("input").fill(str(port))
    dialog.get_by_role("button", name="新建点位", exact=True).click()
    dialog.get_by_label("点位名称", exact=True).fill("现地液位 LT-101")
    existing = dialog.get_by_label("关联画面业务位号", exact=True)
    assert set(existing.locator("option").evaluate_all("(rows)=>rows.map(row=>row.value)")) == {
        "", "ana.level", "influent.flow",
    }
    existing.select_option("ana.level")
    dialog.get_by_role("button", name="新建点位", exact=True).click()
    dialog.get_by_label("点位名称", exact=True).fill("现地流量 FT-101")
    dialog.get_by_label("寄存器序号", exact=True).fill("2")
    dialog.get_by_label("数据格式", exact=True).select_option("float32")
    existing.select_option("influent.flow")
    dialog.get_by_role("button", name="试读点位", exact=True).click()
    table = dialog.locator(".tag-selected")
    expect(table.get_by_role("row", name="现地液位 LT-101", exact=False)).to_contain_text("4.50 m", timeout=15000)
    expect(table.get_by_role("row", name="现地流量 FT-101", exact=False)).to_contain_text("18.25 m³/h")
    expect(dialog).to_contain_text("未关联 2 个画面位号")
    page.screenshot(path=str(OUT / "direct-business-link.png"))
    dialog.get_by_role("button", name="完成并返回画布", exact=True).click()
    expect(level).to_contain_text("4.50 m")
    expect(flow).to_contain_text("18.25 m³/h")
    page.get_by_role("button", name="撤销", exact=True).click()
    expect(level).to_contain_text("3.00 m")
    page.get_by_role("button", name="重做", exact=True).click()
    expect(level).to_contain_text("4.50 m")
    publish(page)
    expect(page.locator(".status-message")).to_contain_text("已发布")
    published = page.request.get(base + "/api/published" + query).json()
    assert published["nodes"] == original["nodes"]
    assert {m["id"] for m in published["mappings"]} == {m["id"] for m in original["mappings"]}
    mappings = {m["id"]: m for m in published["mappings"]}
    assert mappings["ana.level"]["conversion"] == original["mappings"][0]["conversion"]
    assert mappings["influent.flow"]["conversion"]["mode"] == "identity"
    assert mappings["alarm.history"]["protocolUnmapped"] is True
    page.goto(base + "/view" + query)
    expect(level).to_contain_text("4.50 m")
    expect(flow).to_contain_text("18.25 m³/h")
    page.get_by_role("button", name="测点诊断", exact=True).click()
    expect(page.get_by_role("row").filter(has_text="alarm.history")).to_contain_text("未关联当前协议点位")
    verify_dataset_connection(page, base, query, registers)


def verify_dataset_connection(page, base, query, registers):
    state = {"offline": False, "freeze_history": False, "event": "现场进水首条告警"}

    class Datasets(BaseHTTPRequestHandler):
        def do_GET(self):
            if state["offline"]:
                self.send_response(503)
                self.end_headers()
                return
            now = int(time.time() * 1000)
            points = [
                dict(id="plant.history", kind="dataset", quality="good",
                     receivedAt=now-60000 if state["freeze_history"] else now,
                     value=[dict(time=now-120000,value=4.5),dict(time=now-60000,value=3.7)]),
                dict(id="plant.events", kind="dataset", quality="good", receivedAt=now,
                     value=[dict(time=now-120000,title=state["event"],message=state["event"])]),
                dict(id="other.level", kind="number", quality="good", receivedAt=now,value=999),
                dict(id="plant.summary", kind="dataset", quality="good", receivedAt=now,
                     value=[dict(name="进水流量",value=18.25)]),
            ]
            if state.get("duplicate"):
                points.append(points[1])
            data = json.dumps({"points": points},ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type","application/json")
            self.send_header("Content-Length",str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *_):
            pass

    with ThreadingHTTPServer(("127.0.0.1",0),Datasets) as http:
        thread = threading.Thread(target=http.serve_forever,daemon=True)
        thread.start()
        try:
            endpoint = f"http://127.0.0.1:{http.server_port}/plant"
            page.goto(base+"/editor"+query)
            page.get_by_role("button",name="数据连接",exact=True).click()
            dialog = page.get_by_role("dialog",name="数据连接与点位")
            dialog.get_by_label("最大数据年龄（ms）",exact=True).fill("2500")
            dialog.get_by_role("button",name="试读点位",exact=True).click()
            device_reading = dialog.locator(".tag-selected").get_by_role("row",name="现地液位 LT-101",exact=False)
            expect(device_reading).to_contain_text("4.50 m",timeout=15000)
            dialog.get_by_text("历史与告警接口",exact=True).click()
            dialog.get_by_label("历史与告警 REST 地址",exact=True).fill(endpoint)
            dialog.get_by_role("button",name="试读历史与告警",exact=True).click()
            history = dialog.get_by_label("数据集来源 alarm.history",exact=True)
            events = dialog.get_by_label("数据集来源 alarm.events",exact=True)
            history.select_option("plant.history")
            events.select_option("plant.events")
            assert set(history.locator("option").evaluate_all("(rows)=>rows.map(row=>row.value)")) == {
                "", "plant.history", "plant.events", "plant.summary",
            }
            expect(dialog.get_by_text("2 行 · 有效",exact=True)).to_be_visible()
            expect(dialog.get_by_text("1 行 · 有效",exact=True)).to_be_visible()
            expect(dialog.get_by_text("历史与告警接口 · 已关联 2 项",exact=True)).to_be_visible()
            expect(device_reading).to_contain_text("4.50 m")
            dialog.get_by_label("从样本新增数据集",exact=True).select_option("plant.summary")
            expect(dialog.get_by_label("数据集来源 plant.summary",exact=True)).to_have_value("plant.summary")
            expect(dialog.get_by_text("历史与告警接口 · 已关联 3 项",exact=True)).to_be_visible()
            page.screenshot(path=str(OUT/"dataset-link.png"))
            dialog.get_by_role("button",name="完成并返回画布",exact=True).click()
            publish(page)
            expect(page.locator(".status-message")).to_contain_text("已发布")
            after = page.request.get(base+"/api/published"+query).json()
            assert after["source"]["kind"] == "modbus"
            assert after["source"]["datasets"] == dict(url=endpoint, bindings={
                "alarm.history":"plant.history", "alarm.events":"plant.events", "plant.summary":"plant.summary",
            })
            assert next(row for row in after["mappings"] if row["id"]=="plant.summary")["kind"] == "dataset"
            page.goto(base+"/view"+query)
            level = page.locator('[data-cell-id="existing-level"]')
            expect(level).to_contain_text("4.50 m")
            badge = page.locator(".screen-source-badge")
            expect(badge).to_have_attribute("data-monitor-datasets-link","connected")
            page.get_by_role("button",name="测点诊断",exact=True).click()
            diagnostics = page.get_by_role("dialog",name="测点诊断")
            history_row = diagnostics.locator('[data-monitor-point="alarm.history"]')
            event_row = diagnostics.locator('[data-monitor-point="alarm.events"]')
            level_row = diagnostics.locator('[data-monitor-point="ana.level"]')
            expect(history_row).to_contain_text("工程值 2 行")
            expect(event_row).to_contain_text("工程值 1 行")
            expect(event_row).to_have_attribute("data-monitor-channel","datasets")
            for row in (history_row,event_row,level_row):
                expect(row).to_have_attribute("data-monitor-quality","good")
            state["freeze_history"] = True
            expect(history_row).to_have_attribute("data-monitor-quality","stale")
            expect(event_row).to_have_attribute("data-monitor-quality","good")
            expect(level_row).to_have_attribute("data-monitor-quality","good")
            state["freeze_history"] = False
            state["duplicate"] = True
            expect(event_row).to_have_attribute("data-monitor-reason","missing-record")
            expect(history_row).to_have_attribute("data-monitor-quality","good")
            state["duplicate"] = False
            state["offline"] = True
            expect(badge).to_have_attribute("data-monitor-datasets-link","disconnected")
            expect(badge).to_have_attribute("data-monitor-link","connected")
            expect(history_row).to_have_attribute("data-monitor-quality","offline")
            expect(event_row).to_have_attribute("data-monitor-quality","offline")
            expect(level_row).to_have_attribute("data-monitor-quality","good")
            page.screenshot(path=str(OUT/"datasets-offline.png"))
            registers.setValues(0,[12000])
            expect(level).to_contain_text("3.00 m")
            state["offline"] = False
            state["event"] = "现场进水恢复后告警"
            expect(event_row).to_have_attribute("data-monitor-quality","good")
            expect(history_row).to_have_attribute("data-monitor-quality","good")
            registers.readable.clear()
            try:
                expect(level_row).not_to_have_attribute("data-monitor-quality","good",timeout=8500)
                expect(history_row).to_have_attribute("data-monitor-quality","good")
                expect(event_row).to_have_attribute("data-monitor-quality","good")
                page.screenshot(path=str(OUT/"protocol-interrupted.png"))
            finally:
                registers.readable.set()
            expect(level_row).to_have_attribute("data-monitor-quality","good",timeout=10000)
            diagnostics.get_by_role("button",name="关闭",exact=True).click()
            expect(page.locator('[data-cell-id="existing-events"]')).to_contain_text(state["event"])
            page.goto(base+"/editor"+query)
            expect(page.locator(".screen-source-badge")).to_contain_text("历史与告警 · 已连接")
            expect(level).to_contain_text("3.00 m")
            page.locator(".project-menu summary").click()
            with page.expect_download() as download:
                page.get_by_role("button",name="导出离线演示",exact=True).click()
            snapshot = OUT/"protocol-and-datasets-offline.html"
            download.value.save_as(snapshot)
            assert endpoint not in snapshot.read_text(encoding="utf-8")
            network = []
            def record_request(request):
                if request.url.startswith("http"):
                    network.append(request.url)
            page.on("request",record_request)
            page.goto(snapshot.as_uri())
            expect(level).to_contain_text("3.00 m")
            expect(page.locator('[data-cell-id="existing-events"]')).to_contain_text(state["event"])
            assert not network,network
            page.remove_listener("request",record_request)
        finally:
            http.shutdown()
            thread.join()
            registers.setValues(0,[16000])


def post(base, path, data, wait_for_sample=False):
    request = Request(base + path, json.dumps(data).encode(),
                      {"Content-Type": "application/json"}, method="POST")
    for _ in range(30 if wait_for_sample else 1):
        try:
            with urlopen(request, timeout=12) as response:
                return json.load(response)
        except HTTPError as error:
            if not wait_for_sample or "协议连接建立中" not in error.read().decode():
                raise
            time.sleep(.2)
    raise AssertionError(f"Timed out waiting for {data['kind']} samples")


def check_protocols(base, device_port):
    values = [True, False, 12000, 16000, 38.5, 18.25, -320, 480, 226, 52]
    types = [ua.VariantType.Boolean, ua.VariantType.Boolean, ua.VariantType.UInt16,
             ua.VariantType.UInt16, ua.VariantType.Float, ua.VariantType.Double,
             ua.VariantType.Int16, ua.VariantType.UInt16, ua.VariantType.UInt16, ua.VariantType.UInt16]
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        endpoint = f"opc.tcp://127.0.0.1:{listener.getsockname()[1]}/engineering"
    server = UaServer()
    server.set_endpoint(endpoint)
    server.set_security_policy([ua.SecurityPolicyType.NoSecurity])
    namespace = server.register_namespace("urn:studio:engineering-test")
    station = server.nodes.objects.add_object(namespace, "Engineering Fixture")
    points = []
    for index, (value, data_type) in enumerate(zip(values, types)):
        label = f"Point {index:02}"
        node = station.add_variable(namespace, label, ua.Variant(value, data_type))
        points.append(dict(id=f"point{index}", label=label, nodeId=node.nodeid.to_string(),
                           kind="boolean" if isinstance(value, bool) else "number"))
    server.start()
    try:
        browse = post(base, "/api/opcua/browse", {"endpoint": endpoint, "nodeId": station.nodeid.to_string()})
        assert {row["nodeId"] for row in browse["nodes"]} == {row["nodeId"] for row in points}
        opc = post(base, "/api/protocol/sample", {
            "kind": "opcua", "pollMs": 200, "connection": {"endpoint": endpoint, "points": points},
        }, wait_for_sample=True)
        assert all(row["timestamp"] for row in opc["points"])
        assert opc["requestedPollMs"] == 200
        modbus_addresses = [
            (2, 0, None, None), (2, 1, None, None),
            (4, 0, "uint16", None), (4, 3, "uint16", None),
            (4, 4, "float32", "CDAB"), (4, 1, "float32", "ABCD"),
            (4, 6, "int16", None), (4, 7, "uint16", None),
            (4, 8, "uint16", None), (4, 9, "uint16", None),
        ]
        registers = []
        for source, (fc, address, data_type, order) in zip(points, modbus_addresses):
            point = dict(id=source["id"], label=source["label"], kind=source["kind"],
                         function=fc, address=address)
            if data_type:
                point["format"] = data_type
            if order:
                point["order"] = order
            registers.append(point)
        modbus = post(base, "/api/protocol/sample", {
            "kind": "modbus", "pollMs": 500,
            "connection": {"host": "127.0.0.1", "port": device_port, "unitId": 1, "points": registers},
        }, wait_for_sample=True)
        for sample in (opc, modbus):
            assert sample["configuredPollMs"] == 500
            assert all(row["quality"] == "good" and row["raw"] == row["value"] for row in sample["points"])
            assert [row["value"] for row in sample["points"]] == values
    finally:
        server.stop()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    flow = struct.unpack(">HH", struct.pack(">f", 18.25))
    frequency = struct.unpack(">HH", struct.pack(">f", 38.5))
    registers = PausableRegisters(0, [12000, *flow, 16000, *reversed(frequency), 0xFEC0, 480, 226, 52])
    discrete = ModbusSequentialDataBlock(0, [True, False])
    device = ModbusTcpServer(
        ModbusServerContext(slaves=ModbusSlaveContext(ir=registers, di=discrete, zero_mode=True)),
        address=("127.0.0.1", 0),
    )
    threading.Thread(target=device.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory() as data:
            server = subprocess.Popen(
                ["node", "apps/scada-designer/server.mjs"], cwd=ROOT,
                env={**os.environ, "STUDIO_PORT": str(port), "STUDIO_DATA_DIR": data},
            )
            try:
                for _ in range(80):
                    try:
                        urlopen(base + "/api/draft", timeout=1).close()
                        break
                    except OSError:
                        time.sleep(.1)
                check_protocols(base, device.server_address[1])
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch()
                    page = browser.new_page(viewport={"width": 1440, "height": 900})
                    try:
                        exercise(page, base, device.server_address[1], registers)
                        verify_direct_business_links(page, base, device.server_address[1], registers)
                    except Exception:
                        page.screenshot(path=str(OUT / "failure.png"))
                        raise
                    finally:
                        browser.close()
            finally:
                server.terminate()
                server.wait(timeout=15)
    finally:
        device.shutdown()
        device.server_close()
    result = {
        "transport": "local deterministic OPC UA and Modbus TCP servers",
        "representativePointsPerProtocol": 10,
        "levels": {"4000": 0, "12000": 3, "16000": 4.5, "20000": 6},
        "outOfRange": 3999, "engineeredFlow": 18.25,
        "verified": ["commissioning", "batch preview/apply/undo", "invalid range rejection",
                     "binding", "publish", "live trend", "stalled acquisition and recovery",
                     "normalized direct protocol association keeps existing bindings and unlinked history",
                     "protocol current values with independent REST history and alarms, expiry, recovery and offline export"],
    }
    (OUT / "results.json").write_text(json.dumps(result, indent=2), "utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
