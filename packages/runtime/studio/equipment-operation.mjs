export function equipmentOperationProblem(intent, state) {
  if (state.permitted !== true) return "当前没有操作许可";
  if (state.interlocked !== false) return "联锁状态阻止本次操作";
  if (state.pointId !== intent.pointId || state.feedback?.quality !== "good" ||
      typeof state.feedback.value !== typeof intent.target || !Number.isSafeInteger(state.sequence))
    return "设备反馈无效，请恢复数据后重新预选";
  if (state.feedback.value === intent.target) return "设备已达到目标状态";
  if (state.feedback.value !== intent.previous) return "设备反馈已变化，请重新预选";
  return "";
}

export function beginEquipmentOperation(intent, state, at, timeoutMs) {
  if (at >= intent.confirmBy) throw Error("二次确认已超时，请重新预选");
  const problem = equipmentOperationProblem(intent, state);
  if (problem) throw Error(problem);
  return {
    ...intent,
    sentAt: at,
    deadline: at + timeoutMs,
    lastSequence: state.sequence,
    status: "submitted",
    accepted: false,
  };
}

export function updateEquipmentOperation(operation, event) {
  if (!operation || ["confirmed", "rejected"].includes(operation.status) ||
      !Number.isFinite(event.at) || event.at <= operation.sentAt)
    return operation;
  const late = operation.status === "unconfirmed" || event.at >= operation.deadline;
  let next = operation;
  if (event.type === "receipt") {
    if (event.id !== operation.id || typeof event.accepted !== "boolean") return operation;
    if (!event.accepted) return { ...operation, status: "rejected", reason: event.reason };
    if (operation.accepted) return operation;
    next = { ...operation, status: "accepted", accepted: true };
  } else if (event.type === "feedback") {
    if (event.pointId !== operation.pointId || !Number.isSafeInteger(event.sequence) ||
        event.sequence <= operation.lastSequence) return operation;
    next = { ...operation, lastSequence: event.sequence };
    if (operation.accepted && event.quality === "good" && event.value === operation.target)
      return { ...next, status: "confirmed", late };
  } else if (event.type !== "timeout" || event.at < operation.deadline) return operation;

  return late ? { ...next, status: "unconfirmed" } : next;
}
