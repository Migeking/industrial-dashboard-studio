import {
  screenSymbols,
  screenSlots,
} from "../../components/studio/screen-symbols.mjs";

export const isScreen = (doc) =>
  doc?.format === "screen-document" && doc?.version === 1;
export const isScreenItem = (n) =>
  n?.type === "screen-node" || n?.type === "pipe";
export function blankScreen() {
  return {
    format: "screen-document",
    version: 1,
    template: "blank",
    title: "新建监控画面",
    canvas: { width: 1920, height: 1080, background: "#f4f7f9" },
    source: {
      kind: "json",
      data: "{}",
      url: "",
      pollMs: 1000,
      maxAgeMs: 10000,
      demo: true,
    },
    mappings: [],
    nodes: [],
    pipes: [],
  };
}
export function screenNode(symbol, id, x, y, siblings = []) {
  const def = screenSymbols[symbol];
  if (!def) throw Error("未知图元");
  let number = 101;
  while (siblings.some((n) => n.title === def.prefix + "-" + number)) number++;
  return {
    id,
    type: "screen-node",
    symbol,
    title: def.prefix ? def.prefix + "-" + number : def.label,
    x: Math.max(0, Math.min(1920 - def.w, Math.round(x / 10) * 10)),
    y: Math.max(0, Math.min(1080 - def.h, Math.round(y / 10) * 10)),
    w: def.w,
    h: def.h,
    angle: 0,
    z: symbol === "rect" ? -10 : 10,
    locked: false,
    hidden: false,
    style: {
      fill:
        symbol === "text"
          ? "transparent"
          : ["readout", "trend"].includes(symbol)
            ? "#ffffff"
            : symbol === "junction"
              ? "#547185"
              : "#e5edf2",
      stroke: "#547185",
      color: "#304c5d",
      fontSize: symbol === "text" ? 32 : symbol === "readout" ? 44 : 20,
    },
    params: { min: 0, max: 6, unit: "", precision: 2, windowSeconds: 120 },
    bindings: {},
    ...(symbol === "text" ? { text: "输入标题" } : {}),
    ...(symbol === "image" ? { image: "" } : {}),
  };
}
export function screenProblem(n, mappings) {
  for (const s of screenSlots(n)) {
    const binding = n.bindings?.[s.key];
    if (!binding) {
      if (s.required) return "请选择" + s.label;
      continue;
    }
    const point = mappings.find((m) => m.id === binding);
    if (!point) return s.label + "测点已不存在";
    if (!s.kinds.includes(point.kind)) return s.label + "测点类型不匹配";
  }
  return "";
}
export function validateScreen(doc, publishing) {
  if (
    !isScreen(doc) ||
    doc.canvas?.width !== 1920 ||
    doc.canvas?.height !== 1080 ||
    !/^#[\da-f]{6}$/i.test(doc.canvas.background) ||
    !Array.isArray(doc.pipes)
  )
    throw Error("画布格式或尺寸无效");
  if (
    doc.nodes.some((n) => n?.type !== "screen-node") ||
    doc.pipes.some((n) => n?.type !== "pipe")
  )
    throw Error("画面对象类型无效");
  const ids = new Set(),
    nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const n of [...doc.nodes, ...doc.pipes]) {
    if (
      !n ||
      typeof n.id !== "string" ||
      !n.id ||
      ids.has(n.id) ||
      typeof n.title !== "string" ||
      !isScreenItem(n)
    )
      throw Error("画面对象编号或名称无效");
    ids.add(n.id);
    if (
      !n.bindings ||
      typeof n.bindings !== "object" ||
      Array.isArray(n.bindings)
    )
      throw Error("图元绑定格式无效");
    for (const [key, value] of Object.entries(n.bindings))
      if (
        !screenSlots(n).some((s) => s.key === key) ||
        typeof value !== "string"
      )
        throw Error("图元绑定槽位无效");
    if (n.type === "screen-node") {
      if (
        !screenSymbols[n.symbol] ||
        ![n.x, n.y, n.w, n.h, n.angle, n.z].every(Number.isFinite) ||
        n.w < 16 ||
        n.h < 16 ||
        n.x < 0 ||
        n.y < 0 ||
        n.x + n.w > 1920.01 ||
        n.y + n.h > 1080.01
      )
        throw Error(n.title + " 的位置或尺寸无效");
      if (n.group !== undefined && typeof n.group !== "string")
        throw Error("对象分组无效");
      if (
        !n.style ||
        !["fill", "stroke", "color"].every(
          (k) =>
            n.style[k] === "transparent" || /^#[\da-f]{6}$/i.test(n.style[k]),
        ) ||
        !Number.isFinite(n.style.fontSize) ||
        n.style.fontSize < 8 ||
        n.style.fontSize > 120
      )
        throw Error("图元样式无效");
      if (
        !n.params ||
        ![
          n.params.min,
          n.params.max,
          n.params.precision,
          n.params.windowSeconds,
        ].every(Number.isFinite) ||
        n.params.max <= n.params.min ||
        !Number.isInteger(n.params.precision) ||
        n.params.precision < 0 ||
        n.params.precision > 10 ||
        n.params.windowSeconds < 10 ||
        n.params.windowSeconds > 86400 ||
        typeof n.params.unit !== "string"
      )
        throw Error("图元量程或显示参数无效");
      if (n.symbol === "text" && typeof n.text !== "string")
        throw Error("文字内容无效");
      if (
        n.symbol === "image" &&
        n.image &&
        !/^data:image\/(png|jpeg|webp);base64,/i.test(n.image)
      )
        throw Error("请使用本地 PNG、JPEG 或 WebP 图片");
    } else {
      if (
        !Array.isArray(n.vertices) ||
        n.vertices.some((p) => ![p.x, p.y].every(Number.isFinite))
      )
        throw Error("管道转折点无效");
      for (const end of [n.source, n.target]) {
        const owner = nodes.get(end?.nodeId);
        if (!owner || !screenSymbols[owner.symbol]?.ports.includes(end.portId))
          throw Error(n.title + " 的设备端口不存在");
      }
      if (
        !n.style ||
        !/^#[\da-f]{6}$/i.test(n.style.color) ||
        !Number.isFinite(n.style.width) ||
        n.style.width < 1 ||
        n.style.width > 30
      )
        throw Error("管道样式无效");
    }
    if (publishing) {
      const problem = screenProblem(n, doc.mappings);
      if (problem) throw Error(n.title + "：" + problem);
    }
  }
  return doc;
}
export function screenState(n, points) {
  const slots = n.bindings || {},
    fault = points[slots.fault],
    feedback = points[slots.open || slots.run];
  if (fault?.quality === "good" && fault.value === true) return "故障";
  if (
    (slots.fault && fault?.quality !== "good") ||
    feedback?.quality !== "good"
  )
    return "未知";
  return n.symbol === "valve"
    ? feedback.value === true
      ? "开启"
      : "关闭"
    : feedback.value === true
      ? "运行"
      : "停止";
}
export function screenDisplay(n, points, mappings, key = "value") {
  const p = points[n.bindings?.[key]],
    m = mappings.find((v) => v.id === n.bindings?.[key]);
  const unit = n.params?.unit || m?.unit || "";
  return {
    value: p?.quality === "good" ? p.value : null,
    quality: p?.quality || "unbound",
    unit,
    text:
      p?.quality === "good" && typeof p.value === "number"
        ? p.value.toFixed(n.params.precision) + (unit ? " " + unit : "")
        : "—",
  };
}
export function copyScreenSelection(doc, selected, idFactory) {
  const originals = doc.nodes.filter((n) => selected.includes(n.id)),
    remap = new Map(originals.map((n) => [n.id, idFactory()])),
    groups = new Map();
  const dx = Math.min(30, ...originals.map((n) => 1920 - n.x - n.w)),
    dy = Math.min(30, ...originals.map((n) => 1080 - n.y - n.h));
  const copies = originals.map((n) => {
    const c = JSON.parse(JSON.stringify(n));
    c.id = remap.get(n.id);
    c.title += " 副本";
    c.bindings = {};
    c.locked = false;
    c.x += dx;
    c.y += dy;
    if (c.group) {
      if (!groups.has(c.group)) groups.set(c.group, idFactory());
      c.group = groups.get(c.group);
    }
    return c;
  });
  const pipes = doc.pipes
    .filter((p) => remap.has(p.source.nodeId) && remap.has(p.target.nodeId))
    .map((p) => ({
      ...JSON.parse(JSON.stringify(p)),
      id: idFactory(),
      title: p.title + " 副本",
      bindings: {},
      source: { ...p.source, nodeId: remap.get(p.source.nodeId) },
      target: { ...p.target, nodeId: remap.get(p.target.nodeId) },
      vertices: p.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy })),
    }));
  doc.nodes.push(...copies);
  doc.pipes.push(...pipes);
  return copies.map((n) => n.id);
}
