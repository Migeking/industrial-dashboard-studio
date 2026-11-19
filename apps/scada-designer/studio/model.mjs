import { nativeTemplate, nativeTypes, nativeProblem, validateNative } from "../../../packages/runtime/studio/native-model.mjs";
import { blankScreen, isScreen, isScreenItem, screenProblem, validateScreen } from "../../../packages/runtime/studio/screen-model.mjs";
import { screenSlots } from "../../../packages/components/studio/screen-symbols.mjs";
export const types = {
  element: "工艺对象",
  trend: "多序列趋势",
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
export const mapped = (value) => {
  if (isScreenItem(value)) return !!screenSlots(value).length;
  if (typeof value === "object" && nativeTypes.has(value.type)) return !!value.slots?.length;
  return ["kpi", "chart", "status", "flow", "campus", "table"].includes(typeof value === "object" ? value.type : value);
};
export const analogRawRange = Object.freeze({ min: 4000, max: 20000 });
export const minimumProtocolPollMs = 500;
const engineeringUnitFactors = Object.freeze({
  m: ["length", 1], cm: ["length", .01], mm: ["length", .001],
  Pa: ["pressure", 1], kPa: ["pressure", 1000], MPa: ["pressure", 1e6], bar: ["pressure", 1e5],
  "m³/h": ["flow", 1], "L/s": ["flow", 3.6], "L/min": ["flow", .06],
  "m³": ["volume", 1], L: ["volume", .001],
});
export const engineeringUnits = Object.keys(engineeringUnitFactors);

function unitFactor(unit) {
  const key = typeof unit === "string" ? unit.trim().replace("m3", "m³") : "";
  return Object.hasOwn(engineeringUnitFactors, key) ? engineeringUnitFactors[key] : null;
}

export function effectivePollMs(source) {
  return ["opcua", "modbus"].includes(source.kind)
    ? Math.max(minimumProtocolPollMs, source.pollMs)
    : source.pollMs;
}

export function engineeringProblem(mapping) {
  const rule = mapping.conversion;
  if (rule == null) return "";
  if (mapping.kind !== "number" || !["identity", "linear", "raw420", "unit"].includes(rule.mode))
    return "工程换算方式无效";
  if (rule.mode === "identity") return "";
  if (rule.mode === "unit") {
    const input = unitFactor(rule.inputUnit), output = unitFactor(mapping.unit);
    return input && output && input[0] === output[0] ? "" : "输入与输出单位必须为同一量纲";
  }
  if (![rule.engineeringMin, rule.engineeringMax].every(Number.isFinite) ||
      rule.engineeringMin === rule.engineeringMax ||
      !Number.isFinite(rule.engineeringMax - rule.engineeringMin))
    return "请输入不同的有限工程量程端点";
  if (rule.mode === "linear" &&
      (![rule.rawMin, rule.rawMax].every(Number.isFinite) || rule.rawMax <= rule.rawMin ||
       !Number.isFinite(rule.rawMax - rule.rawMin)))
    return "输入量程上限必须大于下限";
  return "";
}

export const pointReasonLabels = {
  "source-quality": "数据源报告无效",
  "missing-record": "样本缺少该测点记录",
  "missing-value": "样本无数值",
  "invalid-timestamp": "时间戳无效",
  "invalid-number": "输入不是有效数值",
  "invalid-boolean": "输入不是有效开关量",
  "invalid-type": "输入类型不匹配",
  "invalid-conversion": "换算参数无效",
  "out-of-range": "原值超出输入量程",
  "too-old": "超过最大数据年龄",
  "disconnected": "数据源连接中断",
};

export function protocolMappings(rows, protocol, previous) {
  return rows.map((r) => ({
    id: r.id,
    label: r.label || r.id,
    unit: r.unit || "",
    kind: r.kind,
    path: "value",
    root: "points",
    keyField: "id",
    keyValue: r.id,
    timePath: protocol === "opcua" ? "timestamp" : "receivedAt",
    fallbackTimePath: "receivedAt",
    qualityPath: "quality",
    qualityReasonPath: "reason",
    rawPath: "raw",
    scale: 1,
    offset: 0,
    precision: r.unit === "原码" ? 0 : 2,
    ...previous.find(
      (m) => (m.keyField === "id" && m.keyValue === r.id) || m.id === r.id,
    ),
  }));
}
export function compatibleMappings(type, mappings) {
  const kinds = {
    kpi: ["number", "boolean", "text"],
    chart: ["number"],
    status: ["boolean"],
    flow: ["boolean"],
    campus: ["boolean"],
    table: ["dataset"],
  };
  return mappings.filter((m) => kinds[type]?.includes(m.kind));
}
export function bindingProblem(n, mappings) {
  if (isScreenItem(n)) return screenProblem(n, mappings);
  if (nativeTypes.has(n.type)) return nativeProblem(n, mappings);
  if (n.type === "campus") return campusProblem(n, mappings);
  if (!mapped(n.type) || (n.type === "table" && n.binding === "*")) return "";
  if (!mappings.some((m) => m.id === n.binding)) return "请选择测点";
  return compatibleMappings(n.type, mappings).some((m) => m.id === n.binding)
    ? ""
    : "测点类型不匹配";
}
export function campusBindings(n) {
  return (
    n.entities || [{ entity: n.entity, run: n.binding, fault: "", value: "" }]
  );
}
export function campusProblem(n, mappings) {
  if (
    n.assetVersion !== 1 ||
    !fans.some((f) => f.id === n.entity) ||
    !["equipment", "energy", "overview"].includes(n.camera)
  )
    return "三维对象或镜头无效";
  const entries = campusBindings(n),
    ids = new Set();
  if (!entries.length) return "请至少配置一台三维设备";
  for (const entry of entries) {
    const fan = fans.find((f) => f.id === entry.entity);
    if (!fan || ids.has(entry.entity)) return "三维对象编号无效或重复";
    ids.add(entry.entity);
    for (const [key, kind, label] of [
      ["run", "boolean", "运行反馈"],
      ["fault", "boolean", "故障反馈"],
      ["value", "number", "数值标签"],
    ]) {
      if (key !== "run" && !entry[key]) continue;
      if (!mappings.some((m) => m.id === entry[key] && m.kind === kind))
        return (
          fan.label +
          " " +
          label +
          "需要绑定" +
          (kind === "boolean" ? "开关量" : "数值") +
          "测点"
        );
    }
  }
  return "";
}
export function campusState(binding, points) {
  if (!binding) return "未配置";
  const fault = points[binding.fault],
    run = points[binding.run];
  if (fault?.quality === "good" && fault.value === true) return "故障";
  if ((binding.fault && fault?.quality !== "good") || run?.quality !== "good")
    return "未知";
  return run.value === true ? "运行" : "停止";
}
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
  if (key === "blank") return blankScreen();
  return ["01", "05"].includes(key) ? nativeTemplate(key) : legacyTemplate(key);
}
export function legacyTemplate(key = "01") {
  if (key === "30-demo") return campusExample();
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
export function campusExample() {
  const doc = template("30");
  doc.template = "30-demo";
  doc.title = "园区能源中心 · 联动演示";
  const data = {
    run1: true,
    run2: false,
    run3: true,
    run4: true,
    fault3: true,
    reading: 42.5,
  };
  const names = {
    run1: "1号风机运行反馈",
    run2: "2号风机运行反馈",
    run3: "3号风机运行反馈",
    run4: "4号风机运行反馈",
    fault3: "3号风机故障反馈",
    reading: "1号风机频率",
  };
  doc.source.data = JSON.stringify(data, null, 2);
  doc.mappings = Object.entries(data).map(([id, value]) => ({
    id,
    label: names[id],
    kind: typeof value,
    path: id,
    unit: id === "reading" ? "Hz" : "",
    precision: 1,
    scale: 1,
    offset: 0,
  }));
  doc.nodes = [
    {
      ...doc.nodes[0],
      w: 1800,
      binding: "run1",
      camera: "energy",
      entities: fans.map((f, i) => ({
        entity: f.id,
        run: "run" + (i + 1),
        fault: i === 2 ? "fault3" : "",
        value: i === 0 ? "reading" : "",
      })),
    },
  ];
  return doc;
}
export function validate(doc, publishing) {
  const fail = (msg) => {
    throw Error(msg);
  };
  if (
    (!isScreen(doc) && ![1, 2].includes(doc?.schemaVersion)) ||
    !Array.isArray(doc.nodes) ||
    !Array.isArray(doc.mappings) ||
    !doc.title?.trim()
  )
    fail("页面格式或版本无效");
  const s = doc.source;
  if (
    !s ||
    !["json", "csv", "rest", "ws", "opcua", "modbus"].includes(s.kind) ||
    !Number.isFinite(s.pollMs) ||
    s.pollMs < 200 ||
    !Number.isFinite(s.maxAgeMs) ||
    s.maxAgeMs <= 0
  )
    fail("数据源参数无效");
  if (["opcua", "modbus"].includes(s.kind))
    validateConnection(s.connection, s.kind);
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
    const problem = engineeringProblem(m);
    if (problem) fail(m.id + " · " + problem);
    ids.add(m.id);
  }
  if (doc.schemaVersion === 2) return validateNative(doc, publishing);
  if (isScreen(doc)) return validateScreen(doc, publishing);
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
    if (
      n.type === "campus" &&
      n.entities !== undefined &&
      (!Array.isArray(n.entities) ||
        !n.entities.every(
          (e) =>
            e &&
            typeof e.entity === "string" &&
            typeof e.run === "string" &&
            ["fault", "value"].every(
              (k) => e[k] === undefined || typeof e[k] === "string",
            ),
        ))
    )
      fail("三维设备配置格式无效");
    if (!publishing || !mapped(n.type)) continue;
    if (n.type === "campus") {
      const problem = campusProblem(n, doc.mappings);
      if (problem) fail(problem);
      continue;
    }
    const m = doc.mappings.find((p) => p.id === n.binding);
    if (n.type === "table" && n.binding === "*") continue;
    if (!m) fail(n.title + " 缺少有效绑定");
    if (
      (["status", "flow"].includes(n.type) && m.kind !== "boolean") ||
      (n.type === "chart" && m.kind !== "number") ||
      (n.type === "table" && m.kind !== "dataset") ||
      (n.type === "kpi" && m.kind === "dataset")
    )
      fail(n.title + " 绑定类型不匹配");
  }
  return doc;
}

