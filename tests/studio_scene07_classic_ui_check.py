"""Assemble a classic A2O monitoring page through the production editor."""
import copy
import json
import os
import socket
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'works/scene07-classic'
OUT.mkdir(parents=True, exist_ok=True)
BG, INK, STEEL = '#e9eef1', '#253743', '#90a6b1'
MUD, AIR, DRUG, WATER = '#705a50', '#b38731', '#87669b', '#4386ad'


def fixture():
    doc = json.loads(subprocess.check_output([
        'node', '--input-type=module', '-e',
        'import {blankScreen} from "./packages/runtime/studio/screen-model.mjs";console.log(JSON.stringify(blankScreen()))',
    ], cwd=ROOT))
    doc['title'] = '07 A²/O 生化工段 · 空白画布验收'
    doc['canvas'].update(theme='process-gray', background=BG, purpose='process')
    rows = []

    def add(point, value, unit='', kind='number'):
        rows.append(dict(id=point, label=point, value=value, unit=unit, kind=kind, quality='good'))

    for key, value, unit in [
        ('ana.level',5.20,'m'), ('anx.level',5.35,'m'), ('aer.level',5.48,'m'), ('settler.level',4.42,'m'),
        ('orp',-185,'mV'), ('anx.do',0.31,'mg/L'), ('no3',6.4,'mg/L'), ('do.pv',2.24,'mg/L'),
        ('do.sp',2.2,'mg/L'), ('air.output',65,'%'), ('nh4',1.48,'mg/L'), ('mlss',3420,'mg/L'),
        ('sludge.level',1.15,'m'), ('carbon.flow',120,'L/h'), ('air.hz',43.8,'Hz'),
        ('in.flow',540,'m³/h'), ('internal.ratio',205,'%'), ('external.ratio',75,'%'),
    ]:
        add(key, value, unit)
    for key in ['mix1.run','mix2.run','internal.run','external.run','carbon.run','air.run','water.flowing']:
        add(key, True, kind='boolean')
    for key in ['mix1.fault','carbon.fault','air.interlock']:
        add(key, False, kind='boolean')
    add('effluent', [
        {'指标':a,'当前值':b,'限值':c} for a,b,c in [
            ('COD','28.4 mg/L','≤ 50'),('NH₄-N','1.48 mg/L','≤ 5'),('总氮','12.1 mg/L','≤ 15'),
            ('总磷','0.36 mg/L','≤ 0.5'),('悬浮物','6.2 mg/L','≤ 10'),
        ]
    ], kind='dataset')
    add('energy', [
        {'工艺参数':'供气量','当前值':'48.6 m³/min'},
        {'工艺参数':'母管压力','当前值':'57.8 kPa'},
        {'工艺参数':'吨水曝气单耗','当前值':'0.142 kWh/m³'},
    ], kind='dataset')
    add('alarms', [
        {'时刻':'14:22:10','位号':'AIT-204','事件':'好氧池溶解氧曾短时低于下限','状态':'已恢复'},
        {'时刻':'13:05:42','位号':'P-201A','事件':'内回流泵电机轴温偏高','状态':'已确认'},
    ], kind='dataset')
    add('history', [{'time':f'{i:02}:00','value':round(2.08+(i%5)*.06,2)} for i in range(8)], kind='dataset')
    doc['source']['data'] = json.dumps({'points':rows}, ensure_ascii=False)
    doc['mappings'] = [
        dict(id=r['id'], label=r['label'], kind=r['kind'], unit=r['unit'], path='value', root='points',
             keyField='id', keyValue=r['id'], timePath='', qualityPath='quality', scale=1, offset=0, precision=2)
        for r in rows
    ]
    return doc


