"""Scene 30 checks against visible state and renderer readback, without network access."""
from playwright.sync_api import expect


def assert_scene_30(page):
    page.locator('#canvas-container[data-assets-state="ready"]').wait_for(timeout=30000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    canvas = page.locator('#canvas-container')
    diag = lambda: page.evaluate('window.getCampusDiagnostics()')
    assert diag()['instances'] > 10000
    assert diag()['interiorCount'] > 100
    assert '离线演示' in page.locator('.quality-badge').inner_text()

    page.get_by_role('button', name='精细画质', exact=True).click()
    expect(canvas).to_have_attribute('data-quality', 'fast')
    page.get_by_role('button', name='流畅画质', exact=True).click()
    expect(canvas).to_have_attribute('data-quality', 'fine')
    page.get_by_role('button', name='沉浸观景', exact=True).click()
    expect(page.locator('.hud-wrapper-left')).to_be_hidden()
    expect(page.locator('.hud-wrapper-right')).to_be_hidden()
    page.get_by_role('button', name='恢复面板', exact=True).click()
    expect(page.locator('.hud-wrapper-left')).to_be_visible()

    page.get_by_role('button', name='停车位管理', exact=True).click()
    expect(canvas).to_have_attribute('data-layer', 'parking')
    assert page.locator('.bay-cell').count() == 18
    before = diag()['parking'][0]
    page.locator('.bay-cell').first.click()
    assert diag()['parking'][0] is not before
    page.locator('.bay-cell').first.click()
    assert diag()['parking'][0] is before
    page.get_by_role('button', name='落杆禁行', exact=True).click()
    assert not diag()['gateOpen']
    expect(page.locator('.signal-pill.red')).to_contain_text('红灯落杆')
    page.get_by_role('button', name='抬杆放行', exact=True).click()
    assert diag()['gateOpen']
    positions = []
    for label in ['进出口信号灯与道闸', '超声波车位指示器特写', '新能源超充专区', '安全警示与消防岛', '地库全景鸟瞰']:
        page.get_by_role('button', name=label, exact=True).click()
        expect(page.locator('.garage-sub-btn.active')).to_contain_text(label)
        positions.append(diag()['camera'])
    assert len({tuple(p) for p in positions}) == 5

    page.get_by_role('button', name='智能灯光', exact=True).click()
    colors = []
    for label, mode in [('日光自适应', 'daylight'), ('黄昏迎宾', 'dusk'), ('璀璨夜景', 'night'), ('深夜低碳', 'saving')]:
        page.get_by_role('button', name=label, exact=True).click()
        expect(canvas).to_have_attribute('data-lighting', mode)
        colors.append(diag()['windowColor'])
    assert len(set(colors)) == 4

    page.get_by_role('button', name='设备联锁异常', exact=True).click()
    expect(canvas).to_have_attribute('data-layer', 'elevators')
    expect(page.locator('.elevator-card.warning')).to_contain_text('A-L03')
    assert page.evaluate('echarts.getInstanceByDom(document.getElementById("hvacTrendChart")).getOption().series[1].data[5]') == 13.8
    page.wait_for_timeout(100)
    stopped = diag()['elevatorPositions'][2]
    moving = diag()['elevatorPositions'][0]
    page.wait_for_timeout(400)
    assert abs(diag()['elevatorPositions'][2] - stopped) < .001
    assert abs(diag()['elevatorPositions'][0] - moving) > .01
    page.get_by_role('button', name='日间稳态', exact=True).click()
    assert page.locator('.elevator-card.warning').count() == 0
    assert page.evaluate('echarts.getInstanceByDom(document.getElementById("hvacTrendChart")).getOption().series[1].data[5]') == 12.2

    page.get_by_role('button', name='集中暖通', exact=True).click()
    assert diag()['networkVisible']
    expect(page.locator('.scene-key')).to_contain_text('供水')
    page.get_by_role('button', name='全景鸟瞰', exact=True).click()
    page.get_by_role('button', name='综合全景', exact=True).click()
    page.locator('.pin-marker strong').filter(has_text='A座 · 科研主楼').click()
    expect(page.get_by_role('dialog')).to_contain_text('68000')
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.get_by_role('button', name='全景鸟瞰', exact=True).click()
    assert not errors, errors