// Registers are entered as one-based ordinals, stored as zero-based addresses.
// Build the complete batch before mutating the user's point table.
export function modbusBatchPoints(settings, existing = []) {
  const { prefix, start, count, serial, step, format, order } = settings;
  const fn = settings.function;
  const width = fn <= 2 ? 1 : ["uint32", "int32", "float32"].includes(format) ? 2 : 1;
  if (typeof prefix !== "string" || !/^[\w.-]+$/.test(prefix)) throw Error("编号前缀请使用英文、数字、下划线、点或短横线");
  if (![1,2,3,4].includes(fn) || ![start,count,serial,step].every(Number.isInteger) || start < 1 || count < 1 || count > 500 || serial < 0 || step < width || start - 1 + (count - 1) * step + width > 65536) throw Error("数量为 1～500；寄存器序号从 1 开始，步长不得小于数据占用的寄存器数，末地址不得越界");
  const rows = Array.from({length:count}, (_,i) => ({id:prefix+String(serial+i).padStart(3,"0"),label:prefix+String(serial+i).padStart(3,"0"),kind:fn<=2?"boolean":"number",function:fn,address:start-1+i*step,...(fn>2?{format,order}: {})}));
  const ids = new Set(existing.map(p=>p.id));
  for (const row of rows) {
    if (ids.has(row.id)) throw Error("点位编号已存在："+row.id);
    if (existing.some(p=>p.function===fn && row.address < p.address+(fn<=2||["uint16","int16"].includes(p.format)?1:2) && p.address < row.address+width)) throw Error("地址与已选点位重叠："+(row.address+1));
  }
  validateConnection({host:"batch",port:502,unitId:1,points:rows},"modbus");
  return rows;
}

