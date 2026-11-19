"""Opt-in real Ollama acceptance. Every design batch is requested through production UI."""
import json,os,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'works/scene13-real-model';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('STUDIO_TEST_URL','http://127.0.0.1:8139')
PROMPTS=[
'从空白画布画13号高密度絮凝沉淀工段的主流程。本批只放7个图元，暂不接管、不绑定。依次为FT101进水流量仪表(readout,x=40,y=420,w=240,h=100)、TK101快速混合池(tank,x=400,y=350,w=220,h=300)、TK102絮凝池(tank,x=850,y=350,w=220,h=300)、TK103斜管沉淀池(tank,x=1300,y=350,w=260,h=300)、FT102出水流量仪表(readout,x=1640,y=420,w=240,h=100)、M101快速搅拌电机(fan,x=450,y=150,w=140,h=130)、M102慢速搅拌电机(fan,x=890,y=150,w=140,h=130)。title包含编号和中文名，bindings留空，所有单位暂留空。',
'保持已有7个图元的位置和绑定不变。本批只补7个图元，暂不接管、不绑定：PAC药箱(tank,x=40,y=140,w=130,h=180)、P201 PAC投加泵(pump,x=220,y=180,w=140,h=110)、PAM药箱(tank,x=650,y=140,w=130,h=180)、P202 PAM投加泵(pump,x=1080,y=180,w=140,h=110)、P301污泥回流泵(pump,x=700,y=830,w=170,h=130)、P302排泥泵(pump,x=1400,y=830,w=170,h=130)、脱水机房(text,x=1670,y=860,w=210,h=60)。title使用编号与中文名，bindings留空，单位留空。',
'本批只新增12条管道，不增加或移动图元，也不绑定数据。请按以下12条逐条连接，括号是必须使用的接口方向，转折点必须原样保留：1.FT101(right)→TK101(left)；2.TK101(right)→TK102(left)；3.TK102(right)→TK103(left)；4.TK103(right)→FT102(left)；5.PAC(right)→P201(left)；6.P201(right)→TK101(top)，转折点(380,235)、(380,320)、(510,320)；7.PAM(right)→P202(left)，转折点(810,230)、(810,110)、(1050,110)、(1050,235)；8.P202(right)→TK102(top)，转折点(1240,235)、(1240,320)、(960,320)；9.TK103(bottom)→P301(right)，转折点(1430,760)、(950,760)；10.P301(left)→TK101(bottom)，转折点(600,1000)、(510,1000)；11.TK103(bottom)→P302(top)；12.P302(right)→脱水机房(left)。未指定转折点时vertices填空数组。搅拌电机不接工艺管，以上加药管折线用于避开电机。',
'当前14个图元尚未绑定。本批只给已有图元绑定，不新增、不移动、不接管。必须在nodes数组中逐个列出13个已有设备，key使用上下文设备key，仅需key和bindings，不必重复几何，在bindings中填写真实点ID。不能只在summary里说完成。使用允许的点表：TK101/TK102/TK103各池和PAC/PAM药箱的value绑定对应.level点；FT101和FT102仪表value绑定对应.flow点；M101、M102、P201、P202、P301、P302的run/fault/value分别绑定对应.run/.fault/.hz。所有25个点各使用一次，已有绑定保持不变。不要绑定管道。'
]

