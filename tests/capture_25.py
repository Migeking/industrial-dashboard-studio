from pathlib import Path
from playwright.sync_api import sync_playwright
from scene_25_check import CHROME

ROOT = Path(__file__).resolve().parent.parent

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=CHROME)

        # 1. 打开 25 号场景（污泥浓缩脱水）
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.route("http://**/*", lambda route: route.abort())
        page.route("https://**/*", lambda route: route.abort())
        url_25 = (ROOT / "scenarios" / "water-treatment" / "25-污泥浓缩脱水全流程智能监控中心.html").as_uri()
        page.goto(url_25, wait_until="networkidle")
        page.locator('#chartTrend canvas').wait_for()
        page.emulate_media(reduced_motion='reduce')
        page.get_by_role('button', name='暂停演示').click()

        # 截图主图：常规运行全景
        main_img = ROOT / "docs" / "screenshots" / "25-sludge-dewatering.png"
        page.screenshot(path=str(main_img), full_page=False)
        print(f"[截图完成] 主图 -> {main_img}")

        # 截图特写：高含固冲击 + 脱水机 Faceplate
        page.get_by_role("button", name="高含固冲击").click()
        page.get_by_role('button', name='查看1号离心脱水机', exact=True).click()
        page.get_by_role('dialog').wait_for()
        state_img = ROOT / "docs" / "screenshots" / "states" / "25-state-dewater-line.png"
        page.screenshot(path=str(state_img), full_page=False)
        print(f"[截图完成] 特写 -> {state_img}")

        # 故障事件确认后保持锁定的工况归档
        page.get_by_role('button', name='关闭设备详情').click()
        page.get_by_role('button', name='单机故障', exact=True).click()
        page.locator('.ack-btn').click()
        page.wait_for_timeout(2800)
        fault_img = ROOT / 'docs/screenshots/states/25-state-fault-isolation.png'
        page.screenshot(path=str(fault_img), full_page=False)
        print(f'[截图完成] 故障隔离 -> {fault_img}')

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
