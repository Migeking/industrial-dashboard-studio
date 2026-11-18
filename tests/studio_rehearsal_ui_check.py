"""Exercise a local preview without changing its saved or exported samples."""

import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "works/designer-plan-audit/rehearsal"
EXAMPLE = ROOT / "apps/scada-designer/examples/water-process-and-cockpit.json"


def exercise(page, browser, base):
    original = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    pump_id = next(n["id"] for n in original["nodes"] if n["title"] == "P-101")
    readout_id = next(n["id"] for n in original["nodes"] if n["symbol"] == "readout")
    pump_selector = f'[data-cell-id="{pump_id}"]'
    readout_selector = f'[data-cell-id="{readout_id}"]'
    errors = []
    requests = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("request", lambda r: requests.append(r.url) if r.method == "POST" else None)
    page.goto(base)
    page.locator(".project-menu summary").click()
    page.get_by_label("导入配置", exact=True).set_input_files(EXAMPLE)
    expect(page.locator(pump_selector)).to_have_attribute("data-state", "运行")
    with page.expect_response(lambda r: r.url == base + "/api/draft" and r.request.method == "POST") as saved:
        page.get_by_role("button", name="保存草稿", exact=True).click()
    assert saved.value.ok, saved.value.text()
    initial = page.request.get(base + "/api/draft").json()
    assert initial == original
    requests.clear()

    def enter_preview():
        page.get_by_role("button", name="预览发布", exact=True).click()
        page.locator(".screen-rehearsal summary").click()

    def apply(id, value=None, quality="good"):
        page.get_by_label("演练测点", exact=True).select_option(id)
        page.get_by_label("演练质量", exact=True).select_option(quality)
        if value is not None:
            field = page.get_by_label("演练值", exact=True)
            if isinstance(value, bool):
                field.select_option(str(value).lower())
            else:
                field.fill(str(value))
        page.get_by_role("button", name="应用到预览", exact=True).click()

    enter_preview()
    pump, readout = page.locator(pump_selector), page.locator(readout_selector)
    apply("P101.run", False)
    expect(pump).to_have_attribute("data-state", "停止")
    apply("P101.hz", "")
    expect(page.get_by_role("alert")).to_contain_text("有效的数值")
    expect(readout).to_contain_text("38.50 Hz")
    apply("P101.hz", 0)
    expect(readout).to_contain_text("0.00 Hz")
    apply("P101.fault", True)
    expect(pump).to_have_attribute("data-state", "故障")
    apply("P101.fault", False)
    apply("P101.run", quality="offline")
    expect(pump).to_have_attribute("data-state", "未知")
    apply("P101.hz", quality="stale")
    expect(readout).to_contain_text("—")
    expect(readout).to_contain_text("过期")
    apply("P101.hz", quality="bad")
    expect(readout).to_contain_text("无效")
    expect(page.locator(".screen-source-badge")).to_contain_text("工况演练")
    expect(page.locator(".save-state")).to_have_text("草稿已保存")
    assert not requests, requests
    assert page.request.get(base + "/api/draft").json() == initial
    page.screenshot(path=str(OUT / "rehearsal-1366.png"))

    page.get_by_role("button", name="恢复本点", exact=True).click()
    expect(readout).to_contain_text("38.50 Hz")
    expect(pump).to_have_attribute("data-state", "未知")
    page.get_by_role("button", name="全部恢复样本", exact=True).click()
    expect(pump).to_have_attribute("data-state", "运行")
    assert not page.locator(".screen-rehearsal-badge").count()
    apply("P101.run", False)
    page.get_by_role("button", name="返回编辑", exact=True).click()
    expect(pump).to_have_attribute("data-state", "运行")
    enter_preview()
    expect(pump).to_have_attribute("data-state", "运行")

    apply("P101.run", False)
    apply("P101.hz", 0)
    page.locator(".project-menu summary").click()
    with page.expect_download() as exported:
        page.get_by_role("button", name="导出离线演示", exact=True).click()
    file = OUT / "original-samples-offline.html"
    exported.value.save_as(file)
    offline = browser.new_page()
    http_requests = []
    offline.on("request", lambda r: http_requests.append(r.url) if r.url.startswith("http") else None)
    offline.goto(file.as_uri() + "?page=main")
    expect(offline.locator(pump_selector)).to_have_attribute("data-state", "运行")
    expect(offline.locator(readout_selector)).to_contain_text("38.50 Hz")
    expect(offline.locator(".screen-rehearsal")).to_have_count(0)
    assert not http_requests, http_requests
    offline.close()

    # Publishing directly from an active rehearsal must be safe.
    page.get_by_role("button", name="发布", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("已发布")
    assert page.request.get(base + "/api/published").json() == initial
    assert page.request.get(base + "/api/draft").json() == initial
    expect(pump).to_have_attribute("data-state", "运行")
    page.goto(base + "/view?page=main")
    expect(page.locator(pump_selector)).to_have_attribute("data-state", "运行")
    expect(page.locator(".screen-rehearsal")).to_have_count(0)
    # Identical local data must not expose rehearsal without the explicit demo flag.
    page.goto(base)
    page.get_by_role("button", name="数据连接", exact=True).click()
    config = page.get_by_role("dialog")
    config.get_by_label("标记为本地演示样本", exact=True).uncheck()
    config.get_by_role("button", name="应用数据配置", exact=True).click()
    page.get_by_role("button", name="预览发布", exact=True).click()
    expect(page.locator(".screen-rehearsal")).to_have_count(0)
    expect(pump).to_have_attribute("data-state", "运行")
    assert page.request.get(base + "/api/published").json() == initial
    assert not errors, errors


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="studio-rehearsal-") as data:
        process = subprocess.Popen(
            ["node", "apps/scada-designer/server.mjs"],
            cwd=ROOT, env={**os.environ, "STUDIO_PORT": str(port), "STUDIO_DATA_DIR": data},
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        try:
            for _ in range(80):
                try:
                    urlopen(base + "/api/draft", timeout=1).close()
                    break
                except OSError:
                    time.sleep(0.1)
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                page = browser.new_page(viewport={"width": 1366, "height": 768})
                try:
                    exercise(page, browser, base)
                except Exception:
                    page.screenshot(path=str(OUT / "failure.png"))
                    raise
                finally:
                    browser.close()
        finally:
            process.terminate()
            process.wait(timeout=15)
    print("PASS: preview-only typed rehearsal, state and quality, restoration, publishing and offline isolation")


if __name__ == "__main__":
    main()
