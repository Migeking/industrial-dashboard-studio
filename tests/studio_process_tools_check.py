"""Production process tools: open pipe ends, reconnect, presets and control valve."""
import json,os,socket,subprocess,tempfile,threading,time
from pathlib import Path
from urllib.request import urlopen
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'works/scada-designer-stages/process';OUT.mkdir(parents=True,exist_ok=True)
checks=[]
class Source(BaseHTTPRequestHandler):
    mode='normal'
    def log_message(self,*_):pass
    def do_GET(self):
        rows=[{'id':k,'label':k,'kind':kind,'value':value,'unit':unit,'quality':'bad' if self.mode=='bad' else 'good','receivedAt':int(time.time()*1000)} for k,kind,value,unit in [('pump.run','boolean',True,''),('pump.fault','boolean',False,''),('valve.position','number',0 if self.mode=='zero' else 38.5,'%'),('valve.fault','boolean',self.mode=='fault',''),('tank.level','number',3.2,'m')]]
        body=json.dumps({'points':rows}).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body)

def exercise(page,base,url,browser):
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    page.goto(base);expect(page.locator('.screen-empty')).to_be_visible()
    def point(x,y):
        b=page.locator('.board').bounding_box();return(b['x']+x*b['width']/1920,b['y']+y*b['height']/1080)
    def place(kind,x,y):
        before=set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'));page.get_by_role('tab',name='图元与工具',exact=True).click();page.locator(f'[data-symbol="{kind}"]').click();page.mouse.click(*point(x,y));expect(page.locator('.x6-node')).to_have_count(len(before)+1);return(set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'))-before).pop()
    def select(id):page.get_by_role('tab',name='图层',exact=False).click();page.locator(f'[data-layer="{id}"]').click()
    def node(id):return page.locator(f'.x6-node[data-cell-id="{id}"]')
    def port(id,name):
        b=node(id).locator(f'circle[port="{name}"]').bounding_box();return(b['x']+b['width']/2,b['y']+b['height']/2)
    def save():
        with page.expect_response(lambda r:r.url==base+'/api/draft' and r.request.method=='POST') as r:page.get_by_role('button',name='保存草稿',exact=True).click()
        assert r.value.ok,r.value.text();return page.request.get(base+'/api/draft').json()
    pump=place('pump',350,400)
    page.get_by_label('外观预设',exact=True).select_option('detailed');expect(node(pump).locator('circle').first).to_have_attribute('fill',__import__('re').compile(r'^url\('))
    page.get_by_label('位号位置',exact=True).select_option('top');expect(node(pump).locator('text').first).to_have_attribute('y','-10')
    page.get_by_role('tab',name='图元与工具',exact=True).click();page.locator('[data-tool=pipe]').click()
    a,b=port(pump,'right'),point(920,480);page.mouse.move(*a);page.mouse.down();page.mouse.move(*b,steps=18);page.mouse.up();expect(page.locator('.x6-edge')).to_have_count(1)
    first=save();pipe=first['pipes'][0]['id'];assert first['pipes'][0]['source']['nodeId']==pump and not first['pipes'][0]['target'].get('nodeId')
    valve=place('valve',1150,410);tank=place('tank',80,380)
    select(pipe);page.get_by_label('终点元素',exact=True).select_option(valve);page.get_by_label('终点连接点',exact=True).select_option('left')
    page.get_by_label('管道箭头',exact=True).select_option('forward');page.get_by_label('管道流动方向',exact=True).select_option('reverse')
    expect(page.locator('.x6-edge-label path')).to_have_count(1)
    connected=save();assert connected['pipes'][0]['target']=={'nodeId':valve,'portId':'left'}
    page.get_by_label('终点元素',exact=True).select_option('')
    handle=page.locator('[data-tool-name="target-arrowhead"]');box=handle.bounding_box();a=(box['x']+box['width']/2,box['y']+box['height']/2)
    page.mouse.move(*a);page.mouse.down();page.mouse.move(*port(valve,'left'),steps=15);page.mouse.up()
    assert save()['pipes'][0]['target']=={'nodeId':valve,'portId':'left'}
    checks.append('设备到开放管端、属性重新连接及拖动端点手柄，箭头与流向可配')
    page.get_by_role('tab',name='图元与工具',exact=True).click();page.locator('[data-tool=pipe]').click();page.mouse.move(*point(400,850));page.mouse.down();page.mouse.move(*point(1000,850),steps=12);page.mouse.up()
    expect(page.locator('.x6-edge')).to_have_count(2);openpipe=save()['pipes'][-1];assert all(not openpipe[k].get('nodeId') for k in ['source','target']);assert 'created' not in openpipe
    checks.append('从空白拖画两端开放的正交管道，并保留未连接状态')
    select(valve);page.get_by_label('阀门类型',exact=True).select_option('control');page.get_by_label('外观预设',exact=True).select_option('detailed')
    page.get_by_role('tab',name='动态与测点',exact=True).click();page.get_by_role('button',name='管理连接与点位',exact=True).click()
    dialog=page.get_by_role('dialog');dialog.get_by_label('来源',exact=True).select_option('rest');dialog.get_by_label('接口 URL',exact=True).fill(url);dialog.get_by_label('刷新周期（ms）',exact=True).fill('250');dialog.get_by_role('button',name='读取样本',exact=True).click();dialog.get_by_role('button',name='从桥接点表生成映射',exact=True).click();dialog.get_by_role('button',name='应用数据配置',exact=True).click()
    page.get_by_label('开度 · 绑定测点',exact=True).select_option('valve.position');page.get_by_label('故障反馈 · 绑定测点',exact=True).select_option('valve.fault')
    for mode,state in [('normal','开启'),('zero','关闭'),('bad','未知'),('fault','故障'),('normal','开启')]:Source.mode=mode;expect(node(valve)).to_have_attribute('data-state',state)
    select(pump);page.get_by_label('运行反馈 · 绑定测点',exact=True).select_option('pump.run');page.get_by_label('故障反馈 · 绑定测点',exact=True).select_option('pump.fault')
    select(tank);page.get_by_label('液位 · 绑定测点',exact=True).select_option('tank.level');page.get_by_role('tab',name='外观',exact=True).click();page.get_by_label('液位填充方向',exact=True).select_option('down');page.get_by_label('外观预设',exact=True).select_option('detailed')
    water=node(tank).locator('rect').nth(2);expect(water).to_have_attribute('y','29')
    checks.append('经典/精细图元、位号位置、液位方向及调节阀数值开度、零和质量故障优先级')
    fan=place('fan',420,80);page.get_by_label('外观预设',exact=True).select_option('detailed');expect(node(fan).locator('circle').first).to_have_attribute('fill',__import__('re').compile(r'^url\('));page.get_by_role('tab',name='动态与测点',exact=True).click();page.get_by_label('运行反馈 · 绑定测点',exact=True).select_option('pump.run');page.get_by_label('故障反馈 · 绑定测点',exact=True).select_option('pump.fault');page.get_by_role('tab',name='外观',exact=True).click()
    reading=place('readout',850,80);page.get_by_label('外观预设',exact=True).select_option('detailed');expect(node(reading).locator('rect').first).to_have_attribute('fill',__import__('re').compile(r'^url\('));page.get_by_label('指标符号',exact=True).select_option('≈');page.get_by_role('tab',name='动态与测点',exact=True).click();page.get_by_label('显示数值 · 绑定测点',exact=True).select_option('tank.level');page.get_by_role('tab',name='外观',exact=True).click();checks.append('风机与数值仪表独立配置精细预设、指标符号和类型匹配绑定')
    picture=place('checkValve',1450,240)
    page.get_by_label('外观预设',exact=True).select_option('picture')
    page.get_by_role('button',name='预览发布',exact=True).click()
    expect(page.locator('.studio-header').get_by_role('button',name='发布',exact=True)).to_be_disabled()
    expect(page.locator('.screen-review-issue')).to_contain_text('尚未载入设备图片')
    page.get_by_role('button',name='去配置：CV-101',exact=True).click()
    expect(page.get_by_role('tab',name='外观',exact=True)).to_have_attribute('aria-selected','true')
    page.get_by_label('载入设备图片',exact=True).set_input_files(ROOT/'apps/scada-designer/examples/assets/check-valve.png')
    expect(node(picture).locator('image')).to_have_attribute('visibility','visible')
    checks.append('发布前发现缺少图片并定位外观，上传后完成发布')
    data=save();page.screenshot(path=str(OUT/'process-editor.png'));page.reload();expect(page.locator('.x6-edge')).to_have_count(2);assert page.request.get(base+'/api/draft').json()==data
    page.locator('.studio-header').get_by_role('button',name='预览发布',exact=True).click();page.locator('.studio-header').get_by_role('button',name='发布',exact=True).click();expect(page.get_by_role('status')).to_contain_text('已发布')
    page.goto(base+'/view');expect(node(valve)).to_have_attribute('data-state','开启');expect(page.locator('.x6-edge-label path')).to_have_count(1);page.screenshot(path=str(OUT/'process-published.png'))
    page.goto(base);page.locator('.project-menu summary').click()
    with page.expect_download() as dl:page.get_by_role('button',name='导出离线演示',exact=True).click()
    file=OUT/'process-offline.html';dl.value.save_as(file);local=browser.new_page();local.on('pageerror',lambda e:errors.append(str(e)));local.goto(file.as_uri());expect(local.locator('.x6-edge')).to_have_count(2);expect(local.locator('.x6-edge-label path')).to_have_count(1);local.close()
    assert not errors,errors;checks.append('开放端、重新连接、图元参数和箭头在草稿、发布与离线中一致')
    (OUT/'document.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')

def main():
    fixture=ThreadingHTTPServer(('127.0.0.1',0),Source);threading.Thread(target=fixture.serve_forever,daemon=True).start()
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='screen-process-') as data:
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
