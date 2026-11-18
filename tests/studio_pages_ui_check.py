"""Multi-screen project, shared points, runtime actions and all-screen publishing."""
import json,os,socket,subprocess,tempfile,threading,time
from pathlib import Path
from urllib.request import urlopen
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
from studio_screen_check import Fixture

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'works/scada-designer-stages/pages';OUT.mkdir(parents=True,exist_ok=True);checks=[]

def exercise(page,base,url,browser):
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    page.goto(base);expect(page.locator('.screen-empty')).to_be_visible()
    def place(kind,x,y):
        page.get_by_role('tab',name='图元与工具',exact=True).click();old=set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'));page.locator(f'[data-{"tool" if kind=="text" else "symbol"}="{kind}"]').click();b=page.locator('.board').bounding_box();page.mouse.click(b['x']+x*b['width']/1920,b['y']+y*b['height']/1080);expect(page.locator('.x6-node')).to_have_count(len(old)+1);return(set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'))-old).pop()
    def select(id):page.get_by_role('tab',name='图层',exact=False).click();page.locator(f'[data-layer="{id}"]').click()
    def nav(id):page.locator(f'.screen-page-nav [data-page-id="{id}"]').click()
    def save():
        with page.expect_response(lambda r:r.url==base+'/api/draft' and r.request.method=='POST') as r:page.get_by_role('button',name='保存草稿',exact=True).click()
        assert r.value.ok,r.value.text();return page.request.get(base+'/api/draft').json()
    pump=place('pump',350,400);reading=place('readout',800,380)
    select(pump);page.get_by_role('tab',name='动态与测点',exact=True).click();page.get_by_role('button',name='管理连接与点位',exact=True).click()
    d=page.get_by_role('dialog');d.get_by_label('来源',exact=True).select_option('rest');d.get_by_label('接口 URL',exact=True).fill(url);d.get_by_label('刷新周期（ms）',exact=True).fill('250');d.get_by_role('button',name='读取样本',exact=True).click();d.get_by_role('button',name='从桥接点表生成映射',exact=True).click();d.get_by_role('button',name='应用数据配置',exact=True).click()
    for label,value in [('运行反馈','P101.run'),('故障反馈','P101.fault'),('运行数值','P101.hz')]:page.get_by_label(label+' · 绑定测点',exact=True).select_option(value)
    select(reading);page.get_by_role('tab',name='动态与测点',exact=True).click();page.get_by_label('显示数值 · 绑定测点',exact=True).select_option('P101.hz')
    page.get_by_role('button',name='＋ 添加画面',exact=True).click();expect(page.locator('.screen-empty')).to_be_visible();child=page.locator('.screen-page-nav [aria-current=page]').get_attribute('data-page-id');assert child!='main'
    second=place('readout',600,350);page.get_by_role('tab',name='动态与测点',exact=True).click();page.get_by_label('显示数值 · 绑定测点',exact=True).select_option('P101.hz')
    select(second);page.get_by_role('tab',name='元素定义',exact=True).click();page.get_by_role('button',name='添加连接点',exact=True).click();page.get_by_label('连接点 1 名称',exact=True).fill('子画面出口');page.get_by_label('连接点 1 名称',exact=True).press('Tab');page.get_by_label('连接点 1 Y',exact=True).fill('75');page.get_by_label('连接点 1 Y',exact=True).press('Tab');port_id=page.locator('[data-port-definition]').get_attribute('data-port-definition')
    page.get_by_role('button',name='添加数据槽位',exact=True).click();page.get_by_label('槽位 2 名称',exact=True).fill('子画面附加值');page.get_by_label('槽位 2 名称',exact=True).press('Tab');expect(page.locator('.definition-error')).to_have_count(0);page.get_by_role('tab',name='动态与测点',exact=True).click();page.get_by_label('子画面附加值 · 绑定测点',exact=True).select_option('P101.hz')
    page.get_by_role('tab',name='图元与工具',exact=True).click();page.locator('[data-tool=pipe]').click();p=page.locator(f'[data-cell-id="{second}"] circle[port="{port_id}"]').bounding_box();b=page.locator('.board').bounding_box();page.mouse.move(p['x']+p['width']/2,p['y']+p['height']/2);page.mouse.down();page.mouse.move(b['x']+1100*b['width']/1920,b['y']+500*b['height']/1080,steps=15);page.mouse.up();expect(page.locator('.x6-edge')).to_have_count(1)
    child_doc=save()['pages'][0];pipe=child_doc['pipes'][0]['id'];select(pipe);page.get_by_role('tab',name='外观',exact=True).click();page.get_by_label('终点 X',exact=True).fill('1200');page.get_by_label('终点 X',exact=True).press('Tab');assert save()['pages'][0]['pipes'][0]['target']['x']==1200
    checks.append('子画面也可定义连接点和数据槽位、绑定附加数据并编辑管端；不误报跨页重复编号')
    back=place('text',600,200);page.get_by_label('文字内容',exact=True).fill('返回工艺');page.get_by_role('tab',name='交互',exact=True).click();page.get_by_label('点击动作',exact=True).select_option('navigate');page.get_by_label('目标画面',exact=True).select_option('main')
    page.locator('.screen-page-menu summary').click();page.get_by_label('当前画面名称',exact=True).fill('运行数据页');page.get_by_label('当前画面名称',exact=True).press('Tab');page.get_by_role('button',name='设为首页',exact=True).click()
    data=save();assert data['nodes'][0]['id']==pump and len(data['nodes'])==2 and data['pages'][0]['id']==child and len(data['pages'][0]['nodes'])==2 and data['defaultPageId']==child
    assert 'source' not in data['pages'][0] and data['source']['url']==url
    page.reload();expect(page.locator(f'[data-cell-id="{second}"]')).to_contain_text('38.50 Hz');expect(page.locator(f'.screen-page-nav [data-page-id="{child}"]')).to_have_attribute('aria-current','page')
    checks.append('添加、命名、首页、当前页重开及共享点表，项目保留各画面独立对象')
    nav('main');select(pump);page.get_by_role('tab',name='交互',exact=True).click();page.get_by_label('点击动作',exact=True).select_option('trend');page.get_by_label('趋势面板槽位',exact=True).select_option('value')
    page.locator(f'[data-cell-id="{pump}"]').click();expect(page.get_by_role('dialog')).to_have_count(0)
    select(reading);page.get_by_role('tab',name='交互',exact=True).click();page.get_by_label('点击动作',exact=True).select_option('navigate');page.get_by_label('目标画面',exact=True).select_option(child)
    nav(child);missing=place('readout',1100,350);nav('main')
    page.locator('.studio-header').get_by_role('button',name='预览发布',exact=True).click();expect(page.locator('.studio-header').get_by_role('button',name='发布',exact=True)).to_be_disabled()
    page.get_by_role('button',name='去绑定：数值仪表',exact=True).click();expect(page.locator(f'.screen-page-nav [data-page-id="{child}"]')).to_have_attribute('aria-current','page');expect(page.get_by_label('显示数值 · 绑定测点',exact=True)).to_be_visible();page.get_by_label('显示数值 · 绑定测点',exact=True).select_option('T101.level')
    checks.append('发布检查覆盖全部画面，漏绑问题直接定位到对应画面和元素')
    link=place('text',1150,140)
    page.get_by_label('文字内容',exact=True).fill('查看本地项目说明')
    page.get_by_label('图元名称',exact=True).fill('本地说明链接')
    page.get_by_role('tab',name='交互',exact=True).click()
    page.get_by_label('点击动作',exact=True).select_option('link')
    link_input=page.get_by_label('链接地址',exact=True)
    link_input.fill('not-a-web-url')
    link_input.press('Tab')
    page.get_by_role('button',name='预览发布',exact=True).click()
    expect(page.locator('.studio-header').get_by_role('button',name='发布',exact=True)).to_be_disabled()
    page.get_by_role('button',name='去配置：本地说明链接',exact=True).click()
    link_input.fill(base+'/api/draft')
    link_input.press('Tab')
    before_tabs=len(page.context.pages)
    page.locator(f'[data-cell-id="{link}"]').click()
    assert len(page.context.pages)==before_tabs
    final=save();page.locator('.studio-header').get_by_role('button',name='预览发布',exact=True).click();page.locator('.studio-header').get_by_role('button',name='发布',exact=True).click();expect(page.get_by_role('status')).to_contain_text('已发布')
    assert page.request.get(base+'/api/published').json()==final
    page.goto(base+'/view');expect(page.locator(f'[data-cell-id="{second}"]')).to_be_visible()
    page.locator(f'[data-cell-id="{back}"]').click();expect(page.locator(f'[data-cell-id="{pump}"]')).to_be_visible()
    for _ in range(3):
        page.locator(f'[data-cell-id="{pump}"]').click();expect(page.locator('.runtime-trend-host canvas')).to_have_count(1);expect(page.get_by_role('dialog')).to_contain_text('从打开面板开始采样');page.get_by_role('button',name='关闭详情',exact=True).click();expect(page.locator('.runtime-trend-host canvas')).to_have_count(0)
    page.locator(f'[data-cell-id="{reading}"]').click();expect(page.locator(f'[data-cell-id="{second}"]')).to_be_visible()
    with page.context.expect_page() as opened:
        page.locator(f'[data-cell-id="{link}"]').click()
    linked=opened.value
    linked.wait_for_url(base+'/api/draft')
    assert linked.evaluate('window.opener === null')
    linked.close()
    checks.append('链接校验与定位可用，编辑点击无动作，发布后新标签打开且无 opener')
    page.screenshot(path=str(OUT/'pages-published.png'))
    checks.append('编辑点击不执行，发布按首页启动，元素导航往返与趋势面板反复打开关闭')
    page.goto(base+'/?page='+child);select(second);page.get_by_label('图元名称',exact=True).fill('草稿中的频率仪表');draft=save();assert page.request.get(base+'/api/published').json()==final
    page.locator('.project-menu summary').click()
    with page.expect_download() as dl:page.get_by_role('button',name='导出离线演示',exact=True).click()
    file=OUT/'pages-offline.html';dl.value.save_as(file);local=browser.new_page(viewport={'width':1920,'height':1080});local.on('pageerror',lambda e:errors.append(str(e)));requests=[];local.on('request',lambda r:requests.append(r.url) if r.url.startswith('http') else None);local.goto(file.as_uri());expect(local.locator(f'[data-cell-id="{second}"]')).to_be_visible();local.locator(f'[data-cell-id="{back}"]').click();expect(local.locator(f'[data-cell-id="{pump}"]')).to_be_visible();assert not requests,requests;local.close()
    assert not errors,errors;checks.append('当前子画面导出仍携带整个项目，离线导航可用，编辑草稿不改变已发布内容')
    page.locator('.studio-header').get_by_role('button',name='预览发布',exact=True).click();page.locator('.studio-header').get_by_role('button',name='发布',exact=True).click();expect(page.get_by_role('status')).to_contain_text('已发布');assert page.request.get(base+'/api/published').json()==draft
    page.get_by_role('button',name='版本',exact=True).click();page.get_by_role('button',name='回退至此版',exact=True).click();assert page.request.get(base+'/api/published').json()==final;assert page.request.get(base+'/api/draft').json()==draft
    checks.append('多画面项目发布新版本后可回退整项目，草稿保持独立')
    (OUT/'document.json').write_text(json.dumps(draft,ensure_ascii=False,indent=2),encoding='utf-8')

def main():
    Fixture.mode='normal';fixture=ThreadingHTTPServer(('127.0.0.1',0),Fixture);threading.Thread(target=fixture.serve_forever,daemon=True).start()
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='screen-pages-') as data:
        server=subprocess.Popen(['node','apps/scada-designer/server.mjs'],cwd=ROOT,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_DATA_DIR':data},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(80):
                try:urlopen(base+'/api/draft',timeout=1);break
                except OSError:time.sleep(.1)
            with sync_playwright() as p:
                browser=p.chromium.launch();page=browser.new_page(viewport={'width':1920,'height':1080});page.set_default_timeout(15000)
                try:exercise(page,base,f'http://127.0.0.1:{fixture.server_port}/snapshot',browser)
                except Exception:page.screenshot(path=str(OUT/'failure.png'));raise
                finally:browser.close()
        finally:server.terminate();server.wait(timeout=15);fixture.shutdown();(OUT/'results.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'passed':len(checks),'evidence':str(OUT)},ensure_ascii=False))
if __name__=='__main__':main()
