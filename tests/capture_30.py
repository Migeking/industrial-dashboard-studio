from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SCENE = ROOT / "scenarios" / "building-automation" / "30-智慧园区多建筑集群运营管控数字孪生.html"
SCREENSHOTS = ROOT / "docs" / "screenshots"
STATES = SCREENSHOTS / "states"

def run():
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    STATES.mkdir(parents=True, exist_ok=True)

    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=CHROME)
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.route("http://**/*", lambda route: route.abort())
        page.route("https://**/*", lambda route: route.abort())

        # 1. 打开 30 号场景并等待渲染
        page.goto(SCENE.as_uri(), wait_until="networkidle")
        page.wait_for_timeout(1500)
        assert page.locator("#screen").count() == 1
        assert page.locator("#canvas-container canvas").count() == 1

        # 捕获主场景全景图
        page.screenshot(path=str(SCREENSHOTS / "30-smart-campus-multi-building.png"))
        print("[通过] 捕获主场景全景图 -> 30-smart-campus-multi-building.png")

        # 2. 切换至【停车位管理】图层
        page.get_by_role("button", name="停车位管理").click()
        page.wait_for_timeout(1000)
        page.screenshot(path=str(STATES / "30-parking-layer.png"))
        print("[通过] 捕获停车位管理图层特写 -> states/30-parking-layer.png")

        # 3. 切换至【电梯群控】图层
        page.get_by_role("button", name="电梯群控").click()
        page.wait_for_timeout(1000)
        page.screenshot(path=str(STATES / "30-elevators-layer.png"))
        print("[通过] 捕获电梯垂直交通群控特写 -> states/30-elevators-layer.png")

        # 4. 切换至【智能灯光】图层，并激活【璀璨夜景】
        page.get_by_role("button", name="智能灯光").click()
        page.get_by_role("button", name="璀璨夜景").click()
        page.wait_for_timeout(1000)
        page.screenshot(path=str(STATES / "30-lighting-night.png"))
        print("[通过] 捕获璀璨夜景亮化模式特写 -> states/30-lighting-night.png")

        # 5. 切换至【集中暖通】图层
        page.get_by_role("button", name="集中暖通").click()
        page.wait_for_timeout(1000)
        page.screenshot(path=str(STATES / "30-hvac-layer.png"))
        print("[通过] 捕获集中暖通冷热源管网特写 -> states/30-hvac-layer.png")

        # 6. 点击 A座 浮空标签激活建筑微操弹窗
        page.locator(".pin-marker strong").filter(has_text="A座 · 科研主楼").click()
        page.wait_for_timeout(600)
        page.locator(".building-modal").wait_for()
        page.screenshot(path=str(STATES / "30-building-modal.png"))
        print("[通过] 捕获A座建筑下钻综合微操弹窗特写 -> states/30-building-modal.png")

        # 7. 关闭弹窗并运行【设备联锁异常】剧本
        page.locator(".modal-close").click()
        page.wait_for_timeout(400)
        page.get_by_role("button", name="设备联锁异常").click()
        page.wait_for_timeout(800)
        page.screenshot(path=str(STATES / "30-alarm-scenario.png"))
        print("[通过] 捕获设备联锁异常演练工况特写 -> states/30-alarm-scenario.png")

        # 8. 刷新 Showcase 体验包截图 (选择第 30 号场景)
        showcase = browser.new_page(viewport={"width": 1440, "height": 900})
        showcase.route("http://**/*", lambda route: route.abort())
        showcase.route("https://**/*", lambda route: route.abort())
        showcase.goto((ROOT / "apps" / "showcase" / "index.html").as_uri(), wait_until="networkidle")
        card = showcase.locator('.card[data-src*="30-"]')
        card.scroll_into_view_if_needed()
        card.click()
        showcase.locator("#stageTitle").filter(has_text="智慧园区多建筑集群运营管控数字孪生").wait_for()
        showcase.wait_for_timeout(2000)
        showcase.screenshot(path=str(SCREENSHOTS / "showcase.png"))
        print("[通过] 刷新 Showcase 体验包总览图 -> showcase.png")

        browser.close()

    assert not errors, f"控制台发生错误: {errors}"
    print("[全部通过] 30号场景交互演练与超清截图自动化归档成功！")

if __name__ == "__main__":
    run()
