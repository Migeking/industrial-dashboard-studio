import { screenSlots, screenRoleSlot, screenSymbols } from "../../components/studio/screen-symbols.mjs";
import { equipmentOperationProblem } from "./equipment-operation.mjs";

// Local runtime controls share point bindings; they never call a device write API.
export const screenControlKinds = new Set(['modeSwitch','numberStepper','trendRange']);
export function screenControlDefaults(symbol){
  if (symbol === "controlPanel") return { targetKind: "equipment", targetIds: [] };
  if(symbol==='modeSwitch')return {options:[{label:'常规运行',value:0,values:{}},{label:'高负荷',value:1,values:{}},{label:'单机故障',value:2,values:{}}]};
  if(symbol==='numberStepper')return {min:0,max:100,step:1,precision:1};
  if(symbol==='trendRange')return {targetId:'',options:[{label:'8 h',value:28800},{label:'24 h',value:86400}],defaultSeconds:86400};
  return {};
}
export function screenDemoAllowed(doc){return doc.source?.demo===true&&['json','csv'].includes(doc.source.kind);}
const commandPattern = /^[\p{L}\p{N}_.:-]{1,64}$/u;
const safeguardRoles = [
  { key: "permit", label: "操作许可点", meaning: "有信号才允许操作" },
  { key: "interlock", label: "联锁点", meaning: "有信号禁止操作" },
];
const motorRoles = [
  { key: "feedback", label: "运行反馈点", meaning: "有信号表示设备运行" },
  ...safeguardRoles,
];
const valveRoles = [
  { key: "feedback", label: "开到位反馈点", meaning: "有信号表示阀门开到位" },
  { key: "closed", label: "关到位反馈点", meaning: "有信号表示阀门关到位" },
  ...safeguardRoles,
];
const frequencyPumps = new Set(["pump", "submersiblePump", "screwPump", "pidMeteringPump"]);

export function screenEquipmentControlRoles(item) {
  return item?.symbol === "valve" ? valveRoles : motorRoles;
}

export function screenEquipmentSwitchEnabled(item) {
  const config = item?.panel?.operation;
  return !!config && config.enabled !== false && item.params.valveMode !== "control";
}

function addOperationSlot(slots, base, label, kind) {
  let key = base;
  for (let suffix = 2; slots.some(slot => slot.key === key); suffix++) key = base + suffix;
  slots.push({ key, label, kinds: [kind], role: "extra", required: false });
  return key;
}

export function screenPanelFrequency(item) {
  const frequency = item?.panel?.operation?.frequency;
  return frequency?.enabled === false ? undefined : frequency;
}

export function screenPanelEquipmentEnabled(item) {
  return !!item?.panel?.custom || screenEquipmentSwitchEnabled(item) || !!screenPanelFrequency(item);
}

export function screenControlPanelProblem(panel, project) {
  if (panel.symbol !== "controlPanel") return "";
  const { targetKind, targetIds } = panel.params;
  if (!targetIds.length) return targetKind === "equipment" ? "请选择已有控制配置的设备" : "请添加画面交互控件";
  const candidates = [project, ...(project.pages || [])].flatMap(screen => screen.nodes)
    .filter(node => targetKind === "equipment" ? screenPanelEquipmentEnabled(node) : screenControlKinds.has(node.symbol));
  return targetIds.some(id => !candidates.some(node => node.id === id)) ? "控制面板引用的目标已失效，请重新选择" : "";
}

export function screenEquipmentControlSlots(item) {
  if (!item || item.type === "pipe" || item.symbol === "pidInterlock") return null;
  const valve = item.symbol === "valve";
  const feedback = screenRoleSlot(item, valve ? "open" : "run");
  if (!feedback || feedback.kinds.some(kind => kind !== "boolean")) return null;
  const slots = [...screenSlots(item)];
  const operation = { feedback: feedback.key };
  if (valve) operation.closed = addOperationSlot(slots, "operationClosed", "关到位反馈", "boolean");
  operation.permit = addOperationSlot(slots, "operationPermit", "操作许可", "boolean");
  operation.interlock = addOperationSlot(slots, "operationInterlock", "操作联锁", "boolean");
  return { slots, operation };
}

