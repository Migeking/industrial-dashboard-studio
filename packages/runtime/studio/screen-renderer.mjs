import {
  screenSymbols,
  registerScreenSymbols,
} from "../../components/studio/screen-symbols.mjs";
import { screenNode, screenState, screenDisplay } from "./screen-model.mjs";

const screenQualityLabels = {
  good: "有效",
  bad: "无效",
  stale: "过期",
  offline: "离线",
  unbound: "未绑定",
};
const screenStateColors = {
  运行: "#3c9c77",
  开启: "#3c9c77",
  停止: "#d5dfe6",
  关闭: "#d5dfe6",
  故障: "#cf5757",
  未知: "#9baab5",
};

// The graph is a view of the saved document. Live values never enter that document.
class ScreenGraph {
  constructor(host, getProps, emit) {
    this.host = host;
    this.props = getProps;
    this.emit = emit;
    this.applying = false;
    this.charts = new Map();
    this.projections = new Map();
    this.drawing = null;
    const { Graph, Selection, Transform, Snapline } = window.X6;
    registerScreenSymbols(window.X6, (node) => this.chartElement(node));
    this.graph = new Graph({
      container: host,
      width: 1920,
      height: 1080,
      grid: { visible: getProps().editing, size: 10 },
      background: { color: getProps().doc.canvas.background },
      panning: false,
      mousewheel: false,
      interacting: ({ cell }) => {
        const p = this.props(),
          n = p.doc.nodes.find((n) => n.id === cell.id);
        if (!p.editing) return false;
        const selected = n?.group
          ? p.doc.nodes.filter((v) => v.group === n.group)
          : p.selected.includes(n?.id)
            ? p.doc.nodes.filter((v) => p.selected.includes(v.id))
            : [n];
        return {
          nodeMovable: p.tool === "select" && !selected.some((v) => v?.locked),
          edgeMovable: false,
          vertexMovable: p.tool === "select",
        };
      },
      translating: { restrict: true },
      connecting: {
        allowBlank: false,
        allowNode: false,
        allowEdge: false,
        allowLoop: false,
        connectionPoint: "anchor",
        snap: { radius: 16 },
        router: { name: "orth", args: { padding: 20 } },
        connector: { name: "rounded", args: { radius: 5 } },
        validateMagnet: () =>
          this.props().editing && this.props().tool === "pipe",
        createEdge: () =>
          this.graph.createEdge({
            shape: "edge",
            zIndex: 0,
            attrs: {
              line: {
                stroke: "#557f96",
                strokeWidth: 7,
                sourceMarker: null,
                targetMarker: null,
              },
            },
          }),
      },
    });
    this.graph.use(
      new Selection({
        enabled: getProps().editing,
        multiple: true,
        rubberband: true,
        modifiers: ["shift"],
        multipleSelectionModifiers: ["shift"],
        showNodeSelectionBox: false,
        showEdgeSelectionBox: false,
      }),
    );
    this.graph.use(
      new Transform({
        resizing: {
          enabled: (n) => this.canTransform(n),
          minWidth: 16,
          minHeight: 16,
          restrict: true,
        },
        rotating: { enabled: (n) => this.canTransform(n), grid: 15 },
      }),
    );
    this.graph.use(new Snapline({ enabled: true }));
    this.bindEvents();
    this.syncDocument();
  }
  canTransform(cell) {
    const p = this.props(),
      n = p.doc.nodes.find((n) => n.id === cell.id);
    return (
      p.editing &&
      p.tool === "select" &&
      n &&
      !n.locked &&
      n.symbol !== "junction"
    );
  }
  chartElement(cell) {
    const card = document.createElement("div");
    card.className = "screen-chart";
    const heading = document.createElement("b"),
      host = document.createElement("div"),
      quality = document.createElement("small");
    host.className = "screen-chart-host";
    card.append(heading, host, quality);
    const entry = {
      card,
      heading,
      host,
      quality,
      chart: null,
      samples: [],
      sequence: -1,
      qualityKey: "",
      binding: "",
    };
    this.charts.set(cell.id, entry);
    requestAnimationFrame(() => {
      if (!host.isConnected) return;
      entry.chart = echarts.init(host);
      entry.observer = new ResizeObserver(() => entry.chart?.resize());
      entry.observer.observe(host);
      this.project();
    });
    return card;
  }
  disposeChart(id) {
    const chart = this.charts.get(id);
    chart?.observer?.disconnect();
    chart?.chart?.dispose();
    this.charts.delete(id);
  }
  bindEvents() {
    const graph = this.graph;
    const start = (event) => {
      const p = this.props();
      if (!p.editing || event.button !== 0) return;
      this.emit("start");
      if (["select", "pipe"].includes(p.tool)) return;
      if (!screenSymbols[p.tool]) return;
      event.stopPropagation();
      event.preventDefault();
      const point = graph.clientToLocal(event.clientX, event.clientY);
      const n = this.insert(p.tool, point.x, point.y);
      if (["rect", "ellipse"].includes(p.tool))
        this.drawing = { id: n.id, x: n.x, y: n.y };
      else this.emit("tool", "select");
    };
    const move = (event) => {
      if (!this.drawing) return;
      const p = graph.clientToLocal(event.clientX, event.clientY),
        d = this.drawing;
      const x = Math.max(0, Math.min(d.x, p.x)),
        y = Math.max(0, Math.min(d.y, p.y));
      const w = Math.min(1920 - x, Math.max(16, Math.abs(p.x - d.x))),
        h = Math.min(1080 - y, Math.max(16, Math.abs(p.y - d.y)));
      this.emit("geometry", {
        id: d.id,
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h),
      });
    };
    const up = () => {
      if (this.drawing) {
        this.drawing = null;
        this.emit("tool", "select");
      }
    };
    const drop = (event) => {
      if (!this.props().editing) return;
      const symbol = event.dataTransfer.getData("application/x-scada-symbol");
      if (!screenSymbols[symbol]) return;
      event.preventDefault();
      const p = graph.clientToLocal(event.clientX, event.clientY);
      this.emit("start");
      this.insert(symbol, p.x, p.y);
      this.emit("tool", "select");
    };
    const over = (e) => {
      if (e.dataTransfer.types.includes("application/x-scada-symbol"))
        e.preventDefault();
    };
    this.host.addEventListener("mousedown", start, true);
    this.host.addEventListener("drop", drop);
    this.host.addEventListener("dragover", over);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    this.removeListeners = () => {
      this.host.removeEventListener("mousedown", start, true);
      this.host.removeEventListener("drop", drop);
      this.host.removeEventListener("dragover", over);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    graph.on("node:mousedown", ({ node, e }) => {
      const p = this.props();
      if (!p.editing || p.tool !== "select" || e.shiftKey) return;
      const n = p.doc.nodes.find((n) => n.id === node.id);
      const next = n?.group
        ? p.doc.nodes.filter((v) => v.group === n.group).map((v) => v.id)
        : p.selected.includes(node.id)
          ? p.selected
          : [node.id];
      // Select before translation. Otherwise the engine can move the previous
      // selection, or move only one member on the first drag of a group.
      this.applying = true;
      try {
        graph.getPlugin("selection").reset(next);
      } finally {
        this.applying = false;
      }
      this.emit("select", next);
    });
    graph.on("node:click", ({ node, e }) => {
      const p = this.props(),
        n = p.doc.nodes.find((n) => n.id === node.id);
      if (!p.editing) {
        if (["pump", "fan", "valve", "tank", "readout"].includes(n?.symbol))
          this.emit("faceplate", n.id);
        return;
      }
      if (p.tool !== "select") return;
      const next = e.shiftKey
        ? graph
            .getPlugin("selection")
            .getSelectedCells()
            .map((c) => c.id)
        : n?.group
          ? p.doc.nodes.filter((v) => v.group === n.group).map((v) => v.id)
          : [node.id];
      this.emit("select", next);
    });
    graph.on("edge:click", ({ edge }) => {
      if (this.props().editing && this.props().tool === "select")
        this.emit("select", [edge.id]);
    });
    graph.on("blank:click", () => {
      if (this.props().editing && this.props().tool === "select")
        this.emit("select", []);
    });
    graph.on("selection:changed", ({ selected }) => {
      if (
        !this.applying &&
        this.props().editing &&
        this.props().tool === "select"
      )
        this.emit(
          "select",
          selected.map((c) => c.id),
        );
    });
    for (const event of [
      "node:change:position",
      "node:change:size",
      "node:change:angle",
    ])
      graph.on(event, ({ node }) => {
        if (this.applying || !this.props().editing) return;
        const p = node.position(),
          s = node.size();
        this.emit("geometry", {
          id: node.id,
          x: Math.round(p.x),
          y: Math.round(p.y),
          w: Math.round(s.width),
          h: Math.round(s.height),
          angle: node.angle(),
        });
      });
    const pipe = ({ edge }) => {
      if (this.applying || !this.props().editing) return;
      const source = edge.getSource(),
        target = edge.getTarget();
      if (!source.cell || !target.cell) return;
      const existing = this.props().doc.pipes.find((p) => p.id === edge.id);
      this.emit("pipe", {
        ...(existing || {
          id: edge.id,
          type: "pipe",
          title: "工艺管道",
          style: { color: "#557f96", width: 7 },
          bindings: {},
        }),
        source: { nodeId: source.cell, portId: source.port },
        target: { nodeId: target.cell, portId: target.port },
        vertices: edge.getVertices().map((p) => ({ x: p.x, y: p.y })),
      });
    };
    graph.on("edge:connected", pipe);
    graph.on("edge:change:vertices", pipe);
  }
  insert(symbol, x, y) {
    const n = screenNode(
      symbol,
      crypto.randomUUID(),
      x,
      y,
      this.props().doc.nodes,
    );
    this.emit("insert", n);
    this.emit("select", [n.id]);
    return n;
  }
  syncDocument() {
    const graph = this.graph,
      p = this.props(),
      wanted = new Set([...p.doc.nodes, ...p.doc.pipes].map((n) => n.id));
    this.applying = true;
    try {
      for (const cell of graph.getCells())
        if (!wanted.has(cell.id)) {
          this.disposeChart(cell.id);
          this.projections.delete(cell.id);
          graph.removeCell(cell);
        }
      graph.drawBackground({ color: p.doc.canvas.background });
      for (const n of p.doc.nodes) {
        let cell = graph.getCellById(n.id);
        if (!cell)
          cell = graph.addNode({
            id: n.id,
            shape: "screen-" + n.symbol,
            x: n.x,
            y: n.y,
            width: n.w,
            height: n.h,
            zIndex: n.z,
            attrs:
              n.symbol === "trend"
                ? { body: { fill: "#fff", stroke: "#adc2d0" } }
                : {},
          });
        const position = cell.position(),
          size = cell.size();
        if (position.x !== n.x || position.y !== n.y) cell.position(n.x, n.y);
        if (size.width !== n.w || size.height !== n.h) cell.resize(n.w, n.h);
        if (cell.angle() !== n.angle) cell.rotate(n.angle, { absolute: true });
        if (cell.getZIndex() !== n.z) cell.setZIndex(n.z);
        n.hidden ? cell.hide() : cell.show();
      }
      for (const n of p.doc.pipes) {
        let cell = graph.getCellById(n.id);
        const source = { cell: n.source.nodeId, port: n.source.portId },
          target = { cell: n.target.nodeId, port: n.target.portId };
        if (!cell)
          cell = graph.addEdge({
            id: n.id,
            shape: "edge",
            source,
            target,
            vertices: n.vertices,
            zIndex: 0,
            router: { name: "orth", args: { padding: 20 } },
            connector: { name: "rounded", args: { radius: 5 } },
          });
        if (JSON.stringify(cell.getSource()) !== JSON.stringify(source))
          cell.setSource(source);
        if (JSON.stringify(cell.getTarget()) !== JSON.stringify(target))
          cell.setTarget(target);
        if (JSON.stringify(cell.getVertices()) !== JSON.stringify(n.vertices))
          cell.setVertices(n.vertices);
      }
    } finally {
      this.applying = false;
    }
    this.syncSelection();
    this.project();
  }
  syncSelection() {
    const p = this.props(),
      graph = this.graph;
    const key = JSON.stringify([p.editing, p.tool, p.selected]);
    if (p.selected.some((id) => !graph.getCellById(id))) {
      this.selectionKey = null;
      return;
    }
    if (this.selectionKey === key) return;
    this.selectionKey = key;
    this.applying = true;
    try {
      graph.getPlugin("transform").clearWidgets();
      graph.getEdges().forEach((edge) => edge.removeTools());
      graph
        .getPlugin("selection")
        [p.editing && p.tool === "select" ? "enable" : "disable"]();
      graph
        .getPlugin("selection")
        .reset(
          p.editing ? p.selected.filter((id) => graph.getCellById(id)) : [],
        );
      if (p.editing && p.tool === "select" && p.selected.length === 1) {
        const cell = graph.getCellById(p.selected[0]);
        if (cell?.isNode() && this.canTransform(cell))
          graph.getPlugin("transform").createWidget(cell);
        if (cell?.isEdge())
          cell.addTools([
            { name: "vertices", args: { snapRadius: 12 } },
            { name: "segments" },
          ]);
      }
    } finally {
      this.applying = false;
    }
    p.editing ? graph.showGrid() : graph.hideGrid();
  }
  project() {
    const p = this.props();
    this.applying = true;
    try {
      for (const n of p.doc.nodes) {
        const cell = this.graph.getCellById(n.id);
        if (!cell) continue;
        let attrs;
        if (["pump", "fan", "valve"].includes(n.symbol)) {
          const state = screenState(n, p.points),
            reading = screenDisplay(n, p.points, p.doc.mappings);
          attrs = {
            body: { fill: screenStateColors[state], stroke: n.style.stroke },
            stubs: { stroke: n.style.stroke },
            rotor: { fill: n.style.stroke },
            caption: {
              text: n.title,
              fill: n.style.color,
              fontSize: n.style.fontSize,
            },
            state: {
              text: state + (n.bindings.value ? " · " + reading.text : ""),
            },
          };
          cell.attr("root/data-state", state);
        } else if (n.symbol === "tank") {
          const value = screenDisplay(n, p.points, p.doc.mappings),
            ratio =
              value.value === null
                ? 0
                : Math.max(
                    0,
                    Math.min(
                      1,
                      (value.value - n.params.min) /
                        (n.params.max - n.params.min),
                    ),
                  );
          attrs = {
            body: { stroke: n.style.stroke },
            water: {
              height: 232 * ratio,
              y: 261 - 232 * ratio,
              fill: n.style.fill === "#e5edf2" ? "#66abc5" : n.style.fill,
            },
            value: { text: value.text, fill: n.style.color },
            caption: {
              text: n.title,
              fill: n.style.color,
              fontSize: n.style.fontSize,
            },
          };
        } else if (n.symbol === "readout") {
          const reading = screenDisplay(n, p.points, p.doc.mappings);
          attrs = {
            body: { fill: n.style.fill, stroke: n.style.stroke },
            caption: { text: n.title },
            value: {
              text: reading.text,
              fill: n.style.color,
              fontSize: n.style.fontSize,
            },
            quality: { text: screenQualityLabels[reading.quality] },
          };
        } else if (n.symbol === "junction")
          attrs = { body: { fill: n.style.fill, stroke: n.style.stroke } };
        else if (["rect", "ellipse", "text"].includes(n.symbol)) {
          const label = n.symbol === "text" ? n.text : "";
          attrs = {
            body: {
              fill: n.style.fill,
              stroke: n.symbol === "text" ? "none" : n.style.stroke,
            },
            label: {
              text: label,
              fill: n.style.color,
              fontSize: n.style.fontSize,
            },
          };
        } else if (n.symbol === "image")
          attrs = { image: { "xlink:href": n.image || "" } };
        if (attrs && this.projections.get(n.id) !== JSON.stringify(attrs)) {
          cell.attr(attrs);
          this.projections.set(n.id, JSON.stringify(attrs));
        }
        const chart = this.charts.get(n.id);
        if (chart) this.projectChart(n, chart);
      }
      for (const n of p.doc.pipes) {
        const cell = this.graph.getCellById(n.id);
        if (!cell) continue;
        const point = p.points[n.bindings.run],
          flowing = point?.quality === "good" && point.value === true;
        const attrs = {
          line: {
            stroke: n.style.color,
            strokeWidth: n.style.width,
            sourceMarker: null,
            targetMarker: null,
            strokeDasharray: flowing ? "12 8" : "",
            class: flowing ? "screen-pipe-flow" : "",
          },
        };
        if (this.projections.get(n.id) !== JSON.stringify(attrs)) {
          cell.attr(attrs);
          this.projections.set(n.id, JSON.stringify(attrs));
        }
      }
    } finally {
      this.applying = false;
    }
  }
  projectChart(n, entry) {
    const p = this.props(),
      point = p.points[n.bindings.value],
      map = p.doc.mappings.find((m) => m.id === n.bindings.value);
    const now = p.doc.snapshotTime ?? Date.now();
    entry.heading.textContent = n.title;
    entry.card.style.pointerEvents = p.editing ? "none" : "auto";
    Object.assign(entry.card.style, {
      background: n.style.fill,
      borderColor: n.style.stroke,
      color: n.style.color,
    });
    entry.heading.style.fontSize = n.style.fontSize + "px";
    entry.quality.textContent =
      (map?.label || "请选择趋势测点") +
      " · " +
      (screenQualityLabels[point?.quality] || "未绑定") +
      (map?.kind === "number" ? " · 从接入时开始采样" : "");
    if (!entry.chart) return;
    if (
      entry.binding !== n.bindings.value ||
      entry.source !== p.sourceVersion
    ) {
      entry.samples = [];
      entry.sequence = -1;
      entry.binding = n.bindings.value;
      entry.source = p.sourceVersion;
    }
    const quality = point?.quality || "unbound";
    if (
      map?.kind === "number" &&
      (entry.sequence !== p.sequence || entry.qualityKey !== quality)
    ) {
      entry.sequence = p.sequence;
      entry.qualityKey = quality;
      if (point)
        entry.samples.push([
          point.timestamp || Date.now(),
          quality === "good" ? point.value : null,
        ]);
      const after = now - n.params.windowSeconds * 1000;
      entry.samples = entry.samples.filter(([t]) => t >= after).slice(-600);
    }
    const rows =
      map?.kind === "dataset" &&
      quality === "good" &&
      Array.isArray(point.value)
        ? point.value
            .map((row) => [
              typeof row.time === "number" ? row.time : Date.parse(row.time),
              row.value,
            ])
            .filter(
              ([time, value]) =>
                Number.isFinite(time) &&
                typeof value === "number" &&
                Number.isFinite(value),
            )
        : entry.samples;
    const unit = n.params.unit || map?.unit || "";
    const timeRange =
      map?.kind === "number"
        ? { min: now - n.params.windowSeconds * 1000, max: now }
        : {};
    entry.chart.setOption(
      {
        animation: false,
        grid: { left: 60, right: 25, top: 40, bottom: 45 },
        tooltip: {
          trigger: "axis",
          valueFormatter: (value) =>
            typeof value === "number"
              ? value.toFixed(n.params.precision) + (unit ? " " + unit : "")
              : "—",
        },
        xAxis: {
          type: "time",
          ...timeRange,
          axisLabel: {
            color: n.style.color,
            formatter: "{HH}:{mm}:{ss}",
            hideOverlap: true,
          },
        },
        yAxis: {
          type: "value",
          name: unit,
          scale: true,
          axisLabel: { color: n.style.color },
          splitLine: { lineStyle: { color: "#e4edf3" } },
        },
        series: [
          {
            type: "line",
            name: map?.label || n.title,
            data: rows,
            showSymbol: true,
            connectNulls: false,
            lineStyle: { color: "#227f9f", width: 2 },
            itemStyle: { color: "#227f9f" },
          },
        ],
      },
      true,
    );
  }
  dispose() {
    this.removeListeners();
    for (const id of this.charts.keys()) this.disposeChart(id);
    this.graph.dispose();
  }
}

