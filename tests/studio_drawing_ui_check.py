"""Blank-canvas drawing, point handles, typography, local SVG and offline assets."""
import json,os,socket,subprocess,tempfile,time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'works/scada-designer-stages/drawing';OUT.mkdir(parents=True,exist_ok=True)
checks=[]

def exercise(page,base,browser):
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    page.goto(base);expect(page.locator('.screen-empty')).to_be_visible()
    def pos(x,y):
        b=page.locator('.board').bounding_box();return(b['x']+x*b['width']/1920,b['y']+y*b['height']/1080)
    def create(kind,x,y,drag=None):
        old=set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'))
        page.locator(f'[data-{"symbol" if kind=="image" else "tool"}="{kind}"]').click()
        if drag:
            page.mouse.move(*pos(x,y));page.mouse.down();page.mouse.move(*pos(x+drag[0],y+drag[1]),steps=10);page.mouse.up()
        else:page.mouse.click(*pos(x,y))
        expect(page.locator('.x6-node')).to_have_count(len(old)+1)
        return(set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'))-old).pop()
    def save():
        with page.expect_response(lambda r:r.url==base+'/api/draft' and r.request.method=='POST') as response:page.get_by_role('button',name='保存草稿',exact=True).click()
        assert response.value.ok,response.value.text()
        return page.request.get(base+'/api/draft').json()
    line=create('line',200,250,(400,160))
    first=save();n=next(n for n in first['nodes'] if n['id']==line);assert n['w']==400 and n['h']==160 and n['points'][1]['x']==100,n
    polygon=create('polygon',850,450)
    path=page.locator(f'.x6-node[data-cell-id="{polygon}"] path');d=path.get_attribute('d')
    point=page.locator('[data-shape-point="1"]').bounding_box();a=(point['x']+point['width']/2,point['y']+point['height']/2)
    page.mouse.move(*a);page.mouse.down();page.mouse.move(a[0]+25,a[1]+35,steps=10);page.mouse.up()
    expect(path).not_to_have_attribute('d',d)
    edited=save();assert next(n for n in edited['nodes'] if n['id']==polygon)['points'][1]['y']>0
    page.get_by_role('button',name='撤销',exact=True).click();expect(path).to_have_attribute('d',d)
    page.get_by_role('tab',name='图层',exact=False).click();page.locator(f'[data-layer="{polygon}"]').click()
    page.get_by_role('button',name='添加顶点',exact=True).click();expect(page.locator('[data-shape-point]')).to_have_count(4)
    page.get_by_role('button',name='移除顶点 4',exact=True).click();expect(page.locator('[data-shape-point]')).to_have_count(3)
    checks.append('从零拖画任意方向直线、多边形顶点拖动及整次撤销、增删顶点')
    page.get_by_role('tab',name='图元与工具',exact=True).click();polyline=create('polyline',500,650)
    expect(page.locator(f'.x6-node[data-cell-id="{polyline}"] path')).to_have_attribute('fill','none')
    title=create('text',180,80)
    page.get_by_label('文字内容',exact=True).fill('自绘工艺监控\n运行状态与设备信息')
    page.get_by_label('字体',exact=True).select_option('Consolas');page.get_by_label('文字对齐',exact=True).select_option('left');page.get_by_label('字重',exact=True).select_option('700')
    text=page.locator(f'.x6-node[data-cell-id="{title}"] text')
    expect(text).to_have_attribute('font-family','Consolas');expect(text).to_have_attribute('text-anchor','start');expect(text).to_have_attribute('font-weight','700');expect(text.locator('tspan')).not_to_have_count(0)
    checks.append('折线及可配置字体、字重、对齐和多行文字')
    asset=create('image',1250,200)
    file=OUT/'local-pump.svg';file.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120"><defs><linearGradient id="g"><stop stop-color="#357b9a"/><stop offset="1" stop-color="#85b5c9"/></linearGradient></defs><rect x="10" y="10" width="180" height="100" rx="10" fill="url(#g)"/><text x="50" y="70" fill="white">本地图元</text></svg>',encoding='utf-8')
    page.locator('.screen-inspector input[type=file]').set_input_files(file)
    image=page.locator(f'.x6-node[data-cell-id="{asset}"] image');expect(image).to_have_attribute('xlink:href',__import__('re').compile(r'^data:image/svg\+xml;base64,'))
    data=save();assert next(n for n in data['nodes'] if n['id']==asset)['image'].startswith('data:image/svg+xml;base64,')
    page.screenshot(path=str(OUT/'drawing-editor.png'));page.reload();expect(page.locator('.x6-node')).to_have_count(5)
    assert page.request.get(base+'/api/draft').json()==data
    checks.append('静态本地 SVG 随文档保存重开，不引用开发机路径')
    page.locator('.studio-header').get_by_role('button',name='预览发布',exact=True).click();page.locator('.studio-header').get_by_role('button',name='发布',exact=True).click();expect(page.get_by_role('status')).to_contain_text('已发布')
    page.goto(base+'/view');expect(page.locator('.screen-point-overlay')).to_have_count(0);expect(page.locator(f'.x6-node[data-cell-id="{asset}"] image')).to_have_attribute('xlink:href',__import__('re').compile(r'^data:image/svg\+xml;base64,'))
    page.goto(base);page.locator('.project-menu summary').click()
    with page.expect_download() as dl:page.get_by_role('button',name='导出离线演示',exact=True).click()
    offline=OUT/'drawing-offline.html';dl.value.save_as(offline)
    local=browser.new_page(viewport={'width':1920,'height':1080});requests=[];local.on('request',lambda r:requests.append(r.url) if r.url.startswith('http') else None);local.on('pageerror',lambda e:errors.append(str(e)))
    local.goto(offline.as_uri());expect(local.locator('.x6-node')).to_have_count(5);assert not requests,requests;local.screenshot(path=str(OUT/'drawing-offline.png'));local.close()
    assert not errors,errors
    checks.append('发布端只读、离线图形与 SVG 完整且无网络请求或脚本错误')
    (OUT/'document.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')

def main():
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='screen-drawing-') as data:
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
