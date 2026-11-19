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
from urllib.request import urlopen

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
    dialog.get_by_role("button", name="试读点位", exact=True).click()

    def row(name):
        return dialog.locator(".tag-selected tbody tr").filter(has_text=name)

    expect(row("LT-101")).to_contain_text("3.00 m", timeout=15000)
    expect(row("LT-101")).to_contain_text("12000")
    expect(row("FT-101")).to_contain_text("18.25 m³/h")
    expect(row("FT-101")).to_contain_text("有效")
    page.screenshot(path=str(OUT / "point-list.png"))
    row("LT-101").click()
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
    assert {m["conversion"]["mode"] for m in saved["mappings"]} == {"identity", "raw420"}
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


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    registers = ModbusSequentialDataBlock(0, [12000, *struct.unpack(">HH", struct.pack(">f", 18.25))])
    device = ModbusTcpServer(
        ModbusServerContext(slaves=ModbusSlaveContext(ir=registers, zero_mode=True)),
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
        "transport": "local deterministic Modbus TCP server",
        "levels": {"4000": 0, "12000": 3, "16000": 4.5, "20000": 6},
        "outOfRange": 3999, "engineeredFlow": 18.25,
        "verified": ["commissioning", "invalid range rejection", "binding", "publish", "live trend"],
    }
    (OUT / "results.json").write_text(json.dumps(result, indent=2), "utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
