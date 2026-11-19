import assert from "node:assert/strict";
import {
  csv,
  normalize,
  effectivePollMs,
  template,
  legacyTemplate,
  validate,
  node,
  importNorthbound,
  validateConnection,
  compatibleMappings,
  bindingProblem,
  protocolMappings,
  snapshotPointRows,
  snapshotPointMapping,
  exportSnapshotCrosswalk,
  importSnapshotCrosswalk,
  campusBindings,
  campusState,
} from "../apps/scada-designer/studio/model.mjs";
const doc = legacyTemplate(),
  time = 1700000000000,
  m = doc.mappings[0];
const legacyCampus = template("30");
const snapshotLevel = {
  id: "LT-101.PV", kind: "number", raw: 16000, value: 16000,
  quality: "good", timestamp: time - 100, receivedAt: time,
};
const snapshotPayload = { points: [snapshotLevel,
  { id: "DUP", kind: "number" }, { id: "DUP", kind: "number" },
  { id: 123, kind: "number" }, { id: "123", kind: "number" },
  { id: "INVALID", kind: "unsupported" }, null,
] };
assert.deepEqual([...snapshotPointRows(snapshotPayload)], [[snapshotLevel.id, snapshotLevel]]);
const baseline = { ...m, id: "level", kind: "number", unit: "m", precision: 2,
  conversion: { mode: "raw420", engineeringMin: 0, engineeringMax: 6 } };
const reconciled = snapshotPointMapping(baseline, snapshotLevel.id);
assert.equal(reconciled.id, "level");
assert.equal(reconciled.conversion, baseline.conversion);
assert.equal(normalize(snapshotPayload, reconciled, time, 1000, time).value, 4.5);
assert.equal(normalize(snapshotPayload, reconciled, time, 1000, time).timestamp, time - 100);
assert.equal(normalize(snapshotPayload, reconciled, time, 50, time).quality, "stale");
const fullDataset = [
  { equipment: { id: "P-01" }, value: 0, quality: "good", running: false },
  { equipment: { id: "P-02" }, value: 12, quality: "good", running: true },
  { equipment: { id: "P-01" }, value: 999, quality: "bad" },
  { value: 42 },
];
const dataset = {
  id: "dataset.history", kind: "dataset", path: "records", scale: 1, offset: 0, precision: 2,
  rowFilter: { field: "equipment.id", value: "P-01" },
};
const normalizeDataset = (mapping, now = time) =>
  normalize({ records: fullDataset }, mapping, time, 1000, now);
assert.deepEqual(normalizeDataset(dataset).value, [fullDataset[0], fullDataset[2]]);
assert.equal(normalizeDataset(dataset).rawValue, fullDataset);
assert.equal(normalizeDataset(dataset, time + 1001).value, null);
assert.equal(normalizeDataset(dataset, time + 1001).quality, "stale");
assert.deepEqual(normalizeDataset({ ...dataset, rowFilter: { field: "running", value: "false" } }).value,
  [fullDataset[0]]);
assert.deepEqual(normalizeDataset({ ...dataset, rowFilter: { field: "value", value: "0" } }).value,
  [fullDataset[0]]);
assert.deepEqual(normalizeDataset({ ...dataset, rowFilter: { field: "equipment.id", value: "p-01" } }).value, []);
assert.equal(normalizeDataset({ ...dataset, rowFilter: { field: "", value: "P-01" } }).reason,
  "invalid-row-filter");
const filterDoc = { ...doc, mappings: [...doc.mappings, dataset] };
validate(filterDoc, false);
assert.throws(() => validate({ ...doc, mappings: [{ ...dataset, rowFilter: { field: "equipment.id", value: "" } }] }, false),
  /dataset.history · 请输入筛选匹配值/);
assert.throws(() => validate({ ...doc, mappings: [{ ...dataset, kind: "number" }] }, false),
  /筛选仅适用于行数据集/);
assert.deepEqual(snapshotPointMapping(dataset, "history").rowFilter, dataset.rowFilter);

