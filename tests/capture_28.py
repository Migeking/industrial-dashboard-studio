from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SCENE = ROOT / "scenarios" / "water-treatment" / "28-曝气鼓风机就地控制屏.html"
SCREENSHOTS = ROOT / "docs" / "screenshots"
STATES = SCREENSHOTS / "states"
RESPONSIVE = SCREENSHOTS / "responsive"


def run():
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    STATES.mkdir(parents=True, exist_ok=True)
    RESPONSIVE.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=CHROME)
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.route("http://**/*", lambda route: route.abort())
        page.route("https://**/*", lambda route: route.abort())
        page.goto(SCENE.as_uri(), wait_until="networkidle")
        page.locator("#screen:not([v-cloak])").wait_for()
        page.set_viewport_size({"width": 1024, "height": 768})
        page.wait_for_timeout(200)
        page.evaluate("window.resizeScreen && window.resizeScreen()")
        compact_box = page.locator("#screen").bounding_box()
        assert compact_box and compact_box["width"] == 1024 and compact_box["height"] == 768
        for selector in [".frequency-panel", ".command-grid", ".signal-panel", ".bottom-bar"]:
            assert page.locator(selector).is_visible(), selector
        page.screenshot(path=str(RESPONSIVE / "28-local-control-panel-1024x768.png"))

        page.set_viewport_size({"width": 1366, "height": 768})
        page.wait_for_timeout(200)
        page.evaluate("window.resizeScreen && window.resizeScreen()")
        responsive_box = page.locator("#screen").bounding_box()
        assert responsive_box and 1360 <= responsive_box["width"] <= 1366, responsive_box
        assert responsive_box and 760 <= responsive_box["height"] <= 768, responsive_box
        page.set_viewport_size({"width": 1920, "height": 1080})
        page.wait_for_timeout(200)
        page.evaluate("window.resizeScreen && window.resizeScreen()")
        page.screenshot(path=str(SCREENSHOTS / "28-blower-local-control-panel.png"))

        page.get_by_role("button", name="远程 REMOTE").click()
        page.screenshot(path=str(STATES / "28-state-remote-mode.png"))

        page.get_by_role("button", name="就地 LOCAL").click()
        page.get_by_role("button", name="启动").click()
        page.locator(".status-value").first.filter(has_text="运行").wait_for()
        page.locator(".impeller.is-rotating").wait_for()
        page.screenshot(path=str(STATES / "28-state-running.png"))

        page.get_by_role("button", name="注入演示故障").click()
        page.locator(".status-value").first.filter(has_text="故障锁存").wait_for()
        page.screenshot(path=str(STATES / "28-state-fault-latched.png"))

        showcase = browser.new_page(viewport={"width": 1440, "height": 900})
        showcase.route("http://**/*", lambda route: route.abort())
        showcase.route("https://**/*", lambda route: route.abort())
        showcase.goto((ROOT / "apps" / "showcase" / "index.html").as_uri(), wait_until="networkidle")
        card = showcase.locator('.card[data-src*="28-"]')
        card.scroll_into_view_if_needed()
        card.click()
        showcase.locator("#stageTitle").filter(has_text="就地控制屏").wait_for()
        showcase.wait_for_timeout(1200)
        showcase.screenshot(path=str(SCREENSHOTS / "showcase.png"))
        browser.close()


if __name__ == "__main__":
    run()
