import {screenControlDefaults,validateScreenControl} from './screen-controls.mjs';
import {
  screenSymbols,
  screenSlots,
  screenPorts,
  screenPoint,
  screenRoleSlot,
  screenAppearanceOptions,
  screenMedia,
  screenPortMediaProblem,
} from "../../components/studio/screen-symbols.mjs";
import { validateScreenRules } from "./screen-dynamics.mjs";
import { validateScreenWidget } from "./screen-widgets.mjs";
import { screenPurposes } from "./screen-themes.mjs";
import { waterArtwork } from "../../components/studio/water-artwork.mjs";

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
    z: symbol === "rect" ? -10 : symbol === "pidBasin" ? 2 : symbol === "pidInstrument" ? 20 : 10,
    locked: false,
    hidden: false,
    ...(def.contractVersion ? { equipmentVersion: def.contractVersion } : {}),
    style: {
      fill:
        symbol === "text"
          ? "transparent"
          : [
                "pidInstrument",
                "readout",
                "trend",
                "barChart",
                "pieChart",
                "gauge",
                "table",
                "events",
              ].includes(symbol)
            ? "#ffffff"
            : symbol === "junction"
              ? "#547185"
              : "#e5edf2",
      stroke: "#547185",
      color: "#304c5d",
      fontSize: symbol === "text" ? 32 : symbol === "readout" ? 44 : symbol === "pidBasin" ? 18 : 20,
    },
    params: {
      min: 0,
      max: ["gauge", "barGauge"].includes(symbol) ? 100 : 6,
      unit: "",
      precision: 2,
      windowSeconds: 120,
      ...screenControlDefaults(symbol),
      ...(def.pictureHeight ? {appearance:'depth'} : {}),
    },
    bindings: {},
    ...(["line", "polyline", "polygon"].includes(symbol)
      ? {
          points:
            symbol === "line"
              ? [
                  { x: 0, y: 50 },
                  { x: 100, y: 50 },
                ]
              : symbol === "polyline"
                ? [
                    { x: 0, y: 80 },
                    { x: 40, y: 20 },
                    { x: 70, y: 80 },
                    { x: 100, y: 20 },
                  ]
                : [
                    { x: 0, y: 100 },
                    { x: 50, y: 0 },
                    { x: 100, y: 100 },
                  ],
        }
      : {}),
    ...(symbol === "text" ? { text: "输入标题" } : {}),
    ...(symbol === "image" ? { image: "" } : {}),
    ...(symbol === "button"
      ? { action: { type: "navigate", pageId: "" } }
      : {}),
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
export function screenAssetProblem(n) {
  if (n.params?.appearance === "picture") return n.image ? "" : "尚未载入设备图片";
  if (screenSymbols[n.symbol]?.contractVersion && !Object.hasOwn(waterArtwork, n.symbol))
    return "成套设备图稿缺失";
  return "";
}
export function screenMediumPipeStyle(doc, { source, target }) {
  for (const end of [source, target]) {
    if (!end.nodeId) continue;
    const port = screenPorts(doc.nodes.find(n => n.id === end.nodeId)).find(p => p.id === end.portId);
    const medium = Object.hasOwn(screenMedia, port?.medium) ? screenMedia[port.medium] : null;
    if (medium) return { color: medium.color, appearance: "process", width: 5 };
  }
  return {};
}
export function validateScreen(doc, publishing, project = doc) {
  if (
    !isScreen(doc) ||
    doc.canvas?.width !== 1920 ||
    doc.canvas?.height !== 1080 ||
    !/^#[\da-f]{6}$/i.test(doc.canvas.background) ||
    !Array.isArray(doc.pipes)
  )
    throw Error("画布格式或尺寸无效");
  if (
    doc.canvas.theme !== undefined &&
    !["process-gray", "monitor-light", "cockpit-dark"].includes(
      doc.canvas.theme,
    )
  )
    throw Error("画面主题无效");
  if (doc.canvas.appearance !== undefined && !["classic", "detailed", "depth"].includes(doc.canvas.appearance))
    throw Error("绘图外观无效");
  if (doc.canvas.purpose !== undefined && !Object.hasOwn(screenPurposes, doc.canvas.purpose))
    throw Error("画面用途无效");
  if (doc.pages !== undefined) {
    if (!Array.isArray(doc.pages)) throw Error("项目画面列表无效");
    const pageIds = new Set(["main"]),
      objectIds = new Set([...doc.nodes, ...doc.pipes].map((n) => n.id));
    for (const page of doc.pages) {
      if (
        !page ||
        typeof page.id !== "string" ||
        !page.id ||
        pageIds.has(page.id) ||
        typeof page.title !== "string" ||
        !page.title.trim() ||
        !Array.isArray(page.nodes) ||
        !Array.isArray(page.pipes)
      )
        throw Error("画面编号或名称无效");
      pageIds.add(page.id);
      for (const n of [...page.nodes, ...page.pipes]) {
        if (objectIds.has(n.id)) throw Error("不同画面的对象编号重复");
        objectIds.add(n.id);
      }
      validateScreen(
        { ...doc, ...page, pages: undefined, symbols: undefined },
        publishing,
        project,
      );
    }
    if (doc.defaultPageId !== undefined && !pageIds.has(doc.defaultPageId))
      throw Error("项目首页不存在");
  }
  if (doc.symbols !== undefined) {
    if (!Array.isArray(doc.symbols)) throw Error("我的图元格式无效");
    const symbolIds = new Set();
    for (const symbol of doc.symbols) {
      validateScreenSymbolDefinition(symbol);
      if (symbolIds.has(symbol.id)) throw Error("图元编号重复");
      symbolIds.add(symbol.id);
    }
  }
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
    if (!Array.isArray(screenSlots(n))) throw Error("数据槽位定义无效");
    for (const [key, value] of Object.entries(n.bindings))
      if (
        !screenSlots(n).some((s) => s.key === key) ||
        typeof value !== "string"
      )
        throw Error("图元绑定槽位无效");
    if (n.type === "screen-node") {
      if (n.equipmentVersion !== undefined && n.equipmentVersion !== screenSymbols[n.symbol]?.contractVersion)
        throw Error(n.title + " 的成套设备版本无效");
      const ports = screenPorts(n),
        portIds = new Set();
      if (!Array.isArray(ports)) throw Error("连接点定义无效");
      for (const port of ports) {
        if (
          !port ||
          typeof port.id !== "string" ||
          !port.id ||
          portIds.has(port.id) ||
          typeof port.label !== "string" ||
          !port.label.trim() ||
          ![port.x, port.y].every(
            (v) => Number.isFinite(v) && v >= 0 && v <= 100,
          ) ||
          !["both", "in", "out"].includes(port.direction) ||
          (port.medium !== undefined && !Object.hasOwn(screenMedia, port.medium))
        )
          throw Error(n.title + " 的连接点定义无效");
        portIds.add(port.id);
      }
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
      if (
        n.params.appearance !== undefined &&
        !["classic", "detailed"].includes(n.params.appearance) &&
        !Object.hasOwn(screenAppearanceOptions(n.symbol), n.params.appearance)
      )
        throw Error("图元外观预设无效");
      if (
        n.params.icon !== undefined &&
        !["", "Σ", "%", "≈", "⚙", "●"].includes(n.params.icon)
      )
        throw Error("指标符号无效");
      if (
        n.params.labelPosition !== undefined &&
        !["top", "bottom", "none"].includes(n.params.labelPosition)
      )
        throw Error("位号位置无效");
      if (
        n.params.levelDirection !== undefined &&
        !["up", "down"].includes(n.params.levelDirection)
      )
        throw Error("液位方向无效");
      if (
        n.params.valveMode !== undefined &&
        !["switch", "control"].includes(n.params.valveMode)
      )
        throw Error("阀门类型无效");
      if (
        (n.params.positionMin !== undefined ||
          n.params.positionMax !== undefined) &&
        (![n.params.positionMin ?? 0, n.params.positionMax ?? 100].every(
          Number.isFinite,
        ) ||
          (n.params.positionMax ?? 100) <= (n.params.positionMin ?? 0))
      )
        throw Error("开度范围无效");

      if (n.symbol === "text" && typeof n.text !== "string")
        throw Error("文字内容无效");
      if (
        ["line", "polyline", "polygon"].includes(n.symbol) &&
        (!Array.isArray(n.points) ||
          n.points.length < (n.symbol === "polygon" ? 3 : 2) ||
          n.points.some(
            (p) =>
              ![p.x, p.y].every(
                (v) => Number.isFinite(v) && v >= 0 && v <= 100,
              ),
          ))
      )
        throw Error("图形顶点无效");
      if (
        n.style.fontFamily !== undefined &&
        !["Microsoft YaHei", "Arial", "Consolas", "SimSun"].includes(
          n.style.fontFamily,
        )
      )
        throw Error("字体无效");
      if (
        n.style.align !== undefined &&
        !["left", "center", "right"].includes(n.style.align)
      )
        throw Error("文字对齐无效");
      if (
        n.style.fontWeight !== undefined &&
        ![400, 600, 700].includes(n.style.fontWeight)
      )
        throw Error("字重无效");
      if (
        n.style.lineWidth !== undefined &&
        (!Number.isFinite(n.style.lineWidth) ||
          n.style.lineWidth < 1 ||
          n.style.lineWidth > 30)
      )
        throw Error("图形线宽无效");
      if (
        n.image &&
        (n.symbol === "image" || screenAppearanceOptions(n.symbol).picture)
      )
        validateScreenAsset(n.image);
      const assetProblem = screenAssetProblem(n);
      if (publishing && assetProblem) throw Error(n.title + " " + assetProblem);
    } else {
      if (
        !Array.isArray(n.vertices) ||
        n.vertices.some((p) => ![p.x, p.y].every(Number.isFinite))
      )
        throw Error("管道转折点无效");
      for (const end of [n.source, n.target]) {
        if (!end?.nodeId) {
          if (
            !end ||
            ![end.x, end.y].every(Number.isFinite) ||
            end.x < 0 ||
            end.x > 1920 ||
            end.y < 0 ||
            end.y > 1080
          )
            throw Error("管道开放端坐标无效");
          continue;
        }
        const owner = nodes.get(end?.nodeId);
        if (!owner || !screenPorts(owner).some((p) => p.id === end.portId))
          throw Error(n.title + " 的设备端口不存在");
      }
      const sourcePort = screenPorts(nodes.get(n.source.nodeId)).find(
          (p) => p.id === n.source.portId,
        ),
        targetPort = screenPorts(nodes.get(n.target.nodeId)).find(
          (p) => p.id === n.target.portId,
        );
      if (sourcePort?.direction === "in" || targetPort?.direction === "out")
        throw Error(n.title + " 的连接点方向不匹配");
      const mediumProblem = screenPortMediaProblem(sourcePort, targetPort);
      if (mediumProblem) throw Error(n.title + " · " + mediumProblem);
      if (
        !n.style ||
        !/^#[\da-f]{6}$/i.test(n.style.color) ||
        (n.style.appearance !== undefined &&
          !Object.hasOwn(screenAppearanceOptions("pipe"), n.style.appearance)) ||
        (n.style.flowColor !== undefined &&
          !/^#[\da-f]{6}$/i.test(n.style.flowColor)) ||
        (n.style.pattern !== undefined && !["solid","dashed"].includes(n.style.pattern)) ||
        (n.style.jump !== undefined && typeof n.style.jump !== "boolean") ||
        (n.style.animateFlow!==undefined&&typeof n.style.animateFlow!=='boolean') ||
        !Number.isFinite(n.style.width) ||
        n.style.width < 1 ||
        n.style.width > 30
      )
        throw Error("管道样式无效");
      if (
        n.style.arrow !== undefined &&
        !["none", "forward", "reverse", "both"].includes(n.style.arrow)
      )
        throw Error("管道箭头无效");
      if (
        n.style.flowDirection !== undefined &&
        !["forward", "reverse"].includes(n.style.flowDirection)
      )
        throw Error("管道流向无效");
    }
    const slotIds = new Set(),
      roles = new Set();
    if (!Array.isArray(screenSlots(n))) throw Error("数据槽位定义无效");
    for (const slot of screenSlots(n)) {
      const role = slot.role || slot.key;
      if (
        !slot ||
        typeof slot.key !== "string" ||
        !slot.key ||
        slotIds.has(slot.key) ||
        typeof slot.label !== "string" ||
        !slot.label.trim() ||
        !Array.isArray(slot.kinds) ||
        !slot.kinds.length ||
        slot.kinds.some(
          (k) => !["number", "boolean", "text", "dataset"].includes(k),
        ) ||
        typeof slot.required !== "boolean" ||
        !["extra", "run", "fault", "open", "value", "text", "flow"].includes(
          role,
        )
      )
        throw Error(n.title + " 的数据槽位定义无效");
      if (role !== "extra" && roles.has(role))
        throw Error("同一用途只能定义一个数据槽位");
      if (
        ["run", "fault", "open", "flow"].includes(role) &&
        slot.kinds.some((k) => k !== "boolean")
      )
        throw Error("状态槽位必须为开关量");
      if (
        role === "value" &&
        slot.kinds.some((k) => !["number", "dataset"].includes(k))
      )
        throw Error("数值槽位需要数值或行数据集");
      slotIds.add(slot.key);
      if (role !== "extra") roles.add(role);
    }
    validateScreenRules(n);
    validateScreenWidget(n);
    validateScreenControl(n,doc,publishing);
    if (n.action !== undefined) {
      if (
        !n.action ||
        !["none", "details", "trend", "navigate", "link"].includes(
          n.action.type,
        ) ||
        (n.type === "pipe" && n.action.type !== "none")
      )
        throw Error("元素点击动作无效");
      if (
        n.action.type === "navigate" &&
        publishing &&
        !["main", ...(project.pages || []).map((p) => p.id)].includes(
          n.action.pageId,
        )
      )
        throw Error(n.title + " 的导航目标不存在");
      if (n.action.type === "link" && (publishing || n.action.url)) {
        let url;
        try {
          url = new URL(n.action.url);
        } catch {
          throw Error("链接地址无效");
        }
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw Error("请使用 HTTP 或 HTTPS 链接");
      }
      if (n.action.type === "trend") {
        for (const key of ["timeField", "valueField", "qualityField"]) {
          const field = n.action[key];
          if (field !== undefined && (typeof field !== "string" || field.length > 128))
            throw Error(n.title + " 的趋势字段无效");
        }
      }
      if (n.action.type === "trend" && publishing) {
        const slot = screenSlots(n).find((s) => s.key === n.action.slot),
          mapping = doc.mappings.find(
            (m) => m.id === n.bindings[n.action.slot],
          );
        if (!slot || !mapping || !["number", "dataset"].includes(mapping.kind))
          throw Error(n.title + " 的趋势动作需绑定数值或历史槽位");
      }
    }
    if (publishing) {
      const problem = screenProblem(n, doc.mappings);
      if (problem) throw Error(n.title + "：" + problem);
    }
  }
  return doc;
}
export function screenState(n, points) {
  const fault = screenPoint(n, points, "fault"),
    feedback = screenPoint(
      n,
      points,
      n.symbol === "valve"
        ? n.params.valveMode === "control"
          ? "value"
          : "open"
        : "run",
    ),
    faultSlot = screenRoleSlot(n, "fault");
  if (fault?.quality === "good" && fault.value === true) return "故障";
  if (
    (n.bindings?.[faultSlot?.key] && fault?.quality !== "good") ||
    feedback?.quality !== "good"
  )
    return "未知";
  if (n.symbol === "valve" && n.params.valveMode === "control")
    return feedback.value < (n.params.positionMin ?? 0) ||
      feedback.value > (n.params.positionMax ?? 100)
      ? "未知"
      : feedback.value > (n.params.positionMin ?? 0)
        ? "开启"
        : "关闭";
  return n.symbol === "valve"
    ? feedback.value === true
      ? "开启"
      : "关闭"
    : feedback.value === true
      ? "运行"
      : "停止";
}
export function screenDisplay(n, points, mappings, key = "value") {
  const slot = screenRoleSlot(n, key),
    binding = n.bindings?.[slot?.key || key];
  const p = points[binding],
    m = mappings.find((v) => v.id === binding);
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
export function copyScreenSelection(
  doc,
  selected,
  idFactory,
  keepBindings = false,
) {
  const originals = doc.nodes.filter((n) => selected.includes(n.id)),
    remap = new Map(originals.map((n) => [n.id, idFactory()])),
    groups = new Map();
  const includedPipes = doc.pipes.filter((p) =>
      screenPipeInSelection(p, new Set(remap.keys())),
    ),
    openEnds = includedPipes.flatMap((p) =>
      [p.source, p.target].filter((e) => !e.nodeId),
    );
  const dx = Math.max(
      0,
      Math.min(
        30,
        ...originals.map((n) => 1920 - n.x - n.w),
        ...openEnds.map((e) => 1920 - e.x),
      ),
    ),
    dy = Math.max(
      0,
      Math.min(
        30,
        ...originals.map((n) => 1080 - n.y - n.h),
        ...openEnds.map((e) => 1080 - e.y),
      ),
    );
  const copies = originals.map((n) => {
    const c = JSON.parse(JSON.stringify(n));
    c.id = remap.get(n.id);
    if(c.symbol==='trendRange')c.params.targetId=remap.get(c.params.targetId)||c.params.targetId;
    c.title += " 副本";
    if (!keepBindings) c.bindings = {};
    c.locked = false;
    c.x += dx;
    c.y += dy;
    if (c.group) {
      if (!groups.has(c.group)) groups.set(c.group, idFactory());
      c.group = groups.get(c.group);
    }
    return c;
  });
  const pipes = includedPipes.map((p) => ({
    ...JSON.parse(JSON.stringify(p)),
    id: idFactory(),
    title: p.title + " 副本",
    bindings: keepBindings ? { ...p.bindings } : {},
    source: p.source.nodeId
      ? { ...p.source, nodeId: remap.get(p.source.nodeId) }
      : { x: p.source.x + dx, y: p.source.y + dy },
    target: p.target.nodeId
      ? { ...p.target, nodeId: remap.get(p.target.nodeId) }
      : { x: p.target.x + dx, y: p.target.y + dy },
    vertices: p.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy })),
  }));
  doc.nodes.push(...copies);
  doc.pipes.push(...pipes);
  return copies.map((n) => n.id);
}
export function screenPipeInSelection(pipe, ids) {
  return (
    [pipe.source, pipe.target].every((e) => !e.nodeId || ids.has(e.nodeId)) &&
    [pipe.source, pipe.target].some((e) => ids.has(e.nodeId))
  );
}
export function screenEndpointPosition(doc, end) {
  if (!end.nodeId) return { x: end.x, y: end.y };
  const n = doc.nodes.find((n) => n.id === end.nodeId),
    p = screenPorts(n).find((p) => p.id === end.portId);
  if (!n || !p) throw Error("连接点不存在");
  const x = (p.x / 100 - 0.5) * n.w,
    y = (p.y / 100 - 0.5) * n.h,
    r = (n.angle * Math.PI) / 180;
  return {
    x: n.x + n.w / 2 + x * Math.cos(r) - y * Math.sin(r),
    y: n.y + n.h / 2 + x * Math.sin(r) + y * Math.cos(r),
  };
}
// An active-page view shares root metadata, including pages. Validate edited
// geometry in isolation so its own child page is not counted a second time.
function screenEditingPage(doc) {
  return {
    format: doc.format,
    version: doc.version,
    canvas: doc.canvas,
    nodes: doc.nodes,
    pipes: doc.pipes,
    mappings: doc.mappings,
  };
}
export function editScreenEndpoint(doc, id, which, end, commit = true) {
  const pipe = doc.pipes.find((p) => p.id === id);
  if (!pipe || !["source", "target"].includes(which))
    throw Error("请选择管道端点");
  const next = { ...pipe, [which]: end };
  validateScreen(
    {
      ...screenEditingPage(doc),
      pipes: doc.pipes.map((p) => (p.id === id ? next : p)),
    },
    false,
  );
  if (commit) Object.assign(pipe, next);
  return next;
}

