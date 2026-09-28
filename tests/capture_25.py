import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        
        # 1. 打开 25 号场景
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.route("http://**/*", lambda route: route.abort())
        page.route("https://**/*", lambda route: route.abort())
        url_25 = (ROOT / "scenarios" / "water-treatment" / "25-智慧水务宏观地球与多级厂区穿透数字驾驶舱.html").as_uri()
        page.goto(url_25, wait_until="networkidle")
        page.wait_for_timeout(1500)
        
        # 截图 Level 1: 宏观地球主图
        main_img = ROOT / "docs" / "screenshots" / "25-global-water-twin.png"
        page.screenshot(path=str(main_img), full_page=False)
        print(f"[截图完成] Level 1 主图 -> {main_img}")
        
        # 截图 Level 2: 华东水厂集群
        page.locator(".step-item").nth(1).click()
        page.wait_for_timeout(800)
        state_l2_img = ROOT / "docs" / "screenshots" / "states" / "25-state-regional-grid.png"
        page.screenshot(path=str(state_l2_img), full_page=False)
        print(f"[截图完成] Level 2 特写 -> {state_l2_img}")
        
        # 截图 Level 3: 厂区空间孪生全景
        page.locator(".step-item").nth(2).click()
        page.wait_for_timeout(800)
        state_l3_img = ROOT / "docs" / "screenshots" / "states" / "25-state-plant-twin.png"
        page.screenshot(path=str(state_l3_img), full_page=False)
        print(f"[截图完成] Level 3 特写 -> {state_l3_img}")
        
        # 截图 Level 4: 核心工艺数据中枢
        page.locator(".step-item").nth(3).click()
        page.wait_for_timeout(800)
        state_l4_img = ROOT / "docs" / "screenshots" / "states" / "25-state-process-detail.png"
        page.screenshot(path=str(state_l4_img), full_page=False)
        print(f"[截图完成] Level 4 特写 -> {state_l4_img}")
        
        # 2. 刷新 Showcase 体验包总览图
        showcase_page = browser.new_page(viewport={"width": 1440, "height": 900})
        showcase_page.route("http://**/*", lambda route: route.abort())
        showcase_page.route("https://**/*", lambda route: route.abort())
        showcase_url = (ROOT / "apps" / "showcase" / "index.html").as_uri()
        showcase_page.goto(showcase_url, wait_until="networkidle")
        showcase_page.wait_for_timeout(1000)
        # 点击 25 号卡片让舞台展示 25 号
        latest_card = showcase_page.locator('.card[data-src*="25-"]')
        latest_card.scroll_into_view_if_needed()
        latest_card.click()
        showcase_page.wait_for_timeout(1500)
        showcase_img = ROOT / "docs" / "screenshots" / "showcase.png"
        showcase_page.screenshot(path=str(showcase_img), full_page=False)
        print(f"[截图完成] Showcase -> {showcase_img}")
        
        browser.close()

if __name__ == "__main__":
    run()
