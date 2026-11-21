import { screenSlots, screenRoleSlot } from '../../components/studio/screen-symbols.mjs';
import { screenState } from './screen-model.mjs';

import { screenEquipmentSummaryLimit } from './screen-controls.mjs';

export function equipmentStatus(node, points) {
  const slots=screenSlots(node),fault=screenRoleSlot(node,'fault');
  const failed=points[node.bindings[fault?.key]];
  if(failed?.quality==='good'&&failed.value===true)return '故障';
  const bound=slots.filter(s=>node.bindings[s.key]);
  if(slots.some(s=>s.required&&!node.bindings[s.key]))return '待绑定';
  const invalid=bound.map(s=>points[node.bindings[s.key]]).find(p=>!p||p.quality!=='good');
  if(bound.some(s=>!points[node.bindings[s.key]]))return '等待数据';
  if(invalid)return ({stale:'数据过期',offline:'通信离线'}[invalid.quality]||'数据无效');
  if(!bound.length)return '待绑定';
  const run=screenRoleSlot(node,'run');
  return node.bindings[run?.key]?screenState(node,points):'只读监视';
}

export function equipmentReadings(node, points, mappings) {
  const slots = screenSlots(node).filter(slot => slot.kinds.includes("number"));
  const visible = node.panel?.summary
    ? slots.filter(slot => node.panel.summary.includes(slot.key))
    : slots.slice(0, screenEquipmentSummaryLimit(node));
  return visible.map(slot => {
    const id=node.bindings[slot.key],point=points[id],mapping=mappings.find(m=>m.id===id);
    const unit=(slot.role==='value'?node.params.unit:'')||mapping?.unit||'';
    const valid=point?.quality==='good'&&typeof point.value==='number'&&Number.isFinite(point.value);
    return {label:slot.label,text:valid?point.value.toFixed(node.params.precision)+(unit?' '+unit:''):'—',quality:point?.quality||'unbound'};
  });
}