export const ScreenStage = {
  props: [
    "doc",
    "points",
    "selected",
    "editing",
    "tool",
    "sequence",
    "sourceVersion",
    "blocked",
  ],
  emits: ["start", "insert", "geometry", "pipe", "select", "tool", "command"],
  setup(props, { emit }) {
    const { ref, computed, onMounted, onBeforeUnmount, watch } = Vue;
    const host = ref(),
      faceplate = ref("");
    let adapter;
    const object = computed(() =>
      props.doc.nodes.find((n) => n.id === faceplate.value),
    );
    const status = computed(() =>
      object.value && ["pump", "fan", "valve"].includes(object.value.symbol)
        ? screenState(object.value, props.points)
        : "",
    );
    const fields = computed(() =>
      object.value
        ? screenSymbols[object.value.symbol].slots.map((slot) => {
            const point = props.points[object.value.bindings[slot.key]],
              map = props.doc.mappings.find(
                (m) => m.id === object.value.bindings[slot.key],
              );
            return {
              label: slot.label,
              value:
                point?.quality === "good"
                  ? typeof point.value === "boolean"
                    ? point.value
                      ? "有"
                      : "无"
                    : String(point.value) + (map?.unit ? " " + map.unit : "")
                  : "—",
              quality: screenQualityLabels[point?.quality] || "未绑定",
            };
          })
        : [],
    );
    const dispatch = (event, data) =>
      event === "faceplate" ? (faceplate.value = data) : emit(event, data);
    const keyboard = (event) => {
      if (
        !props.editing ||
        props.blocked ||
        event.target.closest?.("input,select,textarea,[contenteditable=true]")
      )
        return;
      const command =
        event.ctrlKey || event.metaKey
          ? event.key.toLowerCase() === "z"
            ? event.shiftKey
              ? "redo"
              : "undo"
            : event.key.toLowerCase() === "d"
              ? "copy"
              : null
          : ["Delete", "Backspace"].includes(event.key)
            ? "delete"
            : ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  event.key,
                )
              ? event.key
              : event.key === "Escape"
                ? "select"
                : null;
      if (command) {
        event.preventDefault();
        if (command === "select") {
          emit("tool", "select");
          emit("select", []);
        } else emit("command", { key: command, step: event.shiftKey ? 10 : 1 });
      }
    };
    onMounted(() => {
      adapter = new ScreenGraph(host.value, () => props, dispatch);
      window.addEventListener("keydown", keyboard);
    });
    watch(
      () =>
        JSON.stringify([props.doc.nodes, props.doc.pipes, props.doc.canvas]),
      () => adapter?.syncDocument(),
      { flush: "post" },
    );
    watch(
      () => JSON.stringify([props.selected, props.editing, props.tool]),
      () => {
        adapter?.syncSelection();
        if (props.editing) faceplate.value = "";
      },
    );
    watch(
      () => [props.points, props.sequence, props.sourceVersion],
      () => adapter?.project(),
      { flush: "post" },
    );
    onBeforeUnmount(() => {
      window.removeEventListener("keydown", keyboard);
      adapter?.dispose();
    });
    return { host, object, status, fields, faceplate };
  },
  template: `<div class="screen-stage" :class="{'is-design':editing,'is-connecting':editing&&tool==='pipe'}"><div ref="host" class="screen-graph"></div><div v-if="!doc.nodes.length&&editing" class="screen-empty"><b>从空白画布开始设计</b><span>拖入泵、阀、池体，再用“连管”连接设备接口。</span><span>矩形、文字与数据仪表也可自由摆放。</span></div><section v-if="object&&!editing" class="screen-faceplate" role="dialog" :aria-label="object.title+' 设备详情'"><header><b>{{object.title}}</b><button @click="faceplate=''">关闭详情</button></header><strong v-if="status">{{status}}</strong><dl><template v-for="field in fields"><dt>{{field.label}}</dt><dd>{{field.value}} <small>{{field.quality}}</small></dd></template></dl><p>当前为只读监视；显示值来自绑定测点。</p></section></div>`,
};
