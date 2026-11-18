import {
  screenSymbols,
  registerScreenSymbols,
  screenPorts,
  screenGraphPorts,
  screenSlots,
  screenPoint,
  screenRoleSlot,
  screenDefaultAction,
} from "../../components/studio/screen-symbols.mjs";
import { screenNode, screenState, screenDisplay } from "./screen-model.mjs";
import { screenRuleProjection } from "./screen-dynamics.mjs";
import { ScreenRuntimeTrend } from "./screen-trend-panel.mjs";
import {
  screenChartKinds,
  screenTableKinds,
  screenChartResult,
  screenTableResult,
  screenSeries,
} from "./screen-widgets.mjs";

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
    this.portDefinitions = new Map();
    this.drawing = null;
    const { Graph, Selection, Transform, Snapline } = window.X6;
    registerScreenSymbols(window.X6, (node) => this.chartElement(node));
    Graph.registerEdge(
      "screen-pipe",
      {
        inherit: "edge",
        markup: [
          { tagName: "path", selector: "wrap" },
          { tagName: "path", selector: "line" },
          { tagName: "path", selector: "flow" },
        ],
        attrs: {
          wrap: {
            connection: true,
            fill: "none",
            stroke: "transparent",
            strokeWidth: 14,
            cursor: "pointer",
          },
          line: { connection: true, fill: "none", strokeLinecap: "round" },
          flow: { connection: true, fill: "none", pointerEvents: "none" },
        },
      },
      true,
    );
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
        allowBlank: true,
        allowNode: false,
        allowEdge: false,
        allowLoop: false,
        connectionPoint: "anchor",
        // Use the port under the pointer. Grid-rounded proximity can choose a neighboring junction port.
        snap: false,
        router: { name: "orth", args: { padding: 20 } },
        connector: { name: "rounded", args: { radius: 5 } },
        validateMagnet: () =>
          this.props().editing && this.props().tool === "pipe",
        validateConnection: ({
          sourceCell,
          sourcePort,
          targetCell,
          targetPort,
        }) => {
          const nodes = this.props().doc.nodes,
            source = screenPorts(
              nodes.find((n) => n.id === sourceCell?.id),
            ).find((p) => p.id === sourcePort),
            target = screenPorts(
              nodes.find((n) => n.id === targetCell?.id),
            ).find((p) => p.id === targetPort);
          return (
            (!sourceCell || (!!source && source.direction !== "in")) &&
            (!targetCell || (!!target && target.direction !== "out"))
          );
        },
        createEdge: () =>
          this.graph.createEdge({
            shape: "screen-pipe",
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
    const table = screenTableKinds.has(
      this.props().doc.nodes.find((n) => n.id === cell.id)?.symbol,
    );
    if (table) {
      host.className = "screen-table-host";
      card.classList.add("screen-data-table");
    }
    card.append(heading, host, quality);
    const entry = {
      card,
      heading,
      host,
      quality,
      chart: null,
    };
    this.charts.set(cell.id, entry);
    requestAnimationFrame(() => {
      if (!host.isConnected) return;
      if (table) {
        this.project();
        return;
      }
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
      if (
        p.tool === "pipe" &&
        !event.target.closest(".x6-node,.x6-edge,.x6-port,.x6-cell-tools")
      ) {
        event.stopPropagation();
        event.preventDefault();
        const point = graph.snapToGrid(event.clientX, event.clientY);
        this.pipeDrawing = {
          id: crypto.randomUUID(),
          type: "pipe",
          title: "工艺管道",
          source: { x: point.x, y: point.y },
          target: { x: point.x, y: point.y },
          vertices: [],
          style: { color: "#557f96", width: 7 },
          bindings: {},
        };
        return;
      }
      if (["select", "pipe"].includes(p.tool)) return;
      if (p.tool.startsWith("library:")) {
        event.stopPropagation();
        event.preventDefault();
        const point = graph.clientToLocal(event.clientX, event.clientY);
        this.emit("library", { id: p.tool.slice(8), x: point.x, y: point.y });
        this.emit("tool", "select");
        return;
      }
      if (!screenSymbols[p.tool]) return;
      event.stopPropagation();
      event.preventDefault();
      const point = graph.clientToLocal(event.clientX, event.clientY);
      const n = this.insert(p.tool, point.x, point.y);
      if (["rect", "ellipse", "line"].includes(p.tool))
        this.drawing = { id: n.id, x: n.x, y: n.y, kind: p.tool };
      else this.emit("tool", "select");
    };
    const move = (event) => {
      if (this.pipeDrawing) {
        const point = graph.snapToGrid(event.clientX, event.clientY);
        this.pipeDrawing.target = {
          x: Math.max(0, Math.min(1920, point.x)),
          y: Math.max(0, Math.min(1080, point.y)),
        };
        if (
          Math.hypot(
            this.pipeDrawing.target.x - this.pipeDrawing.source.x,
            this.pipeDrawing.target.y - this.pipeDrawing.source.y,
          ) >= 10
        ) {
          const { created, ...definition } = this.pipeDrawing;
          this.emit("pipe", definition);
          this.pipeDrawing.created = true;
        }
        return;
      }
      if (!this.drawing) return;
      const p = graph.snapToGrid(event.clientX, event.clientY),
        d = this.drawing;
      const x = Math.max(0, Math.min(d.x, p.x)),
        y = Math.max(0, Math.min(d.y, p.y));
      const w = Math.min(1920 - x, Math.max(16, Math.abs(p.x - d.x))),
        h = Math.min(1080 - y, Math.max(16, Math.abs(p.y - d.y)));
      const shapePoints =
        d.kind === "line"
          ? {
              points: [
                { x: ((d.x - x) / w) * 100, y: ((d.y - y) / h) * 100 },
                { x: ((p.x - x) / w) * 100, y: ((p.y - y) / h) * 100 },
              ].map((v) => ({
                x: Math.max(0, Math.min(100, v.x)),
                y: Math.max(0, Math.min(100, v.y)),
              })),
            }
          : {};
      this.emit("geometry", {
        id: d.id,
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h),
        ...shapePoints,
      });
    };
    const up = () => {
      this.flushPipes?.();
      if (this.pipeDrawing) {
        const pipe = this.pipeDrawing;
        this.pipeDrawing = null;
        if (pipe.created) {
          this.emit("select", [pipe.id]);
          this.emit("tool", "select");
        }
        return;
      }
      if (this.drawing) {
        this.drawing = null;
        this.emit("tool", "select");
      }
    };
    const drop = (event) => {
      if (!this.props().editing) return;
      const symbol = event.dataTransfer.getData("application/x-scada-symbol");
      const library = event.dataTransfer.getData("application/x-scada-library");
      if (library) {
        event.preventDefault();
        const point = graph.clientToLocal(event.clientX, event.clientY);
        this.emit("start");
        this.emit("library", { id: library, x: point.x, y: point.y });
        this.emit("tool", "select");
        return;
      }
      if (!screenSymbols[symbol]) return;
      event.preventDefault();
      const p = graph.clientToLocal(event.clientX, event.clientY);
      this.emit("start");
      this.insert(symbol, p.x, p.y);
      this.emit("tool", "select");
    };
    const over = (e) => {
      if (
        e.dataTransfer.types.some((type) =>
          [
            "application/x-scada-symbol",
            "application/x-scada-library",
          ].includes(type),
        )
      )
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
      const next = e.altKey
        ? [node.id]
        : n?.group
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
        const action = n.action;
        if (action?.type === "none") return;
        if (action?.type === "navigate") {
          this.emit("navigate", action.pageId);
          return;
        }
        if (action?.type === "link") {
          try {
            const url = new URL(action.url);
            if (
              ["http:", "https:"].includes(url.protocol) &&
              !url.username &&
              !url.password
            )
              window.open(url.href, "_blank", "noopener,noreferrer");
          } catch {}
          return;
        }
        if (action?.type === "trend") {
          this.emit("trend", n.id);
          return;
        }
        if (action?.type === "details") {
          this.emit("faceplate", n.id);
          return;
        }
        if (screenDefaultAction(n) === "details") this.emit("faceplate", n.id);
        return;
      }
      if (p.tool !== "select") return;
      const next = e.altKey
        ? [node.id]
        : e.shiftKey
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
      if (
        (!source.cell && ![source.x, source.y].every(Number.isFinite)) ||
        (!target.cell && ![target.x, target.y].every(Number.isFinite))
      )
        return;
      const existing = this.props().doc.pipes.find((p) => p.id === edge.id);
      this.emit("pipe", {
        ...(existing || {
          id: edge.id,
          type: "pipe",
          title: "工艺管道",
          style: { color: "#557f96", width: 7 },
          bindings: {},
        }),
        source: source.cell
          ? { nodeId: source.cell, portId: source.port }
          : {
              x: Math.max(0, Math.min(1920, source.x)),
              y: Math.max(0, Math.min(1080, source.y)),
            },
        target: target.cell
          ? { nodeId: target.cell, portId: target.port }
          : {
              x: Math.max(0, Math.min(1920, target.x)),
              y: Math.max(0, Math.min(1080, target.y)),
            },
        vertices: edge.getVertices().map((p) => ({ x: p.x, y: p.y })),
      });
    };
    graph.on("edge:connected", pipe);
    graph.on("edge:change:vertices", pipe);
    // Persist the final point terminals of open-ended gestures too. They do
    // not always produce the same connection event as a device port drop.
    this.flushPipes = () => {
      if (this.props().editing && !this.applying)
        graph.getEdges().forEach((edge) => pipe({ edge }));
    };
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
          this.portDefinitions.delete(cell.id);
          graph.removeCell(cell);
        }
      graph.drawBackground({ color: p.doc.canvas.background });
      for (const n of p.doc.nodes) {
        let cell = graph.getCellById(n.id);
        if (cell && cell.shape !== "screen-" + n.symbol) {
          this.disposeChart(n.id);
          this.projections.delete(n.id);
          this.portDefinitions.delete(n.id);
          graph.removeCell(cell);
          cell = null;
        }
        if (!cell) {
          this.projections.delete(n.id);
          this.portDefinitions.delete(n.id);
          cell = graph.addNode({
            id: n.id,
            shape: "screen-" + n.symbol,
            x: n.x,
            y: n.y,
            width: n.w,
            height: n.h,
            zIndex: n.z,
            ports: screenGraphPorts(n),
            attrs:
              n.symbol === "trend"
                ? { body: { fill: "transparent", stroke: "none" } }
                : {},
          });
        }
        const portDefinition = JSON.stringify(screenPorts(n));
        if (this.portDefinitions.get(n.id) !== portDefinition) {
          cell.prop("ports", screenGraphPorts(n));
          this.portDefinitions.set(n.id, portDefinition);
        }
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
        const source = n.source.nodeId
            ? { cell: n.source.nodeId, port: n.source.portId }
            : { x: n.source.x, y: n.source.y },
          target = n.target.nodeId
            ? { cell: n.target.nodeId, port: n.target.portId }
            : { x: n.target.x, y: n.target.y };
        if (!cell) {
          this.projections.delete(n.id);
          cell = graph.addEdge({
            id: n.id,
            shape: "screen-pipe",
            source,
            target,
            vertices: n.vertices,
            zIndex: 0,
            router: { name: "orth", args: { padding: 20 } },
            connector: { name: "rounded", args: { radius: 5 } },
          });
        }
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
            { name: "source-arrowhead" },
            { name: "target-arrowhead" },
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
        if (["pump", "fan", "valve", "status"].includes(n.symbol)) {
          const state = screenState(n, p.points),
            reading = screenDisplay(n, p.points, p.doc.mappings);
          attrs = {
            body: {
              fill:
                n.symbol === "status" && !["故障", "未知"].includes(state)
                  ? state === "运行"
                    ? n.params.onColor || screenStateColors[state]
                    : n.params.offColor || screenStateColors[state]
                  : screenStateColors[state],
              stroke: n.style.stroke,
            },
            stubs: { stroke: n.style.stroke },
            rotor: { fill: n.style.stroke },
            caption: {
              text: n.title,
              fill: n.style.color,
              fontSize: n.style.fontSize,
            },
            state: {
              text:
                (n.symbol === "status" && !["未知", "故障"].includes(state)
                  ? state === "运行"
                    ? n.params.onText || "运行"
                    : n.params.offText || "停止"
                  : state) +
                (n.bindings[screenRoleSlot(n, "value")?.key]
                  ? " · " + reading.text
                  : ""),
            },
          };
          cell.attr("root/data-state", state);
        } else if (["line", "polyline", "polygon"].includes(n.symbol)) {
          const def = screenSymbols[n.symbol],
            path =
              n.points
                .map(
                  (v, i) =>
                    (i ? "L" : "M") +
                    (v.x * def.w) / 100 +
                    " " +
                    (v.y * def.h) / 100,
                )
                .join(" ") + (n.symbol === "polygon" ? " Z" : "");
          attrs = {
            body: {
              d: path,
              fill: n.symbol === "polygon" ? n.style.fill : "none",
              stroke: n.style.stroke,
              strokeWidth: n.style.lineWidth || 3,
            },
          };
        } else if (n.symbol === "tank" || n.symbol === "barGauge") {
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
            body: {
              stroke: n.style.stroke,
              fill:
                n.params.waterColor || n.params.theme
                  ? n.style.fill
                  : "#edf2f5",
            },
            water: {
              height: (n.symbol === "barGauge" ? 212 : 232) * ratio,
              y:
                n.params.levelDirection === "down"
                  ? 29
                  : (n.symbol === "barGauge" ? 241 : 261) -
                    (n.symbol === "barGauge" ? 212 : 232) * ratio,
              fill:
                n.params.waterColor ||
                (n.style.fill === "#e5edf2" ? "#66abc5" : n.style.fill),
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
            caption: {
              text: (n.params.icon ? n.params.icon + " " : "") + n.title,
            },
            value: {
              text: reading.text,
              fill: n.style.color,
              fontSize: n.style.fontSize,
            },
            quality: { text: screenQualityLabels[reading.quality] },
          };
        } else if (n.symbol === "checkValve") {
          attrs = {
            body: { fill: n.style.fill, stroke: n.style.stroke },
            stubs: { stroke: n.style.stroke },
          };
        } else if (n.symbol === "junction")
          attrs = { body: { fill: n.style.fill, stroke: n.style.stroke } };
        else if (["rect", "ellipse", "text", "button"].includes(n.symbol)) {
          const textSlot = screenRoleSlot(n, "text"),
            point = screenPoint(n, p.points, "text");
          const label = n.bindings[textSlot?.key]
            ? point?.quality === "good"
              ? String(point.value)
              : "—"
            : n.bindings[screenRoleSlot(n, "value")?.key]
              ? screenDisplay(n, p.points, p.doc.mappings).text
              : n.symbol === "text"
                ? n.text
                : n.symbol === "button"
                  ? n.title
                  : "";
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
        if (attrs) {
          for (const key of ["label", "caption", "value", "state", "quality"]) {
            if (attrs[key]) {
              attrs[key].fill ??= n.style.color;
              attrs[key].fontFamily =
                n.style.fontFamily || "Microsoft YaHei,sans-serif";
              attrs[key].fontWeight = n.style.fontWeight || 400;
            }
          }
        }
        if (attrs?.label) {
          const align = n.style.align || "center";
          Object.assign(attrs.label, {
            textAnchor:
              align === "left" ? "start" : align === "right" ? "end" : "middle",
            refX: align === "left" ? "2%" : align === "right" ? "98%" : "50%",
            textWrap: { width: "96%", height: "100%", ellipsis: false },
          });
        }
        const dynamic = screenRuleProjection(n, p.points);
        if (attrs) {
          const guarded =
            ["pump", "fan", "valve", "status"].includes(n.symbol) &&
            ["故障", "未知"].includes(screenState(n, p.points));
          if (dynamic.fill && !guarded) {
            if (n.symbol === "tank") attrs.water.fill = dynamic.fill;
            else if (attrs.body) attrs.body.fill = dynamic.fill;
          }
          const textSelector =
            n.symbol === "text" || ["rect", "ellipse"].includes(n.symbol)
              ? "label"
              : n.symbol === "readout" || n.symbol === "tank"
                ? "value"
                : "state";
          if (dynamic.text !== undefined && !guarded && attrs[textSelector])
            attrs[textSelector].text = dynamic.text;
          if (dynamic.color) {
            for (const key of ["label", "caption", "value", "state"])
              if (attrs[key]) attrs[key].fill = dynamic.color;
          }
        }
        if (
          attrs?.body &&
          ["pump", "fan", "valve", "tank", "readout"].includes(n.symbol)
        ) {
          const detailed = n.params.appearance === "detailed";
          attrs.body.style = {
            filter: detailed ? "drop-shadow(0px 2px 2px #304c5d33)" : "none",
          };
          attrs.body.strokeWidth = detailed ? 2 : 3;
          if (n.symbol === "tank" && !n.params.waterColor && !n.params.theme)
            attrs.body.fill = "#edf2f5";
          if (detailed && /^#[\da-f]{6}$/i.test(attrs.body.fill))
            attrs.body.fill = {
              type: "linearGradient",
              stops: [
                { offset: "0%", color: "#ffffff" },
                { offset: "35%", color: attrs.body.fill },
                { offset: "100%", color: attrs.body.fill },
              ],
              attrs: { x1: "0%", y1: "0%", x2: "100%", y2: "100%" },
            };
        }
        if (
          attrs?.caption &&
          ["pump", "fan", "valve", "tank"].includes(n.symbol)
        ) {
          attrs.caption.y =
            n.params.labelPosition === "top"
              ? -10
              : n.symbol === "tank"
                ? 289
                : n.symbol === "valve"
                  ? 119
                  : 139;
          attrs.caption.visibility =
            n.params.labelPosition === "none" ? "hidden" : "visible";
        }
        const visible = !n.hidden && (dynamic.visible !== false || p.editing);
        visible ? cell.show() : cell.hide();
        cell.attr(
          "root/opacity",
          dynamic.visible === false && p.editing ? 0.35 : 1,
        );
        const angle =
          !p.editing && dynamic.angle !== undefined ? dynamic.angle : n.angle;
        if (cell.angle() !== angle) cell.rotate(angle, { absolute: true });
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
        const point = screenPoint(n, p.points, "flow"),
          dynamic = screenRuleProjection(n, p.points),
          flowing =
            dynamic.flow ?? (point?.quality === "good" && point.value === true);
        dynamic.visible === false && !p.editing ? cell.hide() : cell.show();
        const attrs = {
          line: {
            stroke: dynamic.fill || n.style.color,
            strokeWidth: n.style.width,
            sourceMarker: null,
            targetMarker: null,
          },
          flow: {
            stroke: flowing ? n.style.flowColor || "#36c2ff" : "none",
            strokeWidth: Math.max(1, n.style.width * 0.46),
            strokeDasharray: "12 8",
            strokeLinecap: "round",
            class: flowing ? "screen-pipe-flow" : "",
            style: {
              animationDirection:
                n.style.flowDirection === "reverse" ? "reverse" : "normal",
            },
          },
        };
        if (this.projections.get(n.id) !== JSON.stringify(attrs)) {
          cell.attr(attrs);
          this.projections.set(n.id, JSON.stringify(attrs));
        }
        const arrowKey = JSON.stringify([
          n.style.arrow || "none",
          n.style.color,
          n.style.width,
        ]);
        if (cell.getData()?.screenArrow !== arrowKey) {
          const forward =
              n.style.arrow === "forward" || n.style.arrow === "both",
            reverse = n.style.arrow === "reverse" || n.style.arrow === "both";
          cell.setLabels(
            [...(forward ? [1] : []), ...(reverse ? [-1] : [])].map(
              (direction, i) => ({
                position: {
                  distance:
                    n.style.arrow === "both" ? (i === 0 ? 0.45 : 0.55) : 0.5,
                  options: { keepGradient: true },
                },
                markup: [{ tagName: "path", selector: "arrow" }],
                attrs: {
                  arrow: {
                    d: direction === 1 ? "M-8 -5L0 0L-8 5" : "M8 -5L0 0L8 5",
                    fill: "none",
                    stroke: n.style.color,
                    strokeWidth: 3,
                  },
                },
              }),
            ),
          );
          cell.setData({ screenArrow: arrowKey });
        }
      }
    } finally {
      this.applying = false;
    }
  }
  projectChart(n, entry) {
    const p = this.props(),
      dynamic = screenRuleProjection(n, p.points);
    entry.heading.textContent = dynamic.text ?? n.title;
    entry.card.style.setProperty(
      "--screen-card-padding",
      (n.params.cardPadding || 16) + "px",
    );
    Object.assign(entry.card.style, {
      pointerEvents: p.editing ? "none" : "auto",
      background: dynamic.fill || n.style.fill,
      borderColor: n.style.stroke,
      color: dynamic.color || n.style.color,
      fontFamily: n.style.fontFamily || "Microsoft YaHei",
    });
    Object.assign(entry.heading.style, {
      fontSize: n.style.fontSize + "px",
      fontWeight: n.style.fontWeight || 600,
    });
    if (screenTableKinds.has(n.symbol)) {
      const data = screenTableResult(n, p.points, p.doc.mappings),
        key = JSON.stringify([data, n.params]);
      entry.quality.textContent = data.quality + " · " + data.total + " 行";
      if (entry.tableKey === key) return;
      entry.tableKey = key;
      const table = document.createElement("table"),
        head = document.createElement("thead"),
        tr = document.createElement("tr");
      for (const col of data.columns) {
        const th = document.createElement("th");
        th.textContent = col.title;
        tr.append(th);
      }
      head.append(tr);
      table.append(head);
      const body = document.createElement("tbody");
      for (const row of data.rows) {
        const tr = document.createElement("tr"),
          level = row.severity.toLowerCase();
        if (
          [
            "critical",
            "high",
            "alarm",
            "error",
            "fault",
            "严重",
            "报警",
            "故障",
          ].includes(level)
        )
          tr.className = "severity-high";
        else if (["warning", "warn", "预警"].includes(level))
          tr.className = "severity-warning";
        for (const value of row.cells) {
          const td = document.createElement("td");
          td.textContent = value;
          tr.append(td);
        }
        body.append(tr);
      }
      if (!data.rows.length) {
        const tr = document.createElement("tr"),
          td = document.createElement("td");
        td.colSpan = Math.max(1, data.columns.length);
        td.textContent =
          data.quality === "有效" ? "暂无数据" : "— · " + data.quality;
        tr.append(td);
        body.append(tr);
      }
      table.append(body);
      const top = entry.host.scrollTop;
      entry.host.replaceChildren(table);
      entry.host.scrollTop = top;
      return;
    }
    if (!entry.chart) return;
    const result = screenChartResult(
      n,
      p.points,
      p.doc.mappings,
      entry,
      p.sequence,
      p.sourceVersion,
      p.doc.snapshotTime ?? Date.now(),
    );
    if (result) {
      entry.quality.textContent =
        result.quality +
        (n.symbol === "trend" &&
        screenSeries(n).some(
          (s) =>
            p.doc.mappings.find((m) => m.id === n.bindings[s.slot])?.kind ===
            "number",
        )
          ? " · 从接入时开始采样"
          : "");
      entry.chart.setOption(result.option, true);
    }
  }
  dispose() {
    this.removeListeners();
    for (const id of this.charts.keys()) this.disposeChart(id);
    this.graph.dispose();
  }
}