const specialPoint = { ...baseline, id: "-backup", label: '试验 "位号", 输入', kind: "number" };
const specialSource = '=-LT,"A"';
const crosswalkSamples = new Map([[snapshotLevel.id, snapshotLevel], [specialSource, { kind: "number" }]]);
const exportedCrosswalk = exportSnapshotCrosswalk([{ mapping: specialPoint, selected: specialSource }]);
assert.equal(exportedCrosswalk.codePointAt(0), 0xFEFF);
assert.equal(csv(exportedCrosswalk)[0]["现场点位或字段"], "'" + specialSource);
assert.equal(csv(exportedCrosswalk)[0]["显示名称"], specialPoint.label);
const importedCrosswalk = importSnapshotCrosswalk(exportedCrosswalk, [baseline, specialPoint], crosswalkSamples);
assert.deepEqual([...importedCrosswalk.choices], [[specialPoint.id, specialSource]]);
assert.deepEqual(importedCrosswalk.errors, []);
const rejectedCrosswalk = importSnapshotCrosswalk(
  "画面业务位号,现场点位或字段\r\nlevel,LT-101.PV\r\nlevel,LT-101.PV\r\nmissing,LT-101.PV",
  [baseline], crosswalkSamples,
);
assert.equal(rejectedCrosswalk.choices.size, 0);
assert.match(rejectedCrosswalk.errors[0], /第 2 条记录.*位号重复/);
assert.match(rejectedCrosswalk.errors[1], /第 3 条记录.*位号不存在/);
assert.equal(campusBindings(legacyCampus.nodes[0])[0].run, "fan");
const entityBinding = {
  entity: "D.FAN.NW",
  run: "fan",
  fault: "pump",
  value: "level",
};
assert.equal(
  campusState(entityBinding, {
    fan: { quality: "good", value: true },
    pump: { quality: "good", value: false },
  }),
  "运行",
);
assert.equal(
  campusState(entityBinding, {
    fan: { quality: "good", value: true },
    pump: { quality: "good", value: true },
  }),
  "故障",
);
assert.equal(
  campusState(entityBinding, {
    fan: { quality: "bad", value: null },
    pump: { quality: "good", value: false },
  }),
  "未知",
);
assert.equal(
  campusState(entityBinding, {
    fan: { quality: "good", value: true },
    pump: { quality: "bad", value: null },
  }),
  "未知",
);
legacyCampus.nodes[0].entities = [
  entityBinding,
  { ...entityBinding, entity: "D.FAN.SW" },
];
validate(legacyCampus, true);
legacyCampus.nodes[0].entities[1].run = "level";
assert.throws(() => validate(legacyCampus, true), /运行反馈/);
legacyCampus.nodes[0].entities = [null];
assert.throws(() => validate(legacyCampus, false), /格式/);
const nativeMaps = protocolMappings(
  [{ id: "AI1", kind: "number", unit: "原码", label: "液位" }],
  "modbus",
  [],
);
const customized = { ...nativeMaps[0], id: "level", unit: "m", scale: 0.001 };
const regenerated = protocolMappings(
  [{ id: "AI1", kind: "number", unit: "原码", label: "液位" }],
  "modbus",
  [customized],
);
assert.equal(regenerated[0].id, "level");
assert.equal(regenerated[0].scale, 0.001);
assert.equal(regenerated[0].unit, "m");
assert.equal(bindingProblem(doc.nodes[0], doc.mappings), "");
assert.equal(
  bindingProblem({ ...doc.nodes[0], binding: "missing" }, doc.mappings),
  "请选择测点",
);
assert.equal(
  bindingProblem({ ...doc.nodes[0], type: "status" }, doc.mappings),
  "测点类型不匹配",
);
assert(
  compatibleMappings("status", doc.mappings).every((m) => m.kind === "boolean"),
);
const registers = importNorthbound({
  mappings: [
    {
      status: "active",
      type: "DI",
      dataType: "BOOL",
      address: 10002,
      point_alias: "运行反馈",
    },
    {
      status: "active",
      type: "AI",
      dataType: "UINT16",
      address: 30003,
      point_alias: "液位原码",
    },
    { status: "disabled", type: "DI", address: 10004 },
  ],
});
assert.equal(registers.length, 2);
assert.equal(registers[0].address, 1);
assert.equal(registers[0].function, 2);
assert.equal(registers[1].address, 2);
assert.equal(registers[1].rawMin, 4000);
const modbus = { host: "127.0.0.1", port: 502, unitId: 1, points: registers };
validateConnection(modbus, "modbus");
assert.throws(
  () =>
    validateConnection(
      {
        ...modbus,
        points: [{ ...registers[1], format: "float32", order: "AABC" }],
      },
      "modbus",
    ),
  /字序/,
);
assert.throws(
  () =>
    validateConnection(
      { ...modbus, points: [{ ...registers[1], function: 6 }] },
      "modbus",
    ),
  /功能码/,
);
const ua = {
  endpoint: "opc.tcp://127.0.0.1:49320",
  points: [{ id: "run", nodeId: "ns=2;s=Run", kind: "boolean" }],
};
validateConnection(ua, "opcua");
assert.throws(
  () => validateConnection({ ...ua, endpoint: "http://127.0.0.1" }, "opcua"),
  /地址/,
);
const native = template("blank");
native.source.kind = "modbus";
native.source.connection = modbus;
validate(native, true);
for (const key of ["01", "05", "30", "30-demo", "blank"])
  validate(template(key), true);
