import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})

    target_html = (ROOT / "scenarios" / "building-automation" / "22-智能楼宇自控与空间微气候数字孪生.html").as_uri()
    page.goto(target_html, wait_until="networkidle")
    page.wait_for_timeout(1500)

    # 1. 27F 智慧办公空间室内完整精细场景（主图）
    page.screenshot(path=str(ROOT / "docs" / "screenshots" / "22-building-automation.png"))
    print("[完成] 22-building-automation.png")

    # 2. 全楼综合总览（高楼大厦与园区建筑群）
    page.locator(".pill-btn").filter(has_text="全楼综合总览").click()
    page.wait_for_timeout(1000)
    page.screenshot(path=str(ROOT / "docs" / "screenshots" / "states" / "22-state-building-tower.png"))
    print("[完成] states/22-state-building-tower.png")

    # 3. 2F 核心数据机房切面
    page.locator(".pill-btn").filter(has_text="核心数据机房").click()
    page.wait_for_timeout(1000)
    page.screenshot(path=str(ROOT / "docs" / "screenshots" / "22-datacenter.png"))
    print("[完成] 22-datacenter.png")

    # 4. -1F 冷源动力泵房切面
    page.locator(".pill-btn").filter(has_text="冷源动力泵房").click()
    page.wait_for_timeout(1000)
    page.screenshot(path=str(ROOT / "docs" / "screenshots" / "22-chiller-plant.png"))
    print("[完成] 22-chiller-plant.png")

    # 5. 更新 Showcase 总览图
    showcase_url = (ROOT / "apps" / "showcase" / "index.html").as_uri()
    page.goto(showcase_url, wait_until="networkidle")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(ROOT / "docs" / "screenshots" / "showcase.png"))
    print("[完成] showcase.png")

    browser.close()
