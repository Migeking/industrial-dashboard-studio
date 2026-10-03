from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SCENE = ROOT / 'scenarios/water-treatment/25-污泥浓缩脱水全流程智能监控中心.html'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'


def assert_scene_25(page):
    expect(page.locator('.brand-title')).to_contain_text('污泥浓缩脱水')
    expect(page.locator('#chartTrend canvas')).to_have_count(1)
    expect(page.locator('.footer')).to_contain_text('数据质量：DEMO')
    expect(page.locator('[data-testid="feed-metric"] strong')).to_have_text('72.0')

    page.get_by_role('button', name='高含固冲击', exact=True).click()
    expect(page.locator('[data-testid="feed-metric"] strong')).to_have_text('96.0')
    expect(page.locator('.event-count')).to_have_text('3 条待确认')
    page.get_by_role('button', name='PAM配比增加0.1').click()
    expect(page.locator('.do-target')).to_have_text('5.3')
    for _ in range(7):
        page.get_by_role('button', name='PAM配比增加0.1').click()
    expect(page.locator('.do-target')).to_have_text('6.0')
    expect(page.get_by_role('button', name='PAM配比增加0.1')).to_be_disabled()
    for _ in range(30):
        page.get_by_role('button', name='PAM配比减少0.1').click()
    expect(page.locator('.do-target')).to_have_text('3.0')
    expect(page.get_by_role('button', name='PAM配比减少0.1')).to_be_disabled()

    page.get_by_role('button', name='关注 1# 线').click()
    expect(page.locator('[data-device="dw2"]')).to_have_attribute('opacity', '0.32')
    # Keyboard opens the same equipment panel; focus returns to the device.
    equipment = page.get_by_role('button', name='查看1号离心脱水机', exact=True)
    equipment.focus()
    page.keyboard.press('Enter')
    expect(page.get_by_role('dialog')).to_be_visible()
    expect(page.locator('#deviceTitle')).to_have_text('1# 离心脱水机')
    expect(page.locator('.faceplate')).to_contain_text('转鼓转速')
    expect(page.get_by_role('button', name='关闭设备详情')).to_be_focused()
    page.keyboard.press('Shift+Tab')
    expect(page.get_by_role('button', name='返回工艺总览')).to_be_focused()
    page.keyboard.press('Tab')
    expect(page.get_by_role('button', name='关闭设备详情')).to_be_focused()
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(equipment).to_be_focused()

    page.get_by_role('button', name='单机故障', exact=True).click()
    expect(page.locator('[data-testid="feed-metric"] strong')).to_have_text('36.0')
    fault_row = page.locator('.line-row').first
    expect(fault_row).to_contain_text('故障锁定')
    page.locator('.ack-btn').click()
    expect(page.locator('.event-count')).to_have_text('0 条待确认')
    expect(fault_row).to_contain_text('故障锁定')
    expect(page.locator('[data-device="dw1"]')).to_have_class('device centrifuge fault')
    expect(page.locator('[data-testid="feed-branch-1"]')).to_have_class('sludge-pipe inactive')
    assert page.locator('[data-testid="feed-branch-1"]').get_attribute('marker-end') is None
    equipment.click()
    expect(page.locator('.drawer-metric').filter(has_text='转鼓转速').locator('strong')).to_have_text('0')
    expect(page.locator('.device-explanation')).to_contain_text('不会恢复设备运行')
    page.get_by_role('button', name='关闭设备详情').click()

    page.get_by_role('button', name='雨季稀释', exact=True).click()
    expect(page.locator('[data-testid="feed-metric"] strong')).to_have_text('42.0')
    expect(page.locator('.line-row').nth(1)).to_contain_text('备用')
    page.get_by_role('button', name='8 h', exact=True).click()
    expect(page.get_by_role('button', name='8 h', exact=True)).to_have_attribute('aria-pressed', 'true')
    assert page.evaluate("echarts.getInstanceByDom(document.getElementById('chartTrend')).getOption().xAxis[0].data.length") == 8

    page.get_by_role('button', name='暂停演示', exact=True).click()
    timestamp = page.locator('.footer').inner_text()
    page.wait_for_timeout(3200)
    assert page.locator('.footer').inner_text() == timestamp, '暂停后更新时间仍在推进'
    page.get_by_role('button', name='恢复初始演示').click()
    expect(page.locator('.do-target')).to_have_text('4.2')
    expect(page.locator('[data-testid="feed-metric"] strong')).to_have_text('72.0')
    expect(page.get_by_role('button', name='暂停演示')).to_be_visible()
    expect(page.get_by_role('button', name='24 h', exact=True)).to_have_attribute('aria-pressed', 'true')
    expect(page.get_by_role('button', name='全部流程')).to_have_attribute('aria-pressed', 'true')


def run():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=CHROME)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
        page.route('http://**/*', lambda route: route.abort())
        page.route('https://**/*', lambda route: route.abort())
        page.goto(SCENE.as_uri(), wait_until='networkidle')
        assert_scene_25(page)
        for width, height in [(1920, 1080), (1440, 900), (1366, 768), (2560, 1440)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
            rect = page.locator('#screen').bounding_box()
            assert rect and rect['x'] >= -.5 and rect['y'] >= -.5
            assert rect['x'] + rect['width'] <= width + .5
            assert rect['y'] + rect['height'] <= height + .5
            assert abs(rect['width'] / rect['height'] - 16 / 9) < .001
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            print(f'[通过] 25号横屏缩放 {width}×{height}')
        page.emulate_media(reduced_motion='reduce')
        assert page.locator('.flow').evaluate_all("nodes => nodes.every(el => getComputedStyle(el).animationName === 'none')")
        assert not errors, errors
        browser.close()
        print('[通过] 25号离线加载、四种工况、配比边界、故障确认、键盘焦点、趋势和暂停恢复')


if __name__ == '__main__':
    run()
