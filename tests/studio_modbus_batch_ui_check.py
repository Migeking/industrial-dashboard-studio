"""Configure a Modbus table without connecting to or writing a field device."""
import json,os,socket,subprocess,tempfile,time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'works/scada-designer-stages/modbus-batch';OUT.mkdir(parents=True,exist_ok=True)
def main():
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='screen-batch-') as data:
        server=subprocess.Popen(['node','apps/scada-designer/server.mjs'],cwd=ROOT,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_DATA_DIR':data},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(80):
                try:urlopen(base+'/api/draft',timeout=1);break
                except OSError:time.sleep(.1)
            with sync_playwright() as p:
                browser=p.chromium.launch();page=browser.new_page(viewport={'width':1366,'height':768});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base);page.get_by_role('button',name='管理连接与点位',exact=True).click();d=page.get_by_role('dialog');d.get_by_label('来源',exact=True).select_option('modbus');d.get_by_label('Modbus 主机',exact=True).fill('127.0.0.1');d.get_by_role('button',name='批量地址',exact=True).click()
                for label,value in [('批量编号前缀','AI_'),('批量起始序号','101'),('批量点数','10')]:d.get_by_label(label,exact=True).fill(value)
                d.get_by_label('批量数据格式',exact=True).select_option('float32');expect(d.get_by_label('批量地址步长',exact=True)).to_have_value('2');d.get_by_label('批量字节顺序',exact=True).select_option('CDAB');d.get_by_role('button',name='添加这批点位',exact=True).click();expect(d.locator('.tag-selected tbody tr')).to_have_count(10)
                # Duplicate batch rejection must leave the table unchanged.
                d.get_by_role('button',name='批量地址',exact=True).click();d.get_by_role('button',name='添加这批点位',exact=True).click();expect(d).to_contain_text('点位编号已存在');expect(d.locator('.tag-selected tbody tr')).to_have_count(10)
                d.get_by_role('button',name='取消批量',exact=True).click();page.screenshot(path=str(OUT/'configured-1366.png'));d.get_by_role('button',name='完成并返回画布',exact=True).click();expect(d).to_have_count(0)
                with page.expect_response(lambda r:r.url==base+'/api/draft' and r.request.method=='POST'):page.get_by_role('button',name='保存草稿',exact=True).click()
                doc=page.request.get(base+'/api/draft').json();points=doc['source']['connection']['points'];assert len(points)==10 and points[0]['address']==100 and points[-1]['address']==118 and all(x['order']=='CDAB' and x['function']==4 for x in points);assert len(doc['mappings'])==10
                assert not errors,errors;(OUT/'document.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
        finally:server.terminate();server.wait(timeout=15)
    (OUT/'results.json').write_text(json.dumps({'passed':3,'checks':['1366 点表批量创建及属性','重复提交整体拒绝无部分修改','应用、保存与协议零基地址/字序/映射一致'],'scope':'configuration only, no field read/write'},ensure_ascii=False,indent=2),encoding='utf-8');print('PASS: Modbus batch UI, conflicts and persistence')
if __name__=='__main__':main()
