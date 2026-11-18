"""Selection/layout/resize acceptance on an independently UI-authored drawing."""
import json,os,socket,subprocess,tempfile,time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright,expect
import studio_drawing_ui_check as drawing
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'works/scada-designer-stages/layout';OUT.mkdir(parents=True,exist_ok=True);checks=[]
def exercise(page,base,browser):
    drawing.exercise(page,base,browser);page.goto(base)
    def save():
        with page.expect_response(lambda r:r.url==base+'/api/draft' and r.request.method=='POST') as r:page.get_by_role('button',name='保存草稿',exact=True).click()
        assert r.value.ok,r.value.text();return page.request.get(base+'/api/draft').json()
    initial=save();ids=[n['id'] for n in initial['nodes'] if n['symbol'] in ['line','polygon','polyline']];asset=next(n['id'] for n in initial['nodes'] if n['symbol']=='image')
    def select(values):
        page.get_by_role('tab',name='图层',exact=False).click()
        for i,id in enumerate(values):page.locator(f'[data-layer="{id}"]').click(modifiers=['Shift'] if i else [])
        page.get_by_role('tab',name='外观',exact=True).click()
    def node(id):return page.locator(f'.x6-node[data-cell-id="{id}"]')
    for label,key in [('左对齐','left'),('右对齐','right'),('顶对齐','top'),('底对齐','bottom'),('水平居中','center'),('垂直居中','middle'),('横向等距','horizontal'),('纵向等距','vertical')]:
        select(ids);page.get_by_role('button',name=label,exact=True).click();nodes=[n for n in save()['nodes'] if n['id'] in ids]
        value=lambda n:n['x'] if key=='left' else n['x']+n['w'] if key=='right' else n['y'] if key=='top' else n['y']+n['h'] if key=='bottom' else n['x']+n['w']/2 if key=='center' else n['y']+n['h']/2
        if key in ['horizontal','vertical']:
            axis='x' if key=='horizontal' else 'y';dim='w' if key=='horizontal' else 'h';ns=sorted(nodes,key=lambda n:n[axis]);gaps=[ns[i+1][axis]-ns[i][axis]-ns[i][dim] for i in range(2)];assert abs(gaps[0]-gaps[1])<.01
        else:assert max(map(value,nodes))-min(map(value,nodes))<.01
        page.get_by_role('button',name='撤销',exact=True).click();assert save()['nodes']==initial['nodes']
    checks.append('六向对齐、双向等距与每次撤销保留所有几何和资产')
    for position,dx,dy in [('top-left',-18,-14),('top',0,-14),('top-right',18,-14),('right',18,0),('bottom-right',18,14),('bottom',0,14),('bottom-left',-18,14),('left',-18,0)]:
        select([asset]);handle=page.locator(f'.x6-widget-transform-resize[data-position="{position}"]');box=handle.bounding_box();a=(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.move(*a);page.mouse.down();page.mouse.move(a[0]+dx,a[1]+dy,steps=8);page.mouse.up();n=next(n for n in save()['nodes'] if n['id']==asset);old=next(n for n in initial['nodes'] if n['id']==asset);assert n['w']!=old['w'] or n['h']!=old['h'],position;page.get_by_role('button',name='撤销',exact=True).click();assert save()['nodes']==initial['nodes']
    checks.append('八个独立缩放柄均可拖动，单次撤销完整恢复尺寸和位置')
    select([asset]);page.get_by_role('button',name='锁定 / 解锁',exact=True).click();locked=save();box=node(asset).bounding_box();a=(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.move(*a);page.mouse.down();page.mouse.move(a[0]+50,a[1]+30,steps=8);page.mouse.up();assert save()['nodes']==locked['nodes'];select([asset]);page.get_by_role('button',name='锁定 / 解锁',exact=True).click();page.get_by_label('隐藏对象',exact=True).check();expect(node(asset)).not_to_be_visible();page.get_by_label('隐藏对象',exact=True).uncheck();expect(node(asset)).to_be_visible()
    page.get_by_role('button',name='置顶',exact=True).click();top=save();assert next(n for n in top['nodes'] if n['id']==asset)['z']==max(n['z'] for n in top['nodes']);page.get_by_role('button',name='置底',exact=True).click();bottom=save();assert next(n for n in bottom['nodes'] if n['id']==asset)['z']==min(n['z'] for n in bottom['nodes'])
    select([asset]);page.locator('.canvas-toolbar').click();old=save();page.keyboard.press('ArrowLeft');moved=save();assert next(n for n in moved['nodes'] if n['id']==asset)['x']==next(n for n in old['nodes'] if n['id']==asset)['x']-1
    page.keyboard.press('Control+d');expect(page.locator('.x6-node')).to_have_count(6);page.keyboard.press('Delete');expect(page.locator('.x6-node')).to_have_count(5)
    select([asset]);width=page.get_by_label('宽度',exact=True);width.focus();width.press('Control+a');width.type('280');width.press('ArrowLeft');assert page.locator('.x6-node').count()==5;width.press('Tab');assert next(n for n in save()['nodes'] if n['id']==asset)['w']==280
    checks.append('锁定禁止拖动、隐藏恢复、层级、键盘微移复制删除，输入框快捷键保留本地行为')
    page.screenshot(path=str(OUT/'layout-editor.png'))
def main():
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='screen-layout-') as data:
        server=subprocess.Popen(['node','apps/scada-designer/server.mjs'],cwd=ROOT,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_DATA_DIR':data},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(80):
                try:urlopen(base+'/api/draft',timeout=1);break
                except OSError:time.sleep(.1)
            with sync_playwright() as p:
                browser=p.chromium.launch();page=browser.new_page(viewport={'width':1920,'height':1080});page.set_default_timeout(15000)
                try:exercise(page,base,browser)
                except Exception:page.screenshot(path=str(OUT/'failure.png'));raise
                finally:browser.close()
        finally:server.terminate();server.wait(timeout=15);(OUT/'results.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'passed':len(checks),'evidence':str(OUT)},ensure_ascii=False))
if __name__=='__main__':main()