def exercise(page, base):
    page.goto(base)
    ids = {}
    nav = page.get_by_role('complementary', name='场景与组件')
    tools = page.get_by_role('toolbar', name='画布工具')
    assert not page.request.get(base+'/api/draft').json()['nodes']
    expect(tools).to_be_visible()
    tools.get_by_label('工作区组件分类').select_option('pid')
    expect(nav.locator('[data-palette-section=pid] button')).to_have_count(5)
    page.screenshot(path=str(OUT/'blank.png'))

    def field(label, value):
        control = page.get_by_label(label, exact=True)
        control.fill(str(value))
        control.press('Tab')

    def position(x, y):
        box = page.locator('.board').bounding_box()
        return box['x']+x*box['width']/1920, box['y']+y*box['height']/1080

    def select(id, tab='外观'):
        tools.get_by_role('button', name='打开图层面板').click()
        page.locator(f'[data-layer="{id}"]').click()
        page.get_by_role('tab',name=tab,exact=True).click()

    def bind(key, values):
        select(ids[key], '动态与测点')
        for label, point in values.items():
            page.get_by_label(label+' · 绑定测点', exact=True).select_option(point)

    def save():
        with page.expect_response(lambda r:r.url==base+'/api/draft' and r.request.method=='POST') as resp:
            page.get_by_role('button', name='保存草稿', exact=True).click()
        assert resp.value.ok, resp.value.text()
        return page.request.get(base+'/api/draft').json()

    def place(key, kind, x, y, w, h, title, fill=None, stroke=None, size=None):
        nav.get_by_role('tab',name='图元与工具',exact=True).click()
        nav.get_by_label('组件分类',exact=True).select_option('all')
        nav.get_by_label('搜索组件',exact=True).fill(kind)
        nodes = page.locator('.x6-node')
        before = set(nodes.evaluate_all('(items)=>items.map(e=>e.dataset.cellId)'))
        card = nav.locator(f'[data-symbol="{kind}"]')
        if key == 'ana':
            box = page.locator('.board').bounding_box()
            card.drag_to(page.locator('.board'),target_position={'x':x*box['width']/1920,'y':y*box['height']/1080})
        else:
            card.click()
            page.mouse.click(*position(x+1,y+1))
        expect(nodes).to_have_count(len(before)+1)
        ids[key] = (set(nodes.evaluate_all('(items)=>items.map(e=>e.dataset.cellId)'))-before).pop()
        field('图元名称',title)
        for label, value in [('宽度',w),('高度',h),('位置 X',x),('位置 Y',y)]:
            field(label,value)
        if fill:
            field('填充颜色',fill)
        if stroke:
            field('边线颜色',stroke)
        if size:
            field('字号',size)
        if page.get_by_label('文字颜色',exact=True).count():
            field('文字颜色',INK)

    def rect(key,x,y,w,h,fill,stroke=None):
        place(key,'rect',x,y,w,h,key,fill,stroke or fill)

    def caption(key,x,y,w,h,value,size=17,weight='400',color=INK):
        place(key,'text',x,y,w,h,value,size=size)
        field('文字内容',value)
        field('文字颜色',color)
        page.get_by_label('字重',exact=True).select_option(weight)
        page.get_by_label('文字对齐',exact=True).select_option('left')

    def readout(key,x,y,w,h,title,point,precision,color):
        place(key,'readout',x,y,w,h,title,size=15)
        page.get_by_label('外观预设',exact=True).select_option('inline')
        field('小数位',precision)
        field('文字颜色',color)
        page.get_by_label('字重',exact=True).select_option('600')
        bind(key,{'显示数值':point})

    rect('页眉',0,0,1920,54,'#dce5ea',STEEL)
    rect('阶段栏',0,54,1920,48,'#d0dce2')
    rect('工艺底板',16,114,1519,727,'#edf2f4','#a4b7bf')
    rect('侧栏底板',1548,114,356,727,'#f6f8f9','#a4b7bf')
    rect('报警底板',16,855,930,193,'#f7f9fa','#a4b7bf')
    rect('趋势底板',960,855,944,193,'#f7f9fa','#a4b7bf')
    caption('head',24,9,1170,34,'城东污水处理厂   /   A²/O 生化脱氮除磷 · 上位监控',23,'700')
    caption('scope',1570,12,331,32,'工艺监视 · 只读',16,'600','#355b70')
    caption('stages',25,60,1430,32,'生化车间    /    厌氧释磷    ›    缺氧反硝化    ›    好氧硝化    ›    二沉分离',16,'600')
    caption('diagram',35,129,430,35,'工艺总览  /  生化反应池',19,'700')
    caption('in',43,407,138,28,'进水总管',15,'600')
    caption('out',1380,407,135,28,'出水排放',15,'600',WATER)
    readout('return1',640,147,338,30,'内回流 / 硝化液','internal.ratio',0,MUD)
    readout('return2',520,719,255,27,'外回流 / 活性污泥','external.ratio',0,MUD)
    readout('air-label',998,743,245,29,'空气总管','air.hz',1,'#805c12')
    caption('legend',35,793,1430,33,'工艺管线   ━  混合液 / 污泥      ━  出水      ━  曝气      ┄  加药     ·     弧形跨线表示不连通',15,'400','#526c7a')
    caption('eff-title',1567,132,320,31,'出水水质  /  监测快照',18,'700')
    caption('energy-title',1567,379,320,31,'曝气能耗  /  运行参数',18,'700')
    caption('permit-title',1567,591,320,31,'鼓风机联锁  /  只读反馈',18,'700')
    caption('alarm-title',35,868,500,29,'报警与事件',18,'700')
    caption('trend-title',977,868,500,29,'好氧池溶解氧 · 历史趋势',18,'700')

    basins = [
        ('ana',130,258,'1# 厌氧池 · 释磷','#bac8cc'),
        ('anx',460,258,'2# 缺氧池 · 反硝化','#bdc9cd'),
        ('aer',795,280,'3# 好氧池 · 硝化','#a5c8da'),
        ('settler',1150,251,'4# 二沉池 · 泥水分离','#c3d0d5'),
    ]
    for key,x,w,title,water in basins:
        place(key,'pidBasin',x,255,w,358,title,'#cbd7dc',STEEL,18)
        field('液位颜色',water)
        field('液位上限',6.2)
        bind(key,{'液位':key+'.level'})

    instruments = [
        ('t1',171,352,'AIT-201','orp',0), ('t2',496,349,'AIT-202','anx.do',2),
        ('t3',496,417,'AIT-203','no3',1), ('t4',840,349,'AIT-204','do.pv',2),
        ('t5',840,417,'AIT-205','nh4',2), ('t6',1185,349,'AIT-206','mlss',0),
        ('t7',1185,417,'LIT-201','sludge.level',2),
    ]
    for key,x,y,title,point,precision in instruments:
        place(key,'pidInstrument',x,y,183,56,title,'#fdfefe',STEEL)
        field('小数位',precision)
        slots = {'过程值':point}
        if point == 'do.pv':
            slots.update({'设定反馈':'do.sp','输出反馈':'air.output'})
        bind(key,slots)

    for i,x in enumerate([190,529],1):
        key=f'mix{i}'
        place(key,'pidMixer',x,499,118,78,f'{i}# 潜水搅拌')
        slots={'运行反馈':key+'.run'}
        if i == 1:
            slots['故障反馈']='mix1.fault'
        bind(key,slots)
    for key,x,y,title in [('internal',727,169,'P-201A'),('external',727,644,'P-202A')]:
        place(key,'pump',x,y,82,77,title)
        page.get_by_label('外观预设',exact=True).select_option('classic')
        bind(key,{'运行反馈':key+'.run','运行数值':key+'.ratio'})
    place('carbon','pidMeteringPump',278,697,118,77,'碳源计量泵','#e9e0ed','#897498')
    field('小数位',0)
    bind('carbon',{'运行反馈':'carbon.run','故障反馈':'carbon.fault','运行数值':'carbon.flow'})
    place('air','fan',890,718,90,84,'B-201')
    page.get_by_label('外观预设',exact=True).select_option('classic')
    bind('air',{'运行反馈':'air.run','运行数值':'air.hz'})
    place('interlock','pidInterlock',1566,638,320,48,'鼓风机保护','#f7f9fa','#afc0c8')
    bind('interlock',{'联锁成立':'air.interlock'})

    for key,kind,x,y,w,h,point,slot in [
        ('eff','table',1562,168,327,206,'effluent','表格数据'),
        ('energy','table',1562,415,327,154,'energy','表格数据'),
        ('alarm','events',29,909,899,125,'alarms','事件数据'),
        ('trend','trend',972,905,913,128,'history','趋势数据'),
    ]:
        place(key,kind,x,y,w,h,key,'#f7f9fa','#f7f9fa',14)
        page.get_by_label('简洁显示',exact=True).check()
        if kind=='trend':
            page.get_by_label('图表横轴类型',exact=True).select_option('category')
            field('图表分类字段','time')
            field('序列 1 名称','DO (mg/L)')
            field('左轴最小值',1.5)
            field('左轴最大值',3)
        bind(key,{slot:point})

    def connect(key, source, target, color, run=None, waypoints=(), dashed=False, bridge=False):
        tools.locator('[data-tool=pipe]').click()
        def terminal(end):
            if isinstance(end[0], int):
                return position(*end)
            node,port=end
            box=page.locator(f'[data-cell-id="{ids[node]}"] circle[port="{port}"]').bounding_box()
            return box['x']+box['width']/2,box['y']+box['height']/2
        edges=page.locator('.x6-edge')
        before=set(edges.evaluate_all('(items)=>items.map(e=>e.dataset.cellId)'))
        page.mouse.move(*terminal(source));page.mouse.down()
        page.mouse.move(*terminal(target),steps=14);page.mouse.up()
        expect(edges).to_have_count(len(before)+1)
        ids[key]=(set(edges.evaluate_all('(items)=>items.map(e=>e.dataset.cellId)'))-before).pop()
        tools.locator('[data-tool=select]').click()
        select(ids[key])
        field('图元名称',key)
        page.get_by_label('管道外观',exact=True).select_option('process')
        field('管道颜色',color)
        field('管道宽度',3 if dashed else 5)
        field('管道流动颜色','#e3edf1')
        page.get_by_label('管道箭头',exact=True).select_option('forward')
        if dashed:
            page.get_by_label('管道线型',exact=True).select_option('dashed')
        if bridge:
            page.get_by_label('跨线桥',exact=True).check()
        if waypoints:
            page.get_by_text('转折点 · 0',exact=True).click()
            for i,(x,y) in enumerate(waypoints,1):
                page.get_by_role('button',name='添加转折点',exact=True).click()
                field(f'转折 {i} X',x)
                field(f'转折 {i} Y',y)
        if run:
            bind(key,{'流动状态':run})

    # The open feed line is authored from the tank port outward, then reversed by the inspector.
    connect('进水总管',('ana','left'),(48,434),MUD,'water.flowing')
    select(ids['进水总管'])
    page.get_by_label('管道箭头',exact=True).select_option('reverse')
    page.get_by_label('管道流动方向',exact=True).select_option('reverse')
    field('终点 Y',434)
    connect('厌氧至缺氧',('ana','right'),('anx','left'),MUD,'water.flowing')
    connect('缺氧至好氧',('anx','right'),('aer','left'),MUD,'water.flowing')
    connect('好氧至二沉',('aer','right'),('settler','left'),MUD,'water.flowing')
    connect('二沉出水',('settler','right'),(1500,434),WATER,'water.flowing')
    select(ids['二沉出水'])
    field('终点 Y',434)
    connect('好氧内回流',('aer','top'),('internal','right'),MUD,'internal.run',[(935,207.5)])
    connect('内回流至缺氧',('internal','left'),('anx','top'),MUD,'internal.run',[(589,207.5)])
    connect('二沉排泥',('settler','bottom'),('external','right'),MUD,'external.run',[(1275.5,682.5)])
    connect('外回流至厌氧',('external','left'),('ana','bottom'),MUD,'external.run',[(259,682.5)])
    connect('碳源投加',('carbon','right'),('anx','bottom'),DRUG,'carbon.run',[(433,735.5),(433,633),(589,633)],dashed=True,bridge=True)
    connect('空气总管',('air','left'),('aer','bottom'),AIR,'air.run',[(864,760),(864,632),(935,632)],bridge=True)

    authored = save()
    assert len(authored['pipes']) == 11
    assert sum(len(n['bindings']) for n in authored['nodes']+authored['pipes']) == 44
    index = {p['title']:p for p in authored['pipes']}
    assert index['空气总管']['source']=={'nodeId':ids['air'],'portId':'left'}
    assert index['空气总管']['target']=={'nodeId':ids['aer'],'portId':'bottom'}
    assert index['空气总管']['style']['jump'] and index['碳源投加']['style']['pattern']=='dashed'
    assert not index['缺氧至好氧']['vertices']
    expect(nav.locator('[data-layer-group]')).to_have_count(4)
    select(ids['t4'])
    tools.get_by_role('button',name='选中对象置顶').click()
    assert next(n for n in save()['nodes'] if n['id']==ids['t4'])['z'] > 20
    page.get_by_role('button',name='撤销',exact=True).click()
    assert save()==authored
    select(ids['aer'])
    field('位置 X',805)
    moved=save()
    assert moved['pipes']==authored['pipes']
    page.get_by_role('button',name='撤销',exact=True).click()
    assert save()==authored
    page.screenshot(path=str(OUT/'editor.png'))

    active = copy.deepcopy(authored)
    payload = json.loads(active['source']['data'])
    next(p for p in payload['points'] if p['id']=='air.interlock')['value']=True
    next(p for p in payload['points'] if p['id']=='do.pv')['quality']='bad'
    active['source']['data']=json.dumps(payload,ensure_ascii=False)
    assert page.request.post(base+'/api/draft', data=active).ok
    page.reload()
    expect(page.locator(f'[data-cell-id="{ids["interlock"]}"]')).to_contain_text('联锁中')
    expect(page.locator(f'[data-cell-id="{ids["t4"]}"]')).to_have_attribute('data-state','无效')
    page.screenshot(path=str(OUT/'quality-and-interlock.png'))
    assert page.request.post(base+'/api/draft',data=authored).ok
    page.reload()
    page.get_by_role('button',name='预览发布',exact=True).click()
    page.get_by_role('button',name='发布',exact=True).click()
    expect(page.locator('.status-message')).to_contain_text('已发布')
    page.goto(base+'/view')
    expect(page.locator('.x6-edge')).to_have_count(11)
    def assert_bridge():
        path=page.locator(f'[data-cell-id="{ids["空气总管"]}"] path').first
        # The arc over the sludge return adds a cubic contour away from the known elbows.
        return path.evaluate("""p=>{const n=p.getTotalLength();return Array.from({length:Math.ceil(n)},(_,i)=>p.getPointAtLength(i)).some(a=>Math.abs(a.y-682.5)<2&&Math.abs(a.x-864)>3&&Math.abs(a.x-864)<12)}""")
    assert assert_bridge(), 'aeration crossing did not receive a bridge'
    labels = {key:page.locator(f'[data-cell-id="{ids[key]}"] text:visible')
              for key in ('return1','return2','air-label')}
    for key, value in [('return1','205 %'),('return2','75 %'),('air-label','43.8 Hz')]:
        expect(labels[key]).to_be_visible()
        expect(labels[key]).to_contain_text(value)
    page.screenshot(path=str(OUT/'published-1920.png'))
    page.locator(f'[data-cell-id="{ids["t4"]}"]').click()
    details=page.get_by_role('dialog')
    expect(details).to_contain_text('设定反馈')
    expect(details).to_contain_text('输出反馈')
    details.get_by_role('button',name='关闭详情').click()
    page.set_viewport_size({'width':1366,'height':768})
    page.screenshot(path=str(OUT/'published-1366.png'))
    page.goto(base)
    page.locator('.project-menu summary').click()
    with page.expect_download() as download:
        page.get_by_role('button',name='导出离线演示',exact=True).click()
    file=OUT/'scene07-offline.html'
    download.value.save_as(file)
    requests=[]
    page.on('request',lambda r:requests.append(r.url) if r.url.startswith('http') else None)
    page.goto(file.as_uri())
    expect(page.locator('.x6-edge')).to_have_count(11)
    assert assert_bridge()
    for key, value in [('return1','205 %'),('return2','75 %'),('air-label','43.8 Hz')]:
        expect(labels[key]).to_contain_text(value)
    assert not requests
    backup = page.request.get(base+'/api/project-backup')
    assert backup.ok
    (OUT/'scene07-monitor-backup.json').write_text(backup.text(),encoding='utf-8')
    verify_live_labels(page,base,authored,labels)
    return authored


