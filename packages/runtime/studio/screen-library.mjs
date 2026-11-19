import {
  validateScreenSymbolDefinition,
  validateScreen,
  screenEditingPage,
  screenPipeInSelection,
} from "./screen-model.mjs";
import {
  screenMedia,
  screenPortSides,
  screenSlotRoles,
  screenSlots,
  screenPorts,
  resizeScreenPorts,
} from "../../components/studio/screen-symbols.mjs";

const copy = (value) => JSON.parse(JSON.stringify(value));
const sameMember = (a, b) => a.type === b.type && a.symbol === b.symbol && a.title === b.title;

function memberReference(symbol, itemId) {
  return { symbolId: symbol.id, itemId, revision: symbol.revision || 1 };
}

export function makeScreenSymbol(doc, selected, name, id) {
  const nodes = doc.nodes.filter((n) => selected.includes(n.id));
  if (!nodes.length) throw Error("请先选择一个或多个元素");
  if (!name?.trim()) throw Error("请填写图元名称");
  const ids = new Set(nodes.map((n) => n.id));
  const pipes = doc.pipes.filter((p) => screenPipeInSelection(p, ids)),
    vertices = pipes.flatMap((p) => [
      ...p.vertices,
      ...[p.source, p.target].filter((e) => !e.nodeId),
    ]);
  const minX = Math.min(...nodes.map((n) => n.x), ...vertices.map((v) => v.x)),
    minY = Math.min(...nodes.map((n) => n.y), ...vertices.map((v) => v.y));
  const symbol = {
    id,
    name: name.trim(),
    version: 1,
    revision: 1,
    w:
      Math.max(...nodes.map((n) => n.x + n.w), ...vertices.map((v) => v.x)) -
      minX,
    h:
      Math.max(...nodes.map((n) => n.y + n.h), ...vertices.map((v) => v.y)) -
      minY,
    nodes: copy(nodes),
    pipes: copy(pipes),
  };
  const members = [...symbol.nodes, ...symbol.pipes];
  const memberIds = new Map(members.map((item) => [item.id,
    item.libraryRef?.symbolId === id ? item.libraryRef.itemId : item.id]));
  const uniqueIds = new Set(memberIds.values()).size === memberIds.size;
  if (!uniqueIds) for (const item of members) memberIds.set(item.id, item.id);
  for (const item of members) {
    item.id = memberIds.get(item.id);
    delete item.libraryRef;
  }
  for (const n of symbol.nodes) {
    if (n.symbol === "trendRange")
      n.params.targetId = ids.has(n.params.targetId) ? memberIds.get(n.params.targetId) : "";
    n.x -= minX;
    n.y -= minY;
    n.bindings = {};
    delete n.params.equipmentCode;
    n.locked = false;
    n.ports = JSON.parse(JSON.stringify(screenPorts(n)));
    n.dataSlots = JSON.parse(JSON.stringify(screenSlots(n)));
  }
  for (const p of symbol.pipes) {
    p.bindings = {};
    p.vertices = p.vertices.map((v) => ({ x: v.x - minX, y: v.y - minY }));
    for (const key of ["source", "target"])
      if (p[key].nodeId) p[key].nodeId = memberIds.get(p[key].nodeId);
      else p[key] = { x: p[key].x - minX, y: p[key].y - minY };
  }
  validateScreenSymbol(symbol);
  return symbol;
}
export function validateScreenSymbol(symbol) {
  return validateScreenSymbolDefinition(symbol);
}

function libraryPortDescription(port) {
  const direction = { in: "进口", out: "出口", both: "双向" };
  const x = Number(port.x.toFixed(2)), y = Number(port.y.toFixed(2));
  return [
    port.label,
    direction[port.direction || "both"],
    screenMedia[port.medium]?.label || port.medium || "通用介质",
    `位置 ${x}%, ${y}%`,
    port.routingSide && `走线 ${screenPortSides[port.routingSide]}`,
  ].filter(Boolean).join(" · ");
}

function librarySlotDescription(slot) {
  const labels = { boolean: "开关量", number: "数值", text: "文本", dataset: "行数据集" };
  return [
    slot.label,
    slot.required ? "必绑" : "可选",
    [...slot.kinds].sort().map((kind) => labels[kind]).join("／"),
    screenSlotRoles[slot.role || slot.key],
  ].filter(Boolean).join(" · ");
}