export function screenEquipmentFrequencySlots(item) {
  if (!frequencyPumps.has(item?.symbol)) return null;
  const base = item.panel?.operation
    ? { slots: [...screenSlots(item)], operation: item.panel.operation }
    : screenEquipmentControlSlots(item);
  if (!base) return null;
  const readback = addOperationSlot(base.slots, "frequencyReadback", "频率设定回读", "number");
  return {
    slots: base.slots,
    operation: {
      ...base.operation,
      enabled: base.operation.enabled ?? !!item.panel?.operation,
      frequency: { readback, min: 0, max: 50, step: .5 },
    },
  };
}

function frequencyRangeValid({ min, max, step }) {
  return [min, max, step].every(value => Number.isFinite(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER / 1e6 && Number(value.toFixed(6)) === value) &&
    min >= 0 && max > min && step > 0 && step <= max - min + 1e-9;
}

export function screenFrequencyMapping(point) {
  return point?.kind === "number" && /^hz$/i.test(point.unit?.trim());
}

export function screenFrequencyPointId(item, doc) {
  const readback = item?.panel?.operation?.frequency?.readback;
  const id = readback && item.bindings[readback];
  const actualId = item?.bindings[screenRoleSlot(item, "value")?.key];
  return id && id !== actualId && screenFrequencyMapping(doc.mappings.find(map => map.id === id)) ? id : "";
}

export function screenValvePosition(item, points) {
  const config = item.panel.operation;
  const openId = item.bindings[config.feedback], closedId = item.bindings[config.closed];
  const open = points[openId], closed = points[closedId];
  if (!openId || !closedId || openId === closedId || [open, closed].some(point =>
    point?.quality !== "good" || typeof point.value !== "boolean"))
    return { label: "到位反馈无效", quality: "bad" };
  if (open.value && closed.value) return { label: "到位反馈冲突", quality: "bad" };
  if (!open.value && !closed.value) return { label: "位置待确认", quality: "bad" };
  return { label: open.value ? "开启" : "关闭", quality: "good", value: open.value };
}

export function screenEquipmentSummaryLimit(item) {
  return screenSymbols[item.symbol]?.category === "devices" ? 1 : 3;
}

export function validateScreenEquipmentPanel(item) {
  const panel = item.panel;
  if (panel === undefined) return;
  if (!panel || Array.isArray(panel) || typeof panel !== "object" || item.type === "pipe")
    throw Error("设备面板设置无效");
  const slots = screenSlots(item);
  for (const [field, limit, kind] of [["summary", screenEquipmentSummaryLimit(item), "number"], ["details", slots.length, null]]) {
    const list = panel[field];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length > limit || new Set(list).size !== list.length ||
        list.some(key => !slots.some(slot => slot.key === key && (!kind || slot.kinds.includes(kind)))))
      throw Error(item.title + " 的面板字段引用无效");
  }
  const custom = panel.custom;
  if (custom !== undefined) {
    if (!custom || typeof custom.title !== "string" || custom.title.length > 80 ||
        !Array.isArray(custom.items) || custom.items.length > 16)
      throw Error("自定义面板定义无效");
    const ids = new Set(), commands = new Set();
    for (const row of custom.items) {
      if (!row || typeof row.id !== "string" || !row.id || ids.has(row.id) ||
          !["read", "signal", "setpoint"].includes(row.type) || typeof row.label !== "string" ||
          !row.label.trim() || row.label.length > 64)
        throw Error("面板控件定义无效");
      ids.add(row.id);
      const kind = ({ signal: "boolean", setpoint: "number" })[row.type];
      for (const [role, expected] of [["slot", kind], ["permit", "boolean"], ["interlock", "boolean"]]) {
        if (row[role] && !slots.some(slot => slot.key === row[role] && (!expected || slot.kinds.includes(expected))))
          throw Error("面板控件引用的测点槽位无效");
      }
      if (row.type === "signal" && typeof row.value !== "boolean" ||
          row.type === "setpoint" && ![row.min, row.max, row.step].every(Number.isFinite))
        throw Error("面板控件目标值或范围无效");
      if (row.command !== undefined && (typeof row.command !== "string" ||
          !commandPattern.test(row.command) || commands.has(row.command)))
        throw Error("面板命令编号无效或重复");
      if (row.command) commands.add(row.command);
    }
  }
  const operation = panel.operation;
  if (operation === undefined) return;
  const keys = screenEquipmentControlRoles(item).map(role => operation?.[role.key]);
  const valve = item.symbol === "valve";
  const feedback = screenRoleSlot(item, valve ? "open" : "run");
  if (!operation || item.symbol === "pidInterlock" ||
      (operation.enabled !== undefined && typeof operation.enabled !== "boolean") ||
      !feedback || feedback.kinds.length !== 1 || feedback.kinds[0] !== "boolean" ||
      new Set(keys).size !== keys.length || keys[0] !== feedback.key ||
      keys.slice(1).some(key => !slots.some(slot => slot.key === key &&
        slot.role === "extra" && slot.kinds.length === 1 && slot.kinds[0] === "boolean")))
    throw Error(item.title + " 的控制面板槽位定义无效");
  const frequency = operation.frequency;
  if (frequency !== undefined &&
      (!frequency || !frequencyPumps.has(item.symbol) ||
        (frequency.enabled !== undefined && typeof frequency.enabled !== "boolean") ||
        !frequencyRangeValid(frequency) ||
        !slots.some(slot => slot.key === frequency.readback && slot.role === "extra" &&
          slot.kinds.length === 1 && slot.kinds[0] === "number")))
    throw Error(item.title + " 的频率设定需使用有效的下限、上限、步长和独立回读槽位（最多六位小数）");
  const commands = [operation.start, operation.stop, frequency?.command].filter(id => id !== undefined);
  if (commands.some(id => typeof id !== "string" || !commandPattern.test(id)) ||
      new Set(commands).size !== commands.length)
    throw Error(item.title + " 的命令编号无效或重复");
}