def verify_live_labels(page, base, authored, labels):
    rows = json.loads(authored['source']['data'])['points']
    readings = {row['id']: row for row in rows}
    for point,value in [('internal.ratio',188),('external.ratio',62),('air.hz',38.4)]:
        readings[point]['value'] = value
    response = (200, json.dumps({'points':rows},ensure_ascii=False).encode())

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            code, payload = response
            self.send_response(code)
            self.send_header('Content-Type','application/json')
            self.send_header('Access-Control-Allow-Origin','*')
            self.send_header('Content-Length',str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args):
            pass

    with ThreadingHTTPServer(('127.0.0.1',0),Handler) as server:
        thread = Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            doc = copy.deepcopy(authored)
            doc['source'] = dict(kind='rest',url=f'http://127.0.0.1:{server.server_port}',
                                 demo=False,pollMs=500,maxAgeMs=3000)
            created = page.request.post(base+'/api/projects',data={
                'action':'create','name':'07 行内读数 · 本机只读台架','purpose':'process',
            })
            assert created.ok, created.text()
            query = '?project='+created.json()['id']
            draft_url = base+'/api/draft'+query
            unbound_doc = copy.deepcopy(doc)
            air_label = next(n for n in unbound_doc['nodes'] if n['title']=='空气总管')
            air_label['bindings'].pop('value')
            assert page.request.post(draft_url,data=unbound_doc).ok
            page.goto(base+'/editor'+query)
            expect(labels['air-label']).to_have_text('空气总管 · — · 未绑定')
            assert page.request.post(draft_url,data=doc).ok
            page.reload()
            page.get_by_role('button',name='预览发布',exact=True).click()
            page.get_by_role('button',name='发布',exact=True).click()
            expect(page.locator('.status-message')).to_contain_text('已发布')
            page.goto(base+'/view'+query)
            for key,value in [('return1','188 %'),('return2','62 %'),('air-label','38.4 Hz')]:
                expect(labels[key]).to_contain_text(value)
            page.screenshot(path=str(OUT/'rest-good.png'))
            readings['internal.ratio']['value'] = 0
            readings['external.ratio']['quality'] = 'bad'
            response = (200, json.dumps({'points':[r for r in rows if r['id']!='air.hz']},ensure_ascii=False).encode())
            expect(labels['return1']).to_have_text('内回流 / 硝化液 · 0 %')
            expect(labels['return2']).to_have_text('外回流 / 活性污泥 · — · 无效')
            expect(labels['air-label']).to_have_text('空气总管 · — · 无效')
            response = (503, b'{}')
            for label in labels.values():
                expect(label).to_contain_text('— · 离线')
            page.screenshot(path=str(OUT/'rest-offline.png'))
            readings['external.ratio']['quality'] = 'good'
            readings['air.hz']['value'] = 40.2
            response = (200, json.dumps({'points':rows},ensure_ascii=False).encode())
            for key,value in [('return1','0 %'),('return2','62 %'),('air-label','40.2 Hz')]:
                expect(labels[key]).to_contain_text(value)
        finally:
            server.shutdown()
            thread.join()


