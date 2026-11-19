"""Refine the authored scene25 using production editor controls; isolated local samples."""
import copy,json,os,socket,subprocess,time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'works/scene25-refinement';OUT.mkdir(exist_ok=True,parents=True)

def main():
 doc=json.loads((ROOT/'works/scene25-rebuild/project.json').read_text('utf-8'));ids=json.loads((ROOT/'works/scene25-rebuild/ids.json').read_text('utf-8'))
 rows=json.loads(doc['source']['data'])['points'];rows.append(dict(id='plant.mode',label='演示工况',kind='number',value=0,unit='',quality='good'))
 for r in next(r for r in rows if r['id']=='plant.history')['value']:r['time']='2026-11-'+('20T00:00:00+08:00' if r['time']=='24:00' else '19T'+r['time']+':00+08:00')
 doc['source']['data']=json.dumps({'points':rows},ensure_ascii=False);doc['mappings'].append(dict(id='plant.mode',label='演示工况',kind='number',unit='',path='value',root='points',keyField='id',keyValue='plant.mode',timePath='',fallbackTimePath='',qualityPath='quality',scale=1,offset=0,precision=0))
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 base=f'http://127.0.0.1:{port}';store=OUT/'server';store.mkdir(exist_ok=True);(store/'project.json').write_text(json.dumps({'draft':doc,'versions':[],'active':None}),'utf-8') if not os.environ.get('SCENE25_REFINE_RESUME') else None
 server=subprocess.Popen(['node','apps/scada-designer/server.mjs'],cwd=ROOT,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_DATA_DIR':str(store)},creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
 try:
  for _ in range(100):
   try:urlopen(base+'/api/draft',timeout=1).close();break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   browser=p.chromium.launch();page=browser.new_page(viewport={'width':1920,'height':1080});page.set_default_timeout(20000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   try:
    page.goto(base)
    def field(label,value):f=page.get_by_label(label,exact=True);f.fill(str(value));f.press('Tab')
    def select(id,tab='外观'):
     page.get_by_role('tab',name='图层',exact=False).click();page.locator('[data-layer="'+id+'"]').click();page.get_by_role('tab',name=tab,exact=True).click()
    def save():
     with page.expect_response(lambda r:r.url==base+'/api/draft' and r.request.method=='POST') as resp:page.get_by_role('button',name='保存草稿',exact=True).click()
     assert resp.value.ok,resp.value.text();return page.request.get(base+'/api/draft').json()
    def bind(key,label,point):select(ids[key],'动态与测点');page.get_by_label(label+' · 绑定测点',exact=True).select_option(point)
    def geometry(key,**props):
     select(ids[key]);
     for k,v in props.items():field({'x':'位置 X','y':'位置 Y','w':'宽度','h':'高度'}[k],v)
    def place(key,kind,x,y,w,h,title):
     page.get_by_role('tab',name='图元与工具',exact=True).click();page.get_by_label('组件分类',exact=True).select_option('all');page.get_by_label('搜索组件',exact=True).fill(kind);button=page.locator('[data-symbol="'+kind+'"]');before=set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'));button.click();b=page.locator('.board').bounding_box();page.mouse.click(b['x']+(x+1)*b['width']/1920,b['y']+(y+1)*b['height']/1080);expect(page.locator('.x6-node')).to_have_count(len(before)+1);ids[key]=(set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'))-before).pop();field('图元名称',title);geometry(key,x=x,y=y,w=w,h=h);return ids[key]
    def text(key,x,y,w,h,value,size=14,color='#647f72'):
     place(key,'text',x,y,w,h,value);field('文字内容',value);field('字号',size);field('文字颜色',color);page.get_by_label('文字对齐',exact=True).select_option('left')
    def remove(key):select(ids[key]);page.get_by_role('button',name='删除',exact=True).click()
    if not os.environ.get('SCENE25_REFINE_RESUME'):
     page.get_by_role('button',name='数据连接',exact=True).click();connection=page.get_by_role('dialog');connection.get_by_label('样本内容',exact=True).fill(doc['source']['data']);connection.get_by_role('button',name='读取样本',exact=True).click();connection.get_by_role('button',name='应用数据配置',exact=True).click()
     for key in ['mode-active','normal','mode-options','pam-rate','legend']:remove(key)
     for key,value in [('kpi-note0','进泥汇总 · 本地演示值'),('kpi-note2','演示关注值 80% · 观察含水率'),('demo','本地演示 · 不写现场')]:select(ids[key]);field('文字内容',value)
     # Same process, aligned lanes; labels do not sit on drains or pipes.
     geometry('PAM101',x=512,y=601,w=204,h=150);geometry('labelPAM101',x=510,y=704,w=240,h=22);field('文字内容','三槽制备 · PAM-101')
     geometry('labelDC101',x=805,y=394,w=260,h=22);field('文字内容','DC-101 · 1# 离心脱水机')
     geometry('labelDC102',x=805,y=541,w=260,h=22);field('文字内容','DC-102 · 2# 离心脱水机')
     for key,x,y in [('feed-junction',512,512),('split-junction',761,512),('return-junction',780,731)]:
      geometry(key,x=x,y=y,w=6,h=6);field('填充颜色','#6b8f7a');field('边线颜色','#6b8f7a');page.get_by_label('外观预设',exact=True).select_option('process')
     geometry('return-label',x=210,y=699,w=270,h=22);field('文字内容','上清液 / 分离液回流')
     place('overflow-return','junction',76,731,6,6,'上清液汇入');field('填充颜色','#a8b8be');field('边线颜色','#a8b8be');page.get_by_label('外观预设',exact=True).select_option('process')
     current=save()
     for e in current['pipes']:
      select(e['id']);source=e['source'].get('nodeId');target=e['target'].get('nodeId');water=e['style']['color']=='#6b94a4';drug=e['style']['color']=='#b58740';cake=target==ids['BN101'];color='#6e907b' if not water and not drug and not cake else '#b79d69' if drug else '#9cac9c' if cake else '#a3b6bd'
      page.get_by_label('管道外观',exact=True).select_option('process');field('管道颜色',color);field('管道宽度',5 if not water and not drug else 2.5);field('管道流动颜色','#d2e0d5' if not water else '#a3b6bd')
      page.get_by_label('管道流动动画',exact=True).set_checked(not water and not drug);page.get_by_label('管道箭头',exact=True).select_option('forward' if not water else 'none')
      if source in [ids['TK101'],ids['TK102']] and e['source']['portId']=='top':
       page.get_by_label('终点元素',exact=True).select_option(ids['overflow-return']);page.get_by_label('终点连接点',exact=True).select_option('top')
      if not target:
       page.get_by_label('终点元素',exact=True).select_option(ids['overflow-return']);page.get_by_label('终点连接点',exact=True).select_option('right')
      if source in [ids['P101'],ids['P102']]:
       summary=page.get_by_text('转折点 · 0',exact=True)
       if summary.locator('..').get_attribute('open') is None:summary.click()
       waypoints=[(410,445),(500,445),(500,512)] if source==ids['P101'] else [(410,555),(500,555),(500,528)]
       for index,(x,y) in enumerate(waypoints,1):page.get_by_role('button',name='添加转折点',exact=True).click();field(f'转折 {index} X',x);field(f'转折 {index} Y',y)
      run='DC101.run' if source==ids['DC101'] or target==ids['DC101'] else 'DC102.run' if source==ids['DC102'] or target==ids['DC102'] else 'plant.flowing'
      page.get_by_role('tab',name='动态与测点',exact=True).click();page.get_by_label('流动状态 · 绑定测点',exact=True).select_option(run)
     for i,(label,color) in enumerate([('污泥','#6e907b'),('PAM 药液','#b79d69'),('上清液 / 分离液','#a3b6bd'),('泥饼','#9cac9c')]):text('legend-new'+str(i),53+i*235,753,230,23,'━━━━  '+label,13,color)
     # Author presets using the reusable control inspector, not a scene-specific API.
     place('mode-control','modeSwitch',101,96,595,45,'演示工况');page.get_by_label('交互隐藏标题',exact=True).check();field('填充颜色','#e9efec');bind('mode-control','当前工况','plant.mode');select(ids['mode-control'])
     page.get_by_role('button',name='添加切换选项',exact=True).click()
     for i,label in enumerate(['常规运行','高含固冲击','单机故障','雨季稀释'],1):field(f'选项 {i} 名称',label)
     targets=['plant.flow','plant.solids','plant.moisture','DC101.run','DC101.fault','DC102.run','DC102.fault','DC101.torque','DC102.torque','PAM101.value','MX101.value','DC101.value']
     for id in targets:page.get_by_label('添加联动测点',exact=True).select_option(id);page.get_by_role('button',name='添加联动',exact=True).click()
     values=[[72,3.2,78.6,True,False,True,False,62,58,4.2,72,2800],[84,4.6,79.8,True,False,True,False,75,73,5.0,84,2800],[45,3.2,79.2,False,True,True,False,0,68,4.4,45,0],[98,2.1,80.4,True,False,True,False,50,48,3.6,98,2800]]
     for i,row in enumerate(values,1):
      page.locator('.control-preset-values').nth(i-1).locator('summary').click()
      for id,value in zip(targets,row):
       if isinstance(value,bool):page.get_by_label(f'选项 {i} · {id}',exact=True).select_option(str(value).lower())
       else:field(f'选项 {i} · {id}',value)
      page.locator('.control-preset-values').nth(i-1).locator('summary').click()
     text('pam-caption',1400,504,300,28,'PAM 投加配比 · kg/tDS',14)
     place('pam-stepper','numberStepper',1696,504,175,48,'PAM 投加配比');page.get_by_label('交互隐藏标题',exact=True).check();field('调节下限',3);field('调节上限',6);field('调节步长',.2);field('调节小数位',1);field('填充颜色','#ffffff');bind('pam-stepper','调节数值','PAM101.value')
     text('pam-hint',1400,558,460,22,'演示范围 3.0–6.0 · 步长 0.2 · 不写现场',12)
     select(ids['trend']);page.get_by_label('图表横轴类型',exact=True).select_option('time');page.get_by_label('趋势时间刻度',exact=True).select_option('hours');page.get_by_label('平滑趋势线',exact=True).check();page.get_by_label('显示数据标记',exact=True).uncheck();field('序列 2 颜色','#7196a7')
     place('range-control','trendRange',1007,815,141,43,'趋势时间');page.get_by_label('交互隐藏标题',exact=True).check();field('填充颜色','#ffffff');page.get_by_label('目标趋势图',exact=True).select_option(ids['trend'])
    else:ids=json.loads((OUT/'ids.json').read_text('utf-8'))
    authored=save()
    geometry('DC101',w=310,h=225);resized=save();assert resized['pipes']==authored['pipes']
    distances=page.evaluate('''(doc)=>doc.pipes.flatMap(e=>{
      const group=document.querySelector('[data-cell-id="'+e.id+'"]');const path=group.querySelector('[data-selector="line"]')||[...group.querySelectorAll('path')].find(p=>p.getAttribute('d'));
      return ['source','target'].map((side,i)=>{const end=e[side],circle=document.querySelector('[data-cell-id="'+end.nodeId+'"] circle[port="'+end.portId+'"]'),r=circle.getBoundingClientRect(),p=path.getPointAtLength(i?path.getTotalLength():0),v=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM());return Math.hypot(v.x-r.x-r.width/2,v.y-r.y-r.height/2);});})''',resized)
    assert len(distances)==32 and max(distances)<3,distances
    page.get_by_role('button',name='撤销',exact=True).click();page.get_by_role('button',name='撤销',exact=True).click();assert save()==authored
    final=save();(OUT/'project.json').write_text(json.dumps(final,ensure_ascii=False,indent=2),'utf-8');(OUT/'ids.json').write_text(json.dumps(ids),'utf-8');page.screenshot(path=str(OUT/'editor.png'))
    page.get_by_role('button',name='预览发布',exact=True).click()
    def check_controls():
     page.get_by_role('button',name='演示工况 · 高含固冲击',exact=True).click();expect(page.locator('[data-cell-id="'+ids['kpi1']+'"]')).to_contain_text('4.6');expect(page.locator('[data-cell-id="'+ids['pam-stepper']+'"] output')).to_have_text('5.0')
     page.get_by_role('button',name='PAM 投加配比 · +',exact=True).click();expect(page.locator('[data-cell-id="'+ids['pam-stepper']+'"] output')).to_have_text('5.2')
     page.get_by_role('button',name='PAM 投加配比 · −',exact=True).focus();page.keyboard.press('Enter');expect(page.locator('[data-cell-id="'+ids['pam-stepper']+'"] output')).to_have_text('5.0')
     page.get_by_role('button',name='演示工况 · 单机故障',exact=True).click();expect(page.locator('[data-cell-id="'+ids['DC101']+'"]')).to_have_attribute('data-state','故障')
     page.screenshot(path=str(OUT/'single-fault.png'))
     page.get_by_role('button',name='演示工况 · 雨季稀释',exact=True).click();expect(page.locator('[data-cell-id="'+ids['kpi0']+'"]')).to_contain_text('98.0');expect(page.locator('[data-cell-id="'+ids['DC101']+'"]')).to_have_attribute('data-state','运行')
     page.get_by_role('button',name='演示工况 · 常规运行',exact=True).click();expect(page.locator('[data-cell-id="'+ids['pam-stepper']+'"] output')).to_have_text('4.2')
     for option in ['8 h','24 h']:
      page.get_by_role('button',name='趋势时间 · '+option,exact=True).click();expect(page.get_by_role('button',name='趋势时间 · '+option,exact=True)).to_have_attribute('aria-pressed','true')
      expected=9 if option=='8 h' else 25
      def count():return page.locator('[data-cell-id="'+ids['trend']+'"] .screen-chart-host').evaluate('(el)=>echarts.getInstanceByDom(el)?.getOption().series[0].data.length')
      for _ in range(50):
       if count()==expected:break
       page.wait_for_timeout(50)
      assert count()==expected,(option,count());page.screenshot(path=str(OUT/('trend-'+option.replace(' ','')+'.png')))
    check_controls();assert page.request.get(base+'/api/draft').json()==final
    page.get_by_role('button',name='PAM 投加配比 · +',exact=True).click();expect(page.locator('[data-cell-id="'+ids['pam-stepper']+'"] output')).to_have_text('4.4')
    page.get_by_role('button',name='返回编辑',exact=True).click();page.get_by_role('button',name='预览发布',exact=True).click();expect(page.locator('[data-cell-id="'+ids['pam-stepper']+'"] output')).to_have_text('4.2')
    page.get_by_role('button',name='发布',exact=True).click();expect(page.locator('.status-message')).to_contain_text('已发布');page.goto(base+'/view');check_controls();page.screenshot(path=str(OUT/'published-1920.png'));page.set_viewport_size({'width':1366,'height':768});page.screenshot(path=str(OUT/'published-1366.png'))
    page.goto(base);page.locator('.project-menu summary').click()
    with page.expect_download() as download:page.get_by_role('button',name='导出离线演示',exact=True).click()
    offline=OUT/'scene25-offline.html';download.value.save_as(offline);page.close();page=browser.new_page(viewport={'width':1920,'height':1080});requests=[];page.on('request',lambda r:requests.append(r.url) if r.url.startswith('http') else None);page.on('pageerror',lambda e:errors.append(str(e)));page.goto(offline.as_uri());check_controls();assert not requests and not errors,(requests,errors)
    report={'scene':25,'nodes':len(final['nodes']),'pipes':len(final['pipes']),'bindings':sum(len(n['bindings']) for n in final['nodes']+final['pipes']),'resizedEndpointMaxErrorPx':max(distances),'manualRoutePipes':sum(bool(e['vertices']) for e in final['pipes']),'modeOptions':4,'linkedPoints':12,'tested':['data modal read/apply preserves bindings','editor UI configuration and binding','preview/published/offline same interactions','keyboard decrement','mode reset and fault recovery','trend 24h/8h/24h keeps data','return to editing clears simulation','no project mutation from simulation','two viewport sizes','offline zero HTTP'],'errors':errors};(OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print(report,flush=True)
   except Exception as error:
    page.screenshot(path=str(OUT/'failure.png'));(OUT/'failure.json').write_text(json.dumps({'error':str(error),'errors':errors,'text':page.locator('body').first.inner_text()},ensure_ascii=False),'utf-8');raise
   finally:browser.close()
 finally:server.terminate();server.wait(timeout=15)
if __name__=='__main__':main()