// Definitions are saved on the instance. Existing documents inherit registry
// defaults until the user edits them; IDs remain stable when labels move/change.
export function editScreenDefinition(
  doc,
  id,
  section,
  operation,
  value,
  commit = true,
) {
  const item = [...doc.nodes, ...doc.pipes].find((n) => n.id === id);
  if (!item) throw Error("请选择元素");
  const next = JSON.parse(JSON.stringify(item));
  if (section === "ports") {
    if (item.type === "pipe") throw Error("请在设备元素上定义连接点");
    next.ports = JSON.parse(JSON.stringify(screenPorts(item)));
    const index = next.ports.findIndex((p) => p.id === value.id);
    if (operation === "add") next.ports.push(value);
    else if (index < 0) throw Error("连接点不存在");
    else if (operation === "remove") {
      if (
        doc.pipes.some((p) =>
          [p.source, p.target].some(
            (e) => e.nodeId === id && e.portId === value.id,
          ),
        )
      )
        throw Error("该连接点仍有管道，请先更换管道端点或删除管道");
      next.ports.splice(index, 1);
    } else next.ports[index] = { ...next.ports[index], ...value };
  } else if (section === "slots") {
    next.dataSlots = JSON.parse(JSON.stringify(screenSlots(item)));
    const index = next.dataSlots.findIndex((s) => s.key === value.key);
    if (operation === "add") next.dataSlots.push(value);
    else if (index < 0) throw Error("数据槽位不存在");
    else if (operation === "remove") {
      if (next.rules?.some((r) => r.slot === value.key))
        throw Error("该槽位仍被显示规则使用，请先修改规则");
      if (
        next.params?.series?.some((s) => s.slot === value.key) ||
        (next.action?.type === "trend" && next.action.slot === value.key)
      )
        throw Error("该槽位仍被图表序列或点击动作使用");
      next.dataSlots.splice(index, 1);
      delete next.bindings[value.key];
    } else {
      next.dataSlots[index] = { ...next.dataSlots[index], ...value };
      const mapping = doc.mappings.find(
        (m) => m.id === next.bindings[value.key],
      );
      if (mapping && !next.dataSlots[index].kinds.includes(mapping.kind))
        delete next.bindings[value.key];
    }
  } else throw Error("元素定义类型无效");
  validateScreen(
    {
      ...screenEditingPage(doc),
      nodes: doc.nodes.map((n) => (n.id === id ? next : n)),
      pipes: doc.pipes.map((n) => (n.id === id ? next : n)),
    },
    false,
  );
  if (commit) Object.assign(item, next);
  return next;
}

