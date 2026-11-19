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
