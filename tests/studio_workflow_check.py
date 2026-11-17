"""Follow a component from canvas editing through data selection and publication."""
import json
import os
from pathlib import Path
from playwright.sync_api import expect
from studio_ui import choose_scene, publish


def workflow_inspector(page,base):
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    capture=os.environ.get('STUDIO_CAPTURE_DIR')
    def shot(name):
        if capture:
            Path(capture).mkdir(parents=True,exist_ok=True)
            page.screenshot(path=str(Path(capture)/(name+'.png')))
    page.goto(base)
    page.get_by_role('button',name='选择场景',exact=True).click()
    page.get_by_role('button',name='选择场景 30-demo',exact=True).click()
    shot('scene-selection')
    page.get_by_role('button',name='使用该场景',exact=True).click()
    page.get_by_role('button',name='指标卡',exact=True).click()
    panel=page.locator('.panel.chosen')
    id=panel.get_attribute('data-id')
    page.get_by_label('位置 X',exact=True).fill('200')
    page.get_by_label('位置 X',exact=True).press('Tab')
    page.get_by_label('宽度',exact=True).fill('600')
    page.get_by_label('宽度',exact=True).press('Tab')
    expect(panel).to_have_css('left','200px')
    expect(panel).to_have_css('width','600px')
    page.get_by_role('button',name='配置数据绑定 →',exact=True).click()
    expect(page.get_by_label('当前组件测点',exact=True)).to_have_value('')
    expect(page.locator('.binding-readback')).to_contain_text('请选择测点')
    page.locator('.studio-header').get_by_role('button',name='预览发布',exact=True).click()
    assert page.locator('.studio-header').get_by_role('button',name='发布',exact=True).is_disabled()
    page.get_by_role('button',name='去绑定：指标卡',exact=True).click()
    expect(panel).to_have_attribute('data-id',id)
    page.get_by_role('button',name='管理连接与点位',exact=True).click()
    expect(page.locator('.connection-context')).to_contain_text('指标卡')
    shot('connection-context')
    # Cancelling is lossless and retains the selected object.
    page.get_by_label('样本内容').fill('{broken')
    page.get_by_role('button',name='应用数据配置',exact=True).click()
    expect(page.get_by_role('dialog').get_by_role('alert')).to_be_visible()
    page.get_by_role('button',name='关闭',exact=True).click()
    expect(panel).to_have_attribute('data-id',id)
    page.get_by_role('button',name='管理连接与点位',exact=True).click()
    data=json.loads(page.get_by_label('样本内容').input_value())
    data['reading']=0
    page.get_by_label('样本内容').fill(json.dumps(data))
    page.get_by_role('button',name='应用数据配置',exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(panel).to_have_attribute('data-id',id)
    page.get_by_label('当前组件测点',exact=True).select_option('reading')
    expect(page.locator('.binding-readback')).to_contain_text('0.0 Hz')
    expect(panel.locator('.number')).to_have_text('0.0')
    shot('linked-inspector')
    page.get_by_role('button',name='完成绑定，预览页面 →',exact=True).click()
    expect(page.locator('.inspector')).to_contain_text('当前为本地样本')
    shot('publish-review')
    page.locator('.studio-header').get_by_role('button',name='发布',exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('已发布')
    published=page.request.get(base+'/api/published').json()
    assert next(n for n in published['nodes'] if n['id']==id)['binding']=='reading'
    page.get_by_role('button',name='返回编辑',exact=True).click()
    page.get_by_label('标题',exact=True).fill('新读数')
    page.locator('.studio-header').get_by_role('button',name='预览发布',exact=True).click()
    expect(page.locator('.publish-success')).to_have_count(0)
    expect(page.get_by_role('status')).to_contain_text('发布后才会更新展示端')
    assert next(n for n in page.request.get(base+'/api/published').json()['nodes'] if n['id']==id)['title']=='指标卡'
    page.goto(base+'/view')
    expect(page.locator('[data-id="'+id+'"] .number')).to_have_text('0.0')
    page.goto(base)
    for w,h in [(1366,768),(1920,1080)]:
        page.set_viewport_size({'width':w,'height':h})
        page.get_by_role('button',name='数据绑定',exact=True).click()
        expect(page.locator('.inspector')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(w,h)
        page.wait_for_function("document.querySelector('.board').getBoundingClientRect().width <= document.querySelector('main').clientWidth+1")
    assert not errors,errors
    print('PASS: scene, canvas, explicit binding, connection context, cancel/error, zero, review, publish and two editor sizes')
