from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SCENE = ROOT / "scenarios" / "water-treatment" / "29-生物除臭系统2.5D数字孪生HMI.html"
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

        # 1. 打开29号场景
        page.goto(SCENE.as_uri(), wait_until="networkidle")
        page.wait_for_timeout(1000)
        assert page.locator("#screen").count() == 1
        assert page.locator("#twin3d canvas").count() == 1

        # 捕获主场景全景图
        page.screenshot(path=str(SCREENSHOTS / "29-bio-deodorization-twin.png"))
        print("[通过] 捕获主场景全景图 -> 29-bio-deodorization-twin.png")

        # 2. 点击特写 1#引风机
        page.locator("#viewFan1").click()
        page.wait_for_timeout(1000)
        page.locator(".device-inspector strong").filter(has_text="1# 离心引风机组").wait_for()
        page.screenshot(path=str(STATES / "29-fan-detail.png"))
        print("[通过] 捕获1#引风机精细化特写 -> states/29-fan-detail.png")

        # 3. 点击特写 预洗涤除臭池
        page.locator("#viewFocus").click()
        page.wait_for_timeout(1000)
        page.locator(".device-inspector strong").filter(has_text="1# 预洗涤增湿除臭池").wait_for()
        page.screenshot(path=str(STATES / "29-tank-detail.png"))
        print("[通过] 捕获预洗池护笼爬梯与视镜特写 -> states/29-tank-detail.png")

        # 4. 点击特写 排放烟囱与CEMS
        page.locator("#viewChimney").click()
        page.wait_for_timeout(1000)
        page.locator(".device-inspector strong").filter(has_text="高空排气筒及CEMS监测站").wait_for()
        page.screenshot(path=str(STATES / "29-chimney-detail.png"))
        print("[通过] 捕获排放烟囱与CEMS采样平台特写 -> states/29-chimney-detail.png")

        # 5. 点击特写 循环喷淋水泵组
        page.locator("#viewPump").click()
        page.wait_for_timeout(1000)
        page.locator(".device-inspector strong").filter(has_text="循环喷淋水泵组").wait_for()
        page.screenshot(path=str(STATES / "29-pump-detail.png"))
        print("[通过] 捕获循环喷淋泵Y型过滤器特写 -> states/29-pump-detail.png")

        # 6. 还原全景并验证控制交互
        page.locator("#viewHome").click()
        page.wait_for_timeout(800)
        page.get_by_role("button", name="控制").click()
        page.locator(".control-form").wait_for()

        # 7. 刷新 Showcase 体验包截图
        showcase = browser.new_page(viewport={"width": 1440, "height": 900})
        showcase.route("http://**/*", lambda route: route.abort())
        showcase.route("https://**/*", lambda route: route.abort())
        showcase.goto((ROOT / "apps" / "showcase" / "index.html").as_uri(), wait_until="networkidle")
        card = showcase.locator('.card[data-src*="29-"]')
        card.scroll_into_view_if_needed()
        card.click()
        showcase.locator("#stageTitle").filter(has_text="除臭").wait_for()
        showcase.wait_for_timeout(1500)
        showcase.screenshot(path=str(SCREENSHOTS / "showcase.png"))
        print("[通过] 刷新 Showcase 体验包总览图 -> showcase.png")

        browser.close()

    assert not errors, f"控制台发生错误: {errors}"
    print("[全部通过] 29号场景特写观察交互与高清归档验证完毕！")

if __name__ == "__main__":
    run()
