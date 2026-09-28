import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        
        # 1. 捕获 24 号 1920x1080 原生高清图
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.route("http://**/*", lambda route: route.abort())
        page.route("https://**/*", lambda route: route.abort())
        url_24 = (ROOT / "scenarios" / "water-treatment" / "24-A2O生化反应池现场就地控制屏.html").as_uri()
        page.goto(url_24, wait_until="networkidle")
        page.wait_for_timeout(1200)
        
        # 正常状态主图
        main_img = ROOT / "docs" / "screenshots" / "24-biochemical-local-hmi.png"
        page.screenshot(path=str(main_img), full_page=False)
        print(f"[截图完成] 主图 -> {main_img}")
        
        # 2. 特写：曝气风阀微调 + DO 自动闭环状态
        page.locator(".toggle-mode-btn").click()
        page.wait_for_timeout(600)
        state_valve_img = ROOT / "docs" / "screenshots" / "states" / "24-state-valve-step.png"
        page.screenshot(path=str(state_valve_img), full_page=False)
        print(f"[截图完成] 特写 1 -> {state_valve_img}")
        
        # 3. 特写：旋钮切换远程锁定状态
        page.locator(".toggle-mode-btn").click() # 切回
        page.locator(".mode-rotary-box").click()
        page.wait_for_timeout(600)
        state_remote_img = ROOT / "docs" / "screenshots" / "states" / "24-state-remote-locked.png"
        page.screenshot(path=str(state_remote_img), full_page=False)
        print(f"[截图完成] 特写 2 -> {state_remote_img}")
        
        # 4. Showcase 体验包总览图刷新
        showcase_page = browser.new_page(viewport={"width": 1440, "height": 900})
        showcase_page.route("http://**/*", lambda route: route.abort())
        showcase_page.route("https://**/*", lambda route: route.abort())
        showcase_url = (ROOT / "apps" / "showcase" / "index.html").as_uri()
        showcase_page.goto(showcase_url, wait_until="networkidle")
        showcase_page.wait_for_timeout(1000)
        # 点击 24 号卡片让舞台展示 24 号
        latest_card = showcase_page.locator('.card[data-src*="24-"]')
        latest_card.scroll_into_view_if_needed()
        latest_card.click()
        showcase_page.wait_for_timeout(1200)
        showcase_img = ROOT / "docs" / "screenshots" / "showcase.png"
        showcase_page.screenshot(path=str(showcase_img), full_page=False)
        print(f"[截图完成] Showcase -> {showcase_img}")
        
        browser.close()

if __name__ == "__main__":
    run()