export function screenSymbolChanges(previous, next) {
  const before = [...previous.nodes, ...previous.pipes];
  const after = [...next.nodes, ...next.pipes];
  const exact = new Map(after.map((item) => [item.id, item]));
  const claimed = new Set(before.map((item) => item.id).filter((id) => exact.has(id)));
  const changes = [];
  const compare = (oldItem, newItem) => {
    const title = (newItem || oldItem).title || "未命名图元";
    const ports = (item) => item?.type === "pipe" ? [] : screenPorts(item);
    for (const [kind, entries, field, description] of [
      ["接口", ports, "id", libraryPortDescription],
      ["测点槽位", screenSlots, "key", librarySlotDescription],
    ]) {
      const oldEntries = new Map(entries(oldItem).map((entry) => [entry[field], description(entry)]));
      const newEntries = new Map(entries(newItem).map((entry) => [entry[field], description(entry)]));
      for (const key of new Set([...oldEntries.keys(), ...newEntries.keys()])) {
        const from = oldEntries.get(key), to = newEntries.get(key);
        if (from !== to) changes.push({ title, kind, key, from, to });
      }
    }
  };
  for (const item of before) {
    let match = exact.get(item.id);
    // Imported copies have new object IDs. Only pair names that identify one item on each side.
    if (!match) {
      const same = (other) => sameMember(item, other);
      const candidates = after.filter((other) => !claimed.has(other.id) && same(other));
      if (candidates.length === 1 && before.filter(same).length === 1) {
        [match] = candidates;
        claimed.add(match.id);
      }
    }
    compare(item, match);
  }
  for (const item of after) if (!claimed.has(item.id)) compare(undefined, item);
  return changes;
}

export function placeScreenSymbol(doc, symbol, x, y, idFactory) {
  validateScreenSymbol(symbol);
  const dx = Math.max(0, Math.min(1920 - symbol.w, Math.round(x / 10) * 10)),
    dy = Math.max(0, Math.min(1080 - symbol.h, Math.round(y / 10) * 10));
  const copies = JSON.parse(JSON.stringify(symbol)),
    map = new Map(copies.nodes.map((n) => [n.id, idFactory()])),
    group = copies.nodes.length > 1 ? idFactory() : undefined;
  for (const n of copies.nodes) {
    n.libraryRef = memberReference(symbol, n.id);
    n.id = map.get(n.id);
    if(n.symbol==='trendRange')n.params.targetId=map.get(n.params.targetId)||'';
    n.x += dx;
    n.y += dy;
    n.bindings = {};
    delete n.params.equipmentCode;
    if (group) n.group = group;
    else delete n.group;
  }
  for (const p of copies.pipes) {
    p.libraryRef = memberReference(symbol, p.id);
    p.id = idFactory();
    for (const key of ["source", "target"])
      if (p[key].nodeId) p[key].nodeId = map.get(p[key].nodeId);
      else p[key] = { x: p[key].x + dx, y: p[key].y + dy };
    p.vertices = p.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy }));
    p.bindings = {};
  }
  doc.nodes.push(...copies.nodes);
  doc.pipes.push(...copies.pipes);
  return copies.nodes.map((n) => n.id);
}

function upgradeSelection(doc, selected, symbol) {
  const selection = new Set(selected);
  const nodes = doc.nodes.filter((item) => selection.has(item.id));
  const first = nodes[0];
  if (!first || nodes.length !== selection.size ||
      (nodes.length > 1 && (!first.group || nodes.some((node) => node.group !== first.group))))
    throw Error("请选择画布中的一个完整图元实例");
  const instance = first.group ? doc.nodes.filter((node) => node.group === first.group) : nodes;
  const ref = first.libraryRef;
  if (instance.some(({ libraryRef }) => libraryRef?.symbolId !== ref?.symbolId ||
      libraryRef?.revision !== ref?.revision) || (ref && ref.symbolId !== symbol.id))
    throw Error("选中的组合包含其他图元或来自不同修订");
  if (ref && ref.revision >= (symbol.revision || 1))
    throw Error("此实例已使用当前修订");
  if (instance.length !== symbol.nodes.length)
    throw Error("新版的子图元数量与当前实例不同，请检查组合后重新放置");
  return instance;
}

function portPairs(pipe, nodeIds) {
  return JSON.stringify([pipe.source, pipe.target].map((end) => end.nodeId
    ? [nodeIds.get(end.nodeId), end.portId] : null));
}

