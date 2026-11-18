import assert from "node:assert/strict";
import {
  blankScreen,
  screenNode,
  editScreenDefinition,
  screenDisplay,
  screenState,
  copyScreenSelection,
} from "../packages/runtime/studio/screen-model.mjs";
import { validate } from "../apps/scada-designer/studio/model.mjs";
import {
  screenSlots,
  screenPorts,
  screenPoint,
} from "../packages/components/studio/screen-symbols.mjs";
import {
  editScreenRule,
  screenRuleProjection,
} from "../packages/runtime/studio/screen-dynamics.mjs";
import {
  makeScreenSymbol,
  placeScreenSymbol,
  validateScreenSymbol,
} from "../packages/runtime/studio/screen-library.mjs";
import {
  validateScreenAsset,
  editScreenEndpoint,
} from "../packages/runtime/studio/screen-model.mjs";

const doc = blankScreen();
const a = screenNode("rect", "a", 100, 100),
  b = screenNode("valve", "b", 700, 100);
doc.nodes.push(a, b);
doc.mappings = [
  {
    id: "q",
    label: "流量",
    kind: "number",
    path: "value",
    scale: 1,
    offset: 0,
    precision: 2,
    unit: "m³/h",
  },
  {
    id: "run",
    label: "运行",
    kind: "boolean",
    path: "run",
    scale: 1,
    offset: 0,
    precision: 0,
    unit: "",
  },
];
editScreenDefinition(doc, "a", "ports", "add", {
  id: "out",
  label: "自定出口",
  x: 100,
  y: 25,
  direction: "out",
});
editScreenDefinition(doc, "b", "ports", "add", {
  id: "inlet",
  label: "上部进口",
  x: 25,
  y: 0,
  direction: "in",
});
doc.pipes.push({
  id: "pipe",
  type: "pipe",
  title: "自定义接口管道",
  source: { nodeId: "a", portId: "out" },
  target: { nodeId: "b", portId: "inlet" },
  vertices: [],
  style: { color: "#557f96", width: 7 },
  bindings: {},
});
validate(doc, false);
editScreenDefinition(doc, "a", "ports", "edit", {
  id: "out",
  label: "出口改名",
  x: 100,
  y: 75,
});
assert.equal(doc.pipes[0].source.portId, "out");
assert.equal(screenPorts(a)[0].y, 75);
assert.throws(
  () => editScreenDefinition(doc, "a", "ports", "remove", { id: "out" }),
  /仍有管道/,
);
assert.throws(
  () =>
    editScreenDefinition(doc, "a", "ports", "edit", {
      id: "out",
      direction: "in",
    }),
  /方向/,
);
assert.throws(
  () => editScreenDefinition(doc, "a", "ports", "edit", { id: "out", x: 101 }),
  /连接点/,
);
assert.equal(screenPorts(a)[0].x, 100);
editScreenDefinition(doc, "a", "slots", "add", {
  key: "flowReading",
  label: "出水流量",
  kinds: ["number"],
  required: true,
  role: "value",
});
assert.throws(() => validate(doc, true), /出水流量/);
a.bindings.flowReading = "q";
b.bindings.open = "run";
validate(doc, true);
assert.equal(
  screenDisplay(a, { q: { value: 0, quality: "good" } }, doc.mappings).text,
  "0.00 m³/h",
);
assert.equal(
  screenPoint(a, { q: { value: 0, quality: "good" } }, "value").value,
  0,
);
editScreenDefinition(doc, "b", "slots", "edit", {
  key: "open",
  label: "阀门开到位",
});
assert.equal(
  screenState(b, { run: { value: false, quality: "good" } }),
  "关闭",
);
assert.throws(
  () =>
    editScreenDefinition(doc, "a", "slots", "add", {
      key: "bad",
      label: "非法状态",
      kinds: ["number"],
      required: false,
      role: "run",
    }),
  /开关量/,
);
editScreenRule(doc, "a", "add", {
  id: "high",
  slot: "flowReading",
  op: "gte",
  value: 10,
  target: "fill",
  result: "#ff6600",
});
editScreenRule(doc, "a", "add", {
  id: "higher",
  slot: "flowReading",
  op: "gte",
  value: 15,
  target: "fill",
  result: "#ff0000",
});
assert.equal(
  screenRuleProjection(a, { q: { value: 20, quality: "good" } }).fill,
  "#ff6600",
);
editScreenRule(doc, "a", "up", { id: "higher" });
assert.equal(
  screenRuleProjection(a, { q: { value: 20, quality: "good" } }).fill,
  "#ff0000",
);
assert.equal(
  screenRuleProjection(a, { q: { value: 0, quality: "good" } }).fill,
  undefined,
);
assert.equal(
  screenRuleProjection(a, { q: { value: 20, quality: "stale" } }).fill,
  "#9baab5",
);
assert.throws(
  () =>
    editScreenDefinition(doc, "a", "slots", "remove", { key: "flowReading" }),
  /规则/,
);
assert.throws(
  () => editScreenRule(doc, "a", "edit", { id: "high", slot: "missing" }),
  /引用/,
);
assert.equal(a.rules[1].slot, "flowReading");
const originalPorts = JSON.stringify(a.ports),
  originalRules = JSON.stringify(a.rules);
