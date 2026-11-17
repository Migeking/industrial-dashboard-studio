import assert from "node:assert/strict";
import { template, legacyTemplate, validate, normalize } from "../apps/scada-designer/studio/model.mjs";
import { nativeBranch, cloneNativeBranch, nativePoint, nativeProblem, nativeRecipes, nativeRecipe, nativeBlank } from "../packages/runtime/studio/native-model.mjs";

for (const key of ["01", "05"]) {
  const doc = template(key);
  validate(doc, true);
  assert.equal(doc.schemaVersion, 2);
  const points = Object.fromEntries(doc.mappings.map((m) => [m.id, normalize(JSON.parse(doc.source.data), m, 1700000000000, 5000, 1700000000000)]));
  assert(Object.values(points).every((p) => p.quality === "good"));
  const bad = structuredClone(doc); bad.nodes[1].parentId = bad.nodes[1].id;
  assert.throws(() => validate(bad, false), /循环|子对象引用/);
  const script = structuredClone(doc); script.nodes[1].tag = "script";
  assert.throws(() => validate(script, false), /格式/);
  const size = structuredClone(doc); size.nodes[1].layout.width = -1;
  assert.throws(() => validate(size, false), /尺寸/);
  const precision = structuredClone(doc); precision.nodes[1].content.push({ precision: 200 });
  assert.throws(() => validate(precision, false), /小数位/);
  if (key === "01") {
    const chart = structuredClone(doc); chart.nodes.find((n) => n.type === "trend").chart.options.yAxis = [];
    assert.throws(() => validate(chart, false), /图表/);
  }
  const broken = structuredClone(doc); broken.nodes.find((n) => n.slots.length).bindings = {};
  assert.throws(() => validate(broken, true), /请选择测点/);
  const roots = doc.nodes.filter((n) => !n.parentId);
  assert.equal(nativeBranch(doc, roots[0].id).length, doc.nodes.length);
}
const pump = template("05"), node = pump.nodes.find((n) => n.role === "device");
let serial = 0;
const copies = cloneNativeBranch(pump, node.id, () => "copy-" + (++serial));
const parent = pump.nodes.find((n) => n.id === node.parentId);
parent.content.push({ child: copies[0].id }); pump.nodes.push(...copies);
validate(pump, true);
assert(copies.every((n) => n.id.startsWith("copy-")));
assert.equal(nativeProblem(copies[0], pump.mappings), "");
const group = { id: "late-group", parentId: parent.id, type: "element", tag: "g", role: "group", title: "泵组", attrs: {}, slots: [], bindings: {}, layout: {}, style: {}, content: [{ child: node.id }] };
parent.content = parent.content.filter((p) => p.child !== node.id);
parent.content.push({ child: group.id }); node.parentId = group.id; pump.nodes.push(group);
assert.equal(cloneNativeBranch(pump, group.id)[0].role, "group");
validate(pump, true);
const points = { "P1.run": { value: false, quality: "good" }, "P1.fault": { value: false, quality: "good" }, "P1.frequency": { value: 0, quality: "good" } };
assert.equal(nativePoint({ node: node.id, slot: "run" }, pump, points).value, false);
assert.equal(nativePoint({ node: node.id, slot: "frequency" }, pump, points).value, 0);
assert.equal(nativePoint({ op: "pumpClass", run: { node: node.id, slot: "run" }, fault: { node: node.id, slot: "fault" } }, pump, points).value, "");
points["P1.fault"] = { value: true, quality: "good" };
assert.equal(nativePoint({ op: "pumpClass", run: { node: node.id, slot: "run" }, fault: { node: node.id, slot: "fault" } }, pump, points).value, "fault");
points["P1.run"] = { value: null, quality: "bad" }; points["P1.fault"].value = false;
assert.equal(nativePoint({ op: "pumpClass", run: { node: node.id, slot: "run" }, fault: { node: node.id, slot: "fault" } }, pump, points).value, "native-unknown");
validate(legacyTemplate("01"), true);
for (const recipe of nativeRecipes) {
  const doc = nativeBlank(), sample = nativeRecipe(recipe.key);
  const branch = cloneNativeBranch(sample.doc, sample.root.id);
  branch[0].parentId = doc.nodes[0].id;
  doc.nodes[0].content.push({ child: branch[0].id }); doc.nodes.push(...branch);
  doc.mappings = sample.doc.mappings;
  validate(doc, true);
}
console.log("PASS: V2 graphs, reference/cycle validation, safe tags, nested copy, named slots, zero/false, quality, fault priority, V1 compatibility");
