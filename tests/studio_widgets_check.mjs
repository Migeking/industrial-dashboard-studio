import assert from "node:assert/strict";
import {
  blankScreen,
  screenNode,
} from "../packages/runtime/studio/screen-model.mjs";
import { screenSlots } from "../packages/components/studio/screen-symbols.mjs";
import {
  screenChartResult,
  screenTableResult,
  screenField,
  screenNumeric,
} from "../packages/runtime/studio/screen-widgets.mjs";
import { applyScreenNodeTheme, applyScreenTheme } from "../packages/runtime/studio/screen-themes.mjs";
import { validate } from "../apps/scada-designer/studio/model.mjs";

const doc = blankScreen(),
  n = screenNode("trend", "dual", 100, 100),
  now = 1794960000000;
doc.nodes.push(n);
doc.mappings = [
  {
    id: "hist",
    label: "运行历史",
    kind: "dataset",
    path: "hist",
    scale: 1,
    offset: 0,
    precision: 2,
    unit: "m³/h",
  },
  {
    id: "instant",
    label: "泵频率",
    kind: "number",
    path: "instant",
    scale: 1,
    offset: 0,
    precision: 2,
    unit: "Hz",
  },
];
n.dataSlots = JSON.parse(JSON.stringify(screenSlots(n)));
n.dataSlots.push({
  key: "head",
  label: "扬程历史",
  role: "extra",
  kinds: ["dataset"],
  required: true,
});
n.bindings = { value: "hist", head: "hist" };
n.params = {
  ...n.params,
  xField: "at",
  leftMin: 0,
  leftMax: 100,
  rightMin: 0,
  rightMax: 10,
  rightUnit: "m",
  series: [
    {
      id: "flow",
      slot: "value",
      name: "流量",
      type: "line",
      axis: 0,
      field: "flow",
    },
    {
      id: "head",
      slot: "head",
      name: "扬程",
      type: "bar",
      axis: 1,
      field: "head",
    },
  ],
  thresholds: [{ value: 8, axis: 1, label: "扬程参考", color: "#d98b45" }],
};
validate(doc, true);
const rows = [
    { at: now - 2000, flow: 0, head: 3 },
    { at: now - 1000, flow: null, head: 4 },
    { at: now, flow: 12, head: 5 },
  ],
  points = { hist: { value: rows, quality: "good", timestamp: now } };
const entry = {},
  result = screenChartResult(n, points, doc.mappings, entry, 1, 1, now);
assert.equal(result.option.yAxis.length, 2);
assert.equal(result.option.yAxis[1].max, 10);
assert.equal(result.option.series[1].type, "bar");
assert.equal(result.option.series[0].data[0][1], 0);
assert.equal(result.option.series[0].data[1][1], null);
assert.equal(result.option.series[1].markLine.data[0].yAxis, 8);
assert.equal(
  screenChartResult(n, points, doc.mappings, entry, 1, 1, now + 500),
  null,
);
const numeric = screenNode("trend", "numeric", 200, 200);
numeric.bindings.value = "instant";
const history = {};
let plotted = screenChartResult(
  numeric,
  { instant: { value: 0, quality: "good", timestamp: now } },
  doc.mappings,
  history,
  1,
  1,
  now,
);
assert.equal(plotted.option.series[0].data[0][1], 0);
plotted = screenChartResult(
  numeric,
  { instant: { value: 0, quality: "bad", timestamp: now + 1000 } },
  doc.mappings,
  history,
  2,
  1,
  now + 1000,
);
assert.equal(plotted.option.series[0].data.at(-1)[1], null);
const table = screenNode("table", "table", 800, 100);
table.bindings.value = "hist";
table.params.columns = [
  { field: "flow", title: "流量", format: "number", unit: "m³/h" },
  { field: "running", title: "运行", format: "boolean", unit: "" },
  { field: "at", title: "时间", format: "time", unit: "" },
];
table.params.sortField = "flow";
table.params.sortDirection = "asc";
table.params.limit = 2;
const tableData = screenTableResult(
  table,
  {
    hist: {
      quality: "good",
      value: [
        { at: 0, flow: 0, running: false },
        { at: now, flow: 12, running: true },
      ],
    },
  },
  doc.mappings,
);
assert.equal(tableData.rows[0].cells[0], "0.00 m³/h");
assert.equal(tableData.rows[0].cells[1], "否");
assert.notEqual(tableData.rows[0].cells[2], "—");
assert.equal(tableData.total, 2);
assert.equal(
  screenTableResult(
    table,
    { hist: { quality: "stale", value: rows } },
    doc.mappings,
  ).rows.length,
  0,
);
assert.equal(screenNumeric(""), null);
assert.equal(screenNumeric(false), null);
assert.equal(screenNumeric("0"), 0);
assert.equal(screenField({ "a.b": 3 }, "a.b"), 3);
assert.equal(screenField({ a: { b: 4 } }, "a.b"), 4);
const pie = screenNode("pieChart", "pie", 200, 600);
pie.bindings.value = "hist";
pie.params.xField = "pump";
const pieResult = screenChartResult(
  pie,
  {
    hist: {
      quality: "good",
      value: [
        { pump: "P1", value: 0 },
        { pump: "P2", value: 12 },
      ],
    },
  },
  doc.mappings,
  {},
  1,
  1,
  now,
);
assert.equal(pieResult.option.series[0].data[0].value, 0);
assert.equal(pieResult.option.series[0].data[1].name, "P2");
const gauge = screenNode("gauge", "g", 300, 300);
gauge.bindings.value = "instant";
const emptyGauge = screenChartResult(
  gauge,
  { instant: { value: null, quality: "offline" } },
  doc.mappings,
  {},
  1,
  1,
  now,
);
assert.deepEqual(emptyGauge.option.series[0].data, []);
assert.equal(emptyGauge.option.graphic[0].style.text, "—");
const before = JSON.stringify(n.bindings);
applyScreenTheme(doc, "cockpit-dark");
assert.equal(doc.canvas.background, "#071a2a");
assert.equal(n.style.color, "#d5e9f4");
assert.equal(JSON.stringify(n.bindings), before);
applyScreenNodeTheme(gauge, "cockpit-dark");
assert.equal(gauge.style.fontFamily, "Consolas");
applyScreenNodeTheme(gauge, "monitor-light");
assert.equal(gauge.style.fontFamily, "Arial");
gauge.style.fontFamily = "SimSun";
applyScreenNodeTheme(gauge, "process-gray");
assert.equal(gauge.style.fontFamily, "SimSun");
n.style.color = "#ffcc00";
applyScreenTheme(doc, "monitor-light");
assert.equal(n.style.color, "#ffcc00");
assert.equal(doc.canvas.background, "#eef5fa");
const malformed = structuredClone(doc);
malformed.nodes[0].params.rightMax = 0;
assert.throws(() => validate(malformed, false), /坐标轴/);
console.log(
  "PASS: multi-series dual axes, fields, gaps, manual ranges, reference lines, zero/false tables, sorting, pie/gauge quality and non-destructive themes",
);
