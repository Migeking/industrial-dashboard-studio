import {
  validateScreenSymbolDefinition,
  screenPipeInSelection,
} from "./screen-model.mjs";
import {
  screenSlots,
  screenPorts,
} from "../../components/studio/screen-symbols.mjs";

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
    w:
      Math.max(...nodes.map((n) => n.x + n.w), ...vertices.map((v) => v.x)) -
      minX,
    h:
      Math.max(...nodes.map((n) => n.y + n.h), ...vertices.map((v) => v.y)) -
      minY,
    nodes: JSON.parse(JSON.stringify(nodes)),
    pipes: JSON.parse(JSON.stringify(pipes)),
  };
  for (const n of symbol.nodes) {
    if(n.symbol==='trendRange'&&!ids.has(n.params.targetId))n.params.targetId='';
    n.x -= minX;
    n.y -= minY;
    n.bindings = {};
    n.locked = false;
    n.ports = JSON.parse(JSON.stringify(screenPorts(n)));
    n.dataSlots = JSON.parse(JSON.stringify(screenSlots(n)));
  }
  for (const p of symbol.pipes) {
    p.bindings = {};
    p.vertices = p.vertices.map((v) => ({ x: v.x - minX, y: v.y - minY }));
    for (const key of ["source", "target"])
      if (!p[key].nodeId) p[key] = { x: p[key].x - minX, y: p[key].y - minY };
  }
  validateScreenSymbol(symbol);
  return symbol;
}
export function validateScreenSymbol(symbol) {
  return validateScreenSymbolDefinition(symbol);
}
export function placeScreenSymbol(doc, symbol, x, y, idFactory) {
  validateScreenSymbol(symbol);
  const dx = Math.max(0, Math.min(1920 - symbol.w, Math.round(x / 10) * 10)),
    dy = Math.max(0, Math.min(1080 - symbol.h, Math.round(y / 10) * 10));
  const copies = JSON.parse(JSON.stringify(symbol)),
    map = new Map(copies.nodes.map((n) => [n.id, idFactory()])),
    group = copies.nodes.length > 1 ? idFactory() : undefined;
  for (const n of copies.nodes) {
    n.id = map.get(n.id);
    if(n.symbol==='trendRange')n.params.targetId=map.get(n.params.targetId)||'';
    n.x += dx;
    n.y += dy;
    n.bindings = {};
    if (group) n.group = group;
    else delete n.group;
  }
  for (const p of copies.pipes) {
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