const read = (data, mapping, now = time) =>
  normalize(data, mapping, time, 5000, now);
assert.equal(read({ flow: 0 }, m).value, 0);
assert.equal(
  read(
    { pump: false },
    doc.mappings.find((v) => v.id === "pump"),
  ).value,
  false,
);
assert.equal(read({ flow: null }, m).quality, "bad");
assert.equal(read({ flow: 1 }, m, time + 5001).quality, "stale");
assert.equal(read({ flow: 1, t: "?" }, { ...m, timePath: "t" }).quality, "bad");
const currentLoop = {
  ...m, unit: "m", conversion: { mode: "raw420", engineeringMin: 0, engineeringMax: 6 },
};
for (const [rawValue, expected] of [[4000, 0], [12000, 3], [16000, 4.5], [20000, 6]]) {
  const measured = read({ flow: rawValue }, currentLoop);
  assert.equal(measured.rawValue, rawValue);
  assert.equal(measured.value, expected);
  assert.equal(measured.unit, "m");
  assert.equal(measured.quality, "good");
}
for (const rawValue of [3999, 20001]) {
  const measured = read({ flow: rawValue }, currentLoop);
  assert.equal(measured.rawValue, rawValue);
  assert.equal(measured.value, null);
  assert.equal(measured.quality, "bad");
  assert.equal(measured.reason, "out-of-range");
}
const bridgeMapping = protocolMappings([{ id: "level", kind: "number" }], "modbus", [])[0];
const diagnosis = read({ points: [{ id: "level", raw: 3999, value: null, quality: "bad",
  reason: "out-of-range", receivedAt: time }] }, bridgeMapping);
assert.equal(diagnosis.rawValue, 3999);
assert.equal(diagnosis.reason, "out-of-range");
assert.equal(read({ flow: true }, currentLoop).reason, "invalid-number");
assert.equal(read({ flow: 12000, q: "stale" }, { ...currentLoop, qualityPath: "q" }).quality, "stale");
assert.equal(read({ flow: 12000, q: "offline" }, { ...currentLoop, qualityPath: "q" }).quality, "offline");
const engineered = { ...m, scale: 10, offset: 1, conversion: { mode: "identity" } };
assert.equal(read({ flow: 18.25 }, engineered).value, 18.25);
const unitMapping = { ...m, unit: "m3/h", conversion: { mode: "unit", inputUnit: "L/s" } };
assert.equal(read({ flow: 10 }, unitMapping).value, 36);
assert.equal(read({ flow: 10 }, { ...unitMapping, unit: "kPa" }).reason, "invalid-conversion");
const linear = {
  ...m, conversion: { mode: "linear", rawMin: -10, rawMax: 10, engineeringMin: 5, engineeringMax: 1 },
};
assert.equal(read({ flow: 0 }, linear).value, 3);
const badRange = { ...currentLoop, conversion: { ...currentLoop.conversion, engineeringMax: 0 } };
assert.equal(read({ flow: 5000 }, badRange).reason, "invalid-conversion");
assert.throws(() => validate({ ...doc, mappings: [badRange, ...doc.mappings.slice(1)] }, false), /工程量程/);
assert.equal(effectivePollMs({ kind: "modbus", pollMs: 200 }), 500);
assert.equal(effectivePollMs({ kind: "opcua", pollMs: 1000 }), 1000);
assert.equal(effectivePollMs({ kind: "rest", pollMs: 200 }), 200);
const rows = csv('id,raw,unit\r\na,0,m\r\nb,"4,5","a""b"');
assert.equal(rows[1].unit, 'a"b');
assert.equal(
  read(
    { rows },
    {
      ...m,
      root: "rows",
      keyField: "id",
      keyValue: "a",
      path: "raw",
      offset: 1,
    },
  ).value,
  1,
);
assert.equal(
  read(
    { state: "ON" },
    { ...m, path: "state", kind: "boolean", enumMap: { ON: true } },
  ).value,
  true,
);
assert.throws(() => csv('id,x\n"unfinished'));
const c = template("30");
c.nodes[0].entity = "removed";
assert.throws(() => validate(c, true), /三维对象/);
doc.nodes.push(node("status", "extra", "flow"));
assert.throws(() => validate(doc, true), /绑定类型/);
console.log(
  "PASS: templates, mapping, engineering range, raw quality, scan floor, enum, timestamps, zero, false, CSV, invalid bindings and asset IDs",
);
