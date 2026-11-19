"""Verify point commissioning, binding and publishing with a local read-only Modbus fixture."""
import json
import os
import socket
import struct
import subprocess
import tempfile
import threading
import time
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
    registers = ModbusSequentialDataBlock(0, [12000, *flow, 16000, *reversed(frequency), 0xFEC0, 480, 226, 52])
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
                     "binding", "publish", "live trend"],
    }
    (OUT / "results.json").write_text(json.dumps(result, indent=2), "utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
