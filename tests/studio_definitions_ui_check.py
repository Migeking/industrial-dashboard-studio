"""Production UI authoring of user-defined ports, data slots and display rules."""
import json,os,socket,subprocess,tempfile,threading,time
from pathlib import Path
from urllib.request import urlopen
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
from studio_screen_check import Fixture

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'works/scada-designer-stages/definitions'
OUT.mkdir(parents=True,exist_ok=True)
checks=[]

def exercise(page,base,url):
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    page.goto(base);expect(page.locator('.screen-empty')).to_be_visible()
    def place(symbol,x,y):
        old=set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'))
        page.locator(f'[data-{"tool" if symbol=="rect" else "symbol"}="{symbol}"]').click()
        box=page.locator('.board').bounding_box();page.mouse.click(box['x']+x*box['width']/1920,box['y']+y*box['height']/1080)
        expect(page.locator('.x6-node')).to_have_count(len(old)+1)
        return(set(page.locator('.x6-node').evaluate_all('(els)=>els.map(e=>e.dataset.cellId)'))-old).pop()
    def select(cell):
        page.get_by_role('tab',name='图层',exact=False).click();page.locator(f'[data-layer="{cell}"]').click(modifiers=['Alt'])
    def field(label,value):
        f=page.get_by_label(label,exact=True);f.fill(str(value));f.press('Tab')
    def save():
        with page.expect_response(lambda r:r.url==base+'/api/draft' and r.request.method=='POST') as response:page.get_by_role('button',name='保存草稿',exact=True).click()
        assert response.value.ok,response.value.text()
        return page.request.get(base+'/api/draft').json()
    def current(project):
        id=page.locator('.screen-page-nav [aria-current=page]').get_attribute('data-page-id')
        return project if id=='main' else next(p for p in project['pages'] if p['id']==id)
    def port(cell,id):
        box=page.locator(f'.x6-node[data-cell-id="{cell}"] circle[port="{id}"]').bounding_box();return(box['x']+box['width']/2,box['y']+box['height']/2)
    def record(name):checks.append({'check':name,'status':'passed'})

    shape=place('rect',220,400)
    page.get_by_role('tab',name='元素定义',exact=True).click()
    page.get_by_role('button',name='添加连接点',exact=True).click()
    field('连接点 1 名称','自定出口');field('连接点 1 Y',25)
    page.get_by_label('连接点 1 方向',exact=True).select_option('out')
    page.get_by_role('button',name='添加数据槽位',exact=True).click()
    field('槽位 1 名称','过程频率')
    page.get_by_label('槽位 1 用途',exact=True).select_option('value')
    page.get_by_label('槽位 1 必需绑定',exact=True).check()
    doc=save();source_id=doc['nodes'][0]['ports'][0]['id']
    assert doc['nodes'][0]['dataSlots'][0]['key']=='data_1'
    record('基础形状通过表单定义自定位置的连接点及必需数值槽位')
    page.get_by_role('tab',name='图元与工具',exact=True).click()
    pump=place('pump',880,420)
    page.get_by_role('tab',name='元素定义',exact=True).click()
    page.get_by_role('button',name='移除槽位 1',exact=True).click()
    page.get_by_role('button',name='添加数据槽位',exact=True).click()
    field('槽位 3 名称','自定义运行信号')
    page.get_by_label('槽位 3 用途',exact=True).select_option('run')
    page.get_by_label('槽位 3 必需绑定',exact=True).check()
    expect(page.get_by_label('槽位 3 类型',exact=True)).to_have_value('boolean')
    field('连接点 1 名称','泵进口')
    record('设备默认槽位可替换为用户定义编号并保留运行语义')

    page.get_by_role('tab',name='图元与工具',exact=True).click();page.locator('[data-tool=pipe]').click()
    a,b=port(shape,source_id),port(pump,'left')
    page.mouse.move(*a);page.mouse.down();page.mouse.move(a[0]+20,a[1],steps=3);page.mouse.move(*b,steps=15);page.mouse.up()
    expect(page.locator('.x6-edge')).to_have_count(1)
    select(shape);page.get_by_role('tab',name='元素定义',exact=True).click()
    before=save();path=page.locator('.x6-edge path:nth-child(2)');d=path.get_attribute('d')
    field('连接点 1 Y',75)
    expect(path).not_to_have_attribute('d',d)
    moved=save();assert moved['pipes'][0]['source']['portId']==source_id
    page.get_by_role('button',name='移除连接点 1',exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('仍有管道')
    assert save()['nodes'][0]['ports']==moved['nodes'][0]['ports']
    page.get_by_role('button',name='撤销',exact=True).click()
    undone=save();assert undone['nodes'][0]['ports']==before['nodes'][0]['ports']
    record('接口位置变更立即更新真实管道，受引用接口删除被阻止且失败不占撤销')

    select(shape);page.get_by_role('tab',name='动态与测点',exact=True).click();page.get_by_role('button',name='管理连接与点位',exact=True).click()
    dialog=page.get_by_role('dialog');dialog.get_by_label('来源',exact=True).select_option('rest');dialog.get_by_label('接口 URL',exact=True).fill(url);dialog.get_by_label('刷新周期（ms）',exact=True).fill('250');dialog.get_by_role('button',name='读取样本',exact=True).click();dialog.get_by_role('button',name='从桥接点表生成映射',exact=True).click();dialog.get_by_role('button',name='应用数据配置',exact=True).click()
    expect(page.get_by_label('过程频率 · 绑定测点',exact=True)).to_be_visible()
    choose=page.get_by_role('button',name='过程频率 · 选择测点',exact=True)
    choose.click()
    picker=page.get_by_role('dialog',name='选择测点')
    expect(picker).to_be_visible()
    point_search=picker.get_by_label('查找候选测点',exact=True)
    point_search.fill('P101.run')
    expect(picker).to_contain_text('没有匹配的测点')
    point_search.fill('P101.hz')
    result=picker.get_by_role('row').filter(has_text='P101.hz')
    expect(result).to_contain_text('38.5 Hz')
    expect(result).to_contain_text('有效')
    Fixture.mode='zero'
    expect(result).to_contain_text('0 Hz')
    Fixture.mode='bad'
    expect(result).to_contain_text('无效')
    Fixture.mode='normal'
    expect(result).to_contain_text('38.5 Hz')
    page.screenshot(path=str(OUT/'typed-point-picker.png'))
    result.get_by_role('button').click()
    expect(picker).not_to_be_visible()
    expect(page.get_by_label('过程频率 · 绑定测点',exact=True)).to_have_value('P101.hz')
    choose.click()
    point_search.press('Escape')
    expect(picker).not_to_be_visible()
    expect(choose).to_be_focused()
    expect(page.get_by_label('过程频率 · 绑定测点',exact=True)).to_have_value('P101.hz')
    record('候选测点表按类型与搜索筛选，实时预览零值和坏质量，选点和取消返回原槽位')
    select(pump);page.get_by_role('tab',name='动态与测点',exact=True).click()
    page.get_by_label('自定义运行信号 · 绑定测点',exact=True).select_option('P101.run')
    assert 'P101.hz' not in page.get_by_label('自定义运行信号 · 绑定测点',exact=True).locator('option').evaluate_all('(els)=>els.map(e=>e.value)')
    page.get_by_label('故障反馈 · 绑定测点',exact=True).select_option('P101.fault')
    expect(page.locator(f'[data-cell-id="{pump}"]')).to_have_attribute('data-state','运行')
    record('自定数据槽位按类型选点、返回原对象并驱动设备真实状态')

    select(shape);page.get_by_role('button',name='添加规则',exact=True).click()
    page.get_by_label('规则 1 条件',exact=True).select_option('gte');field('规则 1 比较值',30)
    expect(page.locator(f'.x6-node[data-cell-id="{shape}"] rect')).to_have_attribute('fill','#d98b45')
    for mode,color,text in [('zero','#e5edf2','0.00 Hz'),('bad','#9baab5','—'),('normal','#d98b45','38.50 Hz')]:
        Fixture.mode=mode
        expect(page.locator(f'.x6-node[data-cell-id="{shape}"] rect')).to_have_attribute('fill',color)
        expect(page.locator(f'.x6-node[data-cell-id="{shape}"]')).to_contain_text(text)
    page.get_by_role('tab',name='元素定义',exact=True).click();page.get_by_role('button',name='移除槽位 1',exact=True).click();expect(page.get_by_role('alert')).to_contain_text('显示规则')
    record('条件颜色规则、数值零、坏质量及规则引用保护')
    select(shape);page.locator(f'[data-layer="{pump}"]').click(modifiers=['Shift'])
    page.get_by_role('tab',name='我的图元',exact=True).click()
    page.get_by_label('我的图元名称',exact=True).fill('自绘设备支路')
    page.get_by_role('button',name='保存选中为图元',exact=True).click()
    expect(page.locator('[data-user-symbol]')).to_have_count(1)
    with page.expect_download() as download:page.get_by_role('button',name='导出图元',exact=True).click()
    symbol_file=OUT/'custom-branch.symbol.json';download.value.save_as(symbol_file)
    exported=json.loads(symbol_file.read_text(encoding='utf-8'));assert len(exported['nodes'])==2 and len(exported['pipes'])==1
    page.get_by_role('button',name='移除图元',exact=True).click()
    expect(page.locator('.x6-node')).to_have_count(2)
    page.get_by_role('button',name='新建画面',exact=True).click();expect(page.locator('.screen-empty')).to_be_visible()
    page.get_by_role('tab',name='我的图元',exact=True).click();page.get_by_label('导入我的图元',exact=True).set_input_files(symbol_file)
    page.get_by_role('button',name='放置 自绘设备支路',exact=True).click()
    box=page.locator('.board').bounding_box();page.mouse.click(box['x']+200*box['width']/1920,box['y']+350*box['height']/1080)
    expect(page.locator('.x6-node')).to_have_count(2);expect(page.locator('.x6-edge')).to_have_count(1)
    reused=current(save());assert reused['nodes'][0]['id']!=shape and all(not n['bindings'] for n in reused['nodes'])
    assert reused['pipes'][0]['source']['portId']==source_id
    shape=next(n['id'] for n in reused['nodes'] if n['symbol']=='rect');pump=next(n['id'] for n in reused['nodes'] if n['symbol']=='pump')
    select(shape);page.get_by_role('tab',name='动态与测点',exact=True).click();page.get_by_label('过程频率 · 绑定测点',exact=True).select_option('P101.hz')
    select(pump);page.get_by_role('tab',name='动态与测点',exact=True).click();page.get_by_label('自定义运行信号 · 绑定测点',exact=True).select_option('P101.run');page.get_by_label('故障反馈 · 绑定测点',exact=True).select_option('P101.fault')
    select(shape);page.get_by_role('tab',name='元素定义',exact=True).click()
    record('自画组合存为我的图元、导出导入到另一张空画面，接口槽位规则保留且新实例重新绑定')
    geometry=current(save())
    page.get_by_label('画布缩放',exact=True).select_option('1')
    page.wait_for_function('Math.abs(document.querySelector(".board").getBoundingClientRect().width-1920)<1')
    before_pan=page.locator(f'.x6-node[data-cell-id="{shape}"]').bounding_box()
    page.get_by_role('button',name='平移',exact=True).click()
    board=page.locator('main').bounding_box();a=(board['x']+board['width']/2,board['y']+board['height']/2)
    page.mouse.move(*a);page.mouse.down();page.mouse.move(a[0]+60,a[1]+25,steps=10);page.mouse.up()
    after_pan=page.locator(f'.x6-node[data-cell-id="{shape}"]').bounding_box();assert abs(after_pan['x']-before_pan['x']-60)<2
    assert current(save())['nodes']==geometry['nodes']
    page.get_by_role('button',name='平移',exact=True).click()
    page.get_by_role('button',name='适应画面',exact=True).click()
    expect(page.locator('.ruler-horizontal i')).not_to_have_count(0)
    page.get_by_role('button',name='收起图元面板',exact=True).click();expect(page.locator('.navigator')).not_to_be_visible()
    page.get_by_role('button',name='收起属性面板',exact=True).click();expect(page.locator('.inspector')).not_to_be_visible()
    page.get_by_role('button',name='展开图元面板',exact=True).click();page.get_by_role('button',name='展开属性面板',exact=True).click()
    record('标尺、手动缩放、指针平移和面板收起不改变世界坐标与已连接对象')
    page.locator('.screen-page-menu summary').click();page.get_by_role('button',name='设为首页',exact=True).click()
    page.screenshot(path=str(OUT/'custom-definition-editor.png'))
    final=save();page.reload();expect(page.locator('.x6-edge')).to_have_count(1);assert page.request.get(base+'/api/draft').json()==final
    page.locator('.studio-header').get_by_role('button',name='预览发布',exact=True).click();page.locator('.studio-header').get_by_role('button',name='发布',exact=True).click();expect(page.get_by_role('status')).to_contain_text('已发布')
    assert page.request.get(base+'/api/published').json()==final
    page.goto(base+'/view');expect(page.locator(f'[data-cell-id="{pump}"]')).to_have_attribute('data-state','运行')
    page.locator(f'[data-cell-id="{shape}"]').click();expect(page.get_by_role('dialog')).to_contain_text('过程频率');page.get_by_role('button',name='关闭详情',exact=True).click()
    page.screenshot(path=str(OUT/'custom-definition-published.png'))
    record('自定接口、槽位、规则保存重开与发布一致，基础形状可查看自定读数')
    page.goto(base);page.locator('.project-menu summary').click()
    with page.expect_download() as download:page.get_by_role('button',name='导出离线演示',exact=True).click()
    offline=OUT/'custom-definition-offline.html';download.value.save_as(offline)
    page.goto(offline.as_uri());expect(page.locator(f'[data-cell-id="{shape}"] rect')).to_have_attribute('fill','#d98b45');expect(page.locator('.x6-edge')).to_have_count(1)
    assert not errors,errors
    record('离线包携带自定定义与规则，全部过程无脚本错误')
    (OUT/'document.json').write_text(json.dumps(final,ensure_ascii=False,indent=2),encoding='utf-8')

def main():
    Fixture.mode='normal';fixture=ThreadingHTTPServer(('127.0.0.1',0),Fixture);threading.Thread(target=fixture.serve_forever,daemon=True).start()
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='screen-definitions-') as data:
        server=subprocess.Popen(['node','apps/scada-designer/server.mjs'],cwd=ROOT,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_DATA_DIR':data},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(80):
                try:urlopen(base+'/api/draft',timeout=1);break
                except OSError:time.sleep(.1)
            with sync_playwright() as p:
                browser=p.chromium.launch();page=browser.new_page(viewport={'width':1920,'height':1080});page.set_default_timeout(15000)
                try:exercise(page,base,f'http://127.0.0.1:{fixture.server_port}/snapshot')
                except Exception:page.screenshot(path=str(OUT/'failure.png'));raise
                finally:browser.close()
        finally:
            server.terminate();server.wait(timeout=15);fixture.shutdown();(OUT/'results.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'passed':len(checks),'evidence':str(OUT)},ensure_ascii=False))

if __name__=='__main__':main()
