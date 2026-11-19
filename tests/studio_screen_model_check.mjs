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
import { makeScreenSymbol, placeScreenSymbol, planScreenSymbolUpgrade, screenSymbolChanges, validateScreenSymbol } from "../packages/runtime/studio/screen-library.mjs";

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
pump.params.equipmentCode = "P-101";
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
assert.equal(unit.nodes[0].params.equipmentCode, undefined);
assert.equal(pump.params.equipmentCode, "P-101");
const invalidCode = structuredClone(doc);
invalidCode.nodes[0].params.equipmentCode = "P-101\tSTG";
assert.throws(() => validate(invalidCode, false), /设备编号无效/);
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
{
  const installed = blankScreen();
  installed.mappings = structuredClone(doc.mappings);
  let sequence = 0;
  const placed = placeScreenSymbol(installed, unit, 400, 300, () => `placed-${++sequence}`);
  const [placedPump, placedValve] = installed.nodes;
  const [internalPipe] = installed.pipes;
  placedPump.title = "P-101 · 现场回流泵";
  placedPump.params.equipmentCode = "P-101";
  placedPump.bindings = { run: "run", fault: "fault" };
  placedValve.bindings = { open: "open" };
  const outside = screenNode("tank", "outside", 1300, 300);
  installed.nodes.push(outside);
  installed.pipes.push({
    ...structuredClone(doc.pipes[0]), id: "outside-pipe", title: "场站出水管",
    source: { nodeId: placedValve.id, portId: "right" },
    target: { nodeId: outside.id, portId: "left" },
  });
  const revised = structuredClone(unit);
  revised.revision = 2;
  const pumpDef = revised.nodes.find((item) => item.id === "p");
  pumpDef.ports.find((port) => port.id === "right").x = 91;
  pumpDef.dataSlots.push({ key: "energy", label: "电耗", role: "extra", kinds: ["number"], required: true });
  const before = structuredClone(installed);
  const plan = planScreenSymbolUpgrade(installed, [placed[0]], revised);
  assert.deepEqual(installed, before);
  assert.equal(plan.connected, 2);
  assert.equal(plan.bindings, 3);
  assert.deepEqual(plan.unbound, ["P-101 · 现场回流泵 · 电耗"]);
  assert.equal(plan.nodes[0].libraryRef.revision, 2);
  assert.equal(plan.nodes[0].title, placedPump.title);
  assert.equal(plan.nodes[0].params.equipmentCode, "P-101");
  assert.deepEqual(plan.nodes[0].bindings, placedPump.bindings);
  assert.equal(plan.nodes[0].ports.find((port) => port.id === "right").x, 91);
  assert.deepEqual({ ...plan.pipes[0], libraryRef: internalPipe.libraryRef }, internalPipe);
  assert.equal(plan.pipes[1], installed.pipes[1]);
  assert.throws(() => validate({ ...installed, nodes: plan.nodes, pipes: plan.pipes }, true), /电耗/);

  const expanded = structuredClone(revised);
  const tankDef = screenNode("tank", "inspection-tank", 760, 180);
  tankDef.title = "取样池";
  expanded.nodes.push(tankDef);
  expanded.w = Math.max(expanded.w, tankDef.x + tankDef.w);
  expanded.h = Math.max(expanded.h, tankDef.y + tankDef.h);
  expanded.pipes.push({ ...structuredClone(expanded.pipes[0]), id: "test-branch", title: "取样支路",
    source: { nodeId: "v", portId: "right" }, target: { nodeId: tankDef.id, portId: "left" },
    vertices: [], bindings: {} });
  const addition = planScreenSymbolUpgrade(installed, placed, expanded, () => `added-${++sequence}`);
  assert.deepEqual(addition.additions, { nodes: ["取样池"], pipes: ["取样支路"] });
  assert.deepEqual(addition.nodes.slice(0, -1), plan.nodes);
  assert.deepEqual(addition.pipes.slice(0, -1), plan.pipes);
  assert.equal(addition.nodes.at(-1).group, placedPump.group);
  assert.equal(addition.nodes.at(-1).x, placedPump.x - pumpDef.x + tankDef.x);
  assert.deepEqual(addition.nodes.at(-1).bindings, {});
  assert.deepEqual(addition.pipes.at(-1).source, { nodeId: placedValve.id, portId: "right" });
  assert.deepEqual(addition.pipes.at(-1).target,
    { nodeId: addition.nodes.at(-1).id, portId: "left" });
  assert.deepEqual(addition.memberIds, [...placed, addition.nodes.at(-1).id]);

  const overflowing = structuredClone(expanded);
  overflowing.nodes.at(-1).x = 1920 - tankDef.w;
  overflowing.w = 1920;
  assert.throws(() => planScreenSymbolUpgrade(installed, placed, overflowing), /取样池.*超出画布/);
  const duplicate = structuredClone(revised);
  duplicate.pipes.push({ ...structuredClone(duplicate.pipes[0]), id: "duplicate", title: "重复接管" });
  assert.throws(() => planScreenSymbolUpgrade(installed, placed, duplicate), /重复接管.*与画面已有接管重复/);
  const reconnect = structuredClone(expanded);
  reconnect.pipes[0].target = { nodeId: tankDef.id, portId: "left" };
  assert.throws(() => planScreenSymbolUpgrade(installed, placed, reconnect), /内部接管已改变/);
  assert.deepEqual(installed, before);

  const resaved = makeScreenSymbol(installed, placed, unit.name, unit.id);
  assert.deepEqual(resaved.nodes.map((item) => item.id), unit.nodes.map((item) => item.id));
  assert.deepEqual(resaved.pipes[0].source, unit.pipes[0].source);
  assert.ok([...resaved.nodes, ...resaved.pipes].every((item) => !item.libraryRef));
  const removed = structuredClone(revised);
  removed.nodes[1].ports = removed.nodes[1].ports.filter((port) => port.id !== "right");
  assert.throws(() => planScreenSymbolUpgrade(installed, placed, removed), /场站出水管.*移除了接口/);
  const rebound = structuredClone(revised);
  rebound.nodes[0].dataSlots = rebound.nodes[0].dataSlots.filter((slot) => slot.key !== "run");
  assert.throws(() => planScreenSymbolUpgrade(installed, placed, rebound), /已绑定 run/);
  const rewired = { ...revised, pipes: [] };
  assert.throws(() => planScreenSymbolUpgrade(installed, placed, rewired), /内部管线数量/);
  assert.throws(() => planScreenSymbolUpgrade(installed, placed, unit), /当前修订/);
  assert.deepEqual(installed, before);

  placedPump.title = unit.nodes[0].title;
  for (const item of [placedPump, placedValve, internalPipe]) delete item.libraryRef;
  const legacy = planScreenSymbolUpgrade(installed, placed, revised);
  assert.equal(legacy.fromRevision, undefined);
  assert.equal(legacy.pipes[0].libraryRef.itemId, unit.pipes[0].id);
  assert.equal(legacy.connected, 2);
}
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
assert.equal(doc.nodes.find(n => n.id === copies[0]).params.equipmentCode, undefined);
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
