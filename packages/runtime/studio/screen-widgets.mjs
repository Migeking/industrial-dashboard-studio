import {
  screenSlots,
  screenRoleSlot,
  screenDefaultAction,
} from "../../components/studio/screen-symbols.mjs";

export const screenChartKinds = new Set([
  "trend",
  "barChart",
  "pieChart",
  "gauge",
]);
export const screenTableKinds = new Set(["table", "events"]);
export function screenTrendSampleKey(point, sequence, binding) {
  const capturedAt = [point?.receivedAt, point?.timestamp].find(Number.isFinite);
  return JSON.stringify([binding, capturedAt ?? sequence, point?.timestamp, point?.quality, point?.value]);
}
export function screenField(row, path) {
  if (row === null || row === undefined || !path) return undefined;
  if (Object.hasOwn(Object(row), path)) return row[path];
  return path
    .split(".")
    .reduce(
      (v, key) =>
        ["__proto__", "prototype", "constructor"].includes(key)
          ? undefined
          : v?.[key],
      row,
    );
}
export function screenNumeric(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" &&
        value.trim() !== "" &&
        Number.isFinite(Number(value))
      ? Number(value)
      : null;
}
function widgetTime(value) {
  return typeof value === "number" ? value : Date.parse(value);
}
export function screenHistoryRows(rows, {
  xType = "time",
  xField = "time",
  field = "value",
  qualityField = "",
} = {}) {
  const samples = rows.map((row) => {
    const rawTime = screenField(row, xField);
    const quality = screenField(row, qualityField || "quality");
    const valid = (!qualityField && quality === undefined) ||
      ["good", "GOOD", true, 1].includes(quality);
    return {
      x: xType === "time" ? widgetTime(rawTime) : String(rawTime ?? ""),
      y: valid ? screenNumeric(screenField(row, field)) : null,
    };
  });
  return xType === "time"
    ? samples.filter((r) => Number.isFinite(r.x)).sort((a, b) => a.x - b.x)
    : samples;
}
export function screenSeries(n) {
  return n.params.series?.length
    ? n.params.series
    : [
        {
          id: "primary",
          slot: screenRoleSlot(n, "value")?.key || "value",
          name: "",
          type: n.symbol === "barChart" ? "bar" : "line",
          axis: 0,
          field: "value",
        },
      ];
}
export function validateScreenWidget(n) {
  if (
    !screenChartKinds.has(n.symbol) &&
    !screenTableKinds.has(n.symbol) &&
    !["status", "barGauge"].includes(n.symbol)
  )
    return;
  const p = n.params;
  if (
    !Number.isFinite(p.min) ||
    !Number.isFinite(p.max) ||
    p.max <= p.min ||
    !Number.isInteger(p.precision) ||
    p.precision < 0 ||
    p.precision > 10
  )
    throw Error("仪表量程或小数位无效");
  for (const k of ["onColor", "offColor"])
    if (p[k] !== undefined && !/^#[\da-f]{6}$/i.test(p[k]))
      throw Error("状态颜色无效");
  const valueSlot = screenRoleSlot(n, "value");
  if (
    valueSlot &&
    ["gauge", "barGauge"].includes(n.symbol) &&
    valueSlot.kinds.some((k) => k !== "number")
  )
    throw Error("仪表的显示数值槽位需要数值类型");
  if (
    valueSlot &&
    ["pieChart", "table", "events"].includes(n.symbol) &&
    valueSlot.kinds.some((k) => k !== "dataset")
  )
    throw Error("此组件的数据槽位需要行数据集");
  if (p.series !== undefined) {
    if (!Array.isArray(p.series) || !p.series.length)
      throw Error("请保留至少一个图表序列");
    const ids = new Set();
    for (const s of p.series) {
      const slot = screenSlots(n).find((t) => t.key === s?.slot);
      if (
        !s ||
        typeof s.id !== "string" ||
        !s.id ||
        ids.has(s.id) ||
        !slot ||
        slot.kinds.some((k) => !["number", "dataset"].includes(k)) ||
        typeof s.name !== "string" ||
        !["line", "bar"].includes(s.type) ||
        ![0, 1].includes(s.axis) ||
        typeof s.field !== "string" ||
        !s.field.trim()
      )
        throw Error("图表序列定义无效");
      if (s.color !== undefined && !/^#[\da-f]{6}$/i.test(s.color))
        throw Error("序列颜色无效");
      if (s.qualityField !== undefined && typeof s.qualityField !== "string")
        throw Error("序列质量字段无效");
      if (s.xField !== undefined && typeof s.xField !== "string")
        throw Error("序列时间或分类字段无效");
      ids.add(s.id);
    }
  }
  for (const axis of ["left", "right"]) {
    for (const edge of ["Min", "Max"])
      if (p[axis + edge] !== undefined && !Number.isFinite(p[axis + edge]))
        throw Error("坐标轴范围无效");
    if (
      p[axis + "Min"] !== undefined &&
      p[axis + "Max"] !== undefined &&
      p[axis + "Max"] <= p[axis + "Min"]
    )
      throw Error("坐标轴上限必须大于下限");
  }
  if (p.xType !== undefined && !["time", "category"].includes(p.xType))
    throw Error("横轴类型无效");
  if (
    p.xField !== undefined &&
    (typeof p.xField !== "string" || !p.xField.trim())
  )
    throw Error("分类或时间字段不能为空");
  if (
    p.thresholds !== undefined &&
    (!Array.isArray(p.thresholds) ||
      p.thresholds.some(
        (t) =>
          !t ||
          !Number.isFinite(t.value) ||
          ![0, 1].includes(t.axis) ||
          typeof t.label !== "string" ||
          !/^#[\da-f]{6}$/i.test(t.color),
      ))
  )
    throw Error("参考线定义无效");
  if (
    p.columns !== undefined &&
    (!Array.isArray(p.columns) ||
      p.columns.some(
        (c) =>
          !c ||
          typeof c.field !== "string" ||
          !c.field.trim() ||
          typeof c.title !== "string" ||
          !["text", "number", "time", "boolean"].includes(c.format) ||
          typeof c.unit !== "string",
      ))
  )
    throw Error("表格列定义无效");
  if (
    p.limit !== undefined &&
    (!Number.isInteger(p.limit) || p.limit < 1 || p.limit > 200)
  )
    throw Error("表格行数应为 1～200");
  if (
    p.sortDirection !== undefined &&
    !["asc", "desc"].includes(p.sortDirection)
  )
    throw Error("表格排序方向无效");
  if (n.symbol === "events" && p.deviceRefField !== undefined &&
      (typeof p.deviceRefField !== "string" || p.deviceRefField.length > 128))
    throw Error("告警定位字段无效");
}
const widgetQualityNames = {
  good: "有效",
  bad: "无效",
  stale: "过期",
  offline: "离线",
  unbound: "未绑定",
};
export function screenChartResult(
  n,
  points,
  mappings,
  entry,
  sequence,
  sourceVersion,
  now,
) {
  const specs = screenSeries(n),
    resolved = specs.map((s) => ({
      s,
      map: mappings.find((m) => m.id === n.bindings[s.slot]),
      point: points[n.bindings[s.slot]],
    }));
  const key = JSON.stringify([
    n.title,
    n.style,
    n.params,
    n.bindings,
    resolved.map((r) => [r.map, r.point?.quality, r.point?.value]),
    sequence,
    sourceVersion,
  ]);
  if (entry.widgetKey === key) return null;
  entry.widgetKey = key;
  if (entry.historySource !== sourceVersion) {
    entry.histories = new Map();
    entry.historySource = sourceVersion;
  }
  entry.histories ||= new Map();
  const xType = n.params.xType || (n.symbol === "trend" ? "time" : "category"),
    xField = n.params.xField || (xType === "time" ? "time" : "name"),
    plots = [];
  for (const { s, map, point } of resolved) {
    let rows = [];
    if (map?.kind === "number") {
      let h = entry.histories.get(s.id);
      if (!h || h.binding !== map.id) {
        h = { binding: map.id, key: "", rows: [] };
        entry.histories.set(s.id, h);
      }
      const sampleKey = screenTrendSampleKey(point, sequence, map);
      if (h.key !== sampleKey) {
        h.key = sampleKey;
        h.rows.push([
          point?.quality === "good" ? point.timestamp || now : now,
          point?.quality === "good" ? point.value : null,
        ]);
      }
      h.rows = h.rows
        .filter((r) => r[0] >= now - Math.max(n.params.windowSeconds,86400) * 1000)
        .slice(-600);
      rows =
        xType === "time"
          ? h.rows.map((r) => ({ x: r[0], y: r[1] }))
          : [
              {
                x: s.name || map.label || n.title,
                y: point?.quality === "good" ? point.value : null,
              },
            ];
    } else if (point?.quality === "good" && Array.isArray(point.value)) {
      rows = screenHistoryRows(point.value, {
        xType, xField: s.xField?.trim() || xField, field: s.field, qualityField: s.qualityField,
      });
    }
    if(n.params.rangeActive&&xType==='time'&&rows.length){
      const latest=rows.reduce((max,r)=>Math.max(max,r.x),-Infinity);rows=rows.filter(r=>r.x>=latest-n.params.windowSeconds*1000);
    }
    plots.push({
      spec: s,
      name: s.name || map?.label || n.title,
      unit: n.params.unit || map?.unit || "",
      quality: point?.quality || "unbound",
      rows,
      point,
    });
  }
  const palette = ["#227f9f", "#d68b45", "#5a9c7c", "#8b79b9", "#cf6e6a"],
    color = n.style.color;
  const quality = plots
    .map((p) => p.name + " · " + widgetQualityNames[p.quality])
    .join(" / ");
  const base = {
    animation: false,
    textStyle: { fontFamily: n.style.fontFamily || "Microsoft YaHei", color },
    tooltip: {
      trigger:
        n.symbol === "pieChart" || n.symbol === "gauge" ? "item" : "axis",
    },
    legend: { show: n.params.legend !== false, textStyle: { color }, top: 5 },
    color: palette,
  };
  let option;
  if (n.symbol === "pieChart") {
    const p = plots[0],
      data = p.rows
        .filter((r) => r.y !== null)
        .map((r) => ({ name: String(r.x), value: r.y }));
    option = {
      ...base,
      series: [
        {
          type: "pie",
          radius: n.params.donut === false ? [0, "70%"] : ["40%", "70%"],
          center: ["50%", "57%"],
          label: { color, formatter: "{b}: {c}" },
          data,
        },
      ],
    };
  } else if (n.symbol === "gauge") {
    const p = plots[0],
      value =
        p?.point?.quality === "good" ? screenNumeric(p.point.value) : null;
    option = {
      ...base,
      legend: { show: false },
      series: [
        {
          type: "gauge",
          min: n.params.min,
          max: n.params.max,
          center: ["50%", "58%"],
          radius: "85%",
          progress: { show: value !== null },
          axisLine: { lineStyle: { width: 12, color: [[1, "#b7cbd5"]] } },
          axisLabel: { color, fontSize: 12 },
          splitLine: { length: 10 },
          pointer: { show: value !== null },
          detail: {
            offsetCenter: [0, "78%"],
            valueAnimation: false,
            fontSize: Math.max(20, n.style.fontSize * 1.2),
            color,
            formatter: (v) =>
              Number(v).toFixed(n.params.precision) +
              (p.unit ? " " + p.unit : ""),
          },
          data: value === null ? [] : [{ value }],
        },
      ],
      ...(value === null
        ? {
            graphic: [
              {
                type: "text",
                left: "center",
                top: "60%",
                style: { text: "—", fill: color, fontSize: 30 },
              },
            ],
          }
        : {}),
    };
  } else {
    const categories = [
        ...new Set(plots.flatMap((p) => p.rows.map((r) => r.x))),
      ],
      range =
        xType === "time" && resolved.some((r) => r.map?.kind === "number")
          ? { min: now - n.params.windowSeconds * 1000, max: now }
          : {};
    const axes = [0, 1].map((i) => {
      const side = i === 0 ? "left" : "right",
        plot = plots.find((p) => p.spec.axis === i);
      return {
        type: "value",
        name: n.params[side + "Unit"] || plot?.unit || "",
        scale: true,
        position: side,
        axisLabel: { color },
        splitLine: { show: i === 0, lineStyle: { color: "#b8cbd544" } },
        ...(n.params[side + "Min"] !== undefined
          ? { min: n.params[side + "Min"] }
          : {}),
        ...(n.params[side + "Max"] !== undefined
          ? { max: n.params[side + "Max"] }
          : {}),
      };
    });
    const right = plots.some((p) => p.spec.axis === 1);
    option = {
      ...base,
      grid: { left: 58, right: right ? 65 : 22, top: n.params.compact?32:52, bottom: n.params.compact?28:42 },
      xAxis: {
        type: xType,
        ...range,
        ...(xType === "category"
          ? { data: categories }
          : {
              axisLabel: {
                formatter: n.params.timeFormat==='hours'?"{HH}:{mm}":"{HH}:{mm}:{ss}",
                hideOverlap: true,
                color,
              },
            }),
        axisLabel: {
          color,
          hideOverlap: true,
          ...(xType === "time" ? { formatter: n.params.timeFormat==='hours'?"{HH}:{mm}":"{HH}:{mm}:{ss}" } : {}),
        },
      },
      yAxis: right ? axes : [axes[0]],
      series: plots.map((p, i) => ({
        type: p.spec.type,
        name: p.name,
        yAxisIndex: p.spec.axis,
        showSymbol: n.params.showSymbol??p.rows.length < 100,
        smooth:!!n.params.smooth,
        connectNulls: false,
        data:
          xType === "time"
            ? p.rows.map((r) => [r.x, r.y])
            : categories.map((x) => p.rows.find((r) => r.x === x)?.y ?? null),
        lineStyle: {
          color: p.spec.color || palette[i % palette.length],
          width: 2,
        },
        itemStyle: { color: p.spec.color || palette[i % palette.length] },
        ...(n.params.thresholds?.some((t) => t.axis === p.spec.axis)
          ? {
              markLine: {
                symbol: "none",
                silent: true,
                data: n.params.thresholds
                  .filter((t) => t.axis === p.spec.axis)
                  .map((t) => ({
                    name: t.label,
                    yAxis: t.value,
                    lineStyle: { color: t.color, type: "dashed" },
                    label: {
                      formatter: t.label || String(t.value),
                      color: t.color,
                    },
                  })),
              },
            }
          : {}),
      })),
    };
  }
  return { option, quality };
}
export function screenTableResult(n, points, mappings, pageNodes = [], requestedPage = 1) {
  const slot = screenRoleSlot(n, "value"),
    point = points[n.bindings[slot?.key]],
    source =
      point?.quality === "good" && Array.isArray(point.value)
        ? point.value
        : [];
  const deviceField = n.symbol === "events" ? n.params.deviceRefField : "";
  const byId = new Map(), byCode = new Map(), byTitle = new Map();
  if (deviceField) {
    for (const node of pageNodes) {
      byId.set(node.id, node);
      const code = node.params?.equipmentCode;
      if (code) byCode.set(code, byCode.has(code) ? null : node);
      byTitle.set(node.title, byTitle.has(node.title) ? null : node);
    }
  }
  const resolveDevice = (row) => {
    const ref = screenField(row, deviceField);
    if (typeof ref !== "string" || !ref.trim()) return null;
    const key = ref.trim();
    const codeMatch = byCode.get(key);
    const idMatch = byId.get(key);
    if (byCode.has(key) && idMatch && codeMatch !== idMatch) return null;
    const node = byCode.has(key) ? codeMatch : idMatch || byTitle.get(key);
    return node && !node.hidden && (node.action?.type ?? screenDefaultAction(node)) === "details"
      ? { id: node.id, title: node.title }
      : null;
  };
  const fields =
      source[0] && typeof source[0] === "object" ? Object.keys(source[0]) : [],
    columns = n.params.columns?.length
      ? n.params.columns
      : fields
          .filter(field => field !== deviceField)
          .slice(0, 6)
          .map((field) => ({ field, title: field, format: "text", unit: "" }));
  const rows = [...source];
  const sortAsTime = columns.some(col => col.field === n.params.sortField && col.format === "time");
  if (n.params.sortField)
    rows.sort((a, b) => {
      const av = screenField(a, n.params.sortField),
        bv = screenField(b, n.params.sortField),
        an = sortAsTime ? widgetTime(av) : screenNumeric(av),
        bn = sortAsTime ? widgetTime(bv) : screenNumeric(bv),
        result =
          Number.isFinite(an) && Number.isFinite(bn)
            ? an - bn
            : String(av ?? "").localeCompare(String(bv ?? ""), "zh-CN", {
                numeric: true,
              });
      return n.params.sortDirection === "desc" ? -result : result;
    });
  const format = (value, col) => {
    if (value === null || value === undefined) return "—";
    if (col.format === "number") {
      const v = screenNumeric(value);
      return v === null
        ? "—"
        : v.toFixed(n.params.precision) + (col.unit ? " " + col.unit : "");
    }
    if (col.format === "boolean")
      return value === true || value === 1
        ? "是"
        : value === false || value === 0
          ? "否"
          : "—";
    if (col.format === "time") {
      const time = widgetTime(value);
      return Number.isFinite(time)
        ? new Date(time).toLocaleString("zh-CN", { hour12: false })
        : "—";
    }
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  };
  const limit = n.params.limit || 8;
  const pages = n.symbol === "events" ? Math.max(1, Math.ceil(rows.length / limit)) : 1;
  const page = Number.isInteger(requestedPage) ? Math.max(1, Math.min(pages, requestedPage)) : 1;
  return {
    quality: widgetQualityNames[point?.quality] || "未绑定",
    fields,
    columns,
    rows: rows
      .slice((page - 1) * limit, page * limit)
      .map((row) => ({
        severity: String(
          screenField(row, n.params.severityField || "level") ?? "",
        ),
        cells: columns.map((c) => format(screenField(row, c.field), c)),
        ...(deviceField ? { device: resolveDevice(row) } : {}),
      })),
    total: rows.length,
    page,
    pages,
  };
}