export function clearScreenEquipmentCommands(item) {
  for (const row of item.panel?.custom?.items || []) delete row.command;
  if (!item.panel?.operation) return;
  delete item.panel.operation.start;
  delete item.panel.operation.stop;
  if (item.panel.operation.frequency) delete item.panel.operation.frequency.command;
}

function screenCustomOperationContext(item, doc, points, target, sequence, actionId) {
  const action = item?.panel?.custom?.items.find(row => row.id === actionId);
  if (!action || action.type === "read" || !action.command) return { problem: "请配置该动作的命令编号" };
  const kind = action.type === "signal" ? "boolean" : "number";
  const [pointId, permit, interlock] = ["slot", "permit", "interlock"].map(role => item.bindings[action[role]]);
  const ids = [pointId, permit, interlock];
  if (ids.some((id, index) => !id || !doc.mappings.some(m => m.id === id && m.kind === (index ? "boolean" : kind))) ||
      new Set(ids).size !== ids.length) return { problem: "请分别绑定有效的动作回读、许可和联锁" };
  if (kind === "number") {
    const { min, max, step } = action;
    if (step <= 0 || max <= min || step > max - min) return { problem: "请配置有效的上下限和步长" };
    if (!Number.isFinite(target) || target < min || target > max) return { problem: "给定值超出允许范围" };
    const steps = (target - min) / step;
    if (Math.abs(steps - Math.round(steps)) > 1e-7) return { problem: "请按设定步长输入" };
  } else if (target !== action.value) return { problem: "动作目标已改变，请重新预选" };
  const good = id => points[id]?.quality === "good" ? points[id].value : undefined;
  const fault = item.bindings[screenRoleSlot(item, "fault")?.key];
  const feedback = points[pointId];
  if (fault === pointId || kind === "number" && !Number.isFinite(feedback?.value))
    return { problem: "动作回读无效" };
  const state = { pointId, feedback, sequence, permitted: good(permit),
    interlocked: fault && good(fault) !== false ? true : good(interlock) };
  const intent = { pointId, commandId: action.command, target, previous: feedback?.value };
  return { intent, state, updates: { [pointId]: target },
    signature: JSON.stringify([item.id, ids, fault, action]), problem: equipmentOperationProblem(intent, state) };
}

