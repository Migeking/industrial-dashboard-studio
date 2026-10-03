import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # 1. 打开 27 号场景（曝气鼓风机房智能供风能效驾驶舱）
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.route("http://**/*", lambda route: route.abort())
        page.route("https://**/*", lambda route: route.abort())
        url_27 = (ROOT / "scenarios" / "water-treatment" / "27-曝气鼓风机房智能供风能效驾驶舱.html").as_uri()
        page.goto(url_27, wait_until="networkidle")
        page.wait_for_timeout(1500)

        # 截图主图：常规运行全景
        main_img = ROOT / "docs" / "screenshots" / "27-blower-efficiency.png"
        main_img.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(main_img), full_page=False)
        print(f"[截图完成] 主图 -> {main_img}")

        # 截图特写：高峰负荷工况 + 2# 鼓风机 Faceplate
        page.get_by_role("button", name="高峰负荷").click()
        page.wait_for_timeout(600)
        page.locator(".blower-unit").nth(1).click()
        page.wait_for_timeout(600)
        states_dir = ROOT / "docs" / "screenshots" / "states"
        states_dir.mkdir(parents=True, exist_ok=True)
        state_img = states_dir / "27-state-peak-faceplate.png"
        page.screenshot(path=str(state_img), full_page=False)
        print(f"[截图完成] 特写 -> {state_img}")

        # 2. 刷新 Showcase 体验包总览图
        showcase_page = browser.new_page(viewport={"width": 1440, "height": 900})
        showcase_page.route("http://**/*", lambda route: route.abort())
        showcase_page.route("https://**/*", lambda route: route.abort())
        showcase_url = (ROOT / "apps" / "showcase" / "index.html").as_uri()
        showcase_page.goto(showcase_url, wait_until="networkidle")
        showcase_page.wait_for_timeout(1000)
        # 点击 27 号卡片让舞台展示 27 号
        latest_card = showcase_page.locator('.card[data-src*="27-"]')
        latest_card.scroll_into_view_if_needed()
        latest_card.click()
        showcase_page.wait_for_timeout(1500)
        showcase_img = ROOT / "docs" / "screenshots" / "showcase.png"
        showcase_page.screenshot(path=str(showcase_img), full_page=False)
        print(f"[截图完成] Showcase -> {showcase_img}")

        browser.close()

if __name__ == "__main__":
    run()
