import assert from "node:assert/strict";
import {
  modbusBatchPoints,
  validateConnection,
} from "../apps/scada-designer/studio/model.mjs";
const settings = {
  prefix: "AI_",
  start: 1,
  count: 10,
  serial: 1,
  step: 2,
  function: 4,
  format: "float32",
  order: "CDAB",
};
const rows = modbusBatchPoints(settings);
assert.equal(rows.length, 10);
assert.equal(rows[0].address, 0);
assert.equal(rows[9].address, 18);
assert.equal(rows[0].id, "AI_001");
assert.equal(rows[0].order, "CDAB");
validateConnection(
  { host: "127.0.0.1", port: 502, unitId: 1, points: rows },
  "modbus",
);
assert.throws(() => modbusBatchPoints({ ...settings, step: 1 }), /步长/);
assert.throws(() => modbusBatchPoints({ ...settings, start: 65536 }), /越界/);
assert.throws(() => modbusBatchPoints(settings, rows), /编号/);
assert.throws(
  () => modbusBatchPoints({ ...settings, prefix: "OTHER_" }, rows),
  /重叠/,
);
assert.throws(() => modbusBatchPoints({ ...settings, order: "AB" }), /字序/);
const bits = modbusBatchPoints({
  ...settings,
  prefix: "DI_",
  function: 2,
  step: 1,
  count: 2,
});
assert.equal(bits[0].kind, "boolean");
assert.equal(bits[1].address, 1);
assert.equal(bits[0].format, undefined);
console.log(
  "PASS: transactional Modbus batch, one-based input, width/step, ID/address conflicts, bounds, byte order and read-only functions",
);
