// Independent symbols. No scene HTML, CSS, node IDs or sample points are used.
const slot = (key, label, kinds, required = false) => ({
  key,
  label,
  kinds,
  required,
});
export const screenSymbols = {
  pump: {
    label: "离心泵",
    prefix: "P",
    w: 170,
    h: 160,
    ports: ["left", "right"],
    slots: [
      slot("run", "运行反馈", ["boolean"], true),
      slot("fault", "故障反馈", ["boolean"]),
      slot("value", "运行数值", ["number"]),
    ],
  },
  valve: {
    label: "阀门",
    prefix: "V",
    w: 150,
    h: 140,
    ports: ["left", "right"],
    slots: [
      slot("open", "开到位反馈", ["boolean"], true),
      slot("fault", "故障反馈", ["boolean"]),
      slot("value", "开度", ["number"]),
    ],
  },
  checkValve: {
    label: "止回阀",
    prefix: "CV",
    w: 100,
    h: 60,
    ports: ["left", "right"],
    slots: [],
  },
  tank: {
    label: "水箱 / 池体",
    prefix: "T",
    w: 220,
    h: 300,
    ports: ["left", "right", "top", "bottom"],
    slots: [slot("value", "液位", ["number"], true)],
  },
  fan: {
    label: "风机 / 电机",
    prefix: "M",
    w: 170,
    h: 160,
    ports: ["left", "right"],
    slots: [
      slot("run", "运行反馈", ["boolean"], true),
      slot("fault", "故障反馈", ["boolean"]),
      slot("value", "运行数值", ["number"]),
    ],
  },
  junction: {
    label: "管道分支",
    prefix: "J",
    w: 20,
    h: 20,
    ports: ["left", "right", "top", "bottom"],
    slots: [],
  },
  readout: {
    label: "数值仪表",
    w: 300,
    h: 150,
    ports: [],
    slots: [slot("value", "显示数值", ["number"], true)],
  },
  trend: {
    label: "趋势图",
    w: 620,
    h: 300,
    ports: [],
    slots: [slot("value", "趋势数据", ["number", "dataset"], true)],
  },
  rect: { label: "矩形面板", w: 360, h: 220, ports: [], slots: [] },
  ellipse: { label: "圆 / 椭圆", w: 160, h: 160, ports: [], slots: [] },
  text: { label: "文字", w: 460, h: 60, ports: [], slots: [] },
  image: { label: "图片", w: 400, h: 260, ports: [], slots: [] },
  line: { label: "直线", w: 300, h: 16, ports: [], slots: [] },
  polyline: { label: "折线", w: 300, h: 180, ports: [], slots: [] },
  polygon: { label: "多边形", w: 240, h: 180, ports: [], slots: [] },
  barChart: {
    label: "柱状图",
    w: 620,
    h: 300,
    ports: [],
    slots: [slot("value", "图表数据", ["number", "dataset"], true)],
  },
  pieChart: {
    label: "饼环图",
    w: 420,
    h: 320,
    ports: [],
    slots: [slot("value", "图表数据", ["dataset"], true)],
  },
  gauge: {
    label: "仪表盘",
    w: 360,
    h: 300,
    ports: [],
    slots: [slot("value", "显示数值", ["number"], true)],
  },
  barGauge: {
    label: "棒图",
    w: 200,
    h: 300,
    ports: [],
    slots: [slot("value", "显示数值", ["number"], true)],
  },
  status: {
    label: "状态灯",
    w: 220,
    h: 150,
    ports: [],
    slots: [
      slot("run", "状态信号", ["boolean"], true),
      slot("fault", "故障反馈", ["boolean"]),
    ],
  },
  table: {
    label: "数据表",
    w: 680,
    h: 320,
    ports: [],
    slots: [slot("value", "表格数据", ["dataset"], true)],
  },
  events: {
    label: "告警 / 事件列表",
    w: 680,
    h: 280,
    ports: [],
    slots: [slot("value", "事件数据", ["dataset"], true)],
  },
  button: { label: "导航按钮", w: 200, h: 60, ports: [], slots: [] },
};
export const pipeSlots = [slot("run", "流动状态", ["boolean"])];
export function screenAppearanceOptions(symbol) {
  if (
    !["pump", "fan", "valve", "tank", "readout", "checkValve", "junction", "pipe"].includes(symbol)
  )
    return {};
  const options = { classic: "经典平面", detailed: "精细平面" };
  if (["pump", "fan", "readout"].includes(symbol)) options.monitor = "监控铭牌";
  if (symbol === "tank") options.monitor = "监控液位";
  if (["pump", "fan", "valve", "checkValve"].includes(symbol))
    options.picture = "本地图片外观";
  return options;
}
export function screenSlots(n) {
  const defaults =
    n?.type === "pipe" ? pipeSlots : screenSymbols[n?.symbol]?.slots || [];
  const definitions =
    n?.dataSlots ??
    defaults.map((s) => ({
      ...s,
      role: n?.type === "pipe" && s.key === "run" ? "flow" : s.key,
    }));
  return n?.symbol === "valve" &&
    n.params?.valveMode === "control" &&
    n.dataSlots === undefined
    ? definitions.map((s) => ({
        ...s,
        required: (s.role || s.key) === "value",
      }))
    : definitions;
}
export const screenPortSides = {
  left: "左侧",
  right: "右侧",
  top: "顶部",
  bottom: "底部",
  custom: "自定位置",
};
export const screenSlotRoles = {
  extra: "附加测点",
  run: "运行反馈",
  fault: "故障反馈",
  open: "开到位反馈",
  value: "显示数值 / 数据",
  text: "显示文字",
  flow: "管道流动",
};
export function screenPorts(n) {
  return (
    n?.ports ??
    (screenSymbols[n?.symbol]?.ports || []).map((id) => ({
      id,
      label: screenPortSides[id],
      x: id === "left" ? 0 : id === "right" ? 100 : 50,
      y: id === "top" ? 0 : id === "bottom" ? 100 : 50,
      direction: "both",
    }))
  );
}
export function screenRoleSlot(n, role) {
  return screenSlots(n).find((s) => (s.role || s.key) === role);
}
export function screenDefaultAction(n) {
  return ["trend", "barChart", "pieChart", "gauge", "table", "events"].includes(
    n?.symbol,
  )
    ? "none"
    : screenSlots(n).length
      ? "details"
      : "none";
}
export function screenPoint(n, points, role) {
  const s = screenRoleSlot(n, role);
  return s ? points[n.bindings?.[s.key]] : undefined;
}
export function screenGraphPorts(n) {
  return {
    groups: {
      custom: {
        position: "absolute",
        attrs: {
          circle: {
            r: 7,
            magnet: true,
            stroke: "#087f85",
            strokeWidth: 2,
            fill: "#fff",
          },
        },
      },
    },
    items: screenPorts(n).map((p) => ({
      id: p.id,
      group: "custom",
      args: { x: p.x + "%", y: p.y + "%" },
      attrs: { circle: { "data-port-label": p.label, "aria-label": p.label } },
      tooltip: p.label,
    })),
  };
}
export function screenSlotMappings(slot, mappings) {
  return mappings.filter((m) => slot.kinds.includes(m.kind));
}

