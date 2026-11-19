"""Production component-library UI acceptance; isolated project and explicit local demo points."""
import copy,json,os,socket,subprocess,tempfile,time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'works/water-components-acceptance';OUT.mkdir(parents=True,exist_ok=True)

def main():
 data=json.loads(subprocess.check_output(['node','--input-type=module','-e',
  'import {waterComponentBlank,waterComponentGallery} from "./tests/studio_water_fixture.mjs";import {waterEquipment} from "./packages/components/studio/water-equipment.mjs";console.log(JSON.stringify({blank:waterComponentBlank(),gallery:waterComponentGallery(),definitions:waterEquipment}));'],cwd=ROOT))
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 base=f'http://127.0.0.1:{port}'
 with tempfile.TemporaryDirectory(prefix='studio-water-') as temp:
  Path(temp,'project.json').write_text(json.dumps({'draft':data['blank'],'versions':[],'active':None}),'utf-8')
  server=subprocess.Popen(['node','apps/scada-designer/server.mjs'],cwd=ROOT,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_DATA_DIR':temp},creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  try:
   for _ in range(100):
    try:urlopen(base+'/api/draft',timeout=1).close();break
    except OSError:time.sleep(.1)
   with sync_playwright() as p:
    browser=p.chromium.launch();page=browser.new_page(viewport={'width':1920,'height':1080});page.set_default_timeout(15000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    try:
     page.goto(base);nav=page.get_by_role('complementary',name='场景与组件')
     assert not page.request.get(base+'/api/draft').json()['nodes']
     expect(nav.get_by_label('绘图外观',exact=True)).to_have_count(0)
     expect(nav.get_by_label('组件分类',exact=True)).to_be_visible()
     nav.get_by_label('组件分类',exact=True).select_option('devices');nav.get_by_label('搜索组件',exact=True).fill('沉淀')
     expect(nav.get_by_text('没有匹配的组件',exact=True)).to_be_visible();nav.get_by_role('button',name='查看全部组件',exact=True).click()
     page.screenshot(path=str(OUT/'01-component-library.png'))
     def save():
      with page.expect_response(lambda r:r.url==base+'/api/draft' and r.request.method=='POST') as response:page.get_by_role('button',name='保存草稿',exact=True).click()
      assert response.value.ok,response.value.text();return page.request.get(base+'/api/draft').json()
     def point(x,y):
      b=page.locator('.board').bounding_box();return b['x']+x*b['width']/1920,b['y']+y*b['height']/1080
     def field(label,value):
      f=page.get_by_label(label,exact=True);f.fill(str(value));f.press('Tab')
     def tools():page.get_by_role('tab',name='图元与工具',exact=True).click()
     def select(id,tab='动态与测点'):
      page.get_by_role('tab',name='图层',exact=False).click();page.locator('[data-layer="'+id+'"]').click();page.get_by_role('tab',name=tab,exact=True).click()
     def cell(id):return page.locator('[data-cell-id="'+id+'"]')
     def place(symbol,x,y):
      tools();nav.get_by_label('搜索组件',exact=True).fill(symbol)
      button=nav.locator('[data-symbol="'+symbol+'"]');expect(button).to_have_count(1)
      assert button.locator('img').get_attribute('src').startswith('data:image/webp;base64,')
      before=set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'));button.click();page.mouse.click(*point(x+2,y+2))
      expect(page.locator('.x6-node')).to_have_count(len(before)+1)
      id=(set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'))-before).pop()
      definition=data['definitions'][symbol];field('图元名称',definition['prefix']+'101 '+definition['label'])
      page.get_by_role('tab',name='动态与测点',exact=True).click()
      for slot in definition['slots']:page.get_by_label(slot['label']+' · 绑定测点',exact=True).select_option(definition['prefix']+'101.'+slot['key'])
      return id
     # Thumbnails and inserted legacy equipment must use the exact same bitmap.
     for symbol in ['pump','fan','valve','checkValve']:
      tools();nav.get_by_label('搜索组件',exact=True).fill(symbol);button=nav.locator('[data-symbol="'+symbol+'"]')
      thumb=button.locator('img').get_attribute('src')
      if symbol=='pump':button.drag_to(page.locator('.board'),target_position={'x':100,'y':100})
      else:button.click();page.mouse.click(*point(100,100))
      expect(page.locator('.x6-node')).to_have_count(1);inserted=save()['nodes'][0]
      assert inserted['params']['appearance']=='depth',symbol
      assert cell(inserted['id']).locator('image').get_attribute('xlink:href')==thumb,symbol
      page.get_by_role('button',name='撤销',exact=True).click();expect(page.locator('.x6-node')).to_have_count(0)
     ids={}
     for symbol,x,y in [('dosingSkid',40,180),('lamellaClarifier',750,260),('pressureFilter',1590,330),('submersiblePump',1000,740)]:ids[symbol]=place(symbol,x,y)
     normal=save();expect(cell(ids['lamellaClarifier'])).to_contain_text('0.85 NTU');expect(cell(ids['lamellaClarifier'])).to_contain_text('1.70 m');expect(cell(ids['lamellaClarifier'])).to_contain_text('42.00 m³/h')
     # Real port drags; no direct creation of pipes through the document API.
     def connect(a,ap,b,bp):
      tools();nav.get_by_label('搜索组件',exact=True).fill('');page.locator('[data-tool="pipe"]').click()
      start=cell(a).locator('circle[port="'+ap+'"]');end=cell(b).locator('circle[port="'+bp+'"]')
      p1=start.bounding_box();p2=end.bounding_box();page.mouse.move(p1['x']+p1['width']/2,p1['y']+p1['height']/2);page.mouse.down();page.mouse.move(p2['x']+p2['width']/2,p2['y']+p2['height']/2,steps=15);page.mouse.up()
     for a,ap,b,bp in [('dosingSkid','right','lamellaClarifier','top'),('lamellaClarifier','right','pressureFilter','left'),('lamellaClarifier','bottom','submersiblePump','bottom'),('submersiblePump','right','lamellaClarifier','left')]:connect(ids[a],ap,ids[b],bp)
     expect(page.locator('.x6-edge')).to_have_count(4);linked=save()
     routes=[
      [(690,386.8),(690,150),(1086,150)],
      [],
      [(1380,519.6),(1380,700),(900,700),(900,941.3)],
      [(1400,911.6),(1400,1070),(700,1070),(700,396.4)],
     ]
     for pipe,vertices in zip(linked['pipes'],routes,strict=True):
      select(pipe['id'],'外观');page.get_by_label('管道外观',exact=True).select_option('detailed')
      if vertices:
       summary=page.get_by_text('转折点 · 0',exact=True)
       if summary.locator('..').get_attribute('open') is None:summary.click()
       for index,(x,y) in enumerate(vertices,1):
        page.get_by_role('button',name='添加转折点',exact=True).click();field(f'转折 {index} X',x);field(f'转折 {index} Y',y)
     linked=save()
     assert all(pipe['source'].get('nodeId') and pipe['target'].get('nodeId') for pipe in linked['pipes'])
     select(ids['lamellaClarifier'],'外观');field('宽度',640)
     resized=save();assert resized['pipes']==linked['pipes']
     assert next(n for n in resized['nodes'] if n['id']==ids['lamellaClarifier'])['bindings']==next(n for n in normal['nodes'] if n['id']==ids['lamellaClarifier'])['bindings']
     page.get_by_role('button',name='撤销',exact=True).click();assert save()==linked
     # A copied unit keeps engineering ports and artwork, but starts without point assignments.
     select(ids['lamellaClarifier'],'外观');page.keyboard.press('Control+d');duplicated=save()
     added=next(n for n in duplicated['nodes'] if n['id'] not in ids.values());assert added['symbol']=='lamellaClarifier' and added['bindings']=={}
     expect(cell(added['id'])).to_have_attribute('data-state','待绑定')
     page.get_by_role('button',name='撤销',exact=True).click();assert save()==linked
     # Static artwork must never cover invalid quality or a known fault.
     for quality,fault,status in [('good',True,'故障'),('bad',False,'数据无效'),('stale',False,'数据过期')]:
      modified=copy.deepcopy(linked);rows=json.loads(modified['source']['data'])['points']
      next(r for r in rows if r['id']=='HC101.value')['quality']=quality;next(r for r in rows if r['id']=='HC101.fault')['value']=fault
      if quality=='stale':
       next(r for r in rows if r['id']=='HC101.value').update(quality='good',sampledAt=int(time.time()*1000)-120000)
       next(m for m in modified['mappings'] if m['id']=='HC101.value')['timePath']='sampledAt'
      modified['source']['data']=json.dumps({'points':rows});assert page.request.post(base+'/api/draft',data=modified).ok;page.reload()
      expect(cell(ids['lamellaClarifier'])).to_have_attribute('data-state',status)
      if quality!='good':expect(cell(ids['lamellaClarifier'])).not_to_contain_text('0.85 NTU')
     assert page.request.post(base+'/api/draft',data=linked).ok;page.reload();expect(cell(ids['lamellaClarifier'])).to_contain_text('0.85 NTU')
     (OUT/'authored-project.json').write_text(json.dumps(linked,ensure_ascii=False,indent=2),'utf-8')
     tools();nav.get_by_label('组件分类',exact=True).select_option('units');page.screenshot(path=str(OUT/'02-authored-editor.png'))
     def publish():
      page.get_by_role('button',name='预览发布',exact=True).click();page.get_by_role('button',name='发布',exact=True).click();expect(page.get_by_role('status')).to_contain_text('已发布')
     publish();page.goto(base+'/view');expect(page.locator('.x6-node')).to_have_count(4);page.screenshot(path=str(OUT/'03-authored-published.png'))
     cell(ids['lamellaClarifier']).click();details=page.get_by_role('dialog');expect(details).to_contain_text('PAC 投加量');expect(details).to_contain_text('26 mg/L');details.get_by_role('button',name='关闭详情',exact=True).click()
     page.set_viewport_size({'width':1366,'height':768});page.screenshot(path=str(OUT/'04-authored-1366.png'));b=page.locator('.board').bounding_box();assert abs(b['width']/b['height']-1920/1080)<.01
     # All 14 component contracts also run together on reusable gallery pages.
     assert page.request.post(base+'/api/draft',data=data['gallery']).ok;page.goto(base);publish();page.set_viewport_size({'width':1920,'height':1080})
     for page_id,count in [('main',4),('clean-water',4),('equipment',6),('more-equipment',3),('more-units',2)]:
      page.goto(base+'/view'+('' if page_id=='main' else '?page='+page_id));expect(page.locator('.x6-node')).to_have_count(count+1)
      images=page.locator('.x6-node image');expect(images).to_have_count(count)
      urls=images.evaluate_all('(els)=>els.map(e=>e.getAttribute("href")||e.getAttribute("xlink:href"))')
      assert all(u.startswith('data:image/webp;base64,') for u in urls)
      assert page.evaluate('async urls=>{await Promise.all(urls.map(src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=resolve;i.onerror=reject;i.src=src;})));return true;}',urls)
      page.screenshot(path=str(OUT/('gallery-'+page_id+'.png')))
     page.goto(base);page.locator('.project-menu summary').click()
     with page.expect_download() as download:page.get_by_role('button',name='导出离线演示',exact=True).click()
     artifact=OUT/'water-components-offline.html';download.value.save_as(artifact)
     local=browser.new_page();requests=[];local.on('request',lambda r:requests.append(r.url) if r.url.startswith('http') else None);local.on('pageerror',lambda e:errors.append(str(e)))
     for page_id,count in [('main',4),('clean-water',4),('equipment',6),('more-equipment',3),('more-units',2)]:
      local.goto(artifact.as_uri()+'?page='+page_id);expect(local.locator('.x6-node image')).to_have_count(count)
     assert not requests and not errors,(requests,errors)
     (OUT/'gallery-project.json').write_text(json.dumps(data['gallery'],ensure_ascii=False,indent=2),'utf-8')
     report={'scope':'production UI; local synthetic points, no field device IO','components':19,'authoredFromBlank':4,'pipes':4,'verified':['component categories/search/no-results recovery','no appearance selector in left palette','image cards independent of canvas appearance','actual port drags','different units per slot','resize preserves connections/bindings and one undo','copy clears bindings','fault and invalid/stale quality visible','save/reload/publish/two sizes','all 19 images decoded across 5 pages','offline all pages zero HTTP'],'errors':errors}
     (OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print(json.dumps(report,ensure_ascii=False))
    except Exception:
     page.screenshot(path=str(OUT/'failure.png'));(OUT/'diagnostics.json').write_text(json.dumps({'url':page.url,'errors':errors,'text':page.locator('body').inner_text()},ensure_ascii=False,indent=2),'utf-8');print(errors,flush=True);raise
    finally:browser.close()
  finally:server.terminate();server.wait(timeout=15)

if __name__=='__main__':main()
