import { screenAppearanceOptions } from "../../components/studio/screen-symbols.mjs";

export const screenDrawingAppearances = { classic: "经典平面", detailed: "精细平面", depth: "2.5D 立体" };
export function applyScreenAppearance(doc, appearance, selected) {
  if (!Object.hasOwn(screenDrawingAppearances, appearance)) throw Error("绘图外观无效");
  let count = 0;
  for (const item of [...doc.nodes, ...doc.pipes]) {
    if (item.locked || selected && !selected.includes(item.id)) continue;
    const target = item.type === "pipe" ? item.style : item.params;
    if (!screenAppearanceOptions(item.type === "pipe" ? "pipe" : item.symbol)[appearance]) continue;
    if (target.appearance === "picture") continue;
    if (target.appearance !== appearance) { target.appearance = appearance; count++; }
  }
  return count;
}

export const screenThemes = {
  "process-gray": {
    name: "灰色工艺",
    background: "#f4f7f9",
    fill: "#e5edf2",
    card: "#ffffff",
    stroke: "#547185",
    color: "#304c5d",
    water: "#66abc5",
    numericFont: "Microsoft YaHei",
    padding: 16,
  },
  "monitor-light": {
    name: "浅色监控",
    background: "#eef5fa",
    fill: "#eaf3f8",
    card: "#ffffff",
    stroke: "#6a93aa",
    color: "#23445a",
    water: "#5faac6",
    numericFont: "Arial",
    padding: 18,
  },
  "cockpit-dark": {
    name: "深色驾驶舱",
    background: "#071a2a",
    fill: "#102d42",
    card: "#102d42",
    stroke: "#426a83",
    color: "#d5e9f4",
    water: "#3887a6",
    numericFont: "Consolas",
    padding: 14,
  },
};

export const screenPurposes = {
  process: {
    name: "工艺监控",
    theme: "process-gray",
    groups: ["devices", "measurements", "widgets"],
    fontSizes: { text: 32, readout: 44 },
  },
  cockpit: {
    name: "数据驾驶舱",
    theme: "cockpit-dark",
    groups: ["widgets", "measurements", "devices"],
    fontSizes: { text: 40, readout: 48 },
  },
};

export function applyScreenPurpose(doc, purpose) {
  const preset = screenPurposes[purpose];
  if (!Object.hasOwn(screenPurposes, purpose)) throw Error("画面用途无效");
  if (doc.nodes.length || doc.pipes.length) throw Error("画面用途只可在空白画面选择");
  applyScreenTheme(doc, preset.theme);
  doc.canvas.purpose = purpose;
}

export function applyScreenNodeDefaults(node, canvas) {
  if (canvas.theme) applyScreenNodeTheme(node, canvas.theme);
  if (!node.params.appearance && canvas.appearance && screenAppearanceOptions(node.symbol)[canvas.appearance])
    node.params.appearance = canvas.appearance;
  const size = screenPurposes[canvas.purpose]?.fontSizes?.[node.symbol];
  if (size !== undefined) node.style.fontSize = size;
}
function screenThemeFill(symbol, theme) {
  return symbol === "text"
    ? "transparent"
    : symbol === "junction"
      ? theme.stroke
      : [
            "readout",
            "trend",
            "barChart",
            "pieChart",
            "gauge",
            "table",
            "events",
          ].includes(symbol)
        ? theme.card
        : theme.fill;
}
export function applyScreenNodeTheme(node, id, previous) {
  const theme = screenThemes[id];
  if (!theme) throw Error("画面主题不存在");
  const before =
    screenThemes[previous || node.params?.theme] ||
    screenThemes["process-gray"];
  if (node.style.color === before.color) node.style.color = theme.color;
  if (node.style.stroke === before.stroke) node.style.stroke = theme.stroke;
  if (node.style.fill === screenThemeFill(node.symbol, before))
    node.style.fill = screenThemeFill(node.symbol, theme);
  if (
    ["readout", "gauge", "barGauge"].includes(node.symbol) &&
    (!node.style.fontFamily || node.style.fontFamily === before.numericFont)
  )
    node.style.fontFamily = theme.numericFont;
  if (
    ["tank", "barGauge"].includes(node.symbol) &&
    (!node.params.waterColor || node.params.waterColor === before.water)
  )
    node.params.waterColor = theme.water;
  node.params.theme = id;
  node.params.cardPadding = theme.padding;
}
export function applyScreenTheme(doc, id) {
  const theme = screenThemes[id];
  if (!theme) throw Error("画面主题不存在");
  const previous = doc.canvas.theme || "process-gray";
  for (const node of doc.nodes) applyScreenNodeTheme(node, id, previous);
  doc.canvas = { ...doc.canvas, theme: id, background: theme.background };
}
