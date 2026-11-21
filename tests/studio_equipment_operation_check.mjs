import { blankScreen, screenNode, screenState, validateScreen } from "../packages/runtime/studio/screen-model.mjs";
import {
  screenEquipmentControlSlots, screenEquipmentFrequencySlots, screenEquipmentOperationContext,
} from "../packages/runtime/studio/screen-controls.mjs";
import { makeScreenSymbol } from "../packages/runtime/studio/screen-library.mjs";
import assert from "node:assert/strict";
import { beginEquipmentOperation, updateEquipmentOperation } from "../packages/runtime/studio/equipment-operation.mjs";

const intent = { id: "op:pump1:1", deviceId: "pump1", pointId: "P1.run", previous: true, target: false, confirmBy: 110 };
const state = { permitted: true, interlocked: false, pointId: "P1.run", sequence: 10,
  feedback: { quality: "good", value: true } };
const begin = (changed = {}, at = 100) => beginEquipmentOperation(intent, { ...state, ...changed }, at, 30);
const receipt = (at, extra = {}) => ({ type: "receipt", id: intent.id, at, accepted: true, ...extra });
const feedback = (sequence, at, extra = {}) => ({ type: "feedback", pointId: intent.pointId,
  sequence, at, quality: "good", value: false, ...extra });

assert.throws(() => begin({ permitted: false }), /没有操作许可/);
assert.throws(() => begin({ interlocked: true }), /联锁/);
assert.throws(() => begin({ interlocked: undefined }), /联锁/);
assert.throws(() => begin({ pointId: "P2.run" }), /反馈无效/);
assert.throws(() => begin({ feedback: { quality: "offline", value: true } }), /反馈无效/);
assert.throws(() => begin({ feedback: { quality: "good", value: 1 } }), /反馈无效/);
assert.throws(() => begin({ feedback: { quality: "good", value: false } }), /已达到目标/);
assert.throws(() => begin({}, 110), /确认已超时/);

const operation = begin();
assert.equal(operation.status, "submitted");
assert.equal(updateEquipmentOperation(operation, receipt(101, { id: "previous-operation" })), operation);
assert.equal(updateEquipmentOperation(operation, receipt(NaN)), operation);
assert.equal(updateEquipmentOperation(operation, feedback(10, 101)), operation);
const prior = updateEquipmentOperation(operation, feedback(11, 102));
const accepted = updateEquipmentOperation(prior, receipt(103));
assert.equal(accepted.status, "accepted");
assert.equal(updateEquipmentOperation(accepted, receipt(104)), accepted);
assert.equal(updateEquipmentOperation(accepted, feedback(11, 104)), accepted);
assert.equal(updateEquipmentOperation(accepted, feedback(12, 104, { pointId: "P2.run" })), accepted);
const bad = updateEquipmentOperation(accepted, feedback(12, 105, { quality: "stale" }));
assert.equal(bad.status, "accepted");
const noChange = updateEquipmentOperation(bad, feedback(13, 106, { value: true }));
assert.equal(noChange.status, "accepted");
const confirmed = updateEquipmentOperation(noChange, feedback(14, 107));
assert.equal(confirmed.status, "confirmed");
assert.equal(confirmed.late, false);
assert.equal(updateEquipmentOperation(confirmed, { type: "timeout", at: 150 }), confirmed);

const denied = updateEquipmentOperation(operation, receipt(102, { accepted: false, reason: "模拟联锁" }));
assert.equal(denied.status, "rejected");
assert.equal(denied.reason, "模拟联锁");
const refusedAfterAck = updateEquipmentOperation(accepted, receipt(104, { accepted: false, reason: "执行前联锁动作" }));
assert.equal(refusedAfterAck.status, "rejected");
assert.equal(refusedAfterAck.reason, "执行前联锁动作");
assert.equal(updateEquipmentOperation(denied, feedback(12, 110)), denied);

const expired = updateEquipmentOperation(operation, { type: "timeout", at: 130 });
assert.equal(expired.status, "unconfirmed");
const reconnect = updateEquipmentOperation(expired, feedback(11, 131, { quality: "offline" }));
const recovered = updateEquipmentOperation(reconnect, feedback(12, 140));
assert.equal(recovered.status, "unconfirmed");
const lateReceipt = updateEquipmentOperation(recovered, receipt(142));
assert.equal(lateReceipt.status, "unconfirmed");
const lateConfirmation = updateEquipmentOperation(lateReceipt, feedback(13, 145));
assert.equal(lateConfirmation.status, "confirmed");
assert.equal(lateConfirmation.id, intent.id);
assert.equal(lateConfirmation.late, true);

