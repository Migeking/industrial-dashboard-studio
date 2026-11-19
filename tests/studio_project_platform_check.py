"""Run the project portal, original cases and isolated editor sessions in Chromium."""
import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'works/project-platform-acceptance'


def project_id(page):
    return parse_qs(urlsplit(page.url).query)['project'][0]


def check(page, base):
    page.goto(base)
    expect(page).to_have_url(base + '/projects')
    expect(page.get_by_role('heading', name='项目管理', exact=True)).to_be_visible()
    initial = page.request.get(base + '/api/projects').json()
    cases = initial['cases']
    expected_case_ids = {f'{i:02}' for i in range(1, 31)}
    if (ROOT / 'scenarios/custom-cso/05-cso-ss02-odor-safety-ventilation.html').is_file():
        expected_case_ids.add('cso-05')
    assert {row['id'] for row in cases} == expected_case_ids
    for row in cases:
        assert page.request.get(base + row['url']).ok, row['id']
        assert page.request.get(base + row['thumbnail']).ok, row['id']

    page.get_by_role('navigation',name='工作台导航').get_by_role('link', name='案例库').click()
    expect(page.locator('.case-card')).to_have_count(len(expected_case_ids))
    page.get_by_label('行业',exact=True).select_option('process-control')
    expect(page.locator('.case-card')).to_have_count(2)
    page.get_by_label('搜索',exact=True).fill('连续分离')
    expect(page.locator('.case-card')).to_have_count(1)
    with page.expect_popup() as popup_wait:
        page.get_by_role('link',name='查看原版 ↗').click()
    original = popup_wait.value
    original.wait_for_load_state('load')
    expect(original).to_have_title('连续分离工艺 · 浅色驾驶舱')
    assert original.evaluate("typeof Vue !== 'undefined' && typeof echarts !== 'undefined'")
    original.close()
    page.get_by_role('button',name='新建关联工程').click()
    expect(page.get_by_role('dialog')).to_contain_text('创建一张空白画布')
    page.get_by_label('工程名称').fill('分离工艺验收')
    page.get_by_role('button',name='创建并打开').click()
    expect(page.locator('.studio-header .project-title')).to_have_text('分离工艺验收')
    first = project_id(page)
    page.get_by_label('名称',exact=True).fill('分离工艺 · 已编辑')
    page.get_by_role('link',name='项目管理',exact=True).click()
    # The default Playwright response dismisses the unsaved-change confirmation.
    expect(page.get_by_role('button',name='保存草稿',exact=True)).to_be_visible()
    page.get_by_role('button',name='保存草稿',exact=True).click()
    expect(page.locator('.save-state')).to_have_text('草稿已保存')
    page.get_by_role('button',name='预览发布',exact=True).click()
    page.get_by_role('button',name='发布',exact=True).click()
    expect(page.locator('.status-message')).to_contain_text('已发布')
    doc = page.request.get(base + '/api/published?project=' + first).json()
    assert doc['title'] == '分离工艺 · 已编辑'
    assert page.request.get(base + '/api/published').status == 404

    page.get_by_role('link',name='项目管理',exact=True).click()
    row = page.locator('.project-row').filter(has_text='分离工艺验收')
    expect(row).to_contain_text('已发布')
    expect(row.get_by_role('link',name='查看发布')).to_have_attribute('href','/view?project='+first)
    row.get_by_label('工程操作').click()
    row.get_by_role('button',name='复制草稿').click()
    page.get_by_label('工程名称').fill('另一份草稿')
    page.get_by_role('button',name='创建并打开').click()
    expect(page.locator('.studio-header .project-title')).to_have_text(doc['title'])
    second = project_id(page)
    assert second != first
    assert page.request.get(base + '/api/published?project=' + second).status == 404
    page.get_by_label('名称',exact=True).fill('另一份草稿 · 已编辑')
    page.get_by_role('button',name='保存草稿',exact=True).click()
    expect(page.locator('.save-state')).to_have_text('草稿已保存')
    assert page.request.get(base + '/api/draft?project=' + first).json() == doc
    assert page.request.get(base + '/api/draft?project=' + second).json()['title']=='另一份草稿 · 已编辑'

    page.get_by_role('link',name='项目管理',exact=True).click()
    row = page.locator('.project-row').filter(has_text='另一份草稿')
    row.get_by_label('工程操作').click()
    row.get_by_role('button',name='重命名').click()
    page.get_by_label('工程名称').fill('独立监控工程')
    page.get_by_role('button',name='保存名称').click()
    expect(page.get_by_role('heading',name='独立监控工程')).to_be_visible()
    page.locator('input[type=file]').set_input_files({
        'name':'import.json','mimeType':'application/json',
        'buffer':json.dumps(doc,ensure_ascii=False).encode('utf-8'),
    })
    expect(page.locator('.studio-header .project-title')).to_have_text(doc['title'])
    assert project_id(page) not in [first,second]
    page.get_by_role('link',name='项目管理',exact=True).click()
    page.get_by_role('navigation',name='工作台导航').get_by_role('link',name='案例库').click()
    expect(page.locator('.case-card')).to_have_count(len(expected_case_ids))
    page.get_by_label('搜索',exact=True).fill('15')
    page.get_by_role('button',name='查看 2 个关联工程').click()
    expect(page.locator('.project-row')).to_have_count(2)
    expect(page.get_by_role('button',name='清除案例筛选 ×')).to_be_visible()
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth === innerWidth')

    original_release = page.request.get(base + '/api/versions?project=' + first).json()['active']
    revised = {**doc, 'title': '分离工艺 · 二版草稿'}
    assert page.request.post(base + '/api/publish?project=' + first, data=revised).ok
    assert page.request.post(base + '/api/rollback?project=' + first, data={'id':original_release}).ok
    page.set_viewport_size({'width':1366,'height':768})
    page.goto(base + '/projects')
    row = page.locator('.project-row').filter(has_text='分离工艺验收')
    row.get_by_label('工程操作').click()
    with page.expect_download() as download:
        row.get_by_role('link', name='下载工程备份', exact=True).click()
    file = OUT / 'project-backup.json'
    download.value.save_as(file)
    archive = json.loads(file.read_text('utf-8'))
    assert archive['projectId'] == first and archive['project']['active'] == original_release
    assert archive['project']['draft'] == revised and len(archive['project']['versions']) == 2
    page.locator('input[type=file]').set_input_files(file)
    expect(page.locator('.studio-header .project-title')).to_have_text(revised['title'])
    restored = project_id(page)
    assert restored not in [first, second]
    assert page.request.get(base + '/api/draft?project=' + restored).json() == revised
    assert page.request.get(base + '/api/published?project=' + restored).json() == doc
    assert page.request.get(base + '/api/published?project=' + first).json() == doc
    records = page.request.get(base + '/api/versions?project=' + restored).json()
    assert records['active'] == original_release
    assert all(v['documentMatches'] and v['manifest']['projectId'] == first for v in records['versions'])
    corrupted = json.loads(file.read_text('utf-8'))
    corrupted['project']['versions'][0]['doc']['title'] = '损坏的版次'
    project_count = len(page.request.get(base + '/api/projects').json()['projects'])
    failure = page.request.post(base + '/api/project-restore', data=corrupted)
    assert not failure.ok and '追溯记录与文档不一致' in failure.json()['error']
    assert len(page.request.get(base + '/api/projects').json()['projects']) == project_count


def main():
    OUT.mkdir(exist_ok=True,parents=True)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0))
        port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory() as directory:
        process=subprocess.Popen(['node','apps/scada-designer/server.mjs'],cwd=ROOT,
            env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_DATA_DIR':directory,'STUDIO_ENTRY':'projects'},
            creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(100):
                try:
                    urlopen(base+'/api/projects',timeout=1).close()
                    break
                except OSError:
                    time.sleep(.1)
            with sync_playwright() as pw:
                browser=pw.chromium.launch()
                page=browser.new_page(viewport={'width':1366,'height':768})
                errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                try:
                    check(page,base)
                    assert not errors,errors
                except Exception:
                    page.screenshot(path=str(OUT/'failure.png'))
                    raise
                finally:
                    browser.close()
        finally:
            process.terminate()
            process.wait(timeout=15)
    print('PASS: portal, case association, isolated projects, import, full backup, separate restore, checksum rejection and mobile layout')


if __name__=='__main__':
    main()