def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0))
        port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    store=OUT/'server'
    store.mkdir(exist_ok=True)
    (store/'project.json').write_text(json.dumps({'draft':fixture(),'versions':[],'active':None}),encoding='utf-8')
    proc=subprocess.Popen(['node','apps/scada-designer/server.mjs'],cwd=ROOT,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_DATA_DIR':str(store)},creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    try:
        for _ in range(100):
            try:
                urlopen(base+'/api/draft',timeout=1).close()
                break
            except OSError:
                time.sleep(.1)
        with sync_playwright() as pw:
            browser=pw.chromium.launch()
            page=browser.new_page(viewport={'width':1920,'height':1080})
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            try:
                doc=exercise(page,base)
                assert not errors,errors
                result=dict(scene=7,nodes=len(doc['nodes']),pipes=len(doc['pipes']),
                    bindings=sum(len(n['bindings']) for n in doc['nodes']+doc['pipes']),
                    inline_readouts=['sample','rest','zero','unbound','bad_quality','missing','offline','recovery'],
                    errors=errors)
                (OUT/'project.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2),encoding='utf-8')
                (OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
                print(result,flush=True)
            except Exception:
                page.screenshot(path=str(OUT/'failure.png'))
                (OUT/'errors.json').write_text(json.dumps(errors,ensure_ascii=False),encoding='utf-8')
                raise
            finally:
                browser.close()
    finally:
        proc.terminate()
        proc.wait(timeout=15)


if __name__=='__main__':
    main()
