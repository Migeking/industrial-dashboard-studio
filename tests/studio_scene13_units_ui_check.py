"""Build a flocculation section from an empty canvas and publish the same equipment artwork."""
import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright
from studio_ui import publish, project_action

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "works/scene13-assembly-acceptance"


def verify_unit_imports(page, base):
    units = ROOT / "apps/scada-designer/examples/units"
    for file in sorted(units.glob("*.symbol.json")):
        unit = json.loads(file.read_text("utf-8"))
        created = page.request.post(base + "/api/projects", data={
            "action": "create", "name": "跨工程复用 " + unit["name"], "purpose": "process",
        })
        assert created.ok, created.text()
        project_id = created.json()["id"]
        page.goto(base + "/editor?project=" + project_id)
        expect(page.locator(".x6-node")).to_have_count(0)
        page.get_by_role("tab", name="我的图元", exact=True).click()
        page.get_by_label("导入我的图元", exact=True).set_input_files(file)
        page.get_by_role("button", name="放置 " + unit["name"], exact=True).click()
        bounds = page.locator(".board").bounding_box()
        page.mouse.click(bounds["x"] + 15, bounds["y"] + 15)
        expect(page.locator(".x6-node")).to_have_count(len(unit["nodes"]))
        expect(page.locator(".x6-edge")).to_have_count(len(unit["pipes"]))
        url = base + "/api/draft?project=" + project_id
        with page.expect_response(lambda response: response.url == url and response.request.method == "POST"):
            page.get_by_role("button", name="保存草稿", exact=True).click()
        doc = page.request.get(url).json()
        assert all(not n["bindings"] for n in doc["nodes"])
        assert len(doc["pipes"]) == len(unit["pipes"])


