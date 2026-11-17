"""Multi-object rendering and lifecycle checks through the studio UI."""
import json
from pathlib import Path
from playwright.sync_api import expect
from studio_ui import choose_scene, publish, project_action

def campus_flow(page,base,folder,capture_dir=None):
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(base)
    # The explicit demo replaces the current source; undo restores the user's source.
    original=page.request.get(base+'/api/draft').json()['source']
    choose_scene(page,'30-demo')
    expect(page.get_by_role('status')).to_contain_text('本地联动演示')
    page.get_by_role('button',name='撤销',exact=True).click()
    with page.expect_response(lambda response:response.url==base+'/api/draft' and response.request.method=='POST'):
        page.get_by_role('button',name='保存草稿',exact=True).click()
    assert page.request.get(base+'/api/draft').json()['source']==original
    fixture=page.evaluate("""async()=>{const {template}=await import('/model.mjs');const doc=template('30-demo');delete doc.nodes[0].entities;return doc;}""")
    assert page.request.post(base+'/api/draft',data=fixture).ok
    page.reload()
    page.locator('.panel').first.click(position={'x':12,'y':12})
    page.get_by_role('button',name='配置数据绑定 →',exact=True).click()
    modal=page.locator('.inspector')
    ids=['D.FAN.NW','D.FAN.SW','D.FAN.NE','D.FAN.SE']
    for i,id in enumerate(ids):
        if i:modal.locator('[data-entity="'+id+'"] input[type=checkbox]').check()
        modal.get_by_label('运行反馈 '+id,exact=True).select_option('run'+str(i+1))
    modal.get_by_label('故障反馈 D.FAN.NE',exact=True).select_option('fault3')
    modal.get_by_label('数值标签 D.FAN.NW',exact=True).select_option('reading')
    if capture_dir:
        Path(capture_dir).mkdir(parents=True,exist_ok=True)
        page.screenshot(path=str(Path(capture_dir)/'configuration.png'))
    def status(id,value):
        expect(page.locator('[data-device="'+id+'"]')).to_have_attribute('data-state',value)
    for id,value in zip(ids,['运行','停止','故障','运行']):status(id,value)
    canvas=page.locator('.host canvas')
    page.wait_for_function("document.querySelector('.host canvas').dataset.states==='运行,停止,故障,运行'")
    before=canvas.get_attribute('data-rotations')
    page.wait_for_timeout(500)
    after=canvas.get_attribute('data-rotations')
    a=list(map(float,before.split(',')));b=list(map(float,after.split(',')))
    assert a[0]!=b[0] and a[1]==b[1] and a[2]==b[2] and a[3]!=b[3],(a,b)
    expect(page.locator('[data-object="D.FAN.NW"]')).to_contain_text('42.5 Hz')
    page.locator('[data-device="D.FAN.NE"]').click()
    page.get_by_role('tab',name='外观与布局',exact=True).click()
    expect(page.get_by_label('设备',exact=True)).to_have_value('D.FAN.NE')
    page.get_by_label('镜头',exact=True).select_option('equipment')
    expect(page.locator('[data-object="D.FAN.NE"]')).to_be_visible()
    page.get_by_label('镜头',exact=True).select_option('energy')
    publish(page)
    expect(page.get_by_role('status')).to_contain_text('已发布')
    published=page.request.get(base+'/api/published').json()
    assert len(published['nodes'][0]['entities'])==4
    page.goto(base+'/view')
    for id,value in zip(ids,['运行','停止','故障','运行']):status(id,value)
    if capture_dir:
        page.screenshot(path=str(Path(capture_dir)/'four-object-view.png'))
    # A source failure makes every configured object unknown, and recovery restores each independently.
    request_count=[];mode=['good']
    def snapshot(route):
        request_count.append(1)
        if mode[0]=='offline':route.fulfill(status=503,json={'error':'offline'})
        else:
            values=json.loads(fixture['source']['data']);values['run2']=True
            if mode[0]=='faultmissing':values['fault3']=None
            if mode[0]=='valuemissing':values['reading']=None
            route.fulfill(json=values)
    page.route('**/api/sample',snapshot)
    published['source'].update(kind='rest',url='http://127.0.0.1:1/campus-fixture',pollMs=250,maxAgeMs=1000)
    assert page.request.post(base+'/api/draft',data=published).ok
    page.goto(base)
    status(ids[1],'运行')
    mode[0]='offline'
    for id in ids:status(id,'未知')
    mode[0]='good'
    for id,value in zip(ids,['运行','运行','故障','运行']):status(id,value)
    mode[0]='faultmissing'
    status(ids[2],'未知');status(ids[0],'运行')
    mode[0]='valuemissing'
    expect(page.locator('[data-object="D.FAN.NW"]')).to_contain_text('— Hz')
    status(ids[0],'运行');status(ids[2],'故障')
    mode[0]='good'
    expect(page.locator('[data-object="D.FAN.NW"]')).to_contain_text('42.5 Hz')
    # Export embeds the same object bindings and renderer.
    with page.expect_download() as result:
        project_action(page,'导出离线演示')
    target=Path(folder)/'campus.html';result.value.save_as(target)
    page.goto(target.as_uri())
    for id,value in zip(ids,['运行','运行','故障','运行']):status(id,value)
    assert not errors,errors
    print('PASS: four campus objects, independent rotation, fault, labels, publish, recovery and offline export')