export function validateScreenSymbolDefinition(symbol) {
  if (
    !symbol ||
    typeof symbol.id !== "string" ||
    !symbol.id ||
    typeof symbol.name !== "string" ||
    !symbol.name.trim() ||
    symbol.version !== 1 ||
    ![symbol.w, symbol.h].every(Number.isFinite) ||
    symbol.w < 16 ||
    symbol.h < 16 ||
    symbol.w > 1920 ||
    symbol.h > 1080 ||
    !Array.isArray(symbol.nodes) ||
    !symbol.nodes.length ||
    !Array.isArray(symbol.pipes)
  )
    throw Error("图元文件格式无效");
  validateScreen(
    {
      format: "screen-document",
      version: 1,
      canvas: { width: 1920, height: 1080, background: "#ffffff" },
      mappings: [],
      nodes: symbol.nodes,
      pipes: symbol.pipes,
    },
    false,
  );
  if (
    symbol.nodes.some(
      (n) => n.x + n.w > symbol.w + 0.01 || n.y + n.h > symbol.h + 0.01,
    )
  )
    throw Error("图元边界与内容不匹配");
  if (
    [...symbol.nodes, ...symbol.pipes].some((n) =>
      Object.values(n.bindings).some(Boolean),
    )
  )
    throw Error("图元定义不应携带站点实际绑定");
  return symbol;
}