export function planScreenSymbolUpgrade(doc, selected, symbol) {
  validateScreenSymbol(symbol);
  const nodes = upgradeSelection(doc, selected, symbol);
  const fromRevision = nodes[0].libraryRef?.revision;
  const nodeIds = new Map();
  const matched = new Map();
  for (const node of nodes) {
    const byId = symbol.nodes.find((item) => item.id === node.libraryRef?.itemId);
    const candidates = byId ? [byId] : symbol.nodes.filter((item) => sameMember(node, item));
    const [definition] = candidates;
    if (candidates.length !== 1 || node.symbol !== definition.symbol || matched.has(definition.id))
      throw Error(`无法唯一匹配子图元「${node.title}」，请核对新版图元的类型和名称`);
    nodeIds.set(node.id, definition.id);
    matched.set(definition.id, node);
  }
  const touchesInstance = (pipe) => [pipe.source, pipe.target].some((end) => nodeIds.has(end.nodeId));
  const connected = doc.pipes.filter(touchesInstance);
  const internal = connected.filter((pipe) => fromRevision
    ? pipe.libraryRef?.symbolId === symbol.id && pipe.libraryRef?.revision === fromRevision &&
      [pipe.source, pipe.target].every((end) => !end.nodeId || nodeIds.has(end.nodeId))
    : screenPipeInSelection(pipe, nodeIds));
  if (internal.length !== symbol.pipes.length)
    throw Error("新版的内部管线数量与当前实例不同，请核对接管后重新放置");

  const changes = [], unbound = [], replacements = new Map();
  const mappings = new Map(doc.mappings.map((item) => [item.id, item]));
  let bindings = 0;
  function replace(item, definition) {
    const next = {
      ...item,
      libraryRef: memberReference(symbol, definition.id),
      bindings: { ...item.bindings },
    };
    const previousSlots = screenSlots(item);
    const nextSlots = screenSlots(definition);
    if (definition.dataSlots !== undefined || JSON.stringify(nextSlots) !== JSON.stringify(previousSlots))
      next.dataSlots = copy(nextSlots);
    if (item.type !== "pipe") {
      next.ports = copy(resizeScreenPorts(definition, item.w, item.h) ??
        screenPorts({ ...definition, w: item.w, h: item.h }));
      const usesPicture = definition.params.appearance === "picture";
      if (definition.image && (definition.image !== item.image ||
          (usesPicture && item.params.appearance !== "picture"))) {
        next.image = definition.image;
        if (usesPicture)
          next.params = { ...item.params, appearance: "picture" };
        changes.push({ title: item.title, kind: "图稿", key: "图片", from: "当前图稿", to: "新版图稿" });
      }
    }
    const slots = new Map(nextSlots.map((slot) => [slot.key, slot]));
    for (const [key, pointId] of Object.entries(item.bindings)) {
      const oldSlot = previousSlots.find((slot) => slot.key === key);
      const slot = slots.get(key);
      if (!pointId) {
        if (!slot) delete next.bindings[key];
        continue;
      }
      if (!slot || !slot.kinds.includes(mappings.get(pointId)?.kind) ||
          (slot.role || slot.key) !== (oldSlot?.role || oldSlot?.key))
        throw Error(`「${item.title}」的 ${oldSlot?.label || key} 已绑定 ${pointId}，新版无法保留此绑定`);
      bindings++;
    }
    if (item.action?.type === "trend" && !slots.has(item.action.slot))
      throw Error(`「${item.title}」的趋势动作仍引用已移除的测点槽位`);
    for (const slot of nextSlots)
      if (slot.required && !next.bindings[slot.key]) unbound.push(`${item.title} · ${slot.label}`);
    replacements.set(item.id, next);
  }

  for (const definition of symbol.nodes) replace(matched.get(definition.id), definition);
  const definitions = new Map(symbol.nodes.map((node) => [node.id, node.id]));
  const usedPipes = new Set();
  for (const definition of symbol.pipes) {
    const topology = portPairs(definition, definitions);
    const byId = internal.find((pipe) => pipe.libraryRef?.itemId === definition.id);
    const candidates = byId ? [byId] : internal.filter((pipe) => !usedPipes.has(pipe.id) &&
      portPairs(pipe, nodeIds) === topology);
    const [pipe] = candidates;
    if (candidates.length !== 1 || usedPipes.has(pipe.id) || portPairs(pipe, nodeIds) !== topology)
      throw Error(`「${definition.title}」的内部接管已改变或无法唯一匹配，请核对后重新放置`);
    usedPipes.add(pipe.id);
    replace(pipe, definition);
  }

  for (const pipe of connected) {
    for (const end of [pipe.source, pipe.target]) {
      const next = replacements.get(end.nodeId);
      if (!next) continue;
      const oldPort = screenPorts(matched.get(nodeIds.get(end.nodeId))).find((port) => port.id === end.portId);
      const port = screenPorts(next).find((value) => value.id === end.portId);
      if (!port || (oldPort?.medium && oldPort.medium !== port.medium))
        throw Error(`「${pipe.title}」仍连接「${next.title}」的 ${oldPort?.label || end.portId}，新版移除了接口或改变了介质`);
    }
  }

  const items = (list) => list.map((item) => replacements.get(item.id) || item);
  const proposed = { ...screenEditingPage(doc), nodes: items(doc.nodes), pipes: items(doc.pipes) };
  validateScreen(proposed, false);
  changes.push(...screenSymbolChanges({ nodes, pipes: internal }, {
    nodes: items(nodes), pipes: items(internal),
  }));
  return {
    fromRevision, changes, unbound, bindings, connected: connected.length,
    nodes: proposed.nodes, pipes: proposed.pipes,
  };
}