export function screenEquipmentOperationContext(item, doc, points, target, sequence, actionId) {
  if (actionId) return screenDemoAllowed(doc)
    ? screenCustomOperationContext(item, doc, points, target, sequence, actionId)
    : { problem: "当前数据连接只读" };
  if (!screenDemoAllowed(doc)) return { problem: "当前数据连接只读" };
  const config = item?.panel?.operation;
  const frequency = typeof target === "number" ? config?.frequency : null;
  const commandId = frequency ? frequency.command : config?.[target ? "start" : "stop"];
  if (typeof target === "number" ? !frequency || frequency.enabled === false : !screenEquipmentSwitchEnabled(item))
    return { problem: "本动作未启用" };
  if (!commandId) return { problem: "尚未配置本动作的命令点" };

  const bound = key => Object.hasOwn(item.bindings, key) ? item.bindings[key] : undefined;
  const roles = screenEquipmentControlRoles(item);
  const pointIds = roles.map(role => bound(config[role.key]));
  const valve = item.symbol === "valve";
  const faultId = bound(screenRoleSlot(item, "fault")?.key);
  if (pointIds.some(id => !id || !doc.mappings.some(map => map.id === id && map.kind === "boolean")) ||
      new Set(pointIds).size !== pointIds.length || pointIds.includes(faultId))
    return { problem: valve ? "请分别绑定开到位、关到位、操作许可和联锁" :
      "请分别绑定运行反馈、操作许可和联锁三个开关量点" };

  let pointId = bound(config.feedback);
  let feedback = points[pointId];
  let updates = { [pointId]: target };
  if (valve) {
    feedback = screenValvePosition(item, points);
    if (feedback.quality !== "good") return { problem: feedback.label };
    updates[bound(config.closed)] = !target;
  }
  if (frequency) {
    if (!frequencyRangeValid(frequency) || !Number.isFinite(target) || target < frequency.min || target > frequency.max)
      return { problem: "给定频率超出允许范围" };
    const scaled = Math.round(target * 1e6);
    if (Number(target.toFixed(6)) !== target ||
        (scaled - Math.round(frequency.min * 1e6)) % Math.round(frequency.step * 1e6) !== 0)
      return { problem: "请从下限按设定步长输入频率" };
    pointId = screenFrequencyPointId(item, doc);
    if (!pointId) return { problem: "请绑定独立的 Hz 设定回读点" };
    if (feedback?.quality !== "good" || typeof feedback.value !== "boolean")
      return { problem: "运行反馈无效，无法设定频率" };
    pointIds.push(pointId);
    feedback = points[pointId];
    if (!Number.isFinite(feedback?.value)) return { problem: "频率设定回读无效" };
    updates = { [pointId]: target };
  }
  const good = id => points[id]?.quality === "good" ? points[id].value : undefined;
  const state = {
    pointId,
    feedback,
    permitted: good(bound(config.permit)),
    interlocked: faultId && good(faultId) !== false ? true : good(bound(config.interlock)),
    sequence,
  };
  const intent = { pointId, commandId, target, previous: state.feedback?.value };
  const signature = JSON.stringify([item.id, commandId, pointIds, faultId,
    frequency && [frequency.min, frequency.max, frequency.step]]);
  return { intent, state, signature, updates, problem: equipmentOperationProblem(intent, state) };
}