export function validateScreenAsset(uri) {
  if (/^data:image\/(png|jpeg|webp);base64,/i.test(uri)) return uri;
  if (!/^data:image\/svg\+xml;base64,/i.test(uri))
    throw Error("请使用本地 PNG、JPEG、WebP 或静态 SVG");
  let svg;
  try {
    svg = atob(uri.slice(uri.indexOf(",") + 1));
  } catch {
    throw Error("SVG 文件编码无效");
  }
  if (
    !/<svg[\s>]/i.test(svg) ||
    /<\s*(script|foreignObject|iframe|object|embed|animate|animateMotion|animateTransform|set)\b|<!DOCTYPE|<!ENTITY|\bon\w+\s*=|@import/i.test(
      svg,
    )
  )
    throw Error("SVG 含动态内容，请使用静态自包含图形");
  for (const match of svg.matchAll(
    /(?:href|xlink:href)\s*=\s*["']([^"']*)["']/gi,
  ))
    if (
      !match[1].startsWith("#") &&
      !/^data:image\/(png|jpeg|webp);base64,/i.test(match[1])
    )
      throw Error("SVG 引用了外部资源，请嵌入图片后重试");
  for (const match of svg.matchAll(/url\(([^)]*)\)/gi))
    if (
      !match[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .startsWith("#")
    )
      throw Error("SVG 引用了外部样式资源");
  return uri;
}