def exercise(browser, base, definitions):
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    page.set_default_timeout(15000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base)
    expect(page.locator(".x6-node")).to_have_count(0)
    library = page.get_by_role("complementary", name="场景与组件")
    board = page.locator(".board")
    equipment = {}

    def tools():
        page.get_by_role("tab", name="图元与工具", exact=True).click()

    def save():
        with page.expect_response(lambda res: res.url == base + "/api/draft" and res.request.method == "POST") as response:
            page.get_by_role("button", name="保存草稿", exact=True).click()
        assert response.value.ok, response.value.text()
        return page.request.get(base + "/api/draft").json()

    def cell(key):
        return page.locator(f'.x6-node[data-cell-id="{equipment[key]}"]')

    def field(label, value):
        form_field = page.get_by_label(label, exact=True)
        form_field.fill(str(value))
        form_field.press("Tab")

    def add(symbol, x, y):
        tools()
        library.get_by_label("搜索组件", exact=True).fill(symbol)
        button = library.locator(f'[data-symbol="{symbol}"]')
        artwork = button.locator("img").get_attribute("src")
        assert artwork.startswith("data:image/webp;base64,")
        prior = set(page.locator(".x6-node").evaluate_all("(els) => els.map(el => el.dataset.cellId)"))
        bounds = board.bounding_box()
        button.drag_to(board, target_position={"x": x * bounds["width"] / 1920, "y": y * bounds["height"] / 1080})
        expect(page.locator(".x6-node")).to_have_count(len(prior) + 1)
        equipment[symbol] = (set(page.locator(".x6-node").evaluate_all("(els) => els.map(el => el.dataset.cellId)")) - prior).pop()
        expect(cell(symbol).locator("image")).to_have_attribute("xlink:href", artwork)
        definition = definitions[symbol]
        field("图元名称", definition["label"])
        page.get_by_role("tab", name="动态与测点", exact=True).click()
        for slot in definition["slots"]:
            selection = page.get_by_label(slot["label"] + " · 绑定测点", exact=True)
            selection.select_option(definition["prefix"] + "101." + slot["key"])
        return artwork

    artwork = {
        "dualChemicalDosing": add("dualChemicalDosing", 360, 70),
        "highRateClarifier": add("highRateClarifier", 680, 520),
    }
    add("submersiblePump", 260, 570)
    add("pressureFilter", 1630, 480)
    add("screwPump", 1460, 810)
    tools()
    library.get_by_label("搜索组件", exact=True).fill("")
    page.locator('[data-tool="pipe"]').click()

    def connect(source, output, target, input_port):
        start = cell(source).locator(f'circle[port="{output}"]').bounding_box()
        end = cell(target).locator(f'circle[port="{input_port}"]').bounding_box()
        assert start and end
        page.mouse.move(start["x"] + start["width"] / 2, start["y"] + start["height"] / 2)
        page.mouse.down()
        page.mouse.move(end["x"] + end["width"] / 2, end["y"] + end["height"] / 2, steps=15)
        page.mouse.up()

    connect("dualChemicalDosing", "pacOut", "highRateClarifier", "pacIn")
    connect("dualChemicalDosing", "pamOut", "highRateClarifier", "pamIn")
    connect("submersiblePump", "right", "highRateClarifier", "left")
    connect("highRateClarifier", "right", "pressureFilter", "left")
    connect("highRateClarifier", "bottom", "screwPump", "left")
    expect(page.locator(".x6-edge")).to_have_count(5)
    linked = save()
    assert len(linked["pipes"]) == 5
    assert all(p["source"].get("nodeId") and p["target"].get("nodeId") for p in linked["pipes"])
    assert all(not p["vertices"] for p in linked["pipes"])
    assert [p["style"]["color"] for p in linked["pipes"][:2]] == ["#a27328", "#776595"]
    assert all(n["equipmentVersion"] == 1 for n in linked["nodes"] if n["symbol"] in artwork)

    page.get_by_role("tab", name="图层", exact=False).click()
    page.locator(f'[data-layer="{equipment["highRateClarifier"]}"]').click()
    page.get_by_role("tab", name="外观", exact=True).click()
    field("宽度", 740)
    resized = save()
    assert resized["pipes"] == linked["pipes"]
    dists = page.evaluate("""pipes => pipes.flatMap(pipe => {
        const group = document.querySelector('[data-cell-id="' + pipe.id + '"]');
        const path = group.querySelector('[data-selector="line"]') ||
            [...group.querySelectorAll("path")].find(el => el.getAttribute("d"));
        return ['source','target'].map((side, i) => {
            const end = pipe[side];
            const port = document.querySelector('[data-cell-id="' + end.nodeId + '"] circle[port="' + end.portId + '"]');
            const rect = port.getBoundingClientRect();
            const point = path.getPointAtLength(i ? path.getTotalLength() : 0);
            const projected = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM());
            return Math.hypot(projected.x - rect.x - rect.width / 2, projected.y - rect.y - rect.height / 2);
        });
    })""", resized["pipes"])
    assert max(dists) < 2, dists
    page.screenshot(path=str(OUT / "editor.png"))
    publish(page)
    expect(page.get_by_role("status")).to_contain_text("已发布")
    page.goto(base + "/view")
    expect(page.locator(".x6-edge")).to_have_count(5)
    page.screenshot(path=str(OUT / "published.png"))
    cell("highRateClarifier").click()
    details = page.get_by_role("dialog")
    for label in ["快混与 PAC 投加", "絮凝与 PAM 投加", "回流排泥"]:
        expect(details.get_by_role("heading", name=label, exact=True)).to_be_visible()
    expect(details).to_contain_text("26 mg/L")
    expect(details).to_contain_text("1.2 mg/L")
    page.screenshot(path=str(OUT / "faceplate.png"))
    page.goto(base)
    with page.expect_download() as download:
        project_action(page, "导出离线演示")
    offline = OUT / "offline.html"
    download.value.save_as(offline)
    text = offline.read_text("utf-8")
    assert definitions["unusedArtwork"] not in text
    for content in artwork.values():
        assert content in text
    local = browser.new_page(viewport={"width": 1366, "height": 768})
    local.on("pageerror", lambda error: errors.append(str(error)))
    network = []
    local.on("request", lambda request: network.append(request.url) if request.url.startswith("http") else None)
    local.goto(offline.as_uri())
    expect(local.locator(".x6-edge")).to_have_count(5)
    local.screenshot(path=str(OUT / "offline-1366.png"))
    assert not network and not errors, (network, errors)
    verify_unit_imports(page, base)
    (OUT / "project.json").write_text(json.dumps(resized, ensure_ascii=False, indent=2), "utf-8")
    return {"scene": 13, "nodes": len(resized["nodes"]), "pipes": len(resized["pipes"]),
            "bindings": sum(len(n["bindings"]) for n in resized["nodes"]),
            "maxEndpointErrorPx": max(dists), "offlineBytes": offline.stat().st_size,
            "crossProjectImports": 3, "errors": errors}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    source = """
      import {waterComponentBlank} from './tests/studio_water_fixture.mjs';
      import {waterEquipment} from './packages/components/studio/water-equipment.mjs';
      import {waterArtwork} from './packages/components/studio/water-artwork.mjs';
      console.log(JSON.stringify({
        blank:waterComponentBlank(), definitions:{...waterEquipment, unusedArtwork:waterArtwork.aerationTank}
      }));
    """
    fixture = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", source], cwd=ROOT))
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory() as data:
        (Path(data) / "project.json").write_text(json.dumps({"draft": fixture["blank"], "versions": [], "active": None}), "utf-8")
        process = subprocess.Popen(
            ["node", "apps/scada-designer/server.mjs"], cwd=ROOT,
            env={**os.environ, "STUDIO_PORT": str(port), "STUDIO_DATA_DIR": data, "STUDIO_ENTRY": "editor"},
        )
        try:
            for _ in range(60):
                try:
                    urlopen(base + "/api/draft", timeout=1).close()
                    break
                except OSError:
                    time.sleep(.1)
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                try:
                    result = exercise(browser, base, fixture["definitions"])
                except Exception:
                    browser.contexts[0].pages[0].screenshot(path=str(OUT / "failure.png"))
                    raise
                finally:
                    browser.close()
        finally:
            process.terminate()
            process.wait(timeout=15)
    (OUT / "results.json").write_text(json.dumps(result, indent=2), "utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
