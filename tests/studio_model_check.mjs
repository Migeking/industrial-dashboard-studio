import assert from "node:assert/strict";
import {
  csv,
  normalize,
  template,
  validate,
  node,
} from "../apps/scada-designer/studio/model.mjs";
const doc = template(),
  time = 1700000000000,
  m = doc.mappings[0];
for (const key of ["01", "05", "30", "blank"]) validate(template(key), true);
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
  "PASS: templates, mapping, enum, timestamps, zero, false, CSV, invalid bindings and asset IDs",
);
