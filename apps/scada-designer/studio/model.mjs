export const types = {
  text: "文本",
  image: "图片",
  kpi: "指标卡",
  chart: "图表",
  table: "数据表",
  status: "设备状态",
  flow: "工艺流程",
  campus: "三维园区",
};
export const fans = ["NW", "SW", "NE", "SE"].map((corner, index) => ({
  id: "D.FAN." + corner,
  label: "能源中心 " + (index + 1) + " 号冷却风机",
  index,
}));
export const mapped = (type) =>
  ["kpi", "chart", "status", "flow", "campus", "table"].includes(type);
const specs = [
  ["flow", "进水流量", "m³/h", 820],
  ["oxygen", "好氧池溶解氧", "mg/L", 2.4],
  ["nh3", "出水氨氮", "mg/L", 0.48],
  ["level", "泵池液位", "m", 3.82],
  ["frequency", "泵组频率", "Hz", 42],
  ["pressure", "出口压力", "MPa", 0.23],
  ["returnFlow", "污泥回流流量", "m³/h", 206],
  ["pump", "回流泵运行", "", true],
  ["fan", "冷却风机运行", "", true],
  ["load", "处理负荷", "%", 74],
];
export function sample() {
  return Object.fromEntries(specs.map(([id, , , value]) => [id, value]));
}
export function node(type, id, binding = "") {
  return {
    id,
    type,
    title: types[type],
    x: 100,
    y: 140,
    w: 540,
    h: 300,
    binding,
    locked: false,
    ...(type === "text" ? { text: "工艺运行监视" } : {}),
    ...(type === "image" ? { image: "" } : {}),
    ...(type === "chart" ? { series: "line" } : {}),
    ...(type === "flow" ? { steps: "进水,处理,出水" } : {}),
    ...(type === "campus"
      ? { assetVersion: 1, entity: "D.FAN.NW", camera: "equipment" }
      : {}),
  };
}
export function template(key = "01") {
  const doc = {
    schemaVersion: 1,
    template: key,
    title: {
      "01": "A²/O 脱氮除磷运行监视",
      "05": "污泥回流泵站监视",
      30: "园区能源中心",
      blank: "新建监视页面",
    }[key],
    source: {
      kind: "json",
      data: JSON.stringify(sample(), null, 2),
      url: "",
      pollMs: 1000,
      maxAgeMs: 5000,
    },
    mappings: specs.map(([id, label, unit, value]) => ({
      id,
      label,
      path: id,
      kind: typeof value,
      unit,
      precision: 2,
      scale: 1,
      offset: 0,
    })),
    nodes: [],
  };
  const add = (type, binding, title, x, y, w, h, extra = {}) =>
    doc.nodes.push({
      ...node(type, "n" + doc.nodes.length, binding),
      title,
      x,
      y,
      w,
      h,
      ...extra,
    });
  if (key === "blank") return doc;
  if (key === "30") {
    add("campus", "fan", "能源中心 · 冷却风机", 60, 145, 1320, 860);
    add("status", "fan", "风机状态", 1410, 145, 450, 340);
    return doc;
  }
  const water = key === "01";
  (water
    ? ["flow", "oxygen", "nh3"]
    : ["level", "frequency", "pressure"]
  ).forEach((id, i) =>
    add(
      "kpi",
      id,
      specs.find((s) => s[0] === id)[1],
      60 + i * 610,
      140,
      578,
      254,
    ),
  );
  add(
    "flow",
    "pump",
    water ? "生物处理工艺" : "污泥回流管线",
    60,
    425,
    1040,
    262,
    { steps: water ? "厌氧池,缺氧池,好氧池,二沉池" : "集泥池,回流泵,回流总管" },
  );
  add(
    "chart",
    water ? "oxygen" : "returnFlow",
    water ? "溶解氧趋势" : "回流流量趋势",
    60,
    715,
    1040,
    300,
  );
  add("status", "pump", "回流泵状态", 1130, 425, 726, 262);
  add("table", "*", "工艺测点", 1130, 715, 726, 300);
  return doc;
}
export function validate(doc, publishing) {
  const fail = (msg) => {
    throw Error(msg);
  };
  if (
    doc?.schemaVersion !== 1 ||
    !Array.isArray(doc.nodes) ||
    !Array.isArray(doc.mappings) ||
    !doc.title?.trim()
  )
    fail("页面格式或版本无效");
  const s = doc.source;
  if (
    !s ||
    !["json", "csv", "rest", "ws"].includes(s.kind) ||
    !Number.isFinite(s.pollMs) ||
    s.pollMs < 200 ||
    !Number.isFinite(s.maxAgeMs) ||
    s.maxAgeMs <= 0
  )
    fail("数据源参数无效");
  if (publishing && ["rest", "ws"].includes(s.kind)) {
    const url = new URL(s.url);
    if (
      !(s.kind === "ws" ? ["ws:", "wss:"] : ["http:", "https:"]).includes(
        url.protocol,
      ) ||
      url.username ||
      url.password
    )
      fail("接口地址无效");
  }
  const ids = new Set();
  for (const m of doc.mappings) {
    if (
      !/^[\w.-]+$/.test(m.id) ||
      ids.has(m.id) ||
      typeof m.path !== "string" ||
      !m.path ||
      (m.enumMap != null &&
        (typeof m.enumMap !== "object" || Array.isArray(m.enumMap))) ||
      !["number", "boolean", "text", "dataset"].includes(m.kind) ||
      !Number.isInteger(m.precision) ||
      m.precision < 0 ||
      m.precision > 10 ||
      ![m.scale, m.offset].every(Number.isFinite)
    )
      fail("测点编号、类型、路径或换算参数无效");
    ids.add(m.id);
  }
  const nodes = new Set();
  for (const n of doc.nodes) {
    if (
      !Object.hasOwn(types, n.type) ||
      !n.id ||
      nodes.has(n.id) ||
      !["x", "y", "w", "h"].every((k) => Number.isFinite(n[k])) ||
      n.w < 100 ||
      n.h < 100 ||
      n.x < 0 ||
      n.y < 0 ||
      n.x + n.w > 1920.01 ||
      n.y + n.h > 1080.01
    )
      fail("组件位置或编号无效");
    nodes.add(n.id);
    if (
      typeof n.title !== "string" ||
      (n.type === "flow" && typeof n.steps !== "string") ||
      (n.type === "text" && typeof n.text !== "string") ||
      (n.type === "chart" && !["line", "bar"].includes(n.series))
    )
      fail("组件内容或图表样式无效");
    if (
      n.type === "image" &&
      n.image &&
      !/^data:image\/(png|jpeg|webp);base64,/i.test(n.image)
    )
      fail("请使用本地 PNG、JPEG 或 WebP 图片");
    if (!publishing || !mapped(n.type)) continue;
    const m = doc.mappings.find((p) => p.id === n.binding);
    if (n.type === "table" && n.binding === "*") continue;
    if (!m) fail(n.title + " 缺少有效绑定");
    if (
      (["status", "flow", "campus"].includes(n.type) && m.kind !== "boolean") ||
      (n.type === "chart" && m.kind !== "number") ||
      (n.type === "table" && m.kind !== "dataset") ||
      (n.type === "kpi" && m.kind === "dataset")
    )
      fail(n.title + " 绑定类型不匹配");
    if (
      n.type === "campus" &&
      (n.assetVersion !== 1 ||
        !fans.some((f) => f.id === n.entity) ||
        !["equipment", "overview"].includes(n.camera))
    )
      fail(n.title + " 三维对象或镜头无效");
  }
  return doc;
}
export function csv(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && c === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw Error("CSV 引号未闭合");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift();
  if (!headers || new Set(headers).size !== headers.length)
    throw Error("CSV 表头无效");
  return rows
    .filter((r) => r.some(Boolean))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}