export const ScreenStage = {
  components: { ScreenRuntimeTrend },
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
  emits: [
    "start",
    "insert",
    "geometry",
    "pipe",
    "select",
    "tool",
    "command",
    "library",
    "navigate",
  ],
  setup(props, { emit }) {
    const { ref, computed, onMounted, onBeforeUnmount, watch } = Vue;
    const host = ref(),
      faceplate = ref("");
    const trendMode = ref(false);
    let adapter;
    let pointDrag;
    const pointObject = computed(() =>
      props.editing && props.tool === "select" && props.selected.length === 1
        ? props.doc.nodes.find(
            (n) =>
              n.id === props.selected[0] &&
              !n.locked &&
              Array.isArray(n.points),
          )
        : null,
    );
    const selectedPipe = computed(() =>
      props.selected.some((id) => props.doc.pipes.some((p) => p.id === id)),
    );
    const startPoint = (event, index) => {
      if (!pointObject.value) return;
      emit("start");
      pointDrag = { id: pointObject.value.id, index };
      event.stopPropagation();
      event.preventDefault();
    };
    const movePoint = (event) => {
      if (!pointDrag) return;
      const n = props.doc.nodes.find((n) => n.id === pointDrag.id);
      if (!n) return;
      const p = adapter.graph.clientToLocal(event.clientX, event.clientY),
        r = (-n.angle * Math.PI) / 180,
        dx = p.x - n.x - n.w / 2,
        dy = p.y - n.y - n.h / 2;
      const x = ((dx * Math.cos(r) - dy * Math.sin(r) + n.w / 2) / n.w) * 100,
        y = ((dx * Math.sin(r) + dy * Math.cos(r) + n.h / 2) / n.h) * 100;
      emit("geometry", {
        id: n.id,
        points: n.points.map((v, i) =>
          i === pointDrag.index
            ? {
                x: Math.max(0, Math.min(100, x)),
                y: Math.max(0, Math.min(100, y)),
              }
            : v,
        ),
      });
    };
    const endPoint = () => (pointDrag = null);
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
        ? screenSlots(object.value).map((slot) => {
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
                    : (Array.isArray(point.value)
                        ? point.value.length + " 行数据"
                        : String(point.value)) +
                      (map?.unit ? " " + map.unit : "")
                  : "—",
              quality: screenQualityLabels[point?.quality] || "未绑定",
            };
          })
        : [],
    );
    const dispatch = (event, data) => {
      if (event === "faceplate" || event === "trend") {
        trendMode.value = event === "trend";
        faceplate.value = data;
      } else emit(event, data);
    };
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
      window.addEventListener("mousemove", movePoint);
      window.addEventListener("mouseup", endPoint);
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
      window.removeEventListener("mousemove", movePoint);
      window.removeEventListener("mouseup", endPoint);
      adapter?.dispose();
    });
    return {
      host,
      object,
      status,
      fields,
      faceplate,
      pointObject,
      startPoint,
      selectedPipe,
      trendMode,
    };
  },
  template: `<div class="screen-stage" :class="{'is-design':editing,'is-connecting':editing&&(tool==='pipe'||selectedPipe)}"><div ref="host" class="screen-graph"></div><svg v-if="pointObject" class="screen-point-overlay" width="1920" height="1080"><g :transform="'translate('+pointObject.x+' '+pointObject.y+') rotate('+pointObject.angle+' '+pointObject.w/2+' '+pointObject.h/2+')'"><circle v-for="(point,i) in pointObject.points" :key="i" :cx="point.x*pointObject.w/100" :cy="point.y*pointObject.h/100" r="6" :data-shape-point="i" :aria-label="'图形顶点 '+(i+1)" @mousedown="startPoint($event,i)" /></g></svg><div v-if="!doc.nodes.length&&editing" class="screen-empty"><b>从空白画布开始设计</b><span>拖入泵、阀、池体，再用“连管”连接设备接口。</span><span>矩形、文字与数据仪表也可自由摆放。</span></div><section v-if="object&&!editing" class="screen-faceplate" role="dialog" :aria-label="object.title+' 设备详情'"><header><b>{{object.title}}</b><button @click="faceplate=''">关闭详情</button></header><strong v-if="status">{{status}}</strong><screen-runtime-trend v-if="trendMode" :item="object" :doc="doc" :points="points" :sequence="sequence"></screen-runtime-trend><dl><template v-for="field in fields"><dt>{{field.label}}</dt><dd>{{field.value}} <small>{{field.quality}}</small></dd></template></dl><p>当前为只读监视；显示值来自绑定测点。</p></section></div>`,
};
