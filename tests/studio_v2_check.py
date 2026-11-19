"""Native 01/05 parity and human workflow; isolated project and read-only fixture.

Run: python -X utf8 tests/studio_v2_check.py
Evidence: works/editor-v2-implementation/acceptance/
"""
import json
import os
import re
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen

import numpy as np
from PIL import Image
from skimage.metrics import structural_similarity
from playwright.sync_api import sync_playwright, expect
from studio_ui import choose_scene, publish, project_action

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'works/editor-v2-implementation/acceptance'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
FIXED = 1794902400000


def original_template(sid):
    code = "import {template} from './apps/scada-designer/studio/model.mjs';process.stdout.write(JSON.stringify(template('"+sid+"')));"
    return json.loads(subprocess.check_output(['node','--input-type=module','-e',code], cwd=ROOT))


def freeze(page, native=False):
    if native:
        page.locator('.native-host').evaluate("el=>{const s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important}';el.shadowRoot.appendChild(s)}")
    else:
        page.add_style_tag(content='*{animation:none!important;transition:none!important}')


def parity(browser, page, base, sid, results):
    doc = original_template(sid)
    assert page.request.post(base+'/api/publish',data=doc).ok
    original = browser.new_page(viewport={'width':1920,'height':1080})
    original.add_init_script("Date=class extends Date{constructor(...a){super("+str(FIXED)+")}}")
    original.goto(next((ROOT/'scenarios/water-treatment').glob(sid+'-*.html')).as_uri())
    original.locator('#screen').wait_for()
    freeze(original)
    page.goto(base+'/view')
    expect(page.locator('.native-host')).to_be_visible()
    expect(page.locator('#screen')).to_be_visible()
    freeze(page,True)
    if sid=='01':
        expect(page.locator('[data-native-chart] canvas')).to_have_count(2)
        page.wait_for_function("document.querySelector('.native-host').shadowRoot.querySelector('.k-value').textContent.includes('79')")
        original.wait_for_timeout(650)
        # A fixed wall clock also freezes ECharts' Date-based animation timer.
        # Rebuild with animation disabled so the reference contains the full
        # original curves, rather than an unfinished first frame.
        original.evaluate("""()=>{for(const id of ['loadChart','controlChart']){const c=echarts.getInstanceByDom(document.getElementById(id));const o=c.getOption();o.animation=false;o.animationDuration=0;o.animationDurationUpdate=0;c.clear();c.setOption(o,true);c.getZr().flush();}}""")
    for label, p in [('original',original),('native',page)]:
        p.locator('#screen').screenshot(path=str(OUT/f'{sid}-{label}.png'))
    a=np.asarray(Image.open(OUT/f'{sid}-original.png').convert('RGB')).copy()
    b=np.asarray(Image.open(OUT/f'{sid}-native.png').convert('RGB'))
    # Metadata explicitly changed to identify demo/quality rather than claim a
    # physical PLC connection, authentication or regulatory certification.
    if sid=='05':
        a[:54,470:]=b[:54,470:]
        a[900:940,1100:]=b[900:940,1100:]
    score=float(structural_similarity(a,b,channel_axis=2,data_range=255))
    assert score>=.97,(sid,score)
    results.append({'check':'visual-'+sid,'ssim':score,'threshold':.97,'mask':'05 communication/authentication metadata and audit caption only' if sid=='05' else 'none'})
    if sid=='01':
        expected={'标准稳态':['79','205','118','92'],'高峰负荷':['86','220','132','91'],'低温补偿':['82','215','124','89']}
        for mode, values in expected.items():
            page.get_by_role('button',name=mode,exact=True).click()
            for i,value in enumerate(values):expect(page.locator('.k-value').nth(i)).to_contain_text(value)
        results.append({'check':'01-three-scenarios','readings':12,'status':'passed'})
    original.close()


