"""Rebuild scene 25 from an empty production canvas. No source scene import or backdrop."""
import copy,json,math,os,socket,subprocess,time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'works/scene25-rebuild';OUT.mkdir(parents=True,exist_ok=True)
INK='#243e3c';MUTED='#6c8780';GREEN='#416e5a';BG='#e9efec';BORDER='#d9e3dd';WHITE='#ffffff'

def fixture():
 d=json.loads(subprocess.check_output(['node','--input-type=module','-e','import {blankScreen} from "./packages/runtime/studio/screen-model.mjs";console.log(JSON.stringify(blankScreen()))'],cwd=ROOT));d['title']='25 污泥浓缩脱水 · 空白组态重建';d['canvas'].update(theme='process-gray',background=BG,purpose='process');rows=[]
 def add(id,value,unit='',kind='number'):rows.append(dict(id=id,label=id,kind=kind,value=value,unit=unit,quality='good'))
 for tag,level in [('TK101',2.6),('TK102',2.4)]:add(tag+'.value',level,'m');add(tag+'.run',True,kind='boolean');add(tag+'.fault',False,kind='boolean')
 for tag in ['P101','P102','DC101','DC102','PAM101','BN101']:
  add(tag+'.run',True,kind='boolean');add(tag+'.fault',False,kind='boolean')
  add(tag+'.value',2800 if tag.startswith('DC') else 4.2 if tag.startswith('PAM') else 56 if tag=='BN101' else 35,'rpm' if tag.startswith('DC') else 'kg/tDS' if tag.startswith('PAM') else '%' if tag=='BN101' else 'Hz')
 add('DC101.torque',62,'%');add('DC102.torque',58,'%');add('MX101.value',72,'m³/h')
 for id,value,unit in [('plant.flow',72,'m³/h'),('plant.solids',3.2,'%'),('plant.moisture',78.6,'%'),('plant.dry',18.4,'tDS'),('plant.energy',42,'kWh/tDS')]:add(id,value,unit)
 add('plant.flowing',True,kind='boolean')
 add('plant.history',[{'time':f'{i:02}:00','flow':72+5*math.sin(i*.6),'moisture':78.6+.8*math.cos(i*.4)} for i in range(25)],kind='dataset')
 add('plant.events',[{'模拟时刻':'08:42:16','级别 / 设备':'记录 · 系统','事件内容':'双线运行，演示数据投入','确认状态':'已确认'},{'模拟时刻':'08:38:20','级别 / 设备':'记录 · 料仓','事件内容':'泥饼外运完成，料位回落至 56%','确认状态':'已确认'},{'模拟时刻':'08:30:05','级别 / 设备':'记录 · PAM','事件内容':'三槽制备进入稳定投加','确认状态':'已确认'}],kind='dataset')
 d['source'].update(data=json.dumps({'points':rows},ensure_ascii=False),demo=True)
 d['mappings']=[dict(id=p['id'],label=p['id'],kind=p['kind'],unit=p['unit'],path='value',root='points',keyField='id',keyValue=p['id'],timePath='',fallbackTimePath='',qualityPath='quality',scale=1,offset=0,precision=2) for p in rows]
 return d

