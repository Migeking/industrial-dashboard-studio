"""A/B acceptance: author both layouts through palette, pointer and property forms.

Project API reads are assertions only. No authored geometry is injected. Fixture is
explicit local simulation, with no device writes or fabricated upstream history.
"""
import json,os,socket,subprocess,tempfile,threading,time
from pathlib import Path
from urllib.request import urlopen
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
import studio_screen_check as process

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'works/scada-designer-stages/cockpit';OUT.mkdir(parents=True,exist_ok=True)
checks=[]

class Fixture(process.Fixture):
    def do_GET(self):
        if self.mode=='offline':self.send_response(503);self.end_headers();return
        stamp=int(time.time()*1000)
        data={'P101.run':True,'P101.fault':False,'P101.hz':38.5,'P102.run':False,'P102.fault':False,'P103.run':False,'P103.fault':False,'V101.open':True,'V102.open':False,'T101.level':3.2,
              'plant.flow':128.6,'plant.energy':460.2,'plant.efficiency':92.5,'plant.onlineCount':5,
              'history':[{'time':stamp-(5-i)*10000,'frequency':30+i*1.7,'flow':[105,112,121,130,126,128.6][i]} for i in range(6)],
              'history.flow':[{'at':stamp-(5-i)*10000,'metrics':{'flow':[105,112,121,130,126,128.6][i]},'q':'bad' if i==2 else 'good'} for i in range(6)],
              'branches':[{'branch':'东区','flow':68.4},{'branch':'西区','flow':60.2}],
              'branches.alternate':[{'branch':'东区','flow':70.0},{'branch':'西区','flow':58.6}],
              'energy.categories':[{'category':'提升泵','value':300},{'category':'送水泵','value':100},{'category':'附属设备','value':60.2}],
              'devices':[{'name':'P-101','running':True,'fault':False,'frequency':38.5},{'name':'P-102','running':False,'fault':False,'frequency':0},{'name':'P-103','running':False,'fault':False,'frequency':0,'maintenance':'待巡检'}],
              'events':[{'time':stamp-120000,'level':'warning','device':'T-101','message':'历史演示事件：液位低预警已恢复'},{'time':stamp-60000,'level':'info','device':'P-101','message':'历史演示事件：进入运行状态'}]}
        if self.mode=='zero':data.update({'P101.run':False,'P101.hz':0,'T101.level':0,'plant.flow':0})
        if self.mode=='fault':data['P101.fault']=True
        points=[{'id':key,'label':key,'kind':'boolean' if isinstance(value,bool) else 'dataset' if isinstance(value,list) else 'number','value':value,'quality':'bad' if self.mode=='bad' else 'good','receivedAt':stamp-(30000 if self.mode=='stale' else 0),'unit':'Hz' if key.endswith('hz') else 'm' if key.endswith('level') else {'plant.flow':'m³/h','plant.energy':'kWh','plant.efficiency':'%','plant.onlineCount':'台'}.get(key,'')} for key,value in data.items()]
        if self.mode=='missing':points=[p for p in points if p['id']!='P101.run']
        body=json.dumps({'points':points},ensure_ascii=False).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body)

