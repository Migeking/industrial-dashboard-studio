"""Synthetic capacity test only. A/B usability acceptance is separately UI-authored."""
import json,os,platform,socket,subprocess,tempfile,threading,time,statistics
from pathlib import Path
from urllib.request import urlopen
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'works/scada-designer-stages/load';OUT.mkdir(parents=True,exist_ok=True)
class Fixture(BaseHTTPRequestHandler):
    samples=0
    def log_message(self,*_):pass
    def do_GET(self):
        Fixture.samples+=1;body=json.dumps({'run':True,'fault':False,'value':38.5,'time':int(time.time()*1000)}).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body)
def main():
    fixture=ThreadingHTTPServer(('127.0.0.1',0),Fixture);threading.Thread(target=fixture.serve_forever,daemon=True).start()
    source="""import {blankScreen,screenNode} from './packages/runtime/studio/screen-model.mjs';
    const doc=blankScreen();doc.title='规模负载测试';
    doc.mappings=[{id:'run',label:'运行',kind:'boolean',path:'run',precision:0},{id:'fault',label:'故障',kind:'boolean',path:'fault',precision:0},{id:'value',label:'数值',kind:'number',path:'value',precision:2,scale:1,offset:0,unit:'Hz'}];
    for(let i=0;i<294;i++){const n=screenNode(i%2?'readout':'pump','n'+i,20+i%21*90,20+Math.floor(i/21)*40);Object.assign(n,{w:74,h:34});n.style.fontSize=12;n.bindings=i%2?{value:'value'}:{run:'run',fault:'fault'};doc.nodes.push(n);}
    for(let i=0;i<6;i++){const n=screenNode('trend','chart'+i,20+i%3*630,600+Math.floor(i/3)*230);Object.assign(n,{w:600,h:220});n.bindings.value='value';doc.nodes.push(n);}
    for(let i=0;i<100;i++)doc.pipes.push({id:'pipe'+i,type:'pipe',title:'管道',source:{nodeId:'n'+i*2,portId:'right'},target:{x:20+(i*2+1)%21*90,y:37+Math.floor((i*2+1)/21)*40},vertices:[],style:{color:'#557f96',width:5,appearance:'detailed'},bindings:{run:'run'}});
    process.stdout.write(JSON.stringify(doc));"""
    doc=json.loads(subprocess.check_output(['node','--input-type=module','-e',source],cwd=ROOT,text=True,encoding='utf-8'));doc['source']={'kind':'rest','url':f'http://127.0.0.1:{fixture.server_port}/snapshot','pollMs':250,'maxAgeMs':10000,'demo':True}
    for m in doc['mappings']:m.update({'timePath':'time','qualityPath':'','scale':1,'offset':0,'unit':m.get('unit','')})
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}';result={'scope':'synthetic capacity; no FPS or physical IO claim','host':{'os':platform.platform(),'processor':platform.processor(),'logicalCpuCount':os.cpu_count()},'load':{'visibleNodes':300,'pipes':100,'pipeAppearance':'detailed','flowingPipes':100,'charts':6,'pollMs':250}}
    with tempfile.TemporaryDirectory(prefix='screen-load-') as data:
        server=subprocess.Popen(['node','apps/scada-designer/server.mjs'],cwd=ROOT,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_DATA_DIR':data},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(80):
                try:urlopen(base+'/api/draft',timeout=1);break
                except OSError:time.sleep(.1)
            with sync_playwright() as p:
                browser=p.chromium.launch();page=browser.new_page(viewport={'width':1920,'height':1080});page.set_default_timeout(30000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));result['browser']=browser.version
                r=page.request.post(base+'/api/draft',data=doc);assert r.ok,r.text();r=page.request.post(base+'/api/publish',data=doc);assert r.ok,r.text()
                start=time.perf_counter();page.goto(base+'/view');expect(page.locator('.x6-node')).to_have_count(300);expect(page.locator('.x6-edge')).to_have_count(100);expect(page.locator('.screen-pipe-flow')).to_have_count(100);expect(page.locator('.screen-chart-host canvas')).to_have_count(6);result['initialRenderMs']=round((time.perf_counter()-start)*1000,1)
                cdp=page.context.new_cdp_session(page);cdp.send('Performance.enable');metrics=lambda:{x['name']:x['value'] for x in cdp.send('Performance.getMetrics')['metrics']};before=metrics();samples=Fixture.samples;start=time.perf_counter();latencies=[]
                for _ in range(30):
                    t=time.perf_counter();page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(document.querySelectorAll(".x6-node").length)))');latencies.append((time.perf_counter()-t)*1000);page.wait_for_timeout(150)
                elapsed=time.perf_counter()-start;after=metrics();result.update({'observationSeconds':round(elapsed,2),'collectorSamples':Fixture.samples-samples,'taskTimeSeconds':round(after['TaskDuration']-before['TaskDuration'],3),'scriptTimeSeconds':round(after['ScriptDuration']-before['ScriptDuration'],3),'heapMiB':round(after['JSHeapUsedSize']/1024/1024,1),'frameCallbackRoundTripMs':{'median':round(statistics.median(latencies),1),'max':round(max(latencies),1)}})
                # One shared collector: no sixfold request fan-out per chart.
                assert 2 < result['collectorSamples'] < elapsed/.25*1.5+5,result
                page.screenshot(path=str(OUT/'load-1920.png'))
                # Repeated destroy/recreate must leave exactly six live chart hosts.
                for _ in range(3):page.goto(base);expect(page.locator('.screen-chart-host canvas')).to_have_count(6);page.goto(base+'/view');expect(page.locator('.screen-chart-host canvas')).to_have_count(6)
                assert not errors,errors;result['errors']=errors;result['status']='passed';browser.close()
        finally:server.terminate();server.wait(timeout=15);fixture.shutdown();(OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()
