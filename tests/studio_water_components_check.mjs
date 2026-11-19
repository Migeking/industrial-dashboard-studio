import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
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
const artworkRoot = new URL('../packages/components/studio/assets/water/', import.meta.url);
const provenance = JSON.parse(fs.readFileSync(new URL('provenance.json', artworkRoot), 'utf8'));
for(const [key,def] of Object.entries(waterEquipment)){
  assert(waterArtwork[key]?.startsWith('data:image/webp;base64,'),key+' artwork not packaged');
  const node=screenNode(key,key,0,0);node.title=def.prefix+'101 '+def.label;
  assert.equal(node.params.appearance,'depth');assert.deepEqual(node.bindings,{});
  assert(screenSlots(node).every(s=>['extra','run','fault','value'].includes(s.role)));
  assert.equal(new Set(screenPorts(node).map(p=>p.id)).size,def.ports.length);
  const test={...doc,nodes:[node]};validateScreen(test,false);
  if(screenSlots(node).some(s=>s.required))assert.throws(()=>validateScreen(test,true),/请选择/);else validateScreen(test,true);
  if (def.contractVersion) {
    assert.equal(node.equipmentVersion, def.contractVersion);
    assert.deepEqual(def.sections.flatMap(s => s.slots).sort(), def.slots.map(s => s.key).sort());
    const asset = provenance.assets.find(a => a.id === key);
    assert.equal(asset.version, def.contractVersion);
    const bytes = fs.readFileSync(new URL(asset.file, artworkRoot));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.equal(waterArtwork[key].split(',')[1], bytes.toString('base64'));
  }
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
console.log('PASS: packaged contracts, publishing gate, versioned artwork, multi-unit readings, quality/fault precedence, reusable isolated bindings, Agent catalog');

const fitting=screenNode('lamellaClarifier','fit',0,0);fitting.w=900;
const port=screenPorts(fitting).find(p=>p.id==='left');
assert(Math.abs(port.x-(50+(5-50)/1.5))<1e-8);
assert.equal(screenPorts(screenNode('motor','em',0,0)).length,0);
console.log('PASS: image-space ports follow equal-aspect resizing; motor has no fluid ports');

const units = {
  nodes: [
    { key:'dose', symbol:'dualChemicalDosing', title:'DCD101 双加药', x:80, y:60 },
    { key:'tank', symbol:'highRateClarifier', title:'HRC101 高密度沉淀', x:700, y:480 },
  ],
  links: [
    { from:'dose', fromPort:'pacOut', to:'tank', toPort:'pacIn' },
    { from:'dose', fromPort:'pamOut', to:'tank', toPort:'pamIn' },
  ],
};
const process = executeScreenCommands(doc, compileScreenIntent(doc, 'main', units, allowed), allowed).project;
assert.deepEqual(process.pipes.map(p => p.style.color), ['#a27328','#776595']);
const crosswired = structuredClone(units);
crosswired.links[0].toPort = 'pamIn';
assert.throws(() => compileScreenIntent(doc, 'main', crosswired, allowed), /介质不匹配/);
const packaged = makeScreenSymbol(process, process.nodes.map(n => n.id), '絮凝投加组合', 'coagulation-pair');
const secondProject = blankScreen();
placeScreenSymbol(secondProject, packaged, 80, 40, () => `new-${index++}`);
assert(secondProject.nodes.every(n => n.equipmentVersion === 1 && !Object.keys(n.bindings).length));
assert.deepEqual(secondProject.pipes.map(p => p.style.color), ['#a27328','#776595']);
assert.throws(() => validateScreen({
  ...process, nodes: process.nodes.map(n => ({ ...n, equipmentVersion: 99 })),
}, false), /版本/);
for (const name of ['scene05-pump-loop','scene13-coagulation','scene25-dewatering']) {
  const unit = JSON.parse(fs.readFileSync(new URL(
    '../apps/scada-designer/examples/units/' + name + '.symbol.json', import.meta.url
  ), 'utf8'));
  const project = blankScreen();
  placeScreenSymbol(project, unit, 100, 140, () => `instance-${index++}`);
  validateScreen(project, false);
  assert.equal(unit.version, 1);
  assert.equal(project.pipes.length, unit.pipes.length);
  assert(project.nodes.every(n => !Object.keys(n.bindings).length));
}
console.log('PASS: typed chemical ports, mismatched media rejection, version checks and cross-project unit reuse');
