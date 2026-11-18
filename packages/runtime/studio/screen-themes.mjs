export const screenThemes = {
  "process-gray": {
    name: "灰色工艺",
    background: "#f4f7f9",
    fill: "#e5edf2",
    card: "#ffffff",
    stroke: "#547185",
    color: "#304c5d",
    water: "#66abc5",
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
    padding: 14,
  },
};
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
