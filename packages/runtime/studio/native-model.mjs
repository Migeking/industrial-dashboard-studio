import { nativeTemplates } from "../../components/studio/native-data.mjs";

export const isNative = (doc) => doc?.schemaVersion === 2;
export const nativeTypes = new Set(["element", "trend"]);
export const nativeClone = (value) => JSON.parse(JSON.stringify(value));
export function nativeTemplate(key) {
  if (!nativeTemplates[key]) throw Error("场景尚未完成迁移");
  const { css, ...doc } = nativeClone(nativeTemplates[key]);
  doc.skinVersion = 1;
  return doc;
}
export function nativeCss(skin) {
  const common = (nativeTemplates["01"].css.match(/\.(?:kpi(?::after)?|k-label|k-value(?: small)?|k-sub|equipment(?: b| small| \.hz)?|state(?:\.warn)?|chart|process-panel \.panel-body|process-svg|tank-[\w-]+|metric-[\w-]+|flow-[\w-]+|bubble|equipment-dot|warn-dot)\s*\{[^}]*\}/g) || []).join("\n");
  const components = Object.entries(nativeTemplates).map(([id, asset]) => {
    const variables = asset.css.match(/--[\w-]+\s*:[^;}]+;/g)?.join("") || "";
    return `[data-native-component="${id}"]{${variables}}\n@scope ([data-native-component="${id}"]) {${asset.css}}`;
  }).join("\n");
  return common + "\n" + (nativeTemplates[skin]?.css || "") + "\n" + components;
}
export const nativeRecipes = [
  { key: "kpi", label: "紧凑指标卡", scene: "01", className: "kpi", width: 284, height: 112 },
  { key: "trend", label: "双轴趋势图", scene: "01", id: "controlChart", width: 700, height: 280 },
  { key: "equipment", label: "设备卡", scene: "01", className: "equipment", width: 314, height: 58 },
  { key: "a2o", label: "四池与回流组合", scene: "01", className: "process-panel", width: 1172, height: 488 },
  { key: "pumps", label: "泵组管网组合", scene: "05", className: "schematic-wrapper", width: 1220, height: 784 },
];
export function nativeBlank() {
  const doc = nativeTemplate("01");
  doc.template = "blank"; doc.title = "新建工艺画布";
  doc.nodes = doc.nodes.filter((n) => !n.parentId);
  doc.nodes[0].content = [];
  return doc;
}
export function nativeRecipe(key) {
  const recipe = nativeRecipes.find((r) => r.key === key), doc = nativeTemplate(recipe.scene);
  const root = doc.nodes.find((n) => recipe.id ? n.attrs.id === recipe.id : n.attrs.class?.split(" ").includes(recipe.className));
  const branch = nativeBranch(doc, root.id), ids = new Set(branch.map((n) => n.id));
  // A portable process assembly owns its controller setpoint slot, even when
  // the complete template displays that value in a separate header panel.
  for (const n of branch) {
    if (n.action?.type !== "pid" || ids.has(n.action.target)) continue;
    const owner = doc.nodes.find((v) => v.id === n.action.target);
    const slot = nativeClone(owner.slots.find((s) => s.key === n.action.slot));
    n.slots.push(slot); n.bindings[slot.key] = owner.bindings[slot.key];
    n.action.target = n.id;
  }
  root.editable = true;
  return { recipe, doc, root };
}
export function nativeSlots(node) {
  return node?.slots || [];
}
export function nativeProblem(node, mappings) {
  for (const slot of nativeSlots(node)) {
    const id = node.bindings?.[slot.key];
    if (!id && !slot.required) continue;
    const mapping = mappings.find((m) => m.id === id);
    if (!mapping) return slot.label + "：请选择测点";
    const kinds = slot.kind === "series" ? ["number", "dataset"] : [slot.kind];
    if (!kinds.includes(mapping.kind)) return slot.label + "：测点类型不匹配";
  }
  return "";
}
export function nativeSlotMappings(slot, mappings) {
  return mappings.filter((m) => (slot.kind === "series" ? ["number", "dataset"] : [slot.kind]).includes(m.kind));
}
const nativeTags = new Set("div header main section article footer span strong small b p i em time label h1 h2 h3 h4 h5 button input table thead tbody tr th td svg defs linearGradient stop filter feGaussianBlur feMerge feMergeNode path g rect text circle line polyline polygon ellipse".split(" "));
const nativeOps = new Set(["enum", "runningValue", "runningCount", "positive", "linear", "modeClass", "scenarioClass", "oxygenClass", "pumpClass", "flowClass", "equipmentState", "equipmentClass", "eventCount"]);
export function validateNative(doc, publishing) {
  if (!nativeTemplates[doc.skin] || doc.skinVersion !== 1 || !doc.nodes.length || doc.nodes.length > 3000) throw Error("场景资产版本或对象数量无效");
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  if (byId.size !== doc.nodes.length) throw Error("对象编号重复");
  function spec(value) {
    if (value == null || typeof value !== "object") return;
    if (value.precision !== undefined && (!Number.isInteger(value.precision) || value.precision < 0 || value.precision > 10)) throw Error("显示小数位无效");
    if (value.op && !nativeOps.has(value.op)) throw Error("不支持的场景规则");
    if (value.node && (!byId.has(value.node) || !nativeSlots(byId.get(value.node)).some((s) => s.key === value.slot))) throw Error("测点插槽引用无效");
    if (value.devices && !value.devices.every((id) => byId.has(id))) throw Error("设备引用无效");
    Object.values(value).forEach(spec);
  }
  for (const n of doc.nodes) {
    if (!n.id || !nativeTypes.has(n.type) || !nativeTags.has(n.tag) || typeof n.title !== "string" || !Array.isArray(n.content) || !Array.isArray(n.slots)) throw Error("场景对象格式无效");
    if (n.parentId && !byId.has(n.parentId)) throw Error("父对象不存在");
    const chain = new Set([n.id]);
    let parent = n.parentId;
    while (parent) {
      if (chain.has(parent)) throw Error("对象层次形成循环");
      chain.add(parent);
      parent = byId.get(parent)?.parentId;
    }
    for (const [key, value] of Object.entries(n.attrs || {})) {
      if (!/^[a-zA-Z][\w:-]*$/.test(key) || /^on/i.test(key) || ["srcdoc", "href", "src"].includes(key) || typeof value !== "string") throw Error("对象属性无效");
    }
    const slots = new Set();
    for (const s of n.slots) {
      if (!s.key || slots.has(s.key) || !["number", "boolean", "text", "dataset", "series"].includes(s.kind)) throw Error("绑定插槽无效");
      slots.add(s.key);
    }
    for (const part of n.content) {
      if (part?.child && byId.get(part.child)?.parentId !== n.id) throw Error("子对象引用无效");
      spec(part);
    }
    spec(n.rules);
    if (n.action && !["scenario", "faceplate", "pid", "ack", "silence"].includes(n.action.type)) throw Error("交互动作无效");
    if (n.action?.type === "faceplate" && !byId.has(n.action.target)) throw Error("设备面板目标无效");
    if (n.action?.type === "pid" && !nativeSlots(byId.get(n.action.target)).some((s) => s.key === n.action.slot && s.kind === "number")) throw Error("回路设定目标无效");
    if (n.action?.type === "scenario" && !doc.demo?.scenarios?.some((s) => s.id === n.action.target)) throw Error("工况目标无效");
    if (n.type === "trend") {
      const option = n.chart?.options;
      if (!option?.xAxis?.[0] || !option.legend?.[0] || !Array.isArray(option.yAxis) || !Array.isArray(option.series) || !Array.isArray(n.chart?.series) || !n.chart.series.length || n.chart.series.some((s, i) => !option.series[i] || !option.yAxis[s.axis] || !["line", "bar"].includes(s.type) || ![0, 1].includes(s.axis) || !n.slots.some((slot) => slot.key === s.slot && slot.kind === "series"))) throw Error("图表序列配置无效");
    }
    if (Object.values(n.layout || {}).some((v) => !Number.isFinite(v) || Math.abs(v) > 10000)) throw Error("对象位置无效");
    if (["width", "height", "scaleX", "scaleY"].some((key) => n.layout?.[key] !== undefined && n.layout[key] <= 0)) throw Error("对象尺寸无效");
    if (publishing) {
      const problem = nativeProblem(n, doc.mappings);
      if (problem) throw Error(n.title + " · " + problem);
    }
  }
  const roots = doc.nodes.filter((n) => !n.parentId);
  if (roots.length !== 1 || roots[0].attrs.id !== "screen") throw Error("场景根对象无效");
  const visited = new Set();
  function visit(n) { if (visited.has(n.id)) throw Error("重复子对象引用"); visited.add(n.id); n.content.filter((p) => p?.child).forEach((p) => visit(byId.get(p.child))); }
  visit(roots[0]);
  if (visited.size !== doc.nodes.length) throw Error("存在未连接的对象");
  return doc;
}