def main():
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 base=f'http://127.0.0.1:{port}';store=OUT/'server';store.mkdir(exist_ok=True)
 if not os.environ.get('SCENE25_RESUME'):(store/'project.json').write_text(json.dumps({'draft':fixture(),'versions':[],'active':None}),encoding='utf-8')
 server=subprocess.Popen(['node','apps/scada-designer/server.mjs'],cwd=ROOT,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_DATA_DIR':str(store)},creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
 try:
  for _ in range(100):
   try:urlopen(base+'/api/draft',timeout=1).close();break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   browser=p.chromium.launch();page=browser.new_page(viewport={'width':1920,'height':1080});page.set_default_timeout(20000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   try:
    page.goto(base);nav=page.get_by_role('complementary',name='场景与组件');ids={}
    def save():
     with page.expect_response(lambda r:r.url==base+'/api/draft' and r.request.method=='POST'):page.get_by_role('button',name='保存草稿',exact=True).click()
     return page.request.get(base+'/api/draft').json()
    def field(label,value):f=page.get_by_label(label,exact=True);f.fill(str(value));f.press('Tab')
    def position(x,y):
     b=page.locator('.board').bounding_box();return b['x']+x*b['width']/1920,b['y']+y*b['height']/1080
    def select(id,tab='外观'):
     page.get_by_role('tab',name='图层',exact=False).click();page.locator('[data-layer="'+id+'"]').click();page.get_by_role('tab',name=tab,exact=True).click()
    def place(key,kind,x,y,w,h,title,fill=None,color=INK,size=20,text=None,compact=False):
     page.get_by_role('tab',name='图元与工具',exact=True).click();nav.get_by_label('组件分类',exact=True).select_option('all');nav.get_by_label('搜索组件',exact=True).fill(kind)
     button=nav.locator('[data-symbol="'+kind+'"]');before=set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'))
     if kind=='gravityThickener' and key=='TK101':
      b=page.locator('.board').bounding_box();button.drag_to(page.locator('.board'),target_position={'x':x*b['width']/1920,'y':y*b['height']/1080})
     else:button.click();page.mouse.click(*position(x+1,y+1))
     expect(page.locator('.x6-node')).to_have_count(len(before)+1);id=(set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'))-before).pop();ids[key]=id
     field('图元名称',title)
     for label,v in [('宽度',w),('高度',h),('位置 X',x),('位置 Y',y)]:field(label,v)
     if kind!='junction':
      field('字号',size)
      if page.get_by_label('文字颜色',exact=True).count():field('文字颜色',color)
      if fill and page.get_by_label('填充颜色',exact=True).count():field('填充颜色',fill)
      if fill and page.get_by_label('边线颜色',exact=True).count():field('边线颜色',fill)
     if text is not None:field('文字内容',text);page.get_by_label('文字对齐',exact=True).select_option('left')
     if compact:page.get_by_label('简洁显示',exact=True).check()
     if kind=='readout':page.get_by_label('单位独立显示',exact=True).check()
     if key in ['title','overview','ops-title','bin-title','trend-title','events-title']:page.get_by_label('字重',exact=True).select_option('600')
     return id
    def rect(key,x,y,w,h,fill):return place(key,'rect',x,y,w,h,key,fill=fill)
    def text(key,x,y,w,h,value,size=18,color=INK):return place(key,'text',x,y,w,h,key,text=value,size=size,color=color)
    def bind(key,values):
     select(ids[key],'动态与测点')
     for label,value in values.items():page.get_by_label(label+' · 绑定测点',exact=True).select_option(value)
    if not os.environ.get('SCENE25_RESUME'):
     assert page.request.get(base+'/api/draft').json()['nodes']==[]
     page.screenshot(path=str(OUT/'00-blank.png'))
     rect('header',0,0,1920,85,WHITE);text('logo',32,18,48,50,'S',32,GREEN);text('title',90,15,1050,45,'污泥浓缩脱水 · 运行监控',29);text('subtitle',90,58,850,20,'污泥处理工段 / 浓缩 · 调理 · 脱水 · 外运',13,MUTED);text('demo',1630,24,245,35,'本地模拟 · 只读监视',15,GREEN)
     text('mode',32,101,170,30,'演示工况',15,MUTED);rect('mode-active',108,98,120,38,GREEN);text('normal',118,101,100,30,'常规运行',15,WHITE);text('mode-options',250,101,800,30,'高含固冲击       单机故障       雨季稀释',15,MUTED)
     rect('kpi-strip',28,168,1864,100,WHITE)
     kpis=[('进泥总流量','plant.flow',1),('浓缩后含固率','plant.solids',1),('泥饼含水率','plant.moisture',1),('本日累计干固体','plant.dry',1),('脱水单位电耗','plant.energy',0)]
     for i,(title,point,precision) in enumerate(kpis):
      key='kpi'+str(i);place(key,'readout',42+i*372,175,350,90,title,fill=WHITE,size=52,compact=True);field('小数位',precision);bind(key,{'显示数值':point})
     for i,note in enumerate(['2 台脱水机投入运行','浓缩池出泥 · 演示测点','低于演示关注值 80%','本日模拟累计值','脱水机组 · 模拟统计']):text('kpi-note'+str(i),50+i*372,242,340,20,note,12,MUTED)
     rect('process-panel',28,286,1326,500,WHITE);rect('process-bed',40,350,1302,383,'#f3f7f4');text('overview',52,302,350,34,'工艺总览',22);text('hint',180,310,650,24,'点击设备查看运行参数',13,MUTED)
     rect('operations-panel',1372,286,520,310,WHITE);rect('bin-panel',1372,614,520,172,WHITE);rect('trends-panel',28,805,1140,220,WHITE);rect('events-panel',1188,805,704,220,WHITE)
     for key,x,value in [('stage1',82,'浓缩与进泥'),('stage2',520,'药剂调理'),('stage3',780,'离心脱水'),('stage4',1145,'泥饼外运')]:text(key,x,359,190,25,value,14,MUTED)
     devices=[('TK101','gravityThickener',75,405,205,195,'1# 浓缩池'),('TK102','gravityThickener',75,530,205,195,'2# 浓缩池'),('P101','screwPump',323,437,155,109,'1# 螺杆泵'),('P102','screwPump',323,548,155,109,'2# 螺杆泵'),('MX101','staticMixer',567,481,78,72,'静态混合器'),('PAM101','polymerPreparation',490,600,230,168,'PAM 三槽制备'),('DC101','decanterCentrifuge',790,416,270,203,'1# 离心脱水机'),('DC102','decanterCentrifuge',790,542,270,203,'2# 离心脱水机'),('BN101','cakeSilo',1135,412,180,248,'泥饼输送 / 料仓')]
     for key,kind,x,y,w,h,title in devices:
      place(key,kind,x,y,w,h,title,compact=True)
      vals={'运行反馈':key+'.run','故障反馈':key+'.fault'} if key not in ['MX101'] else {}
      vals[{'gravityThickener':'液位','screwPump':'运行频率','staticMixer':'过泥流量','polymerPreparation':'投加配比','decanterCentrifuge':'转速','cakeSilo':'料仓料位'}[kind]]=key+'.value'
      if key.startswith('DC'):vals['扭矩']=key+'.torque'
      bind(key,vals)
     for key,x,y,label in [('TK101',112,508,'1# 浓缩池'),('TK102',112,637,'2# 浓缩池'),('P101',325,515,'1# 螺杆泵'),('P102',325,624,'2# 螺杆泵'),('MX101',555,551,'静态混合器'),('PAM101',500,580,'三槽制备 · 溶解 / 熟化 / 储液'),('DC101',805,515,'1# 离心机'),('DC102',805,642,'2# 离心机'),('BN101',1130,663,'螺旋输送 / 泥饼仓')]:text('label'+key,x,y,250,25,label,15,GREEN)
     for i,(key,kind,x,y,w,h,title) in enumerate([('level1','readout',132,452,100,50,'TK-101'),('level2','readout',132,578,100,50,'TK-102'),('FT101','readout',660,464,94,62,'FT-101'),('bin-level','readout',1180,491,100,62,'料位')]):
      place(key,kind,x,y,w,h,title,fill='#f3f7f4',size=44,compact=True);field('小数位',1 if i<3 else 0);bind(key,{'显示数值':['TK101.value','TK102.value','plant.flow','BN101.value'][i]})
     place('feed-junction','junction',506,505,20,20,'进泥汇合');place('split-junction','junction',754,505,20,20,'双线分配');place('return-junction','junction',780,709,20,20,'分离液回流')
     text('legend',52,748,1200,25,'━━━━ 污泥     ━━━ PAM 药液     ━━━ 上清液 / 分离液     ━━━ 泥饼',14,MUTED)
     text('ops-title',1395,304,400,30,'脱水机组',21)
     for key,y,point,title in [('torque1',345,'DC101.torque','1# 离心脱水机 · 扭矩'),('torque2',428,'DC102.torque','2# 离心脱水机 · 扭矩'),('pam-rate',512,'PAM101.value','PAM 投加配比')]:
      place(key,'readout',1395,y,470,75,title,fill=WHITE,size=43,compact=True);field('小数位',1 if key=='pam-rate' else 0);bind(key,{'显示数值':point})
     text('bin-title',1395,633,400,30,'泥饼暂存与外运',21);place('bin-value','readout',1395,673,220,86,'BN-101 料仓料位',fill=WHITE,size=48,compact=True);field('小数位',0);bind('bin-value',{'显示数值':'BN101.value'});text('bin-note',1615,690,250,65,'料仓余量充足\n密闭输送 · 演示反馈',15,GREEN)
     text('trend-title',52,820,400,30,'运行趋势 · 模拟时序',21);place('trend','trend',45,855,1100,155,'进泥量 / 含水率',fill=WHITE,compact=True);page.get_by_label('图表横轴类型',exact=True).select_option('category');field('图表分类字段','time');field('序列 1 名称','进泥量');field('序列 1 数值字段','flow');field('序列 1 颜色',GREEN);page.get_by_role('button',name='添加序列',exact=True).click();field('序列 2 名称','含水率');field('序列 2 数值字段','moisture');page.get_by_label('序列 2 坐标轴',exact=True).select_option('1')
     for label,v in [('左轴单位','m³/h'),('左轴最小值',0),('左轴最大值',120),('右轴单位','%'),('右轴最小值',75),('右轴最大值',85)]:field(label,v)
     select(ids['trend'],'动态与测点');selectors=page.locator('.screen-slot-picker select');selectors.nth(0).select_option('plant.history');selectors.nth(1).select_option('plant.history')
     text('events-title',1210,820,600,30,'事件记录 · 当前工况',21);place('events','events',1200,858,680,155,'事件记录 · 当前工况',fill=WHITE,compact=True);bind('events',{'事件数据':'plant.events'})
     (OUT/'ids.json').write_text(json.dumps(ids),'utf-8');save();print('Canvas built and points bound',flush=True)
    else:ids=json.loads((OUT/'ids.json').read_text('utf-8'))
    def connect(a,ap,b,bp,color=GREEN):
     matches=[e for e in page.request.get(base+'/api/draft').json()['pipes'] if e['source']=={'nodeId':ids[a],'portId':ap} and e['target']=={'nodeId':ids[b],'portId':bp}]
     if matches:latest=matches[0]
     else:
      page.get_by_role('tab',name='图元与工具',exact=True).click();page.locator('[data-tool="pipe"]').click()
      def portbox(key,side):return page.locator('[data-cell-id="'+ids[key]+'"] circle[port="'+side+'"]').bounding_box()
      p1,p2=portbox(a,ap),portbox(b,bp);count=page.locator('.x6-edge').count();page.mouse.move(p1['x']+p1['width']/2,p1['y']+p1['height']/2);page.mouse.down();page.mouse.move(p2['x']+p2['width']/2,p2['y']+p2['height']/2,steps=12);page.mouse.up();expect(page.locator('.x6-edge')).to_have_count(count+1)
      latest=save()['pipes'][-1];assert latest['source']=={'nodeId':ids[a],'portId':ap} and latest['target']=={'nodeId':ids[b],'portId':bp},latest
     select(latest['id']);field('管道颜色',color);field('管道流动颜色',color);field('管道宽度',3);page.get_by_label('管道外观',exact=True).select_option('detailed');page.get_by_role('tab',name='动态与测点',exact=True).click();page.get_by_label('流动状态 · 绑定测点',exact=True).select_option('plant.flowing')
    if len(page.request.get(base+'/api/draft').json()['pipes'])<14:
     for a,ap,b,bp in [('TK101','right','P101','left'),('TK102','right','P102','left'),('P101','right','feed-junction','top'),('P102','right','feed-junction','bottom'),('feed-junction','right','MX101','left'),('MX101','right','split-junction','left'),('split-junction','top','DC101','left'),('split-junction','bottom','DC102','left'),('DC101','right','BN101','left'),('DC102','right','BN101','left')]:connect(a,ap,b,bp,'#889582' if a.startswith('DC') and b=='BN101' else GREEN)
     connect('PAM101','right','MX101','top','#b58740');connect('DC101','bottom','return-junction','top','#6b94a4');connect('DC102','bottom','return-junction','right','#6b94a4')
    current=save()
    if len(current['pipes'])==13:
     page.get_by_role('tab',name='图元与工具',exact=True).click();page.locator('[data-tool="pipe"]').click()
     p1=page.locator('[data-cell-id="'+ids['return-junction']+'"] circle[port="left"]').bounding_box()
     page.mouse.move(p1['x']+p1['width']/2,p1['y']+p1['height']/2);page.mouse.down();page.mouse.move(*position(80,720),steps=12);page.mouse.up();expect(page.locator('.x6-edge')).to_have_count(14)
     edge=save()['pipes'][-1];select(edge['id']);field('管道颜色','#6b94a4');field('管道流动颜色','#6b94a4');field('管道宽度',3)
     text('return-label',240,687,480,22,'上清液 / 分离液回流至厂内处理',13,MUTED)
     (OUT/'ids.json').write_text(json.dumps(ids),'utf-8')
    connect('TK101','top','return-junction','left','#6b94a4');connect('TK102','top','return-junction','left','#6b94a4')
    linked=save();
    if any(e['vertices'] for e in linked['pipes']):
     for edge in linked['pipes']:
      select(edge['id']);summary=page.get_by_text('转折点 · '+str(len(edge['vertices'])),exact=True)
      if summary.locator('..').get_attribute('open') is None:summary.click()
      page.get_by_role('button',name='恢复自动走线',exact=True).click()
     linked=save()
    assert all(not e['vertices'] for e in linked['pipes'])
    def assert_port_alignment(doc):
     distances=page.evaluate('''(doc)=>doc.pipes.flatMap(e=>{
      const group=document.querySelector('[data-cell-id="'+e.id+'"]');
      const path=group.querySelector('[data-selector="line"]')||[...group.querySelectorAll('path')].find(p=>p.getAttribute('d'));
      return ['source','target'].flatMap((side,i)=>{const end=e[side];if(!end.nodeId)return[];
       const c=document.querySelector('[data-cell-id="'+end.nodeId+'"] circle[port="'+end.portId+'"]'),r=c.getBoundingClientRect();
       const p=path.getPointAtLength(i?path.getTotalLength():0),v=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM());
       return[Math.hypot(v.x-r.x-r.width/2,v.y-r.y-r.height/2)];});})''',doc)
     assert len(distances)==31 and max(distances)<3,distances
     return max(distances)
    assert_port_alignment(linked)
    select(ids['DC101']);field('宽度',310);field('高度',225);resized=save();assert resized['pipes']==linked['pipes'];alignment=assert_port_alignment(resized);page.screenshot(path=str(OUT/'resize-ports.png'))
    page.get_by_role('button',name='撤销',exact=True).click();page.get_by_role('button',name='撤销',exact=True).click();assert save()==linked
    for quality,fault,status in [('good',True,'故障'),('bad',False,'数据无效')]:
     modified=copy.deepcopy(linked);rows=json.loads(modified['source']['data'])['points']
     next(r for r in rows if r['id']=='DC101.value')['quality']=quality;next(r for r in rows if r['id']=='DC101.fault')['value']=fault
     modified['source']['data']=json.dumps({'points':rows});assert page.request.post(base+'/api/draft',data=modified).ok;page.reload()
     cell=page.locator('[data-cell-id="'+ids['DC101']+'"]');expect(cell).to_have_attribute('data-state',status);expect(cell).to_contain_text(status)
    assert page.request.post(base+'/api/draft',data=linked).ok;page.reload()
    page.get_by_role('tab',name='图元与工具',exact=True).click();page.locator('[data-tool=select]').click()
    page.screenshot(path=str(OUT/'editor.png'));(OUT/'project.json').write_text(json.dumps(linked,ensure_ascii=False,indent=2),'utf-8')
    page.get_by_role('button',name='预览发布',exact=True).click();page.get_by_role('button',name='发布',exact=True).click();expect(page.get_by_role('status')).to_contain_text('已发布');page.goto(base+'/view');expect(page.locator('.x6-edge')).to_have_count(16);expect(page.locator('.screen-chart-host canvas')).to_have_count(1);page.screenshot(path=str(OUT/'published-1920.png'))
    page.set_viewport_size({'width':1366,'height':768});page.screenshot(path=str(OUT/'published-1366.png'))
    page.goto(base);page.locator('.project-menu summary').click()
    with page.expect_download() as download:page.get_by_role('button',name='导出离线演示',exact=True).click()
    offline=OUT/'scene25-offline.html';download.value.save_as(offline);local=browser.new_page();requests=[];local.on('request',lambda r:requests.append(r.url) if r.url.startswith('http') else None);local.on('pageerror',lambda e:errors.append(str(e)));local.goto(offline.as_uri());expect(local.locator('.x6-edge')).to_have_count(16);assert not requests and not errors,(requests,errors)
    report={'scene':25,'fromBlank':True,'nodes':len(linked['nodes']),'pipes':len(linked['pipes']),'bindings':sum(len(n['bindings']) for n in linked['nodes']+linked['pipes']),'manualWaypoints':0,'resizedEndpointMaxErrorPx':alignment,'compactFaultQualityVisible':True,'errors':errors};(OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print(report,flush=True)
   except Exception as error:
    print(str(error),flush=True)
    page.screenshot(path=str(OUT/'failure.png'));(OUT/'failure.json').write_text(json.dumps({'errors':errors,'text':page.locator('body').first.inner_text()},ensure_ascii=False),'utf-8');raise
   finally:browser.close()
 finally:server.terminate();server.wait(timeout=15)
if __name__=='__main__':main()
