"""Archive scene 30's visual states, scaled viewports and offline Showcase."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
SCENE = ROOT / 'scenarios/building-automation/30-智慧园区多建筑集群运营管控数字孪生.html'
SCREENSHOTS = ROOT / 'docs/screenshots'
STATES = SCREENSHOTS / 'states'


def run():
    STATES.mkdir(parents=True, exist_ok=True)
    (ROOT / 'works/scene30').mkdir(parents=True, exist_ok=True)
    errors, external_requests = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=CHROME)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        page.on('request', lambda req: external_requests.append(req.url) if req.url.startswith(('http://', 'https://')) else None)
        page.route('http://**/*', lambda route: route.abort())
        page.route('https://**/*', lambda route: route.abort())
        page.goto(SCENE.as_uri(), wait_until='networkidle')
        page.locator('#canvas-container[data-assets-state="ready"]').wait_for(timeout=30000)
        page.wait_for_timeout(500)
        page.screenshot(path=str(SCREENSHOTS / '30-smart-campus-multi-building.png'))
        baseline = page.evaluate('window.getCampusDiagnostics()')

        def shot(name):
            page.wait_for_timeout(350)
            page.screenshot(path=str(STATES / ('30-' + name + '.png')))

        page.get_by_role('button', name='沉浸观景', exact=True).click()
        expect(page.locator('.hud-wrapper-right')).to_be_hidden()
        shot('immersive-campus')
        page.get_by_role('button', name='恢复面板', exact=True).click()
        page.get_by_role('button', name='聚焦A座', exact=True).click(); shot('research-facade')
        page.get_by_role('button', name='动力中心', exact=True).click(); shot('energy-centre')
        page.get_by_role('button', name='停车位管理', exact=True).click(); shot('parking-layer')
        for label, name in [('进出口信号灯与道闸', 'garage-gate'), ('超声波车位指示器特写', 'garage-bays'), ('新能源超充专区', 'garage-ev'), ('安全警示与消防岛', 'garage-safety')]:
            page.get_by_role('button', name=label, exact=True).click(); shot(name)
        page.get_by_role('button', name='进出口信号灯与道闸', exact=True).click()
        page.get_by_role('button', name='落杆禁行', exact=True).click(); shot('garage-gate-closed')
        page.get_by_role('button', name='抬杆放行', exact=True).click()
        page.get_by_role('button', name='电梯群控', exact=True).click(); shot('elevators-layer')
        page.get_by_role('button', name='智能灯光', exact=True).click()
        for label, name in [('日光自适应', 'lighting-daylight'), ('黄昏迎宾', 'lighting-dusk'), ('璀璨夜景', 'lighting-night'), ('深夜低碳', 'lighting-saving')]:
            page.get_by_role('button', name=label, exact=True).click(); shot(name)
        page.get_by_role('button', name='黄昏迎宾', exact=True).click()
        page.get_by_role('button', name='集中暖通', exact=True).click(); shot('hvac-layer')
        page.get_by_role('button', name='综合全景', exact=True).click()
        page.locator('.pin-marker strong').filter(has_text='A座 · 科研主楼').click()
        expect(page.get_by_role('dialog')).to_be_visible(); shot('building-modal')
        page.get_by_role('button', name='关闭建筑看板', exact=True).click()
        page.get_by_role('button', name='设备联锁异常', exact=True).click(); shot('alarm-scenario')
        page.get_by_role('button', name='日间稳态', exact=True).click()

        scaled = []
        for width, height in [(1366, 768), (3840, 2160)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_function('(size) => Math.abs(document.querySelector("#screen").getBoundingClientRect().width - Math.min(size[0] / 1920, size[1] / 1080) * 1920) < 1', arg=[width, height])
            box = page.locator('#screen').bounding_box()
            assert box and abs(box['width'] - min(width / 1920, height / 1080) * 1920) < 1
            assert box['x'] >= -1 and box['y'] >= -1
            shot(f'viewport-{width}x{height}')
            scaled.append({'viewport': [width, height], 'screen': box})

        showcase = browser.new_page(viewport={'width': 1440, 'height': 900})
        showcase.on('pageerror', lambda error: errors.append(str(error)))
        showcase.route('http://**/*', lambda route: route.abort())
        showcase.route('https://**/*', lambda route: route.abort())
        showcase.goto((ROOT / 'apps/showcase/index.html').as_uri(), wait_until='networkidle')
        card = showcase.locator('.card[data-src*="30-"]')
        card.scroll_into_view_if_needed(); card.click()
        showcase.frame_locator('iframe').locator('#canvas-container[data-assets-state="ready"]').wait_for(timeout=30000)
        showcase.screenshot(path=str(SCREENSHOTS / 'showcase.png'))
        showcase.screenshot(path=str(SCREENSHOTS / '30-showcase.png'))
        assert not errors, errors
        assert not external_requests, external_requests
        report = {'offline': True, 'errors': errors, 'externalRequests': external_requests, 'baseline': baseline, 'scaledViewports': scaled}
        (ROOT / 'works/scene30/visual-verification.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
        browser.close()
    print('[通过] 场景 30 全图层、工况特写、横屏缩放与 Showcase 已归档；无外网请求或运行错误。')


if __name__ == '__main__':
    run()