export function at(data, path) {
  if (!path || path === "$") return data;
  return path
    .split(".")
    .reduce(
      (v, k) => (v != null && Object.hasOwn(v, k) ? v[k] : undefined),
      data,
    );
}
export function normalize(payload, m, receivedAt, maxAgeMs, now = Date.now()) {
  const root = at(payload, m.root);
  const record =
    m.keyField && Array.isArray(root)
      ? root.find((row) => String(at(row, m.keyField)) === String(m.keyValue))
      : root;
  let value = at(record, m.path);
  const stamp = m.timePath
    ? (at(record, m.timePath) ??
      (m.fallbackTimePath ? at(record, m.fallbackTimePath) : null))
    : receivedAt;
  const timestamp = typeof stamp === "number" ? stamp : Date.parse(stamp);
  const q = m.qualityPath ? at(record, m.qualityPath) : "good";
  let quality = "good";
  if (
    !["good", "GOOD", true, 1].includes(q) ||
    !Number.isFinite(timestamp) ||
    value == null
  )
    quality = "bad";
  if (m.enumMap && Object.hasOwn(m.enumMap, String(value)))
    value = m.enumMap[String(value)];
  if (m.kind === "number") {
    if (
      !["number", "string"].includes(typeof value) ||
      String(value).trim() === ""
    )
      quality = "bad";
    value = Number(value) * m.scale + m.offset;
    if (!Number.isFinite(value)) quality = "bad";
  } else if (m.kind === "boolean") {
    if ([true, 1, "1", "true"].includes(value)) value = true;
    else if ([false, 0, "0", "false"].includes(value)) value = false;
    else quality = "bad";
  } else if (m.kind === "dataset") {
    if (
      !Array.isArray(value) ||
      !value.every((r) => r && typeof r === "object" && !Array.isArray(r))
    )
      quality = "bad";
  } else if (typeof value !== "string") quality = "bad";
  if (quality === "good" && now - timestamp > maxAgeMs) quality = "stale";
  return {
    value: quality === "good" ? value : null,
    quality,
    timestamp,
    receivedAt,
    unit: m.unit,
  };
}
