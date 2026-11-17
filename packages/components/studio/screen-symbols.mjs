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
};
export const pipeSlots = [slot("run", "流动状态", ["boolean"])];
export function screenSlots(n) {
  return n?.type === "pipe" ? pipeSlots : screenSymbols[n?.symbol]?.slots || [];
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
        ports: {
          groups: portGroups,
          items: def.ports.map((group) => ({ id: group, group })),
        },
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
      text("caption", 85, 139),
      text("state", 85, 158, 15),
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
    text("caption", 75, 119),
    text("state", 75, 138, 15),
  ]);
  artwork("tank", [
    transparent(220, 300),
    {
      tagName: "path",
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
  for (const symbol of ["rect", "ellipse", "text", "image"])
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
  Shape.HTML.register({
    shape: "screen-trend",
    width: 620,
    height: 300,
    effect: [],
    html: renderChart,
  });
}