// Finite display rules; no JavaScript evaluation or template-specific branches.
export function nativePoint(spec, doc, points, ui = {}) {
  const byId = ui.byId || new Map(doc.nodes.map((n) => [n.id, n]));
  if (typeof spec !== "object" || spec == null) return { value: spec, quality: "good" };
  const get = (s) => nativePoint(s, doc, points, { ...ui, byId });
  const good = (value) => ({ value, quality: "good" });
  const bad = () => ({ value: null, quality: "bad" });
  if (spec.node) {
    const id = byId.get(spec.node)?.bindings?.[spec.slot];
    if (spec.meta === "unit") return good(doc.mappings.find((m) => m.id === id)?.unit || "");
    return { ...(points[id] || bad()), mapping: doc.mappings.find((m) => m.id === id) };
  }
  if (spec.runtime) {
    const valid = Object.values(points).every((p) => p.quality === "good");
    return good(({ clock: new Date(ui.clock || Date.now()).toLocaleTimeString("zh-CN", { hour12: false }), date: new Date(ui.clock || Date.now()).toLocaleDateString("zh-CN").replaceAll("/", " · "), auditCount: ui.audit?.length || 0, alarmClass: ui.ack ? "ack" : "", quality: valid ? "数据质量 GOOD" : "数据质量异常", connectionState: valid ? "系统在线" : "数据待确认", communication: valid ? doc.source.demo ? "样本正常" : "已连接" : "无法确认" })[spec.runtime]);
  }
  if (spec.op === "runningCount") {
    const rows = spec.devices.map((id) => get({ node: id, slot: "run" }));
    return rows.every((p) => p.quality === "good") ? good(rows.filter((p) => p.value === true).length * (spec.scale || 1)) : bad();
  }
  if (spec.op === "modeClass") return good("mode-" + (ui.scenario || "stable"));
  if (spec.op === "scenarioClass") return good((ui.scenario || "stable") === spec.target ? "active" : "");
  if (["equipmentState", "equipmentClass"].includes(spec.op)) {
    const run = get(spec.run), fault = get(spec.fault);
    const state = fault.quality === "good" && fault.value ? "故障" : run.quality !== "good" || fault.quality !== "good" ? "未知" : run.value ? spec.notice ? "关注" : "运行" : "停止";
    return good(spec.op === "equipmentState" ? state : state === "未知" ? "native-unknown" : state === "故障" ? "native-fault" : "");
  }
  if (spec.op === "pumpClass" || spec.op === "runningValue") {
    const run = get(spec.run), fault = get(spec.fault);
    if (fault.quality === "good" && fault.value === true) return good(spec.op === "pumpClass" ? "fault" : "故障");
    if (run.quality !== "good" || fault.quality !== "good") return spec.op === "pumpClass" ? good("native-unknown") : bad();
    if (spec.op === "pumpClass") return good(run.value ? "running" : "");
    if (!run.value) return good("停机");
    const input = get(spec.input);
    return input.quality === "good" ? good(Number(input.value).toFixed(spec.precision) + spec.suffix) : bad();
  }
  const input = get(spec.input);
  if (spec.op === "flowClass") return good(input.quality === "good" && input.value ? "pipe-base pipe-flow" : "pipe-base pipe-flow stop");
  if (input.quality !== "good") return bad();
  if (spec.op === "positive") return good(input.value > 0);
  if (spec.op === "linear") return good(Number(input.value) * spec.scale + (spec.offset || 0));
  if (spec.op === "enum") return good(spec.values[String(input.value)] ?? "—");
  if (spec.op === "eventCount") return Array.isArray(input.value) ? good(input.value.filter((r) => r.level === "warning").length + " 条关注") : bad();
  if (spec.op === "oxygenClass") return good(Number(input.value) < 2 ? "warn-dot" : "equipment-dot");
  return bad();
}
export function nativeText(spec, doc, points, ui) {
  if (typeof spec === "string") return spec;
  const p = nativePoint(spec, doc, points, ui);
  if (p.quality !== "good") return "—";
  return typeof p.value === "number" ? p.value.toFixed(spec.precision ?? p.mapping?.precision ?? 0) : String(p.value ?? "—");
}
export function nativeBranch(doc, id) {
  const found = new Set(), result = [];
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  function visit(key) { const n = byId.get(key); if (found.has(key) || !n) return; found.add(key); result.push(n); n.content.filter((p) => p?.child).forEach((p) => visit(p.child)); }
  visit(id);
  return result;
}
export function cloneNativeBranch(doc, id, createId = () => crypto.randomUUID()) {
  const branch = nativeBranch(doc, id), ids = new Map(branch.map((n) => [n.id, createId()]));
  function rewrite(value) {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
    return ids.get(value) || value;
  }
  return branch.map((n) => rewrite(nativeClone(n)));
}