def main():
 with sync_playwright() as p:
  browser=p.chromium.launch();page=browser.new_page(viewport={'width':1920,'height':1080});page.set_default_timeout(20000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)));results=[]
  try:
   page.goto(BASE+'/?assistant=1');panel=page.get_by_role('region',name='辅助设计')
   original=page.request.get(BASE+'/api/draft').json();resume=int(os.environ.get('STUDIO_RESUME_BATCH','1'))
   if resume>1 and (OUT/'progress.json').exists():results=json.loads((OUT/'progress.json').read_text('utf-8'))
   if resume==1:assert original['nodes']==[] and original['pipes']==[]
   def save():
    with page.expect_response(lambda r:r.url==BASE+'/api/draft' and r.request.method=='POST') as r:page.get_by_role('button',name='保存草稿',exact=True).click()
    assert r.value.ok,r.value.text();return page.request.get(BASE+'/api/draft').json()
   before=original
   if os.environ.get('STUDIO_REWIRE')=='1' or os.environ.get('STUDIO_CLEAR_PIPES')=='1':
    page.get_by_role('tab',name='图层',exact=False).click()
    for pipe in original['pipes']:
     page.locator('[data-layer="'+pipe['id']+'"]').click();page.keyboard.press('Delete')
    before=save();assert not before['pipes']
   for index,prompt in enumerate(PROMPTS):
    if index+1<resume or os.environ.get("STUDIO_REWIRE")=="1" and index==3:continue
    if index==3:panel.get_by_role('button',name='使用当前点表（25 个）',exact=True).click()
    panel.get_by_label('设计需求',exact=True).fill(prompt);started=time.time();print(f'Real model UI batch {index+1} started',flush=True)
    with page.expect_response(lambda r:r.url==BASE+'/api/assistant/propose',timeout=1200000) as response:panel.get_by_role('button',name='生成设计预演',exact=True).click()
    data=response.value.json();(OUT/f'batch-{index+1}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),'utf-8')
    assert response.value.ok,data;assert data.get('proposal'),data
    expect(panel.get_by_role('button',name='确认应用到画布',exact=True)).to_be_enabled()
    assert page.request.get(BASE+'/api/draft').json()==before
    page.screenshot(path=str(OUT/f'{index+1}-preview.png'))
    panel.get_by_role('button',name='确认应用到画布',exact=True).click();after=save()
    if index<2:
     assert len(after['nodes'])==7*(index+1),len(after['nodes'])
     for n in before['nodes']:assert next(x for x in after['nodes'] if x['id']==n['id'])==n
    else:
     assert len(after['nodes'])==14
     for n in before['nodes']:
      current=next(x for x in after['nodes'] if x['id']==n['id'])
      for key in ['x','y','w','h','symbol']:assert current[key]==n[key],(n['title'],key)
    if index==2:assert len(after['pipes'])==12,len(after['pipes'])
    if index==3:assert sum(len(n['bindings']) for n in after['nodes'])==25
    page.get_by_role('button',name='撤销',exact=True).click();assert save()==before
    page.get_by_role('button',name='重做',exact=True).click();assert save()==after
    results.append({'batch':index+1,'model':data['model'],'attempts':data['attempts'],'seconds':round(time.time()-started,1),'nodes':len(after['nodes']),'pipes':len(after['pipes']),'bindings':sum(len(n['bindings']) for n in after['nodes'])})
    (OUT/'progress.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps(results[-1],ensure_ascii=False),flush=True);before=after
   (OUT/'project.json').write_text(json.dumps(before,ensure_ascii=False,indent=2),'utf-8')
   # Verify requested flow graph, independent of titles/IDs generated by the model.
   def device(code):return next(n for n in before['nodes'] if code in n['title'])['id']
   for code in ['TK101','TK102','TK103','PAC','PAM','FT101','FT102','M101','M102','P201','P202','P301','P302']:
    n=next(n for n in before['nodes'] if n['id']==device(code))
    expected={'value':code+'.level'} if code in ['TK101','TK102','TK103','PAC','PAM'] else {'value':code+'.flow'} if code.startswith('FT') else {'run':code+'.run','fault':code+'.fault','value':code+'.hz'}
    assert n['bindings']==expected,(code,n['bindings'])
   graph={n['id']:[] for n in before['nodes']}
   for edge in before['pipes']:graph[edge['source']['nodeId']].append(edge['target']['nodeId'])
   for a,b in [('FT101','TK101'),('TK101','TK102'),('TK102','TK103'),('TK103','FT102'),('PAC','P201'),('P201','TK101'),('PAM','P202'),('P202','TK102'),('TK103','P301'),('P301','TK101'),('TK103','P302'),('P302','脱水机房')]:assert device(b) in graph[device(a)],(a,b)
   for a,b,ap,bp in [('FT101','TK101','right','left'),('TK101','TK102','right','left'),('TK102','TK103','right','left'),('TK103','FT102','right','left'),('PAC','P201','right','left'),('P201','TK101','right','top'),('PAM','P202','right','left'),('P202','TK102','right','top'),('TK103','P301','bottom','right'),('P301','TK101','left','bottom'),('TK103','P302','bottom','top'),('P302','脱水机房','right','left')]:
    edge=next(e for e in before['pipes'] if e['source']['nodeId']==device(a) and e['target']['nodeId']==device(b))
    assert (edge['source']['portId'],edge['target']['portId'])==(ap,bp),(a,b,edge)
   for a,b,points in [('P201','TK101',[(380,235),(380,320),(510,320)]),('PAM','P202',[(810,230),(810,110),(1050,110),(1050,235)]),('P202','TK102',[(1240,235),(1240,320),(960,320)]),('TK103','P301',[(1430,760),(950,760)]),('P301','TK101',[(600,1000),(510,1000)])]:
    edge=next(e for e in before['pipes'] if e['source']['nodeId']==device(a) and e['target']['nodeId']==device(b))
    assert [(p['x'],p['y']) for p in edge['vertices']]==points,(a,b,edge['vertices'])
   panel.get_by_role('button',name='关闭助手',exact=True).click();page.get_by_role('button',name='预览发布',exact=True).click();page.get_by_role('button',name='发布',exact=True).click();expect(page.get_by_role('status')).to_contain_text('已发布')
   page.goto(BASE+'/view');expect(page.locator('.x6-node')).to_have_count(14);expect(page.locator('.x6-edge')).to_have_count(12);page.screenshot(path=str(OUT/'published-1920.png'))
   page.set_viewport_size({'width':1366,'height':768});expect(page.locator('.x6-node')).to_have_count(14);page.screenshot(path=str(OUT/'published-1366.png'))
   page.goto(BASE);page.locator('.project-menu summary').click()
   with page.expect_download() as dl:page.get_by_role('button',name='导出离线演示',exact=True).click()
   artifact=OUT/'scene13-offline.html';dl.value.save_as(artifact);local=browser.new_page();requests=[]
   local.on('request',lambda r:requests.append(r.url) if r.url.startswith('http') else None);local.on('pageerror',lambda e:errors.append(str(e)));local.goto(artifact.as_uri());expect(local.locator('.x6-node')).to_have_count(14);assert not requests and not errors,(requests,errors)
   report={'kind':'real Ollama, production editor UI','batches':results,'nodes':14,'pipes':12,'bindings':25,'verified':['preview no draft writes','each batch apply, undo and redo','preserve previous geometry','12 directed process connections with exact ports','5 specified pipe waypoint lists','25 exact device-slot-point identities','publish','1920 and 1366 viewports','offline zero HTTP'],'errors':errors}
   (OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print(json.dumps(report,ensure_ascii=False),flush=True)
  except Exception:
   page.screenshot(path=str(OUT/'failure.png'));raise
  finally:browser.close()

if __name__=='__main__':main()