export function validateScreenControl(n,doc,publishing=false,project=doc){
  if (n.symbol === "controlPanel") {
    const { targetKind, targetIds } = n.params;
    if (!["equipment", "local"].includes(targetKind) || !Array.isArray(targetIds) ||
        targetIds.length > (targetKind === "equipment" ? 1 : 8) ||
        targetIds.some(id => typeof id !== "string" || !id) ||
        new Set(targetIds).size !== targetIds.length) throw Error("控制面板配置无效");
    const problem = publishing && screenControlPanelProblem(n, project);
    if (problem) throw Error(n.title + " · " + problem);
    return;
  }
  if(!screenControlKinds.has(n.symbol))return;
  const p=n.params;
  if(n.symbol==='numberStepper'){
    if(![p.min,p.max,p.step].every(Number.isFinite)||p.max<=p.min||p.step<=0||!Number.isInteger(p.precision)||p.precision<0||p.precision>8)throw Error('加减调节的范围、步长或小数位无效');
  }else{
    if(!Array.isArray(p.options)||!p.options.length||p.options.length>12||new Set(p.options.map(o=>o.value)).size!==p.options.length||p.options.some(o=>!o.label?.trim()||!Number.isFinite(o.value)))throw Error('切换选项的名称或数值无效');
    if(n.symbol==='trendRange'){
      if(p.options.some(o=>o.value<=0||o.value>604800)||!p.options.some(o=>o.value===p.defaultSeconds))throw Error('趋势时间范围无效');
      if((publishing||p.targetId)&&!doc.nodes.some(t=>t.id===p.targetId&&t.symbol==='trend'))throw Error('请选择本画面的目标趋势图');
    }else{
      const slots=n.dataSlots||[{key:'value',kinds:['number']}];
      for(const o of p.options)for(const [key,value] of Object.entries(o.values||{})){
        const s=slots.find(s=>s.key===key);if(!s||key==='value'||!(s.kinds.includes('boolean')?typeof value==='boolean':typeof value==='number'&&Number.isFinite(value)))throw Error('工况联动值与测点类型不匹配');
      }
    }
  }
}
export function screenControlTransition(doc,points,request){
  const n=doc.nodes.find(n=>n.id===request.id);if(!n||!screenControlKinds.has(n.symbol))throw Error('交互组件不存在');
  validateScreenControl(n,doc,true);
  if(n.symbol==='trendRange'){
    if(!n.params.options.some(o=>o.value===request.value))throw Error('时间档位不存在');
    return {window:{id:n.params.targetId,seconds:request.value}};
  }
  if(!screenDemoAllowed(doc))throw Error('仅本地演示数据可调节；当前连接保持只读');
  const updates={};
  const put=(slot,value)=>{const id=n.bindings[slot],point=points[id];if(!id)throw Error('请先绑定'+slot);if(point?.quality!=='good')throw Error('测点质量无效，无法演示调节');
    if(typeof point.value!==typeof value)throw Error('测点类型不匹配');updates[id]=value;};
  if(n.symbol==='numberStepper'){
    if(![-1,1].includes(request.delta))throw Error('调节方向无效');
    const value=points[n.bindings.value]?.value;if(typeof value!=='number'||!Number.isFinite(value))throw Error('未取得有效数值');
    put('value',Number(Math.max(n.params.min,Math.min(n.params.max,value+n.params.step*request.delta)).toFixed(n.params.precision)));
  }else{
    const o=n.params.options.find(o=>o.value===request.value);if(!o)throw Error('工况不存在');
    put('value',o.value);for(const [slot,value] of Object.entries(o.values||{}))put(slot,value);
  }
  return {updates};
}
export function projectScreenControl(n,entry,props,dispatch){
  const point=props.points[n.bindings.value],p=n.params,range=n.symbol==='trendRange';
  const value=range?(props.windows[n.params.targetId]??p.defaultSeconds):(point?.quality==='good'?point.value:null);
  const disabled=props.editing||(!range&&(!screenDemoAllowed(props.doc)||point?.quality!=='good'));
  entry.heading.style.display=p.hideLabel?'none':'';
  const key=JSON.stringify([p,value,disabled,props.controlError?.[n.id],n.title]);if(entry.controlKey===key)return;entry.controlKey=key;
  const focus=entry.host.contains(document.activeElement)?document.activeElement.dataset.controlKey:null;
  entry.card.classList.add('screen-runtime-control');entry.card.dataset.kind=n.symbol;entry.card.setAttribute('aria-label',n.title);entry.heading.textContent=n.title;entry.heading.style.display=p.hideLabel?'none':'';
  entry.host.replaceChildren();
  const button=(label,key,request)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=disabled;b.dataset.controlKey=key;b.setAttribute('aria-label',n.title+' · '+label);b.onclick=e=>{e.stopPropagation();dispatch({...request,id:n.id});};entry.host.append(b);return b;};
  if(n.symbol==='numberStepper'){
    const minus=button('−','minus',{delta:-1});minus.disabled=disabled||value<=p.min;
    const output=document.createElement('output');output.textContent=typeof value==='number'?value.toFixed(p.precision):'—';output.setAttribute('aria-live','polite');entry.host.append(output);
    const plus=button('+','plus',{delta:1});plus.disabled=disabled||value>=p.max;
  }else for(const o of p.options){const b=button(o.label,String(o.value),{value:o.value});b.setAttribute('aria-pressed',String(value===o.value));}
  entry.quality.textContent=props.controlError?.[n.id]||(!range?(screenDemoAllowed(props.doc)?'本地演示 · 不写现场':'当前数据连接只读'):'');
  entry.quality.setAttribute('role',props.controlError?.[n.id]?'alert':'status');entry.quality.style.display=p.hideLabel&&!props.controlError?.[n.id]?'none':'';
  if(focus) [...entry.host.querySelectorAll('button')].find(b=>b.dataset.controlKey===focus)?.focus({preventScroll:true});
}

export function screenControlProblem(n,doc){try{validateScreenControl(n,doc,true);return '';}catch(error){return error.message;}}