let seq = 0;
const copies = copyScreenSelection(doc, ["a", "b"], () => "copy-" + ++seq);
const c = doc.nodes.find((n) => n.id === copies[0]);
c.ports[0].label = "副本接口";
assert.equal(JSON.stringify(a.ports), originalPorts);
assert.equal(JSON.stringify(a.rules), originalRules);
assert.equal(screenSlots(c)[0].key, "flowReading");
assert.deepEqual(c.bindings, {});
assert.equal(doc.pipes.at(-1).source.portId, "out");
assert.equal(doc.pipes.at(-1).target.portId, "inlet");
validate(JSON.parse(JSON.stringify(doc)), false);
const symbol = makeScreenSymbol(doc, ["a", "b"], "自绘设备支路", "symbol");
assert.equal(symbol.nodes.length, 2);
assert.equal(symbol.pipes.length, 1);
assert(
  symbol.nodes.every(
    (n) => n.dataSlots && n.ports && Object.values(n.bindings).every((v) => !v),
  ),
);
const target = blankScreen();
target.symbols = [symbol];
const instance = placeScreenSymbol(
  target,
  symbol,
  200,
  300,
  () => "instance-" + ++seq,
);
assert.equal(target.nodes.length, 2);
assert.equal(target.pipes.length, 1);
assert(instance.includes(target.pipes[0].source.nodeId));
assert.equal(target.pipes[0].source.portId, "out");
target.nodes[0].ports[0].label = "实例修改";
assert.notEqual(symbol.nodes[0].ports[0].label, "实例修改");
validate(JSON.parse(JSON.stringify(target)), false);
assert.throws(
  () =>
    validateScreenSymbol({
      ...symbol,
      nodes: [{ ...symbol.nodes[0], bindings: { flowReading: "field-point" } }],
    }),
  /端口|绑定|边界/,
);
const openDoc = blankScreen();
openDoc.nodes.push(screenNode("pump", "op", 1600, 500));
openDoc.pipes.push({
  id: "open",
  type: "pipe",
  title: "开放管端",
  source: { nodeId: "op", portId: "right" },
  target: { x: 1910, y: 580 },
  vertices: [],
  style: { color: "#557f96", width: 7 },
  bindings: {},
});
validate(openDoc, false);
copyScreenSelection(openDoc, ["op"], () => "open-copy-" + ++seq);
assert.equal(openDoc.pipes.length, 2);
assert.equal(openDoc.pipes[1].target.x, 1920);
validate(openDoc, false);
const openSymbol = makeScreenSymbol(openDoc, ["op"], "开放管路", "openSymbol");
assert.equal(openSymbol.pipes.length, 1);
assert(!openSymbol.pipes[0].target.nodeId);
assert.equal(openSymbol.w, 310);
editScreenEndpoint(openDoc, "open", "target", { x: 1800, y: 680 });
assert.equal(openDoc.pipes[0].target.y, 680);
assert.throws(
  () => editScreenEndpoint(openDoc, "open", "target", { x: 1921, y: 680 }),
  /开放端/,
);
const asset = (s) =>
  "data:image/svg+xml;base64," + Buffer.from(s).toString("base64");
validateScreenAsset(
  asset('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>'),
);
assert.throws(
  () =>
    validateScreenAsset(asset("<svg><script>window.bad=true</script></svg>")),
  /动态/,
);
assert.throws(
  () =>
    validateScreenAsset(
      asset('<svg><image href="https://example.com/a.png"/></svg>'),
    ),
  /外部/,
);
console.log(
  "PASS: editable ports, stable identities, directions, transactional edits, custom slots, typed binding, zero/false, rule priority/quality and independent copies",
);