def exercise(page,base,url,browser):
    process.OUT=OUT/'process-base';process.OUT.mkdir(exist_ok=True);process.RESULTS=[];process.Fixture=Fixture
    process.exercise(page,base,url,browser)
    checks.extend(process.RESULTS)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base)
    def doc():return page.request.get(base+'/api/draft').json()
    def save():
        with page.expect_response(lambda r:r.url==base+'/api/draft' and r.request.method=='POST') as r:page.get_by_role('button',name='保存草稿',exact=True).click()
        assert r.value.ok,r.value.text();return doc()
    def node(id):return page.locator(f'.x6-node[data-cell-id="{id}"]')
    def select(id):page.get_by_role('tab',name='图层',exact=False).click();page.locator(f'[data-layer="{id}"]').click();page.get_by_role('tab',name='外观',exact=True).click()
    def field(label,value):el=page.get_by_label(label,exact=True);el.fill(str(value));el.press('Tab')
    def geometry(id,x,y,w,h,title=None):
        select(id)
        if title:field('图元名称',title)
        for key,val in [('位置 X',x),('位置 Y',y),('宽度',w),('高度',h)]:field(key,val)
    def place(kind,x,y,w,h,title):
        page.get_by_role('tab',name='图元与工具',exact=True).click();old=set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'));page.locator(f'[data-{"tool" if kind=="text" else "symbol"}="{kind}"]').click();b=page.locator('.board').bounding_box();page.mouse.click(b['x']+x*b['width']/1920,b['y']+y*b['height']/1080);expect(page.locator('.x6-node')).to_have_count(len(old)+1);id=(set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'))-old).pop();geometry(id,x,y,w,h,title);return id
    def bind(id,values):
        select(id);page.get_by_role('tab',name='动态与测点',exact=True).click()
        for label,value in values.items():page.get_by_label(label+' · 绑定测点',exact=True).select_option(value)
        page.get_by_role('tab',name='外观',exact=True).click()
    def nav(id):page.locator(f'.screen-page-nav [data-page-id="{id}"]').click()
    def theme(value):
        page.get_by_role('tab',name='图元与工具',exact=True).click();page.locator('[data-tool=select]').click();page.keyboard.press('Escape');b=page.locator('.board').bounding_box();page.mouse.click(b['x']+b['width']*.995,b['y']+b['height']*.995);page.get_by_label('画面主题',exact=True).select_option(value)
    def action(id,target):
        select(id);page.get_by_role('tab',name='交互',exact=True).click();page.get_by_label('点击动作',exact=True).select_option('navigate');page.get_by_label('目标画面',exact=True).select_option(target)
    def columns(id,names):
        select(id);page.get_by_role('button',name='从样本生成列',exact=True).click()
        for i,name in enumerate(names,1):field(f'列 {i} 名称',name)
    def option(id):return node(id).locator('.screen-chart-host').evaluate('el=>echarts.getInstanceByDom(el).getOption()')

    a=doc();readout=next(n['id'] for n in a['nodes'] if n['symbol']=='readout');trend=next(n['id'] for n in a['nodes'] if n['symbol']=='trend')
    geometry(readout,1450,220,400,150,'P-101 运行频率');geometry(trend,1210,450,650,300,'P-101 实时趋势')
    level=place('barGauge',1190,215,210,280,'清水池液位');field('仪表上限',6);bind(level,{'显示数值':'T101.level'});expect(node(level)).to_contain_text('3.20 m')
    events=place('events',1210,790,650,230,'最近事件 · 本地模拟');bind(events,{'事件数据':'events'});columns(events,['时间','级别','设备','事件内容']);field('列表排序字段','time');page.get_by_label('列表排序方向',exact=True).select_option('desc');field('列表行数',3)
    expect(node(events).locator('tbody tr')).to_have_count(2)
    a=save();page.screenshot(path=str(OUT/'A-editor.png'));checks.append({'check':'A 补齐独立液位棒图和字段可配事件表','status':'passed'})

    page.get_by_role('button',name='＋ 添加画面',exact=True).click();expect(page.locator('.screen-empty')).to_be_visible();b_id=page.locator('.screen-page-nav [aria-current=page]').get_attribute('data-page-id')
    page.locator('.screen-page-menu summary').click();field('当前画面名称','供水运行驾驶舱');page.get_by_role('button',name='设为首页',exact=True).click()
    theme('monitor-light');theme('process-gray');theme('cockpit-dark')
    purpose=page.get_by_label('画面用途',exact=True)
    purpose.select_option('cockpit')
    expect(page.get_by_label('画面主题',exact=True)).to_have_value('cockpit-dark')
    expect(page.locator('[data-palette-section]').first).to_have_attribute('data-palette-section','widgets')
    expect(page.locator('.x6-node,.x6-edge')).to_have_count(0)
    page.get_by_role('button',name='撤销',exact=True).click()
    expect(purpose).to_have_value('process')
    page.get_by_role('button',name='重做',exact=True).click()
    expect(purpose).to_have_value('cockpit')
    checks.append({'check':'空白驾驶舱启用深色主题和组件优先图元库，可撤销重做','status':'passed'})
    title=place('text',40,35,1250,80,'驾驶舱标题');expect(page.get_by_label('字号',exact=True)).to_have_value('40');field('文字内容','供水运行驾驶舱  /  本地模拟');field('字号',42);page.get_by_label('文字对齐',exact=True).select_option('left')
    status=place('status',1430,20,220,120,'P-101');field('状态成立文字','运行');field('状态释放文字','停止');bind(status,{'状态信号':'P101.run','故障反馈':'P101.fault'})
    back=place('button',1680,50,200,60,'工艺监控');action(back,'main')
    kpis=[]
    for i,(title,point) in enumerate([('总流量','plant.flow'),('累计能耗','plant.energy'),('运行效率','plant.efficiency'),('在线设备','plant.onlineCount'),('清水池液位','T101.level'),('主泵频率','P101.hz')]):
        id=place('readout',40+i*310,160,280,140,title);bind(id,{'显示数值':point});field('小数位',0 if i==3 else 1);kpis.append(id)
    dual=place('trend',40,340,820,310,'频率 / 流量历史')
    page.get_by_label('序列 1 绑定测点',exact=True).select_option('history')
    page.get_by_role('button',name='添加序列',exact=True).click()
    page.get_by_label('序列 2 绑定测点',exact=True).select_option('history.flow')
    for i,expected_fields in [(1,{'time','frequency','flow'}),(2,{'at','metrics.flow','q'})]:
        locator=page.get_by_label(f'序列 {i} 数值字段',exact=True)
        sample_list=locator.get_attribute('list')
        assert set(page.locator(f'[id="{sample_list}"] option').evaluate_all('(options)=>options.map(o=>o.value)'))==expected_fields
    series2=page.get_by_role('group',name='序列 2',exact=True)
    series2.get_by_text('字段样本',exact=False).click()
    samples=series2.get_by_role('table',name='数据集字段样本')
    expect(samples.get_by_role('row').filter(has_text='metrics.flow')).to_contain_text('数值')
    expect(samples.get_by_role('row').filter(has_text='metrics.flow')).to_contain_text('105')
    expect(samples.get_by_role('row').filter(has_text='at')).to_be_visible()
    page.screenshot(path=str(OUT/'B-dataset-fields.png'))
    field('序列 1 名称','频率')
    field('序列 1 数值字段','frequency')
    field('序列 2 名称','流量')
    field('序列 2 时间 / 分类字段','at')
    value_field=page.get_by_label('序列 2 数值字段',exact=True)
    time_option=page.locator(f'[id="{value_field.get_attribute("list")}"] option[value="at"]')
    previous_sample=time_option.text_content()
    value_field.fill('metrics.flow')
    expect(time_option).not_to_have_text(previous_sample,timeout=10000)
    expect(value_field).to_have_value('metrics.flow')
    value_field.press('Tab')
    field('序列 2 质量字段','q')
    page.get_by_label('序列 2 坐标轴',exact=True).select_option('1')
    for label,val in [('左轴单位','Hz'),('左轴最小值',0),('左轴最大值',60),('右轴单位','m³/h'),('右轴最小值',0),('右轴最大值',200)]:field(label,val)
    page.get_by_role('button',name='添加参考线',exact=True).click()
    field('参考线 1 数值',50)
    field('参考线 1 名称','频率上限')

    def assert_dual_series():
        opt=option(dual)
        assert len(opt['series'])==2 and opt['series'][1]['yAxisIndex']==1 and opt['yAxis'][1]['max']==200
        assert len(opt['series'][0]['data'])==6
        flow_values=[row[1] for row in opt['series'][1]['data']]
        assert flow_values==[105,112,None,130,126,128.6],flow_values

    assert_dual_series()
    bar=place('barChart',890,340,500,310,'分区供水量');field('图表分类字段','branch');field('序列 1 数值字段','flow');field('左轴最小值',0);field('左轴最大值',100);field('左轴单位','m³/h');bind(bar,{'图表数据':'branches'});assert option(bar)['xAxis'][0]['data']==['东区','西区']
    bind(bar,{'图表数据':'branches.alternate'});assert option(bar)['series'][0]['name']=='branches.alternate' and option(bar)['yAxis'][0]['max']==100;bind(bar,{'图表数据':'branches'})
    pie=place('pieChart',1420,340,460,310,'能耗分项');field('图表分类字段','category');field('饼图数值字段','value');bind(pie,{'图表数据':'energy.categories'});assert len(option(pie)['series'][0]['data'])==3
    table=place('table',40,690,670,300,'设备运行状态')
    page.get_by_label('列表绑定测点',exact=True).select_option('devices')
    page.get_by_text('字段样本',exact=False).click()
    expect(page.get_by_role('table',name='数据集字段样本')).to_contain_text('待巡检')
    columns(table,['设备','运行','故障','频率','巡检状态'])
    field('列 4 单位','Hz');field('列表排序字段','name');field('列表行数',3)
    expect(node(table).locator('tbody')).to_contain_text('0.00 Hz')
    expect(node(table).locator('tbody')).to_contain_text('否')
    expect(node(table).locator('tbody')).to_contain_text('待巡检')
    bevents=place('events',740,690,690,300,'事件记录 · 本地模拟');bind(bevents,{'事件数据':'events'});columns(bevents,['发生时间','级别','设备','内容']);field('列表排序字段','time');page.get_by_label('列表排序方向',exact=True).select_option('desc');field('列表行数',5)
    gauge=place('gauge',1460,690,390,300,'主泵频率');field('仪表上限',60);bind(gauge,{'显示数值':'P101.hz'});assert option(gauge)['series'][0]['data'][0]['value']==38.5
    action(back,'main');nav('main');forward=place('button',1600,60,230,65,'运行驾驶舱');action(forward,b_id);nav(b_id)
    final=save();assert len(final['pages'])==1 and len(final['pages'][0]['nodes'])==15;assert final['defaultPageId']==b_id
    assert final['canvas']['purpose']=='process' and final['pages'][0]['canvas']['purpose']=='cockpit'
    assert all(n['style']['fontSize']==48 for n in final['pages'][0]['nodes'] if n['id'] in kpis)
    page.screenshot(path=str(OUT/'B-editor.png'));checks.append({'check':'B 从空白逐个创建六指标、双轴趋势、柱图、环图、状态、设备表、事件表、仪表和导航；字段/名称/轴可改','status':'passed'})

    # Preview and published mode share the authored configuration.
    page.locator('.studio-header').get_by_role('button',name='预览发布',exact=True).click();expect(page.locator('.studio-header').get_by_role('button',name='发布',exact=True)).to_be_enabled();page.locator('.studio-header').get_by_role('button',name='发布',exact=True).click();expect(page.get_by_role('status')).to_contain_text('已发布');assert page.request.get(base+'/api/published').json()==final
    page.goto(base+'/view');expect(node(kpis[0])).to_contain_text('128.6 m³/h');expect(node(status)).to_have_attribute('data-state','运行');assert_dual_series()
    Fixture.mode='zero';expect(node(kpis[0])).to_contain_text('0.0 m³/h');expect(node(status)).to_contain_text('停止');page.wait_for_function('id=>{const h=document.querySelector(`[data-cell-id="${id}"] .screen-chart-host`);return echarts.getInstanceByDom(h).getOption().series[0].data[0]?.value===0}',arg=gauge)
    Fixture.mode='bad';expect(node(kpis[0])).to_contain_text('—');expect(node(status)).to_have_attribute('data-state','未知');expect(node(table)).to_contain_text('无效');page.wait_for_function('id=>{const h=document.querySelector(`[data-cell-id="${id}"] .screen-chart-host`);return echarts.getInstanceByDom(h).getOption().series[0].data.length===0}',arg=gauge)
    Fixture.mode='normal';expect(node(kpis[0])).to_contain_text('128.6 m³/h');expect(node(table).locator('tbody tr')).to_have_count(3)
    page.screenshot(path=str(OUT/'B-published-1920.png'))
    node(back).click();expect(node(level)).to_contain_text('3.20 m');page.screenshot(path=str(OUT/'A-published-1920.png'));node(forward).click()
    for width,height in [(1366,768),(3840,2160),(1920,1080)]:
        page.set_viewport_size({'width':width,'height':height});box=page.locator('.board').bounding_box();assert abs(box['width']/box['height']-1920/1080)<.01;expect(node(table)).to_be_visible();page.screenshot(path=str(OUT/f'B-published-{width}.png'))
    for _ in range(8):node(back).click();expect(page.locator('.screen-chart-host canvas')).to_have_count(1);node(forward).click();expect(page.locator('.screen-chart-host canvas')).to_have_count(4)
    stats=page.evaluate('window.__chartStats');assert stats['init']-stats['dispose']==4,stats
    checks.append({'check':'两条序列内直接选点，字段候选按数据集隔离，不同时间列正常绘图，坏样本断开，列表纳入后续行新列','status':'passed'})
    checks.append({'check':'A/B 共用独立仪表和趋势，预览发布一致；0/false、坏质量/恢复、三尺寸与八次导航正确','status':'passed','chartLifecycle':stats})
    page.goto(base+'/?page='+b_id);page.locator('.project-menu summary').click()
    with page.expect_download() as dl:page.get_by_role('button',name='导出离线演示',exact=True).click()
    file=OUT/'AB-offline.html';dl.value.save_as(file);local=browser.new_page(viewport={'width':1920,'height':1080});local.on('pageerror',lambda e:errors.append(str(e)));requests=[];local.on('request',lambda r:requests.append(r.url) if r.url.startswith('http') else None);local.goto(file.as_uri());expect(local.locator(f'[data-cell-id="{kpis[0]}"]')).to_contain_text('128.6 m³/h');expect(local.locator('.screen-chart-host canvas')).to_have_count(4);local.locator(f'[data-cell-id="{back}"]').click();expect(local.locator('.x6-edge')).to_have_count(8);local.locator(f'[data-cell-id="{forward}"]').click();assert not requests,requests;local.screenshot(path=str(OUT/'B-offline.png'));local.close()
    checks.append({'check':'A/B 离线单 HTML 带全部组件和导航，零 HTTP 请求','status':'passed'})
    with page.expect_download() as dl:page.get_by_role('button',name='导出配置',exact=True).click()
    configfile=OUT/'AB-exported.json';dl.value.save_as(configfile);assert json.loads(configfile.read_text('utf-8'))==final
    page.locator('.project-menu input[type=file]').set_input_files(configfile);expect(page.locator('.project-menu')).not_to_have_attribute('open','');assert save()==final
    checks.append({'check':'多画面配置通过正式导出/导入还原，保存后的对象、绑定、字段和导航完全一致','status':'passed'})
    assert not errors,errors
    (OUT/'authored-project.json').write_text(json.dumps(final,ensure_ascii=False,indent=2),encoding='utf-8')

