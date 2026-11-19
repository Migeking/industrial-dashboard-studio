import assert from "node:assert/strict";
import { validate, normalize } from "../apps/scada-designer/studio/model.mjs";
import {
  blankScreen,
  screenNode,
  screenState,
  screenDisplay,
  copyScreenSelection,
} from "../packages/runtime/studio/screen-model.mjs";
import { screenSymbols } from "../packages/components/studio/screen-symbols.mjs";
import { makeScreenSymbol, screenSymbolChanges, validateScreenSymbol } from "../packages/runtime/studio/screen-library.mjs";

const doc = blankScreen();
assert.deepEqual(doc.nodes, []);
assert.deepEqual(doc.pipes, []);
assert.deepEqual(doc.mappings, []);
assert.equal(doc.source.data, "{}");
assert.equal(doc.skin, undefined);
validate(doc, false);
doc.mappings = [
  ["run", "boolean"],
  ["fault", "boolean"],
  ["open", "boolean"],
  ["level", "number"],
].map(([id, kind]) => ({
  id,
  label: id,
  kind,
  path: id,
  unit: id === "level" ? "m" : "",
  scale: 1,
  offset: 0,
  precision: 2,
}));
const pump = screenNode("pump", "p", 600, 400),
  valve = screenNode("valve", "v", 1000, 400),
  tank = screenNode("tank", "t", 200, 300);
doc.nodes.push(pump, valve, tank);
pump.bindings = { run: "run", fault: "fault" };
valve.bindings = { open: "open" };
tank.bindings = { value: "level" };
doc.pipes.push({
  id: "e",
  type: "pipe",
  title: "管道",
  source: { nodeId: "p", portId: "right" },
  target: { nodeId: "v", portId: "left" },
  vertices: [{ x: 900, y: 480 }],
  style: { color: "#557f96", width: 7 },
  bindings: {},
});
validate(doc, true);
const unit = makeScreenSymbol(doc, ["p", "v"], "回流泵阀组", "unit");
assert.equal(unit.revision, 1);
const portable = structuredClone(unit);
delete portable.revision;
assert.equal(validateScreenSymbol(portable), portable);
assert.throws(() => validateScreenSymbol({ ...portable, revision: 0 }), /图元文件/);
portable.nodes[0].id = "new-pump-id";
portable.pipes[0].source.nodeId = portable.nodes[0].id;
assert.deepEqual(screenSymbolChanges(unit, portable), []);
portable.nodes[0].ports.find((p) => p.id === "right").x = 90;
portable.nodes[0].dataSlots.push({
  key: "energy", label: "电耗", role: "extra", kinds: ["number"], required: true,
});
const changes = screenSymbolChanges(unit, portable);
assert.equal(changes.length, 2);
assert.match(changes.find((item) => item.key === "right").to, /位置 90%/);
assert.match(changes.find((item) => item.key === "energy").to, /电耗 · 必绑/);
const bad = (change, pattern) => {
  const copy = structuredClone(doc);
  change(copy);
  assert.throws(() => validate(copy, true), pattern);
};
bad((d) => (d.nodes[0].bindings.run = ""), /运行反馈/);
bad((d) => (d.nodes[0].bindings.run = "level"), /类型/);
bad((d) => (d.pipes[0].source.portId = "missing"), /端口/);
bad((d) => (d.pipes[0].target.nodeId = "missing"), /端口/);
bad((d) => (d.pipes[0].id = "p"), /编号/);
bad((d) => (d.nodes[0].w = NaN), /尺寸/);
bad((d) => (d.nodes[0].x = 1900), /尺寸/);
bad((d) => (d.nodes[2].params.max = 0), /量程/);
bad((d) => (d.nodes[0].bindings.script = "run"), /槽位/);
const good = (value) => ({ quality: "good", value });
assert.equal(
  screenState(pump, { run: good(false), fault: good(false) }),
  "停止",
);
assert.equal(
  screenState(pump, { run: good(true), fault: good(false) }),
  "运行",
);
assert.equal(
  screenState(pump, { run: { quality: "bad" }, fault: good(true) }),
  "故障",
);
assert.equal(
  screenState(pump, { run: good(true), fault: { quality: "stale" } }),
  "未知",
);
assert.equal(screenState(valve, { open: good(false) }), "关闭");
assert.equal(
  screenDisplay(tank, { level: good(0) }, doc.mappings).text,
  "0.00 m",
);
assert.equal(
  screenDisplay(tank, { level: { quality: "bad", value: 3 } }, doc.mappings)
    .text,
  "—",
);
const zero = normalize({ level: 0 }, doc.mappings[3], 1000, 5000, 1000);
assert.equal(zero.value, 0);
const copies = copyScreenSelection(
  doc,
  ["p", "v"],
  () => "copy-" + Math.random(),
);
assert.equal(copies.length, 2);
assert.equal(doc.pipes.length, 2);
assert.deepEqual(doc.nodes.at(-1).bindings, {});
assert.deepEqual(doc.pipes.at(-1).bindings, {});
assert(copies.includes(doc.pipes.at(-1).source.nodeId));
assert(copies.includes(doc.pipes.at(-1).target.nodeId));
validate(doc, false);
assert.throws(() => validate(doc, true), /运行反馈/);
assert(!JSON.stringify(screenSymbols).includes("01"));
assert(!JSON.stringify(screenSymbols).includes("05"));
console.log(
  "PASS: neutral blank, independent symbols, typed bindings, port references, bounds, zero/false, fault/quality and copy remapping",
);
