import assert from 'node:assert/strict';
import {blankScreen,screenNode,screenEndpointPosition,editScreenDefinition} from '../packages/runtime/studio/screen-model.mjs';
import {routeScreenPipe,equipmentObstacle} from '../packages/runtime/studio/screen-routing.mjs';
import {resizeScreenPorts,screenPorts} from '../packages/components/studio/screen-symbols.mjs';
const d=blankScreen(),a=screenNode('screwPump','a',70,200),b=screenNode('decanterCentrifuge','b',1100,200),block=screenNode('chemicalTank','block',600,150);d.nodes=[a,b,block];
const pipe={source:{nodeId:'a',portId:'right'},target:{nodeId:'b',portId:'left'},vertices:[]};
let points=[screenEndpointPosition(d,pipe.source),...routeScreenPipe(d,pipe),screenEndpointPosition(d,pipe.target)];
assert(points.length>2);const o=equipmentObstacle(block);
for(let i=1;i<points.length;i++){const p=points[i-1],q=points[i];assert(Math.abs(p.x-q.x)<.02||Math.abs(p.y-q.y)<.02);assert(!(p.x===q.x?p.x>o.left&&p.x<o.right&&Math.max(p.y,q.y)>o.top&&Math.min(p.y,q.y)<o.bottom:p.y>o.top&&p.y<o.bottom&&Math.max(p.x,q.x)>o.left&&Math.min(p.x,q.x)<o.right));}
const before=JSON.stringify(points);b.w=500;b.h=300;points=routeScreenPipe(d,pipe);assert.notEqual(JSON.stringify(points),before);
const manual=[{x:900,y:900}];assert.equal(routeScreenPipe(d,{...pipe,vertices:manual}),manual);
console.log('PASS: orthogonal obstacle avoidance, resize reroute, explicit paths preserved');

const thickener=screenNode('gravityThickener','tk',75,530);thickener.w=205;thickener.h=195;
const overflow={source:{nodeId:'tk',portId:'top'},target:{x:780,y:720},vertices:[]};
const overflowPath=routeScreenPipe({...blankScreen(),nodes:[thickener]},overflow);
assert(overflowPath[0].x<equipmentObstacle(thickener).left); // Upper-side overflow nozzle exits left; port ID alone is insufficient.
console.log('PASS: artwork-specific overflow exit direction');

const clarifier = screenNode('highRateClarifier', 'clarifier', 40, 120);
const base = {...clarifier, w:740, h:440};
base.ports = screenPorts(base);
const oldManual = base.ports.find(p => p.id === 'pamIn');
oldManual.x += 3;
const resized = {...base, w:950, h:520, ports:resizeScreenPorts(base, 950, 520)};
const moved = resized.ports.find(p => p.id === 'pacIn');
const expected = screenPorts({...resized, ports:undefined}).find(p => p.id === 'pacIn');
assert.deepEqual(moved, expected);
const fixed = resized.ports.find(p => p.id === 'pamIn');
assert.equal(fixed.x, oldManual.x);
assert.equal(fixed.anchor, undefined);
const modified = editScreenDefinition({...blankScreen(), nodes:[resized]}, resized.id,
  'ports', 'edit', {id:'pacIn', x:moved.x + 3});
assert.equal(modified.ports.find(p => p.id === 'pacIn').anchor, undefined);
assert.equal(resizeScreenPorts(modified, 740, 440).find(p => p.id === 'pacIn').x, moved.x + 3);
console.log('PASS: materialized equipment ports track artwork; manual coordinates stay fixed');