def main():
    Fixture.mode='normal';fixture=ThreadingHTTPServer(('127.0.0.1',0),Fixture);threading.Thread(target=fixture.serve_forever,daemon=True).start()
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='screen-cockpit-') as data:
        server=subprocess.Popen(['node','apps/scada-designer/server.mjs'],cwd=ROOT,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_DATA_DIR':data},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(80):
                try:urlopen(base+'/api/draft',timeout=1);break
                except OSError:time.sleep(.1)
            with sync_playwright() as p:
                browser=p.chromium.launch();page=browser.new_page(viewport={'width':1920,'height':1080});page.set_default_timeout(16000)
                page.add_init_script("""(()=>{window.__chartStats={init:0,dispose:0};let library;Object.defineProperty(window,'echarts',{configurable:true,get:()=>library,set(value){library=value;let initialize;const wrapped=function(...args){const chart=initialize.apply(this,args);window.__chartStats.init++;const dispose=chart.dispose.bind(chart);chart.dispose=function(...a){window.__chartStats.dispose++;return dispose(...a);};return chart;};Object.defineProperty(value,'init',{configurable:true,get:()=>wrapped,set(fn){initialize=fn;}});}});})();""")
                try:exercise(page,base,f'http://127.0.0.1:{fixture.server_port}/snapshot',browser)
                except Exception:page.screenshot(path=str(OUT/'failure.png'));raise
                finally:browser.close()
        finally:server.terminate();server.wait(timeout=15);fixture.shutdown();(OUT/'results.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'passed':len(checks),'evidence':str(OUT)},ensure_ascii=False))
if __name__=='__main__':main()
