import assert from 'node:assert/strict';
import {waterEquipment} from '../packages/components/studio/water-equipment.mjs';
import {waterArtwork} from '../packages/components/studio/water-artwork.mjs';
import {screenSlots,screenPorts} from '../packages/components/studio/screen-symbols.mjs';
import {blankScreen,screenNode,validateScreen} from '../packages/runtime/studio/screen-model.mjs';
import {equipmentStatus,equipmentReadings} from '../packages/runtime/studio/equipment-display.mjs';
import {makeScreenSymbol,placeScreenSymbol} from '../packages/runtime/studio/screen-library.mjs';
import {compileScreenIntent,screenModelContext} from '../packages/runtime/studio/screen-intent.mjs';
import {executeScreenCommands} from '../packages/runtime/studio/screen-commands.mjs';
import {screenIntentSchemaFor} from '../apps/scada-designer/model-schema.mjs';
import {waterComponentBlank,waterComponentGallery} from './studio_water_fixture.mjs';

const doc=waterComponentBlank(),allowed=doc.mappings.map(m=>m.id);
for(const [key,def] of Object.entries(waterEquipment)){
  assert(waterArtwork[key]?.startsWith('data:image/webp;base64,'),key+' artwork not packaged');
  const node=screenNode(key,key,0,0);node.title=def.prefix+'101 '+def.label;
  assert.equal(node.params.appearance,'depth');assert.deepEqual(node.bindings,{});
  assert(screenSlots(node).every(s=>['extra','run','fault','value'].includes(s.role)));
  assert.equal(new Set(screenPorts(node).map(p=>p.id)).size,def.ports.length);
  const test={...doc,nodes:[node]};validateScreen(test,false);
  if(screenSlots(node).some(s=>s.required))assert.throws(()=>validateScreen(test,true),/请选择/);else validateScreen(test,true);
}
validateScreen(waterComponentGallery(),true);
const intent={nodes:[{key:'hc',symbol:'lamellaClarifier',title:'HC101 高效沉淀池',x:700,y:200,w:600,h:440,
  params:{unit:'NTU'},bindings:{value:'HC101.value',run:'HC101.run',fault:'HC101.fault',sludgeLevel:'HC101.sludgeLevel',recycleFlow:'HC101.recycleFlow'}}],links:[]};
const proposal=compileScreenIntent(doc,'main',intent,allowed),result=executeScreenCommands(doc,proposal,allowed).project;
const node=result.nodes[0];assert.equal(node.bindings.sludgeLevel,'HC101.sludgeLevel');
const points=Object.fromEntries(JSON.parse(doc.source.data).points.map(p=>[p.id,{...p}]));
assert.equal(equipmentStatus(node,points),'运行');
assert.deepEqual(equipmentReadings(node,points,result.mappings).map(r=>r.text),['0.85 NTU','1.70 m','42.00 m³/h']);
points['HC101.fault'].value=true;assert.equal(equipmentStatus(node,points),'故障');
points['HC101.fault'].value=false;points['HC101.value'].quality='bad';
assert.equal(equipmentStatus(node,points),'数据无效');assert.equal(equipmentReadings(node,points,result.mappings)[0].text,'—');
points['HC101.value'].quality='stale';assert.equal(equipmentStatus(node,points),'数据过期');
points['HC101.value'].quality='good';points['HC101.run'].value=false;assert.equal(equipmentStatus(node,points),'停止');
const symbol=makeScreenSymbol(result,[node.id],'可复用高效沉淀池','water-unit');
const other=blankScreen();let index=0;placeScreenSymbol(other,symbol,400,300,()=>`copy-${index++}`);
assert.deepEqual(other.nodes[0].bindings,{});assert.equal(other.nodes[0].symbol,'lamellaClarifier');
assert.deepEqual(screenPorts(other.nodes[0]),screenPorts(node));
const context=screenModelContext(result,'main',allowed),schema=screenIntentSchemaFor(context);
assert(context.components.some(c=>c.symbol==='lamellaClarifier'));
assert(schema.properties.nodes.items.anyOf.at(-1).properties.symbol.enum.includes('lamellaClarifier'));
assert(!JSON.stringify(context).includes('data:image/'));
console.log('PASS: 25 packaged contracts, publishing gate, multi-unit readings, quality/fault precedence, reusable isolated bindings, Agent catalog');

const fitting=screenNode('lamellaClarifier','fit',0,0);fitting.w=900;
const port=screenPorts(fitting).find(p=>p.id==='left');
assert(Math.abs(port.x-(50+(5-50)/1.5))<1e-8);
assert.equal(screenPorts(screenNode('motor','em',0,0)).length,0);
console.log('PASS: image-space ports follow equal-aspect resizing; motor has no fluid ports');