def workflow(page,base,fixture,results):
    page.goto(base)
    page.get_by_role('button',name='选择场景',exact=True).click()
    page.get_by_role('button',name='选择场景 01',exact=True).click()
    page.get_by_label('模板数据',exact=True).select_option('demo')
    page.get_by_role('button',name='使用该场景',exact=True).click()
    assert 8<=page.locator('.navigator .layer').count()<=20
    # Click the actual native object. Tree/inspector selection is shared.
    page.locator('.k-label').first.click()
    page.get_by_label('文字内容',exact=True).fill('外回流目标')
    expect(page.locator('.k-label').first).to_have_text('外回流目标')
    page.get_by_role('button',name='撤销',exact=True).click()
    expect(page.locator('.k-label').first).to_have_text('外回流比')
    page.get_by_role('button',name='重做',exact=True).click()
    expect(page.locator('.k-label').first).to_have_text('外回流目标')
    page.get_by_role('button',name='撤销',exact=True).click()
    page.locator('.kpi').first.click(position={'x':8,'y':8})
    page.get_by_label('位置 X',exact=True).fill('390')
    page.get_by_label('位置 X',exact=True).press('Tab')
    page.get_by_role('button',name='配置数据绑定 →',exact=True).click()
    expect(page.get_by_label('外回流比 · 绑定测点',exact=True)).to_have_value('external')
    # Same selected object survives a failed/cancelled data dialog.
    page.get_by_role('button',name='管理连接与点位',exact=True).click()
    page.get_by_label('样本内容',exact=True).fill('{broken')
    page.get_by_role('button',name='应用数据配置',exact=True).click()
    expect(page.get_by_role('dialog').get_by_role('alert')).to_be_visible()
    page.get_by_role('button',name='关闭',exact=True).click()
    expect(page.get_by_label('外回流比 · 绑定测点',exact=True)).to_have_value('external')
    page.get_by_role('button',name='管理连接与点位',exact=True).click()
    page.get_by_label('来源',exact=True).select_option('rest')
    page.get_by_label('接口 URL',exact=True).fill(fixture.url)
    page.get_by_label('刷新周期',exact=False).fill('250')
    page.get_by_role('button',name='读取样本',exact=True).click()
    page.get_by_label('测点',exact=True).select_option('0')
    page.get_by_role('button',name='新增测点',exact=True).click()
    page.get_by_label('业务编号',exact=True).fill('siteExternal')
    page.get_by_label('显示名称',exact=True).fill('现场外回流目标')
    page.get_by_label('数值路径',exact=False).fill('siteExternal')
    page.get_by_role('button',name='应用数据配置',exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.get_by_label('外回流比 · 绑定测点',exact=True).select_option('siteExternal')
    expect(page.locator('.k-value').first).to_contain_text('88')
    page.screenshot(path=str(OUT/'01-editor-binding.png'))
    publish(page)
    expect(page.get_by_role('status')).to_contain_text('已发布')
    first=page.request.get(base+'/api/published').json()
    assert any(n['bindings'].get('value')=='siteExternal' for n in first['nodes'])
    page.goto(base+'/view')
    expect(page.locator('.k-value').first).to_contain_text('88')
    fixture.payload['siteExternal']=0
    expect(page.locator('.k-value').first).to_contain_text('0')
    del fixture.payload['siteExternal']
    expect(page.locator('.k-value').first).to_contain_text('—')
    expect(page.locator('.quality')).to_have_text('数据质量异常')
    fixture.offline=True
    expect(page.locator('.native-source')).to_contain_text('读取失败')
    fixture.payload['siteExternal']=88;fixture.offline=False
    expect(page.locator('.k-value').first).to_contain_text('88')
    for w,h in [(1366,768),(1920,1080),(3840,2160)]:
        page.set_viewport_size({'width':w,'height':h})
        page.wait_for_function("Math.abs(document.querySelector('.board').getBoundingClientRect().width-Math.min(innerWidth,innerHeight*16/9))<2")
    page.set_viewport_size({'width':1920,'height':1080})
    results.append({'check':'01-edit-rest-bind-publish-zero-missing-offline-recovery-three-sizes','status':'passed'})
    page.goto(base)
    # Choosing a different skin can keep a real connection without replacing
    # its catalogue with demo values; undo restores the previous page.
    page.get_by_role('button',name='选择场景',exact=True).click()
    page.get_by_role('button',name='选择场景 05',exact=True).click()
    page.get_by_label('模板数据',exact=True).select_option('keep')
    page.get_by_role('button',name='使用该场景',exact=True).click()
    expect(page.locator('.workflow-source')).to_contain_text('REST 接口')
    page.get_by_role('button',name='撤销',exact=True).click()
    expect(page.locator('.k-value').first).to_contain_text('88')
    page.get_by_role('button',name='选择场景',exact=True).click()
    page.get_by_role('button',name='选择场景 05',exact=True).click()
    page.get_by_label('模板数据',exact=True).select_option('demo')
    page.get_by_role('button',name='使用该场景',exact=True).click()
    page.locator('[data-native-id="05-pump-1"]').get_by_text('P-01',exact=True).click()
    x=page.get_by_label('位置 X',exact=True)
    expected=int(x.input_value())+10
    x.fill(str(expected));x.press('Tab')
    expect(x).to_have_value(str(expected))
    page.get_by_role('button',name='撤销',exact=True).click()
    page.locator('[data-native-id="05-pump-1"]').get_by_text('P-01',exact=True).click()
    width=page.get_by_label('宽度',exact=True)
    expected=int(width.input_value())+10
    width.fill(str(expected));width.press('Tab')
    expect(width).to_have_value(str(expected))
    page.get_by_role('button',name='撤销',exact=True).click()
    page.locator('[data-native-id="05-pump-1"]').get_by_text('P-01',exact=True).click()
    page.get_by_role('button',name='配置数据绑定 →',exact=True).click()
    expect(page.get_by_label('运行反馈 · 绑定测点',exact=True)).to_have_value('P1.run')
    expect(page.get_by_label('故障反馈 · 绑定测点',exact=True)).to_have_value('P1.fault')
    expect(page.get_by_label('频率 · 绑定测点',exact=True)).to_have_value('P1.frequency')
    page.screenshot(path=str(OUT/'05-device-binding.png'))
    # Reuse the same 01 chart implementation inside 05 via the component library.
    page.get_by_role('button',name='编辑画布',exact=True).click()
    page.get_by_role('button',name='双轴趋势图',exact=True).click()
    page.get_by_label('位置 X',exact=True).fill('700');page.get_by_label('位置 X',exact=True).press('Tab')
    page.get_by_label('位置 Y',exact=True).fill('650');page.get_by_label('位置 Y',exact=True).press('Tab')
    page.get_by_label('宽度',exact=True).fill('700');page.get_by_label('宽度',exact=True).press('Tab')
    page.get_by_label('高度',exact=True).fill('220');page.get_by_label('高度',exact=True).press('Tab')
    page.wait_for_function("""()=>{const root=document.querySelector('.native-host').shadowRoot;const stage=root.querySelector('#screen').getBoundingClientRect(),chart=root.querySelector('[data-native-chart]').parentElement.getBoundingClientRect();const z=stage.width/1920;return Math.abs((chart.x-stage.x)/z-700)<2&&Math.abs((chart.y-stage.y)/z-650)<2;}""")
    page.get_by_role('button',name='配置数据绑定 →',exact=True).click()
    page.get_by_label('碳源投加 · 绑定测点',exact=True).select_option('P1.frequency')
    publish(page)
    expect(page.get_by_role('status')).to_contain_text('已发布')
    page.goto(base+'/view')
    expect(page.locator('[data-native-chart] canvas')).to_have_count(1)
    page.wait_for_function("""()=>{const el=document.querySelector('.native-host').shadowRoot.querySelector('[data-native-chart]');const o=echarts.getInstanceByDom(el)?.getOption();return o?.series[0].name==='1#回流泵 频率'&&o.yAxis[0].name==='Hz'&&o.yAxis[0].min==null&&o.yAxis[0].max==null;}""")
    page.locator('[data-native-id="05-pump-1"]').get_by_text('P-01',exact=True).click()
    panel=page.get_by_role('dialog',name='设备面板',exact=True)
    expect(panel).to_contain_text('38.5 Hz')
    page.screenshot(path=str(OUT/'05-device-faceplate.png'))
    operation_audit = page.locator('.audit-table tr[data-operation-id]')
    writes = []
    def capture_write(request):
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            writes.append(request.method)
    page.on('request', capture_write)
    panel.get_by_role('button',name='停止设备',exact=True).click()
    confirm=page.get_by_role('dialog',name='操作二次确认',exact=True)
    confirm.get_by_role('button',name='取消操作',exact=True).click()
    expect(panel).to_contain_text('运行中')
    expect(operation_audit).to_have_count(0)
    panel.get_by_role('button',name='停止设备',exact=True).click()
    confirm.get_by_role('button',name='确认下发执行',exact=True).click()
    progress = panel.locator('[data-operation-id]')
    expect(progress).to_contain_text('模拟服务已接收，等待停机反馈')
    expect(panel).to_contain_text('运行中')
    expect(panel.get_by_role('button',name='停止设备',exact=True)).to_be_disabled()
    operation_id = progress.get_attribute('data-operation-id')
    expect(operation_audit).to_have_count(1)
    expect(operation_audit).to_have_attribute('data-operation-id', operation_id)
    expect(progress).to_contain_text('模拟停机反馈已确认')
    expect(panel.get_by_text('停机',exact=True)).to_be_visible()
    expect(operation_audit).to_have_count(1)
    expect(operation_audit).to_contain_text('模拟停机反馈已确认')
    assert writes == [], writes
    page.remove_listener('request', capture_write)
    page.screenshot(path=str(OUT/'05-stop-readback.png'))
    panel.get_by_role('button',name='远程手动',exact=True).click()
    confirm.get_by_role('button',name='确认下发执行',exact=True).click()
    panel.get_by_label('频率设定',exact=True).fill('40')
    panel.get_by_role('button',name='下发设定',exact=True).click()
    confirm.get_by_role('button',name='确认下发执行',exact=True).click()
    expect(panel).to_contain_text('40.0 Hz')
    panel.get_by_role('button',name='关闭面板',exact=True).click()
    page.get_by_text('回路面板',exact=True).click()
    pid=page.get_by_role('dialog',name='液位回路面板',exact=True)
    expect(pid.get_by_label('液位设定',exact=True)).to_have_value('3.2')
    pid.get_by_label('液位设定',exact=True).fill('3.4')
    pid.get_by_role('button',name='下发设定',exact=True).click()
    confirm.get_by_role('button',name='确认下发执行',exact=True).click()
    expect(pid).to_have_count(0)
    page.screenshot(path=str(OUT/'05-reused-chart-published.png'))
    page.goto(base)
    with page.expect_download() as download:project_action(page,'导出离线演示')
    offline=OUT/'05-offline.html';download.value.save_as(offline)
    offline_page=page.context.browser.new_page()
    requests=[];offline_errors=[]
    offline_page.on('request',lambda r:requests.append(r.url) if r.url.startswith('http') else None)
    offline_page.on('pageerror',lambda e:offline_errors.append(str(e)))
    offline_page.goto(offline.as_uri())
    expect(offline_page.locator('[data-native-chart] canvas')).to_have_count(1)
    expect(offline_page.locator('.pump-shell.running')).to_have_count(2)
    assert not requests,requests
    assert not offline_errors,offline_errors
    offline_page.close()
    results.append({'check':'05-device-slots-cross-template-chart-sbo-audit-offline','status':'passed'})


def blank_workflow(page,base,results):
    # Compatibility only: import a genuine V2 assembly document. New blank
    # authoring is independently exercised by studio_screen_check.py.
    code="import {nativeBlank,nativeTemplate} from './packages/runtime/studio/native-model.mjs';const doc=nativeBlank();const sample=nativeTemplate('05');doc.source=sample.source;doc.mappings=sample.mappings;process.stdout.write(JSON.stringify(doc));"
    legacy=OUT/'legacy-v2-blank.json'
    legacy.write_bytes(subprocess.check_output(['node','--input-type=module','-e',code],cwd=ROOT))
    def open_legacy_blank():
        page.locator('.project-menu summary').click()
        page.locator('.project-menu input[type=file]').set_input_files(legacy)
        expect(page.locator('.native-host')).to_be_visible()
    page.goto(base)
    open_legacy_blank()
    page.get_by_role('button',name='四池与回流组合',exact=True).click()
    for label,value in [('位置 X',40),('位置 Y',300),('宽度',1100)]:
        field=page.get_by_label(label,exact=True);field.fill(str(value));field.press('Tab')
    page.get_by_role('button',name='紧凑指标卡',exact=True).click()
    page.get_by_role('button',name='复制',exact=True).click()
    page.get_by_label('标题',exact=True).fill('复制卡片·泵频率')
    for label,value in [('位置 X',440),('位置 Y',140)]:
        field=page.get_by_label(label,exact=True);field.fill(str(value));field.press('Tab')
    page.get_by_role('button',name='配置数据绑定 →',exact=True).click()
    page.get_by_label('外回流比 · 绑定测点',exact=True).select_option('P1.frequency')
    page.get_by_role('button',name='编辑画布',exact=True).click()
    page.locator('.kpi').nth(0).click(position={'x':8,'y':8})
    page.locator('.kpi').nth(1).click(position={'x':8,'y':8},modifiers=['Shift'])
    page.get_by_role('button',name='成组',exact=True).click()
    expect(page.get_by_label('标题',exact=True)).to_have_value('设备组合')
    field=page.get_by_label('位置 X',exact=True)
    field.fill('140');field.press('Tab')
    page.wait_for_function("""()=>{const s=document.querySelector('.native-host').shadowRoot,b=s.querySelector('#screen').getBoundingClientRect(),r=s.querySelector('.kpi')?.getBoundingClientRect();return r&&Math.abs((r.x-b.x)*1920/b.width-140)<2;}""")
    page.get_by_role('button',name='解组',exact=True).click()
    page.wait_for_function("""()=>{const s=document.querySelector('.native-host').shadowRoot,b=s.querySelector('#screen').getBoundingClientRect(),r=s.querySelector('.kpi')?.getBoundingClientRect();return r&&Math.abs((r.x-b.x)*1920/b.width-140)<2;}""")
    page.get_by_role('button',name='双轴趋势图',exact=True).click()
    for label,value in [('位置 X',1200),('位置 Y',700),('宽度',680)]:
        field=page.get_by_label(label,exact=True);field.fill(str(value));field.press('Tab')
    publish(page)
    expect(page.get_by_role('status')).to_contain_text('已发布')
    doc=page.request.get(base+'/api/published').json()
    assert doc['schemaVersion']==2 and doc['template']=='blank'
    card=next(n for n in doc['nodes'] if n['title']=='复制卡片·泵频率')
    assert any(n['bindings'].get('value')=='P1.frequency' for n in doc['nodes'] if n['parentId']==card['id'])
    page.goto(base+'/view')
    expect(page.locator('.kpi')).to_have_count(2)
    expect(page.locator('.k-value').nth(1)).to_contain_text('38.5')
    expect(page.locator('.k-value').nth(1)).to_contain_text('Hz')
    expect(page.locator('[data-native-chart] canvas')).to_have_count(1)
    page.screenshot(path=str(OUT/'blank-components-published.png'))
    results.append({'check':'blank-assembly-copy-rename-rebind-publish-reopen','status':'passed'})
    page.goto(base)
    open_legacy_blank()
    page.get_by_role('button',name='泵组管网组合',exact=True).click()
    publish(page)
    expect(page.get_by_role('status')).to_contain_text('已发布')
    page.goto(base+'/view')
    expect(page.locator('.pump-shell')).to_have_count(4)
    expect(page.locator('.pump-shell.running')).to_have_count(2)
    page.locator('.pump-shell.running').first.evaluate("el=>{if(getComputedStyle(el).fill!=='rgb(17, 58, 48)')throw Error('component skin missing: '+getComputedStyle(el).fill)}")
    page.screenshot(path=str(OUT/'blank-pump-assembly.png'))
    results.append({'check':'05-pump-assembly-reused-on-01-blank-skin','status':'passed'})


def readonly_workflow(page,base,fixture,results):
    doc=original_template('05')
    fixture.payload=json.loads(doc['source']['data'])
    doc['source']={'kind':'rest','url':fixture.url,'pollMs':250,'maxAgeMs':10000}
    response=page.request.post(base+'/api/publish',data=doc)
    assert response.ok,response.text()
    page.goto(base+'/view')
    page.locator('[data-native-id="05-pump-1"]').get_by_text('P-01',exact=True).click()
    panel=page.get_by_role('dialog',name='设备面板',exact=True)
    expect(panel).to_contain_text('只读监视')
    expect(panel).to_contain_text('38.5 Hz')
    for name in ['远程自动','远程手动','下发设定','启动设备','停止设备']:
        expect(panel.get_by_role('button',name=name,exact=True)).to_be_disabled()
    panel.get_by_role('button',name='关闭面板',exact=True).click()
    expect(page.locator('.audit-table tbody tr')).to_have_count(0)
    flow=next(n for n in doc['nodes'] if n['bindings'].get('value')=='totalFlow')
    fixture.payload['totalFlow']=0
    expect(page.locator('[data-native-id="'+flow['id']+'"]')).to_contain_text('0')
    del fixture.payload['totalFlow']
    expect(page.locator('[data-native-id="'+flow['id']+'"]')).to_contain_text('—')
    fixture.payload['P1.run']=False
    fixture.payload['P1.fault']=False
    expect(page.locator('[data-native-id="05-pump-1"] .pump-shell')).not_to_have_class(re.compile(r'\brunning\b'))
    fixture.payload['P1.fault']=True
    expect(page.locator('[data-native-id="05-pump-1"] .pump-shell')).to_have_class(re.compile(r'\bfault\b'))
    results.append({'check':'05-live-readonly-false-fault-no-fake-audit','status':'passed'})


class Fixture:
    def __init__(self):
        self.payload=json.loads(original_template('01')['source']['data']);self.payload['siteExternal']=88
        self.offline=False
        fixture=self
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(503 if fixture.offline else 200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(fixture.payload).encode())
            def log_message(self,*a):pass
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        self.url='http://127.0.0.1:'+str(self.server.server_port)+'/snapshot'
        threading.Thread(target=self.server.serve_forever,daemon=True).start()


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    results=[];errors=[]
    fixture=Fixture()
    with tempfile.TemporaryDirectory() as folder:
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        base='http://127.0.0.1:'+str(port)
        proc=subprocess.Popen(['node','apps/scada-designer/server.mjs'],cwd=ROOT,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_DATA_DIR':folder},creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            for _ in range(50):
                try:urlopen(base,timeout=1).close();break
                except OSError:time.sleep(.1)
            with sync_playwright() as p:
                b=p.chromium.launch(executable_path=CHROME,headless=True)
                page=b.new_page(viewport={'width':1920,'height':1080})
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.add_init_script("Date=class extends Date{constructor(...a){super("+str(FIXED)+")}}")
                for sid in ['01','05']:parity(b,page,base,sid,results)
                # Real clock is required for live REST age/recovery checks.
                page.close();page=b.new_page(viewport={'width':1920,'height':1080})
                page.on('pageerror',lambda e:errors.append(str(e)))
                try:
                    workflow(page,base,fixture,results)
                    blank_workflow(page,base,results)
                    readonly_workflow(page,base,fixture,results)
                except Exception:
                    page.screenshot(path=str(OUT/'failure.png'))
                    (OUT/'failure-project.json').write_text(json.dumps(page.evaluate("document.querySelector('#app')._vnode.component.proxy.doc"),ensure_ascii=False,indent=2),encoding='utf-8')
                    (OUT/'failure-shadow.html').write_text(page.locator('.native-host').evaluate('el=>el.shadowRoot.innerHTML'),encoding='utf-8')
                    (OUT/'failure-dom.json').write_text(json.dumps(page.evaluate("""()=>{const s=document.querySelector('.native-host')?.shadowRoot;return s?[...s.querySelectorAll('[data-native-chart],#screen,[data-business-device]')].map(el=>({id:el.dataset.nativeId,rect:el.getBoundingClientRect().toJSON(),style:el.getAttribute('style')})):[];}"""),indent=2),encoding='utf-8')
                    raise
                assert not errors,errors
                b.close()
        finally:
            proc.terminate();proc.wait();fixture.server.shutdown()
            (OUT/'results.json').write_text(json.dumps({'checks':results,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(results,ensure_ascii=False,indent=2))
    print('PASS: native 01/05 parity, edit/data/publish, shared chart, SBO, quality and offline')


if __name__=='__main__':main()
