import { screenSlots } from "../../components/studio/screen-symbols.mjs";

export const screenRuleTargets = {
  fill: "填充颜色",
  color: "文字颜色",
  text: "显示文字",
  visible: "可见性",
  angle: "旋转角度",
  flow: "管道流动",
};
export const screenRuleOps = {
  eq: "等于",
  ne: "不等于",
  gt: "大于",
  gte: "大于或等于",
  lt: "小于",
  lte: "小于或等于",
  between: "在区间内",
};
export function validateScreenRules(n) {
  if (n.rules === undefined) return;
  if (!Array.isArray(n.rules)) throw Error("显示规则格式无效");
  const ids = new Set();
  for (const r of n.rules) {
    const slot = screenSlots(n).find((s) => s.key === r?.slot);
    if (
      !r ||
      typeof r.id !== "string" ||
      !r.id ||
      ids.has(r.id) ||
      !slot ||
      !Object.hasOwn(screenRuleOps, r.op) ||
      !Object.hasOwn(screenRuleTargets, r.target)
    )
      throw Error(n.title + " 的显示规则引用无效");
    ids.add(r.id);
    if (slot.kinds.includes("dataset")) throw Error("显示规则请选择单值槽位");
    if (
      ["gt", "gte", "lt", "lte", "between"].includes(r.op) &&
      (!slot.kinds.every((k) => k === "number") || !Number.isFinite(r.value))
    )
      throw Error("比较规则需要数值槽位和数值条件");
    if (r.op === "between" && (!Number.isFinite(r.max) || r.max < r.value))
      throw Error("规则区间无效");
    if (["eq", "ne"].includes(r.op) && !slot.kinds.includes(typeof r.value))
      throw Error("规则条件与槽位类型不匹配");
    if (
      ["fill", "color"].includes(r.target) &&
      !/^#[\da-f]{6}$/i.test(r.result)
    )
      throw Error("规则颜色无效");
    if (["visible", "flow"].includes(r.target) && typeof r.result !== "boolean")
      throw Error("规则结果必须为开关量");
    if (r.target === "angle" && !Number.isFinite(r.result))
      throw Error("规则旋转角度无效");
    if (r.target === "text" && typeof r.result !== "string")
      throw Error("规则显示文字无效");
    if (n.type !== "pipe" && r.target === "flow")
      throw Error("流动规则仅用于管道");
  }
}
export function screenRuleProjection(n, points) {
  const output = {},
    unavailable = new Set();
  // First row wins. Quality always takes precedence over a normal appearance.
  for (const r of [...(n.rules || [])].reverse()) {
    const p = points[n.bindings[r.slot]];
    if (p?.quality !== "good") {
      unavailable.add(r.target);
      continue;
    }
    const v = p.value,
      pass =
        r.op === "eq"
          ? v === r.value
          : r.op === "ne"
            ? v !== r.value
            : r.op === "gt"
              ? v > r.value
              : r.op === "gte"
                ? v >= r.value
                : r.op === "lt"
                  ? v < r.value
                  : r.op === "lte"
                    ? v <= r.value
                    : v >= r.value && v <= r.max;
    if (pass) output[r.target] = r.result;
  }
  for (const key of unavailable) {
    if (key === "fill" || key === "color") output[key] = "#9baab5";
    else if (key === "text") output.text = "—";
    else if (key === "flow") output.flow = false;
    else delete output[key];
  }
  return output;
}
export function editScreenRule(doc, id, operation, rule, commit = true) {
  const item = [...doc.nodes, ...doc.pipes].find((n) => n.id === id);
  if (!item) throw Error("请选择元素");
  const next = { ...item, rules: JSON.parse(JSON.stringify(item.rules || [])) };
  const index = next.rules.findIndex((r) => r.id === rule.id);
  if (operation === "add") next.rules.push(rule);
  else if (index < 0) throw Error("规则不存在");
  else if (operation === "remove") next.rules.splice(index, 1);
  else if (operation === "up" && index > 0)
    [next.rules[index - 1], next.rules[index]] = [
      next.rules[index],
      next.rules[index - 1],
    ];
  else next.rules[index] = { ...next.rules[index], ...rule };
  validateScreenRules(next);
  if (commit) item.rules = next.rules;
  return next.rules;
}
