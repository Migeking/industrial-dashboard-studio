"""Author a new process screen through the production editor UI, bind, publish and export.

Run: python -X utf8 tests/studio_screen_check.py
Uses an isolated Node project and a read-only HTTP fixture. No field device writes.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'works/screen-designer-implementation/acceptance'
OUT.mkdir(parents=True,exist_ok=True)
RESULTS=[]

def record(name,details=None):
    RESULTS.append({'check':name,'status':'passed','details':details})

class Fixture(BaseHTTPRequestHandler):
    mode='normal'
    def log_message(self,*_): pass
    def do_GET(self):
        if self.mode=='offline': self.send_response(503);self.end_headers();return
        data={'P101.run':True,'P101.fault':False,'P101.hz':38.5,'P102.run':False,'P102.fault':False,'P103.run':False,'P103.fault':False,'V101.open':True,'V102.open':False,'T101.level':3.2}
        if self.mode=='zero': data.update({'P101.run':False,'P101.hz':0,'T101.level':0})
        if self.mode=='fault': data['P101.fault']=True
        points=[{'id':key,'label':key,'kind':'boolean' if isinstance(value,bool) else 'number','value':value,'quality':'bad' if self.mode=='bad' else 'good','receivedAt':int(time.time()*1000)-(30000 if self.mode=='stale' else 0),'unit':'Hz' if key.endswith('hz') else 'm' if key.endswith('level') else ''} for key,value in data.items()]
        if self.mode=='missing': points=[p for p in points if p['id']!='P101.run']
        body=json.dumps({'points':points}).encode()
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body)

def exercise(page,base,fixture_url,browser):
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    page.goto(base)
    expect(page.locator('.screen-stage')).to_be_visible()
    assert page.locator('.x6-node').count()==0
    initial=page.request.get(base+'/api/draft').json()
    assert initial['format']=='screen-document' and initial['nodes']==[] and initial['mappings']==[]
    assert 'skin' not in initial
    page.screenshot(path=str(OUT/'empty-canvas.png'))
    record('正式编辑器默认是真正的空白文档')

    def pos(x,y):
        box=page.locator('.board').bounding_box();return(box['x']+x*box['width']/1920,box['y']+y*box['height']/1080)
    def click(x,y):page.mouse.click(*pos(x,y))
    def place(kind,x,y,draw=None):
        before=set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'))
        page.locator(f'[data-{"tool" if kind in ["rect","ellipse","text"] else "symbol"}="{kind}"]').click()
        if draw:
            page.mouse.move(*pos(x,y));page.mouse.down();page.mouse.move(*pos(x+draw[0],y+draw[1]),steps=8);page.mouse.up()
        else:click(x,y)
        page.wait_for_function('n=>document.querySelectorAll(".x6-node").length===n+1',arg=len(before))
        return (set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'))-before).pop()
    def select(cell):
        page.get_by_role('tab',name='图层',exact=False).click()
        page.locator(f'[data-layer="{cell}"]').click()
    def tools():page.get_by_role('tab',name='图元与工具',exact=True).click()
    def node(cell):return page.locator(f'.x6-node[data-cell-id="{cell}"]')
    def bind(cell,**bindings):
        select(cell);page.get_by_role('tab',name='动态与测点',exact=True).click()
        names={'run':'运行反馈','fault':'故障反馈','open':'开到位反馈','value':'液位' if cell==tank else '显示数值' if cell==readout else '趋势数据' if cell==chart else '运行数值'}
        for key,value in bindings.items():page.get_by_label(names[key]+' · 绑定测点',exact=True).select_option(value)
    def save():
        with page.expect_response(lambda r:r.url==base+'/api/draft' and r.request.method=='POST') as response:page.get_by_role('button',name='保存草稿',exact=True).click()
        assert response.value.ok,response.value.text()
        return page.request.get(base+'/api/draft').json()
    def connect(source,sp,target,tp):
        tools();page.locator('[data-tool=pipe]').click()
        def port(cell,p):
            box=node(cell).locator(f'circle[port="{p}"]').bounding_box();return(box['x']+box['width']/2,box['y']+box['height']/2)
        count=page.locator('.x6-edge').count();a,b=port(source,sp),port(target,tp)
        page.mouse.move(*a);page.mouse.down();page.mouse.move(a[0]+18,a[1],steps=3);page.mouse.move(*b,steps=15);page.mouse.up()
        expect(page.locator('.x6-edge')).to_have_count(count+1)

    # All creation is through mouse / palette / form operations, with no template loading.
    panel=place('rect',70,230,(1080,690))
    page.get_by_label('图元名称',exact=True).fill('泵组工艺区')
    title=place('text',90,70)
    page.get_by_label('文字内容',exact=True).fill('供水泵组运行监控')
    tank=place('tank',130,450)
    pumps=[place('pump',560,y) for y in (300,500,700)]
    valves=[place('valve',870,y) for y in (310,510)]
    joints=[place('junction',430,y) for y in (370,570,770)]
    readout=place('readout',1250,290)
    chart=place('trend',1210,540)
    expect(page.locator('.screen-chart canvas')).to_have_count(1)
    connect(tank,'right',joints[1],'left')
    connect(joints[0],'bottom',joints[1],'top');connect(joints[1],'bottom',joints[2],'top')
    for i in range(3):connect(joints[i],'right',pumps[i],'left')
    for i in range(2):connect(pumps[i],'right',valves[i],'left')
    data=save();assert len(data['pipes'])==8
    assert all(p['source']['nodeId'] and p['target']['nodeId'] for p in data['pipes'])
    record('从零逐个创建一池三泵两阀与八条端口管道')
    record('基础绘图、文字、数值与 ECharts 共存')

    # UI geometry changes, pointer dragging and undo must preserve the rendered connections.
    edge=next(p for p in data['pipes'] if p['target']['nodeId']==pumps[0])
    selector=f'.x6-edge[data-cell-id="{edge["id"]}"] path:nth-child(2)'
    before_path=page.locator(selector).get_attribute('d')
    tools();page.locator('[data-tool=select]').click()
    a=pos(645,375);page.mouse.move(*a);page.mouse.down();page.mouse.move(a[0]+80,a[1]-20,steps=15);page.mouse.up()
    expect(page.locator(selector)).not_to_have_attribute('d',before_path)
    moved=save();moved_pump=next(n for n in moved['nodes'] if n['id']==pumps[0])
    assert moved_pump['x']!=560
    assert next(p for p in moved['pipes'] if p['id']==edge['id'])['target']==edge['target']
    page.get_by_role('button',name='撤销',exact=True).click()
    expect(page.locator(selector)).to_have_attribute('d',before_path)
    page.get_by_role('button',name='重做',exact=True).click()
    expect(page.locator(selector)).not_to_have_attribute('d',before_path)
    select(pumps[0]);page.get_by_role('tab',name='外观',exact=True).click()
    page.get_by_label('宽度',exact=True).fill('190');page.get_by_label('宽度',exact=True).press('Tab')
    page.get_by_role('button',name='旋转 90°',exact=True).click()
    rotated=save();assert next(n for n in rotated['nodes'] if n['id']==pumps[0])['angle']==90
    for pipe in rotated['pipes']:
        path=page.locator(f'.x6-edge[data-cell-id="{pipe["id"]}"] path:nth-child(2)')
        ends=path.evaluate('el=>[0,el.getTotalLength()].map(t=>{const p=el.getPointAtLength(t),m=el.getScreenCTM();return{x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f}})')
        for end,key in zip(ends,['source','target']):
            endpoint=pipe[key];box=node(endpoint['nodeId']).locator(f'circle[port="{endpoint["portId"]}"]').bounding_box()
            assert abs(end['x']-box['x']-box['width']/2)<1 and abs(end['y']-box['y']-box['height']/2)<1,(pipe['id'],key,end,box)
    record('移动、缩放、旋转和整次撤销后端口引用及实际路径保持正确')
    for _ in range(3):page.get_by_role('button',name='旋转 90°',exact=True).click()

    bent=next(p for p in data['pipes'] if p['source']['nodeId']==pumps[1] and p['target']['nodeId']==valves[1])
    select(bent['id'])
    path=page.locator('.x6-edge-tool-vertex-path')
    middle=path.evaluate('el=>{const p=el.getPointAtLength(el.getTotalLength()/2),m=el.getScreenCTM();return{x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f}}')
    page.mouse.move(middle['x'],middle['y']);page.mouse.down();page.mouse.move(middle['x'],middle['y']+40,steps=8);page.mouse.up()
    edited=save();edited_pipe=next(p for p in edited['pipes'] if p['id']==bent['id'])
    assert edited_pipe['vertices'] and edited_pipe['source']==bent['source'] and edited_pipe['target']==bent['target']
    page.get_by_role('button',name='撤销',exact=True).click()
    assert next(p for p in save()['pipes'] if p['id']==bent['id'])['vertices']==bent['vertices']
    record('通过画布编辑管道转折点并按手势撤销')

    # Group selection and movement are exercised with the pointer, not just JSON.
    select(pumps[1]);page.locator(f'[data-layer="{valves[1]}"]').click(modifiers=['Shift'])
    page.get_by_role('button',name='成组',exact=True).click()
    grouped=save();pair=[next(n for n in grouped['nodes'] if n['id']==cell) for cell in [pumps[1],valves[1]]]
    assert pair[0]['group']==pair[1]['group']
    click(1870,1000)
    box=node(pumps[1]).bounding_box();a=(box['x']+box['width']/2,box['y']+box['height']/2)
    page.mouse.move(*a);page.mouse.down();page.mouse.move(a[0]+22,a[1]+14,steps=9);page.mouse.up()
    shifted=save();after=[next(n for n in shifted['nodes'] if n['id']==cell) for cell in [pumps[1],valves[1]]]
    dx,dy=after[0]['x']-pair[0]['x'],after[0]['y']-pair[0]['y']
    assert dx and dy
    assert all(n['x']-old['x']==dx and n['y']-old['y']==dy for old,n in zip(pair,after))
    page.get_by_role('button',name='撤销',exact=True).click()
    restored=save();assert all(next(n for n in restored['nodes'] if n['id']==old['id'])['x']==old['x'] for old in pair)
    # Selecting either group member must copy both and their internal connection.
    select(pumps[1]);page.get_by_role('button',name='复制',exact=True).click()
    copied_pair=save();copies=[n for n in copied_pair['nodes'] if n['id'] not in {n['id'] for n in grouped['nodes']}]
    assert len(copies)==2 and all(not n['bindings'] for n in copies)
    new_ids={n['id'] for n in copies};internal=[p for p in copied_pair['pipes'] if p['source']['nodeId'] in new_ids and p['target']['nodeId'] in new_ids]
    assert len(internal)==1 and len(copied_pair['pipes'])==9
    page.get_by_role('button',name='撤销',exact=True).click()
    select(pumps[1]);page.get_by_role('button',name='解组',exact=True).click()
    record('成组指针拖动、整次撤销、组内连管复制及解组')

    # Point manager returns to the same selected object.
    select(pumps[0]);page.get_by_role('tab',name='动态与测点',exact=True).click()
    page.get_by_role('button',name='管理连接与点位',exact=True).click()
    dialog=page.get_by_role('dialog')
    dialog.get_by_label('来源',exact=True).select_option('rest')
    dialog.get_by_label('接口 URL',exact=True).fill(fixture_url)
    dialog.get_by_label('刷新周期（ms）',exact=True).fill('250')
    dialog.get_by_role('button',name='读取样本',exact=True).click()
    dialog.get_by_role('button',name='从桥接点表生成映射',exact=True).click()
    dialog.get_by_role('button',name='应用数据配置',exact=True).click()
    expect(page.locator('.screen-inspector .inspector-heading b')).to_have_text('P-101')
    expect(page.get_by_label('运行反馈 · 绑定测点',exact=True)).to_be_visible()
    for i,cell in enumerate(pumps):bind(cell,run=f'P10{i+1}.run',fault=f'P10{i+1}.fault',**({'value':'P101.hz'} if i==0 else {}))
    for i,cell in enumerate(valves):bind(cell,open=f'V10{i+1}.open')
    bind(tank,value='T101.level');bind(readout,value='P101.hz');bind(chart,value='P101.hz')
    expect(node(pumps[0])).to_have_attribute('data-state','运行')
    expect(node(readout)).to_contain_text('38.50 Hz')
    record('配置 REST 点表后返回原设备并完成类型过滤的槽位绑定')

    for mode,state,value in [('zero','停止','0.00 Hz'),('fault','故障','38.50 Hz'),('bad','未知','—'),('stale','未知','—'),('missing','未知','38.50 Hz'),('offline','未知','—'),('normal','运行','38.50 Hz')]:
        Fixture.mode=mode
        expect(node(pumps[0])).to_have_attribute('data-state',state,timeout=12000)
        expect(node(readout)).to_contain_text(value,timeout=12000)
    record('零、false、故障、坏质量、过期、缺失、离线与恢复')

    # Copying through the UI must require deliberate binding for a new device.
    select(pumps[0]);page.get_by_role('tab',name='外观',exact=True).click()
    page.get_by_role('button',name='复制',exact=True).click()
    copied=save();copy=next(n for n in copied['nodes'] if '副本' in n['title'])
    assert copy['bindings']=={}
    page.locator('.studio-header').get_by_role('button',name='预览发布',exact=True).click()
    expect(page.locator('.studio-header').get_by_role('button',name='发布',exact=True)).to_be_disabled()
    page.get_by_role('button',name='去绑定：'+copy['title'],exact=True).click()
    expect(page.get_by_label('运行反馈 · 绑定测点',exact=True)).to_be_visible()
    page.get_by_role('tab',name='外观',exact=True).click();page.get_by_role('button',name='删除',exact=True).click()
    record('复制独立实例清空测点，发布问题直接定位并阻止漏绑')

    select(chart);page.get_by_role('tab',name='外观',exact=True).click()
    width=page.locator('.screen-chart canvas').get_attribute('width')
    page.get_by_label('宽度',exact=True).fill('560')
    # Keep editing across multiple live samples: readback must not replace input.
    page.wait_for_timeout(1100)
    expect(page.get_by_label('宽度',exact=True)).to_have_value('560')
    page.get_by_label('宽度',exact=True).press('Tab')
    page.wait_for_function('w=>document.querySelector(".screen-chart canvas").getAttribute("width")!==w',arg=width)
    tools();page.screenshot(path=str(OUT/'authored-editor.png'))
    data=save();(OUT/'authored-project.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    page.reload();expect(page.locator('.x6-edge')).to_have_count(8)
    reopened=page.request.get(base+'/api/draft').json();assert reopened==data
    record('正式草稿保存重开保留几何、对象身份、连接和绑定')
    page.locator('.studio-header').get_by_role('button',name='预览发布',exact=True).click()
    page.locator('.studio-header').get_by_role('button',name='发布',exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('已发布')
    assert page.request.get(base+'/api/published').json()==data
    page.goto(base+'/view');expect(node(pumps[0])).to_have_attribute('data-state','运行')
    before=node(pumps[0]).bounding_box();page.mouse.move(before['x']+before['width']/2,before['y']+before['height']/2);page.mouse.down();page.mouse.move(before['x']+120,before['y']+90,steps=6);page.mouse.up()
    after=node(pumps[0]).bounding_box();assert abs(after['x']-before['x'])<1
    node(pumps[0]).click();expect(page.get_by_role('dialog',name='P-101 设备详情')).to_be_visible();page.get_by_role('button',name='关闭详情',exact=True).click()
    page.screenshot(path=str(OUT/'published-monitor.png'))
    record('发布端使用同一模型、禁止编辑且可查看只读设备详情')
    for width,height in [(1366,768),(3840,2160),(1920,1080)]:
        page.set_viewport_size({'width':width,'height':height})
        expect(page.locator('.board')).to_be_visible()
        box=page.locator('.board').bounding_box();assert abs(box['width']/box['height']-1920/1080)<.01
    record('1366、1920、3840 横屏等比展示')

    page.goto(base);page.locator('.project-menu summary').click()
    with page.expect_download() as download:page.get_by_role('button',name='导出离线演示',exact=True).click()
    offline=OUT/'offline-monitor.html';download.value.save_as(offline)
    local=browser.new_page(viewport={'width':1920,'height':1080});local.on('pageerror',lambda e:errors.append(str(e)))
    local.add_init_script('const OriginalDate=Date;globalThis.Date=class extends OriginalDate{constructor(...a){super(...(a.length?a:[OriginalDate.now()+3600000]));}static now(){return OriginalDate.now()+3600000;}}')
    local.goto(offline.as_uri());expect(local.locator('.screen-stage')).to_be_visible();expect(local.locator('.x6-edge')).to_have_count(8)
    expect(local.locator(f'.x6-node[data-cell-id="{readout}"]')).to_contain_text('38.50 Hz')
    local.wait_for_function('()=>{const host=document.querySelector(".screen-chart-host"),option=host&&echarts.getInstanceByDom(host)?.getOption(),time=option?.series[0]?.data[0]?.[0];return time&&time>=option.xAxis[0].min&&time<=option.xAxis[0].max;}')
    assert local.locator('.studio-header').count()==0
    local.screenshot(path=str(OUT/'offline-monitor.png'));local.close()
    record('离线单 HTML 含画布引擎、图元、绑定和明确的只读快照')
    assert not errors,errors
    record('新画布全过程无脚本错误')

def main():
    fixture=ThreadingHTTPServer(('127.0.0.1',0),Fixture)
    threading.Thread(target=fixture.serve_forever,daemon=True).start()
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='screen-studio-') as data:
        env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_DATA_DIR':data}
        server=subprocess.Popen(['node','apps/scada-designer/server.mjs'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(80):
                try:urlopen(base+'/api/draft',timeout=1);break
                except OSError:time.sleep(.1)
            with sync_playwright() as p:
                browser=p.chromium.launch();page=browser.new_page(viewport={'width':1920,'height':1080});page.set_default_timeout(12000)
                try:exercise(page,base,f'http://127.0.0.1:{fixture.server_port}/snapshot',browser)
                except Exception:
                    page.screenshot(path=str(OUT/'failure.png'));raise
                finally:browser.close()
        finally:
            server.terminate();server.wait(timeout=15);fixture.shutdown()
            (OUT/'results.json').write_text(json.dumps({'checks':RESULTS,'scope':'production UI, isolated project, read-only HTTP fixture; no physical IO acceptance'},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'passed':len(RESULTS),'evidence':str(OUT)},ensure_ascii=False))

if __name__=='__main__':main()