console.log("PASS: permission, interlock, preselection expiry, refusal, receipt identity, fresh readback, timeout and reconnect");

// The valve derives one position from two independent limit switches. Ambiguous readings
// must never look like a confirmed endpoint or allow a new operation.
const panelDoc = blankScreen();
const valve = screenNode("valve", "valve", 80, 80);
const valveSetup = screenEquipmentControlSlots(valve);
valve.dataSlots = valveSetup.slots;
const valveOp = valve.panel = { operation: { ...valveSetup.operation, start: "valve.open", stop: "valve.close" } };
for (const role of ["feedback", "closed", "permit", "interlock"])
  valve.bindings[valveOp.operation[role]] = "valve." + role;
const good = value => ({ quality: "good", value });
const panelPoints = {
  "valve.feedback": good(false), "valve.closed": good(true),
  "valve.permit": good(true), "valve.interlock": good(false),
  "pump.run": good(true), "pump.actual": good(32), "pump.set": good(36),
};
const pointMap = id => ({
  id, label: id, kind: typeof panelPoints[id].value === "number" ? "number" : "boolean",
  unit: typeof panelPoints[id].value === "number" ? "Hz" : "", path: "value", scale: 1, offset: 0, precision: 2,
});
panelDoc.mappings = Object.keys(panelPoints).map(pointMap);
panelDoc.nodes.push(valve);
validateScreen(panelDoc, false);
const controlContext = (item, target, points = panelPoints) =>
  screenEquipmentOperationContext(item, panelDoc, points, target, 1);
assert.equal(screenState(valve, panelPoints), "关闭");
assert.deepEqual(controlContext(valve, true).updates, { "valve.feedback": true, "valve.closed": false });
for (const [key, value, label] of [
  ["valve.feedback", good(true), "到位反馈冲突"],
  ["valve.closed", good(false), "位置待确认"],
  ["valve.closed", { quality: "stale", value: true }, "到位反馈无效"],
]) {
  const samples = { ...panelPoints, [key]: value };
  assert.equal(screenState(valve, samples), label);
  assert.equal(controlContext(valve, true, samples).problem, label);
}

const pump = screenNode("pump", "pump", 350, 80);
const pumpSwitch = screenEquipmentControlSlots(pump);
pump.dataSlots = pumpSwitch.slots;
pump.panel = { operation: { ...pumpSwitch.operation, start: "pump.start" } };
const pumpSetup = screenEquipmentFrequencySlots(pump);
assert.equal(pumpSetup.operation.enabled, true);
pump.dataSlots = pumpSetup.slots;
pump.panel.operation = pumpSetup.operation;
const pumpOp = pump.panel.operation;
Object.assign(pumpOp.frequency, { min: 28, max: 48, step: 0.5, command: "pump.freq" });
Object.assign(pump.bindings, {
  [pumpOp.feedback]: "pump.run", [pumpOp.permit]: "valve.permit", [pumpOp.interlock]: "valve.interlock",
  value: "pump.actual", [pumpOp.frequency.readback]: "pump.set",
});
panelDoc.nodes.push(pump);
validateScreen(panelDoc, false);
assert.match(controlContext(pump, 48.5).problem, /允许范围/);
assert.match(controlContext(pump, 40.2).problem, /步长/);
assert.deepEqual(controlContext(pump, 40.5).updates, { "pump.set": 40.5 });
const staleSetpoint = { ...panelPoints, "pump.set": { quality: "stale", value: 36 } };
assert.match(controlContext(pump, 40.5, staleSetpoint).problem, /反馈无效/);
pump.bindings[pumpOp.frequency.readback] = "pump.actual";
assert.match(controlContext(pump, 40.5).problem, /独立的 Hz/);
panelDoc.source.demo = false;
assert.match(controlContext(pump, 40.5).problem, /只读/);
const portable = makeScreenSymbol(panelDoc, ["pump", "valve"], "泵阀支路", "test");
const portablePump = portable.nodes.find(node => node.id === "pump");
assert.deepEqual(portablePump.bindings, {});
assert.equal(portablePump.panel.operation.start, undefined);
assert.equal(portablePump.panel.operation.frequency.command, undefined);
assert.equal(portablePump.panel.operation.frequency.step, 0.5);
console.log("PASS: valve limit conflicts, frequency range/step, independent readback, legacy enable and template reuse");
