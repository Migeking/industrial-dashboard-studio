from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def run_case(page, relative_path, action, assertion):
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.goto((ROOT / "scenarios" / relative_path).as_uri(), wait_until="networkidle")
    page.wait_for_timeout(500)
    action(page)
    page.wait_for_timeout(300)
    assertion(page)
    assert page.locator("#screen").count() == 1
    assert page.evaluate("document.querySelector('#screen').getBoundingClientRect().width") > 1300
    assert not errors, f"控制台错误: {errors}"
    print(f"[通过] {relative_path}")


def assert_agitator_axis(page):
    page.locator(".tabs button.active").filter(has_text="联锁演练").wait_for()
    page.locator(".safety-copy").filter(has_text="联锁动作").wait_for()
    blades = page.locator(".agitator-blades")
    samples = []
    for _ in range(6):
        box = blades.bounding_box()
        assert box
        samples.append(box)
        page.wait_for_timeout(180)
    centers = [box["x"] + box["width"] / 2 for box in samples]
    widths = [box["width"] for box in samples]
    assert max(centers) - min(centers) < 2, "搅拌器旋转轴发生横向漂移"
    assert max(widths) - min(widths) > 10, "搅拌器缺少竖轴旋转的投影变化"


def assert_ngt200_model(page):
    page.locator(".device-tile.selected").filter(has_text="BLW-02").wait_for()
    assert page.locator("#ngtModel canvas").count() == 1
    page.locator("#modeExterior").click()
    page.locator("#modeExterior.active").wait_for()
    page.locator("#modeCutaway").click()
    page.locator("#modeCutaway.active").wait_for()
    page.locator("#modeImpeller").click()
    page.locator("#modeImpeller.active").wait_for()
    assert page.locator(".frequency-strip").is_visible()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=CHROME)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    page.route("http://**/*", lambda route: route.abort())
    page.route("https://**/*", lambda route: route.abort())

    run_case(
        page,
        "water-treatment/01-A2O脱氮除磷精准调控驾驶舱.html",
        lambda p: p.get_by_role("button", name="高峰负荷").click(),
        lambda p: (
            p.locator(".scenario-tabs button.active").filter(has_text="高峰负荷").wait_for(),
            p.locator(".kpi").first.locator(".k-value").filter(has_text="86").wait_for(),
        ),
    )

    run_case(
        page,
        "predictive-maintenance/02-关键机组预测性维护驾驶舱.html",
        lambda p: p.locator(".device-tile").nth(1).click(),
        assert_ngt200_model,
    )

    run_case(
        page,
        "reactor-safety/03-反应釜热失控安全联锁舱.html",
        lambda p: p.get_by_role("button", name="联锁演练").click(),
        assert_agitator_axis,
    )

    run_case(
        page,
        "water-treatment/04-污泥回流泵联动控制驾驶舱.html",
        lambda p: p.get_by_role("button", name="洪峰增泵演练").click(),
        lambda p: (
            p.locator(".scenario-tabs button.active").filter(has_text="洪峰增泵演练").wait_for(),
            p.locator(".kpi").first.locator(".k-value").filter(has_text="3.86").wait_for(),
        ),
    )

    run_case(
        page,
        "water-treatment/06-A2O脱氮除磷SCADA操作终端.html",
        lambda p: (
            p.locator("g.device-interactive").nth(2).click(),
            p.locator(".faceplate-modal").wait_for(),
            p.locator(".slider-group button").click(),
            p.locator(".sbo-overlay").wait_for(),
            p.locator(".sbo-foot button").nth(1).click(),
        ),
        lambda p: (
            p.locator(".audit-table tbody tr").first.locator("td").nth(6).filter(has_text="两步确认通过").wait_for(),
        ),
    )

    run_case(
        page,
        "water-treatment/07-A2O脱氮除磷经典上位SCADA.html",
        lambda p: (
            p.locator("g.hmi-clickable").nth(2).click(),
            p.locator(".faceplate-window").wait_for(),
            p.locator(".bargraph-box").wait_for(),
            p.locator(".inch-btn-group button").nth(1).click(),
            p.locator(".fp-controls button:has-text('下发新设定')").click(),
            p.locator(".sbo-mask").wait_for(),
            p.locator(".sbo-foot button.danger").click(),
        ),
        lambda p: (
            p.locator(".bottom-drawer button:has-text('运行操作记录流水')").click(),
            p.locator(".alarm-table tbody tr").first.locator("td").nth(6).filter(has_text="SBO两步确认通过").wait_for(),
        ),
    )

    run_case(
        page,
        "water-treatment/08-预处理进水井3D交互HMI.html",
        lambda p: (
            p.locator(".equipment-row").first.click(),
            p.locator(".open-faceplate").click(),
            p.locator(".faceplate").wait_for(),
            p.locator(".command-btn.close").click(),
            p.locator(".sbo-mask").wait_for(),
            p.locator(".sbo-foot .confirm").click(),
            p.wait_for_timeout(1000),
            p.locator(".bottom-tabs button").nth(1).click(),
        ),
        lambda p: (
            p.locator(".audit-table tbody tr").first.locator("td").nth(7).filter(has_text="回读成功").wait_for(),
            p.locator(".audit-table tbody tr").first.locator("td").nth(5).filter(has_text="0.0%").wait_for(),
        ),
    )

    run_case(
        page,
        "water-treatment/09-预处理进水井浅色3D数字孪生HMI.html",
        lambda p: (
            p.locator(".valve-line").first.click(),
            p.locator(".control-tabs button").filter(has_text="控制").click(),
            p.locator(".control-buttons .close").click(),
            p.locator(".confirm-mask").wait_for(),
            p.locator(".confirm-actions .primary").click(),
        ),
        lambda p: (
            p.locator(".quick-cell").first.locator("b").filter(has_text="0.0").wait_for(),
            p.locator("#twin3d canvas").wait_for(),
        ),
    )

    run_case(
        page,
        "water-treatment/10-地下调蓄池水力冲洗数字孪生HMI.html",
        lambda p: (
            p.locator(".equipment-line").nth(2).click(),
            p.locator(".control-tabs button").filter(has_text="控制").click(),
            p.locator(".control-buttons .action-flush").click(),
            p.locator(".confirm-mask").wait_for(),
            p.locator(".confirm-actions .primary").click(),
        ),
        lambda p: (
            p.locator(".quick-cell").first.locator("b").filter(has_text="100.0").wait_for(),
            p.locator("#twin3d canvas").wait_for(),
        ),
    )

    showcase = browser.new_page(viewport={"width": 1440, "height": 900})
    showcase.route("http://**/*", lambda route: route.abort())
    showcase.route("https://**/*", lambda route: route.abort())
    showcase.goto((ROOT / "apps" / "showcase" / "index.html").as_uri(), wait_until="networkidle")
    assert showcase.locator(".card").count() == 10
    latest_card = showcase.locator(".card").nth(9)
    latest_card.scroll_into_view_if_needed()
    assert latest_card.is_visible()
    latest_card.click()
    assert "初雨调蓄与水力清淤数字孪生 HMI" in showcase.locator("#stageTitle").inner_text()
    portrait = browser.new_page(viewport={"width": 390, "height": 844})
    portrait.goto((ROOT / "apps" / "showcase" / "index.html").as_uri(), wait_until="domcontentloaded")
    assert portrait.locator(".rotate").is_visible()
    print("[通过] 横屏入口与离线资源加载")
    browser.close()