export function validateConnection(c, kind) {
  if (!c || !Array.isArray(c.points) || !c.points.length)
    throw Error("请先选择协议测点");
  if (kind === "opcua") {
    const url = new URL(c.endpoint);
    if (url.protocol !== "opc.tcp:" || url.username || url.password)
      throw Error("OPC UA 地址无效");
  } else if (
    !c.host ||
    !Number.isInteger(c.port) ||
    c.port < 1 ||
    c.port > 65535 ||
    !Number.isInteger(c.unitId) ||
    c.unitId < 0 ||
    c.unitId > 255
  )
    throw Error("Modbus 连接参数无效");
  const ids = new Set();
  for (const p of c.points) {
    if (
      !/^[\w.-]+$/.test(p.id) ||
      ids.has(p.id) ||
      !["number", "boolean", "text"].includes(p.kind)
    )
      throw Error("协议测点编号或类型无效");
    ids.add(p.id);
    if (kind === "opcua") {
      if (typeof p.nodeId !== "string" || !p.nodeId)
        throw Error("OPC UA 节点编号缺失");
      continue;
    }
    const sizes = { uint16: 2, int16: 2, uint32: 4, int32: 4, float32: 4 };
    if (
      ![1, 2, 3, 4].includes(p.function) ||
      !Number.isInteger(p.address) ||
      p.address < 0 ||
      p.address > 65535
    )
      throw Error("Modbus 功能码或零基地址无效");
    if (p.function <= 2) {
      if (p.kind !== "boolean") throw Error("位测点需使用布尔类型");
    } else {
      const size = sizes[p.format];
      const order = p.order || "ABCD".slice(0, size);
      if (
        p.kind !== "number" ||
        !size ||
        [...order].sort().join("") !== "ABCD".slice(0, size) ||
        p.address + size / 2 > 65536
      )
        throw Error("寄存器格式或字序无效");
    }
    if (
      (p.rawMin != null || p.rawMax != null) &&
      (!Number.isFinite(p.rawMin) ||
        !Number.isFinite(p.rawMax) ||
        p.rawMin > p.rawMax)
    )
      throw Error("原码边界无效");
  }
}

