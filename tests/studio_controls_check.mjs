import assert from 'node:assert/strict';
import {blankScreen,screenNode,validateScreen} from '../packages/runtime/studio/screen-model.mjs';
import {screenControlTransition} from '../packages/runtime/studio/screen-controls.mjs';
import {screenChartResult} from '../packages/runtime/studio/screen-widgets.mjs';
const doc=blankScreen(),step=screenNode('numberStepper','step',0,0),mode=screenNode('modeSwitch','mode',0,100),trend=screenNode('trend','trend',0,300),range=screenNode('trendRange','range',600,300);
Object.assign(step.params,{min:3,max:6,step:.2,precision:1});step.bindings.value='pam';mode.bindings.value='mode';doc.nodes=[step,mode,trend,range];range.params.targetId='trend';const pts={pam:{value:4.2,quality:'good'},mode:{value:0,quality:'good'}};
assert.equal(screenControlTransition(doc,pts,{id:'step',delta:1}).updates.pam,4.4);
assert.equal(screenControlTransition(doc,{...pts,pam:{value:6,quality:'good'}},{id:'step',delta:1}).updates.pam,6);
assert.throws(()=>screenControlTransition({...doc,source:{kind:'opcua',demo:true}},pts,{id:'step',delta:1}),/只读/);
assert.throws(()=>screenControlTransition(doc,{...pts,pam:{value:4.2,quality:'bad'}},{id:'step',delta:1}),/质量/);
mode.dataSlots=[{key:'value',label:'mode',kinds:['number'],role:'value',required:true},{key:'pump',label:'pump',kinds:['boolean'],role:'extra'}];mode.bindings.pump='pump';mode.params.options[1].values={pump:false};
assert.deepEqual(screenControlTransition(doc,{...pts,pump:{value:true,quality:'good'}},{id:'mode',value:1}).updates,{mode:1,pump:false});
assert.throws(()=>screenControlTransition(doc,{...pts,pump:{value:null,quality:'bad'}},{id:'mode',value:1}),/质量/); // All-or-nothing, no partial mutation.
assert.equal(pts.mode.value,0);assert.deepEqual(screenControlTransition(doc,pts,{id:'range',value:28800}).window,{id:'trend',seconds:28800});
trend.bindings.value='history';trend.params.xType='time';trend.params.windowSeconds=86400;trend.params.rangeActive=true;
const rows=Array.from({length:25},(_,i)=>({time:Date.UTC(2026,10,19,i),value:i})),points={history:{quality:'good',value:rows}},maps=[{id:'history',kind:'dataset'}],entry={};
let r=screenChartResult(trend,points,maps,entry,1,1,Date.now());assert.equal(r.option.series[0].data.length,25);
r=screenChartResult({...trend,params:{...trend.params,windowSeconds:28800}},points,maps,entry,1,1,Date.now());assert.equal(r.option.series[0].data.length,9);
r=screenChartResult(trend,points,maps,entry,1,1,Date.now());assert.equal(r.option.series[0].data.length,25);
console.log('PASS: bounded stepping, readonly source, bad quality, atomic mode presets, trend 24h/8h/24h without data loss');

const {makeScreenSymbol,placeScreenSymbol}=await import('../packages/runtime/studio/screen-library.mjs');
const {copyScreenSelection}=await import('../packages/runtime/studio/screen-model.mjs');
const symbol=makeScreenSymbol(doc,['trend','range'],'趋势与时间切换','test-control-symbol'),other=blankScreen();let count=0;
placeScreenSymbol(other,symbol,0,0,()=>`placed-${count++}`);
assert.equal(other.nodes.find(n=>n.symbol==='trendRange').params.targetId,other.nodes.find(n=>n.symbol==='trend').id);
const single=makeScreenSymbol(doc,['range'],'独立时间开关','test-single');assert.equal(single.nodes[0].params.targetId,'');
const broken={...range,params:{...range.params,targetId:'missing'}};assert.throws(()=>screenControlTransition({...doc,nodes:[broken]},pts,{id:'range',value:28800}),/目标趋势/);
mode.params.options[0].values={missing:4};assert.throws(()=>screenControlTransition(doc,pts,{id:'mode',value:0}),/联动值/);
console.log('PASS: reusable grouped range remaps target, standalone import clears target, stale targets and invalid presets rejected');

const copied=blankScreen();copied.nodes=structuredClone([trend,range]);let serial=0;const cloned=copyScreenSelection(copied,['trend','range'],()=>`copy-${serial++}`);
assert.equal(copied.nodes.find(n=>n.symbol==='trendRange'&&cloned.includes(n.id)).params.targetId,copied.nodes.find(n=>n.symbol==='trend'&&cloned.includes(n.id)).id);
console.log('PASS: copied trend/range pair keeps its own target');