export function registerScreenSymbols({ Graph, Shape }, renderChart) {
  const portGroups = Object.fromEntries(
    ["left", "right", "top", "bottom"].map((name) => [
      name,
      {
        position: name,
        attrs: {
          circle: {
            r: 7,
            magnet: true,
            stroke: "#087f85",
            strokeWidth: 2,
            fill: "#fff",
          },
        },
      },
    ]),
  );
  const artwork = (symbol, children) => {
    const def = screenSymbols[symbol];
    Graph.registerNode(
      "screen-" + symbol,
      {
        width: def.w,
        height: def.h,
        markup: [
          {
            tagName: "svg",
            selector: "art",
            attrs: {
              viewBox: `0 0 ${def.w} ${def.h}`,
              preserveAspectRatio: "none",
              overflow: "visible",
            },
            children,
          },
        ],
        attrs: { art: { refWidth: "100%", refHeight: "100%" } },
        // The document supplies the complete port list. X6 merges registered
        // defaults by array index, which can restore deleted ports on reopen.
        ports: { groups: portGroups, items: [] },
      },
      true,
    );
  };
  const text = (selector, x, y, size = 20) => ({
    tagName: "text",
    selector,
    attrs: {
      x,
      y,
      textAnchor: "middle",
      fill: "#304c5d",
      fontSize: size,
      fontFamily: "Microsoft YaHei, sans-serif",
    },
  });
  const transparent = (w, h) => ({
    tagName: "rect",
    attrs: { width: w, height: h, fill: "transparent" },
  });
  const devicePicture = (x, y, width, height) => ({
    tagName: "image",
    selector: "devicePicture",
    attrs: {
      x,
      y,
      width,
      height,
      preserveAspectRatio: "xMidYMid meet",
      visibility: "hidden",
      pointerEvents: "none",
    },
  });
  const badgeBox = (selector, x, y, width, height) => ({
    tagName: "rect",
    selector,
    attrs: {
      x,
      y,
      width,
      height,
      rx: 5,
      fill: "#0b2030",
      stroke: "#355669",
      visibility: "hidden",
    },
  });
  for (const symbol of ["pump", "fan"])
    artwork(symbol, [
      transparent(170, 160),
      {
        tagName: "path",
        selector: "stubs",
        attrs: {
          d: "M0 80H49M121 80H170M51 120H119",
          fill: "none",
          stroke: "#547185",
          strokeWidth: 5,
        },
      },
      {
        tagName: "circle",
        selector: "body",
        attrs: {
          cx: 85,
          cy: 80,
          r: 36,
          stroke: "#547185",
          strokeWidth: 3,
          fill: "#9baab5",
        },
      },
      {
        tagName: "path",
        selector: "rotor",
        attrs: {
          d:
            symbol === "pump"
              ? "M72 59L107 80L72 101Z"
              : "M85 47Q113 53 94 76Q125 80 104 105Q87 124 80 91Q50 109 51 83Q49 59 78 72Z",
          fill: "#3f6074",
        },
      },
      devicePicture(31, 35, 108, 90),
      text("caption", 85, 139),
      text("state", 85, 158, 15),
      badgeBox("frequencyBox", -47, 29, 92, 29),
      badgeBox("modeBox", 50, 121, 70, 24),
      text("frequencyBadge", -1, 49, 19),
      text("modeBadge", 85, 138, 17),
    ]);
  artwork("valve", [
    transparent(150, 140),
    {
      tagName: "path",
      selector: "stubs",
      attrs: {
        d: "M0 70H30M120 70H150M75 70V20M56 20H94",
        fill: "none",
        stroke: "#547185",
        strokeWidth: 4,
      },
    },
    {
      tagName: "path",
      selector: "body",
      attrs: {
        d: "M30 44L120 96V44L30 96Z",
        fill: "#9baab5",
        stroke: "#547185",
        strokeWidth: 3,
      },
    },
    devicePicture(25, 25, 100, 86),
    text("caption", 75, 119),
    text("state", 75, 138, 15),
  ]);
  artwork("checkValve", [
    transparent(100, 60),
    {
      tagName: "path",
      selector: "stubs",
      attrs: {
        d: "M0 30H30M70 30H100",
        fill: "none",
        stroke: "#547185",
        strokeWidth: 4,
      },
    },
    {
      tagName: "path",
      selector: "body",
      attrs: {
        d: "M30 12L65 30L30 48Z M70 10V50",
        fill: "#e5edf2",
        stroke: "#547185",
        strokeWidth: 3,
      },
    },
    devicePicture(17, 6, 66, 48),
  ]);
  artwork("tank", [
    transparent(220, 300),
    {
      tagName: "path",
      selector: "tankStubs",
      attrs: {
        d: "M0 150H25M195 150H220M110 0V25M110 265V300",
        stroke: "#547185",
        strokeWidth: 5,
        fill: "none",
      },
    },
    {
      tagName: "rect",
      selector: "body",
      attrs: {
        x: 25,
        y: 25,
        width: 170,
        height: 240,
        rx: 5,
        fill: "#edf2f5",
        stroke: "#547185",
        strokeWidth: 3,
      },
    },
    {
      tagName: "rect",
      selector: "water",
      attrs: { x: 29, y: 261, width: 162, height: 0, fill: "#66abc5" },
    },
    text("value", 110, 158, 26),
    text("caption", 110, 289),
  ]);
  artwork("junction", [
    {
      tagName: "circle",
      selector: "body",
      attrs: {
        cx: 10,
        cy: 10,
        r: 8,
        stroke: "#547185",
        fill: "#547185",
        strokeWidth: 2,
      },
    },
  ]);
  artwork("readout", [
    {
      tagName: "path",
      selector: "stubs",
      attrs: {
        d: "M0 75H103M197 75H300",
        fill: "none",
        strokeWidth: 4,
        visibility: "hidden",
      },
    },
    {
      tagName: "rect",
      selector: "body",
      attrs: {
        width: 300,
        height: 150,
        rx: 5,
        fill: "#fff",
        stroke: "#a5bece",
        strokeWidth: 2,
      },
    },
    {
      tagName: "text",
      selector: "caption",
      attrs: {
        x: 20,
        y: 32,
        fontSize: 20,
        fill: "#536f82",
        fontFamily: "Microsoft YaHei,sans-serif",
      },
    },
    {
      tagName: "text",
      selector: "value",
      attrs: {
        x: 20,
        y: 93,
        fontSize: 44,
        fontWeight: 600,
        fill: "#24455a",
        fontFamily: "Consolas,Microsoft YaHei,sans-serif",
      },
    },
    {
      tagName: "text",
      selector: "quality",
      attrs: {
        x: 20,
        y: 132,
        fontSize: 16,
        fill: "#6c8596",
        fontFamily: "Microsoft YaHei,sans-serif",
      },
    },
  ]);
  for (const symbol of ["line", "polyline", "polygon"]) {
    const def = screenSymbols[symbol];
    artwork(symbol, [
      {
        ...transparent(def.w, def.h),
        attrs: {
          width: def.w,
          height: def.h,
          fill: "transparent",
          pointerEvents: "none",
        },
      },
      {
        tagName: "path",
        selector: "body",
        attrs: {
          d: `M0 ${def.h / 2}L${def.w} ${def.h / 2}`,
          fill: symbol === "polygon" ? "#e5edf2" : "none",
          stroke: "#547185",
          strokeWidth: 3,
          vectorEffect: "non-scaling-stroke",
        },
      },
    ]);
  }
  for (const symbol of ["rect", "ellipse", "text", "image", "button"])
    Graph.registerNode(
      "screen-" + symbol,
      {
        inherit:
          symbol === "ellipse"
            ? "ellipse"
            : symbol === "image"
              ? "image"
              : "rect",
        width: screenSymbols[symbol].w,
        height: screenSymbols[symbol].h,
        attrs: {
          body: { stroke: "#b3c6d2", fill: "#fff", rx: 5, ry: 5 },
          label: {
            fill: "#304c5d",
            fontSize: 24,
            fontFamily: "Microsoft YaHei, sans-serif",
          },
        },
      },
      true,
    );
  artwork("status", [
    transparent(220, 150),
    {
      tagName: "circle",
      selector: "body",
      attrs: {
        cx: 110,
        cy: 45,
        r: 25,
        fill: "#9baab5",
        stroke: "#547185",
        strokeWidth: 2,
      },
    },
    text("caption", 110, 104),
    text("state", 110, 138, 18),
  ]);
  artwork("barGauge", [
    transparent(200, 300),
    {
      tagName: "rect",
      selector: "body",
      attrs: {
        x: 55,
        y: 25,
        width: 90,
        height: 220,
        rx: 5,
        fill: "#edf2f5",
        stroke: "#547185",
        strokeWidth: 2,
      },
    },
    {
      tagName: "rect",
      selector: "water",
      attrs: { x: 59, y: 241, width: 82, height: 0, fill: "#66abc5" },
    },
    text("value", 100, 150, 24),
    text("caption", 100, 282),
  ]);
  for (const symbol of [
    "trend",
    "barChart",
    "pieChart",
    "gauge",
    "table",
    "events",
  ])
    Shape.HTML.register({
      shape: "screen-" + symbol,
      width: screenSymbols[symbol].w,
      height: screenSymbols[symbol].h,
      effect: [],
      html: renderChart,
    });
}