export function importNorthbound(data) {
  if (!Array.isArray(data.mappings))
    throw Error("请导入北向 mappings JSON 点表");
  const bases = { DO: 1, DI: 10001, AI: 30001, AO: 40001 };
  const functions = { DO: 1, DI: 2, AI: 4, AO: 3 };
  return data.mappings
    .filter((p) => p.status === "active")
    .map((p) => {
      const bit = ["DO", "DI"].includes(p.type);
      if (
        !Object.hasOwn(bases, p.type) ||
        (bit ? p.dataType !== "BOOL" : p.dataType !== "UINT16")
      )
        throw Error("点表包含不支持的类型，请使用手工配置");
      return {
        id: p.type + "_" + p.address,
        label: p.point_alias,
        kind: bit ? "boolean" : "number",
        function: functions[p.type],
        address: p.address - bases[p.type],
        ...(bit
          ? {}
          : { format: "uint16", unit: "原码", rawMin: 4000, rawMax: 20000 }),
      };
    });
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
  if (data != null && Object.hasOwn(data, path)) return data[path];
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
  const rawValue = (m.rawPath ? at(record, m.rawPath) ?? value : value) ?? null;
  const stamp = m.timePath
    ? (at(record, m.timePath) ??
      (m.fallbackTimePath ? at(record, m.fallbackTimePath) : null))
    : receivedAt;
  const timestamp = typeof stamp === "number" ? stamp : Date.parse(stamp);
  const q = m.qualityPath ? at(record, m.qualityPath) : "good";
  const sourceDetail = m.qualityReasonPath ? at(record, m.qualityReasonPath) : null;
  let reason = "";
  if (record == null) reason = "missing-record";
  else if (q === "offline") reason = "disconnected";
  else if (q === "stale") reason = "too-old";
  else if (!["good", "GOOD", true, 1].includes(q))
    reason = Object.hasOwn(pointReasonLabels, sourceDetail) ? sourceDetail : "source-quality";
  else if (!Number.isFinite(timestamp)) reason = "invalid-timestamp";
  else if (value == null) reason = "missing-value";
  if (!m.conversion && m.enumMap && Object.hasOwn(m.enumMap, String(value)))
    value = m.enumMap[String(value)];
  if (m.kind === "number") {
    if (
      !["number", "string"].includes(typeof value) ||
      String(value).trim() === ""
    )
      reason ||= "invalid-number";
    const rule = m.conversion;
    value = Number(value);
    if (engineeringProblem(m)) reason ||= "invalid-conversion";
    else if (!rule) value = value * m.scale + m.offset;
    else if (rule.mode === "unit")
      value = value * (unitFactor(rule.inputUnit)[1] / unitFactor(m.unit)[1]);
    else if (rule.mode !== "identity") {
      const { min, max } = rule.mode === "raw420"
        ? analogRawRange : { min: rule.rawMin, max: rule.rawMax };
      const input = typeof rawValue === "number" ||
        (typeof rawValue === "string" && rawValue.trim()) ? Number(rawValue) : NaN;
      if (input < min || input > max) {
        if (!reason || reason === "source-quality") reason = "out-of-range";
      }
      else if (Number.isFinite(input)) {
        const ratio = (input - min) / (max - min);
        value = rule.engineeringMin + ratio * (rule.engineeringMax - rule.engineeringMin);
      } else reason ||= "invalid-number";
    }
    if (!Number.isFinite(value)) reason ||= "invalid-number";
  } else if (m.kind === "boolean") {
    if ([true, 1, "1", "true"].includes(value)) value = true;
    else if ([false, 0, "0", "false"].includes(value)) value = false;
    else reason ||= "invalid-boolean";
  } else if (m.kind === "dataset") {
    if (
      !Array.isArray(value) ||
      !value.every((r) => r && typeof r === "object" && !Array.isArray(r))
    )
      reason ||= "invalid-type";
  } else if (typeof value !== "string") reason ||= "invalid-type";
  if (!reason && now - timestamp > maxAgeMs) reason = "too-old";
  const quality = reason === "disconnected" ? "offline" :
    reason === "too-old" ? "stale" : reason ? "bad" : "good";
  return {
    value: quality === "good" ? value : null,
    rawValue,
    quality,
    reason,
    timestamp,
    receivedAt,
    unit: m.unit,
  };
}
