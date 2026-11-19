import {screenControlKinds,screenControlTransition,projectScreenControl} from './screen-controls.mjs';
import {
  screenSymbols,
  screenPidSymbols,
  registerScreenSymbols,
  screenPorts,
  screenGraphPorts,
  screenSlots,
  screenPoint,
  screenRoleSlot,
  screenDefaultAction,
  screenAppearanceOptions,
  screenPortMediaProblem,
} from "../../components/studio/screen-symbols.mjs";
import { screenNode, screenState, screenDisplay, screenEndpointPosition } from "./screen-model.mjs";
import { screenRuleProjection } from "./screen-dynamics.mjs";
import { screenDepthArtwork, screenDepthArtworkFrames } from "../../components/studio/screen-artwork.mjs";
import { waterEquipment } from '../../components/studio/water-equipment.mjs';
import { waterArtwork } from '../../components/studio/water-artwork.mjs';
import { equipmentStatus, equipmentReadings } from './equipment-display.mjs';
import {routeScreenPipe} from './screen-routing.mjs';
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

function screenEventPager(move) {
  const nav = document.createElement("nav");
  nav.className = "screen-event-pages";
  nav.setAttribute("aria-label", "告警分页");
  nav.hidden = true;
  const button = (label, step) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.onclick = (event) => {
      event.stopPropagation();
      move(step);
    };
    return element;
  };
  const status = document.createElement("span"),
    previous = button("上一页", -1),
    next = button("下一页", 1),
    latest = button("返回实时", "latest");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  nav.append(status, previous, next, latest);
  return { nav, status, previous, next, latest, page: 1, pages: 1, point: null, snapshot: null };
}

function screenArtworkAt(node, x, y) {
  const { w, h } = screenSymbols[node.symbol];
  const sx = node.w / w,
    sy = node.h / h;
  const scale = Math.min(sx, sy);
  return `translate(${x} ${y}) scale(${scale / sx} ${scale / sy}) translate(${-x} ${-y})`;
}

function screenPictureStubs(node, bounds) {
  const def=screenSymbols[node.symbol],sx=node.w/def.w,sy=node.h/def.h,k=Math.min(sx,sy);
  const [x,y,w,h]=bounds,frame=screenDepthArtworkFrames[node.symbol];
  const fit=Math.min(w/frame.width,h/frame.height),[ax,ay,bx,by]=frame.alphaBounds;
  const ox=x+(w-frame.width*fit)/2,oy=y+(h-frame.height*fit)/2;
  const left=def.w/2+(ox+ax*fit-def.w/2)*k/sx;
  const right=def.w/2+(ox+bx*fit-def.w/2)*k/sx;
  const top=def.h/2+(oy+ay*fit-def.h/2)*k/sy;
  const bottom=def.h/2+(oy+by*fit-def.h/2)*k/sy;
  // Connect to the equal-aspect picture, including when its node is stretched.
  return screenPorts(node).map(p=>{
    const px=p.x*def.w/100,py=p.y*def.h/100;
    const ix=Math.max(left+8,Math.min(right-8,px)),iy=Math.max(top+8,Math.min(bottom-8,py));
    return `M${px} ${py}L${ix} ${iy}`;
  }).join(" ");
}

function screenPumpBadges(node, points, attrs, state, reading) {
  const monitor = node.params.appearance === "monitor";
  const depth = node.params.appearance === "depth";
  const modeSlot = screenRoleSlot(node, "text");
  const mode = screenPoint(node, points, "text");
  const showMode = monitor && !!node.bindings[modeSlot?.key];
  const stateColor =
    state === "运行" ? "#3fcf91" : state === "故障" ? "#f07878" : "#7694a8";
  const at = (x, y) => (monitor ? screenArtworkAt(node, x, y) : "");
  Object.assign(attrs.body, {
    transform: at(85, 80),
    fill: monitor
      ? state === "运行"
        ? "#103b35"
        : state === "故障"
          ? "#502c34"
          : "#102636"
      : attrs.body.fill,
    stroke: monitor ? stateColor : attrs.body.stroke,
  });
  if (depth && node.bindings[modeSlot?.key])
    attrs.state.text += " · " + (mode?.quality === "good" ? String(mode.value) : "未知");
  attrs.rotor.visibility = monitor ? "hidden" : "visible";
  Object.assign(attrs.caption, {
    y: monitor ? 86 : 139,
    transform: monitor ? at(85, 86) : depth ? screenArtworkAt(node, 85, 139) : "",
  });
  Object.assign(attrs.state, {
    visibility: monitor ? "hidden" : "visible",
    fill: !depth
      ? "#304c5d"
      : state === "运行" || state === "故障"
        ? stateColor
        : node.style.color,
    fontSize: depth ? 16 : 15,
    transform: depth ? screenArtworkAt(node, 85, 158) : "",
  });
  if (["pump", "fan"].includes(node.symbol)) {
    attrs.stubs.d = "M0 80H49M121 80H170M51 120H119";
  }
  attrs.frequencyBox = {
    visibility: monitor ? "visible" : "hidden",
    transform: at(-1, 44),
  };
  attrs.frequencyBadge = {
    text: monitor
      ? state === "运行" && reading.quality === "good"
        ? reading.text
        : state
      : "",
    fill: state === "故障" ? "#ffb7b7" : "#c2e9fd",
    transform: at(-1, 44),
  };
  attrs.modeBox = {
    visibility: showMode ? "visible" : "hidden",
    y: depth ? 4 : 121,
    transform: depth ? screenArtworkAt(node,85,16) : at(85,133),
  };
  attrs.modeBadge = {
    y: depth ? 21 : 138,
    text: showMode
      ? mode?.quality === "good"
        ? String(mode.value)
        : "未知"
      : "",
    fill: "#c3dbea",
    transform: depth ? screenArtworkAt(node,85,16) : at(85,133),
  };
}

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
          { tagName: "path", selector: "rim" },
          { tagName: "path", selector: "line" },
          { tagName: "path", selector: "highlight" },
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
          rim: { connection: true, class: "screen-pipe-rim", fill: "none", strokeLinecap: "round", pointerEvents: "none" },
          line: { connection: true, fill: "none", strokeLinecap: "round" },
          highlight: {
            connection: true,
            class: "screen-pipe-highlight",
            fill: "none",
            pointerEvents: "none",
            strokeLinecap: "round",
          },
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
            (!targetCell || (!!target && target.direction !== "out")) &&
            !screenPortMediaProblem(source, target)
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
    const symbol = this.props().doc.nodes.find((n) => n.id === cell.id)?.symbol;
    const table = screenTableKinds.has(symbol);
    const control = screenControlKinds.has(symbol);
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
    if (symbol === "events") {
      entry.pager = screenEventPager((move) => this.moveEventPage(cell.id, move));
      card.append(entry.pager.nav);
    }
    this.charts.set(cell.id, entry);
    requestAnimationFrame(() => {
      if (!host.isConnected) return;
      if (table||control) {
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
    const freePipeTarget = (event, point) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest("[port]");
      const id = hit?.closest(".x6-node")?.dataset.cellId;
      const node = this.props().doc.nodes.find((item) => item.id === id);
      const port = screenPorts(node).find((item) => item.id === hit?.getAttribute("port"));
      return port && port.direction !== "out"
        ? { nodeId: node.id, portId: port.id }
        : { x: Math.max(0, Math.min(1920, point.x)), y: Math.max(0, Math.min(1080, point.y)) };
    };
    const start = (event) => {
      const p = this.props();
      if (!p.editing || event.button !== 0) return;
      this.emit("start");
      const hitNode = event.target.closest(".x6-node");
      const backdrop = hitNode && p.doc.nodes.find((node) => node.id === hitNode.dataset.cellId);
      if (
        p.tool === "pipe" &&
        !event.target.closest(".x6-edge,.x6-port,.x6-cell-tools") &&
        (!hitNode || (backdrop?.symbol === "rect" && !screenPorts(backdrop).length))
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
        if (Math.hypot(point.x - this.pipeDrawing.source.x, point.y - this.pipeDrawing.source.y) >= 10) {
          this.pipeDrawing.target = freePipeTarget(event, point);
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
    const up = (event) => {
      this.flushPipes?.();
      if (this.pipeDrawing) {
        const { created, ...pipe } = this.pipeDrawing;
        this.pipeDrawing = null;
        if (created) {
          const point = graph.snapToGrid(event.clientX, event.clientY);
          if (Math.hypot(point.x - pipe.source.x, point.y - pipe.source.y) >= 10)
            this.emit("pipe", { ...pipe, target: freePipeTarget(event, point) });
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
        if(screenControlKinds.has(n.symbol))return;
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
        vertices: JSON.stringify(edge.getVertices())===this.autoRoutes?.get(edge.id) ? (existing?.vertices||[]) : edge.getVertices().map((p) => ({ x: p.x, y: p.y })),
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
        const layer=n.z+(p.editing&&p.tool==='pipe'&&screenPorts(n).length?10000:0);
        if (cell.getZIndex() !== layer) cell.setZIndex(layer);
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
        const a = screenEndpointPosition(p.doc, n.source);
        const b = screenEndpointPosition(p.doc, n.target);
        // Use the authored path if it is already orthogonal to subpixel precision.
        // The auto-router can overshoot a vertex placed next to a device port.
        const auto=routeScreenPipe(p.doc,n);
        const vertices=auto??n.vertices;
        this.autoRoutes ||= new Map();
        if(auto!==null&&!n.vertices.length)this.autoRoutes.set(n.id,JSON.stringify(vertices));else this.autoRoutes.delete(n.id);
        const points = [a, ...vertices, b];
        const aligned = points.slice(1).every((point, i) =>
          Math.min(Math.abs(point.x - points[i].x), Math.abs(point.y - points[i].y)) < 0.5,
        );
        const router = auto!==null || aligned
          ? { name: "normal" }
          : { name: "orth", args: { padding: 20 } };
        const connector = n.style.jump && p.doc.pipes.length > 1
          ? {name:"jumpover", args:{type:"arc", size:7, radius:5}}
          : {name:"rounded", args:{radius:5}};
        if (!cell) {
          this.projections.delete(n.id);
          cell = graph.addEdge({
            id: n.id,
            shape: "screen-pipe",
            source,
            target,
            vertices,
            zIndex: 0,
            router,
            connector,
          });
        }
        if (cell.getConnector()?.name !== connector.name) cell.setConnector(connector);
        if (JSON.stringify(cell.getSource()) !== JSON.stringify(source))
          cell.setSource(source);
        if (JSON.stringify(cell.getTarget()) !== JSON.stringify(target))
          cell.setTarget(target);
        if (JSON.stringify(cell.getVertices()) !== JSON.stringify(vertices))
          cell.setVertices(vertices);
        if (cell.getRouter()?.name !== router.name) cell.setRouter(router);
      }
      // A crossing may change when another pipe moves, even if this pipe stayed put.
      for (const pipe of p.doc.pipes) {
        if (pipe.style.jump) {
          const cell = graph.getCellById(pipe.id);
          if (cell) graph.findViewByCell(cell)?.update();
        }
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
      for(const n of p.doc.nodes){const cell=graph.getCellById(n.id);cell?.setZIndex(n.z+(p.editing&&p.tool==='pipe'&&screenPorts(n).length?10000:0));}
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
    const connectedPorts=new Set(p.doc.pipes.flatMap(pipe=>[pipe.source,pipe.target].filter(end=>end.nodeId).map(end=>end.nodeId+':'+end.portId)));
    this.applying = true;
    try {
      for (const n of p.doc.nodes) {
        const cell = this.graph.getCellById(n.id);
        if (!cell) continue;
        cell.attr("root/data-proposed",p.proposalIds?.includes(n.id)?"true":"false");
        let attrs;
        if (Object.hasOwn(screenPidSymbols, n.symbol)) {
          const reading = screenDisplay(n, p.points, p.doc.mappings);
          const quality = screenQualityLabels[reading.quality] || "未绑定";
          const color = n.style.color;
          const title = {text: n.title, fill: color};
          if (n.symbol === "pidBasin") {
            const ratio = reading.value === null ? 0 : Math.max(0, Math.min(1,
              (reading.value - n.params.min) / (n.params.max - n.params.min)));
            attrs = {
              body: {fill: n.style.fill, stroke: n.style.stroke, strokeWidth: 2},
              level: {y: 330 - 258 * ratio, height: 258 * ratio, fill: n.params.waterColor || "#b3c6ce"},
              caption: {...title, fontSize: n.style.fontSize},
              value: {text: reading.value === null ? quality : "液位 " + reading.text, fill: color},
            };
            cell.attr("root/data-state", quality);
          } else if (n.symbol === "pidInstrument") {
            attrs = {
              caption: {...title, text: n.title.replace(/-/g, "")},
              field: {fill: n.style.fill, stroke: n.style.stroke},
              value: {text: reading.value === null ? "—" : reading.value.toFixed(n.params.precision), fill: color},
              quality: {text: reading.value === null ? quality : reading.unit, fill: "#435e6c"},
            };
            cell.attr("root/data-state", quality);
          } else {
            const interlock = n.symbol === "pidInterlock";
            const point = screenPoint(n, p.points, "run");
            const state = interlock
              ? point?.quality === "good" ? point.value ? "联锁中" : "未触发" : screenQualityLabels[point?.quality] || "未绑定"
              : screenState(n, p.points);
            const active = state === "运行", alarm = state === "故障" || state === "联锁中";
            const indicator = alarm ? "#b13838" : active ? "#40855a" : "#71838d";
            const label = n.symbol === "pidMeteringPump" && reading.value !== null ? state + " · " + reading.text : state;
            attrs = {caption: title, body: {fill: n.style.fill, stroke: n.style.stroke}, state: {text: label, fill: indicator}};
            if (interlock) attrs.indicator = {fill: indicator, stroke: indicator};
            if (n.symbol === "pidMixer") attrs.rotor = {stroke: indicator};
            cell.attr("root/data-state", state);
          }
        } else if (waterEquipment[n.symbol]) {
          const def=waterEquipment[n.symbol],status=equipmentStatus(n,p.points);
          const dark=p.doc.canvas.theme==='cockpit-dark';
          const color=status==='故障'?(dark?'#ff9696':'#b63c3c'):['运行','只读监视'].includes(status)?(dark?'#63dab0':'#08745b'):status==='停止'?(dark?'#a9c1d1':'#536d7e'):(dark?'#e7bf77':'#93631f');
          const image=n.params.appearance==='picture'?n.image:waterArtwork[n.symbol];
          attrs={
            devicePicture:{'xlink:href':image||'',visibility:image?'visible':'hidden',transform:screenArtworkAt(n,def.w/2,def.pictureHeight/2)},
            equipmentStubs:{d:'',stroke:n.style.stroke},
            caption:{text:n.title,fill:n.style.color,fontSize:n.style.fontSize,textWrap:{width:def.w-12,height:28,ellipsis:true},transform:screenArtworkAt(n,def.w/2,def.pictureHeight+22)},
            state:{x:def.w/2,y:def.pictureHeight+48,text:status,fill:color,transform:screenArtworkAt(n,def.w/2,def.pictureHeight+48)},
            stateBadge:{x:def.w/2-48,y:def.pictureHeight+31,width:96,height:24,fill:p.doc.canvas.theme==='cockpit-dark'?'#102d42':'#f1f6f7',stroke:color,transform:screenArtworkAt(n,def.w/2,def.pictureHeight+43)},
          };
          equipmentReadings(n,p.points,p.doc.mappings).forEach((reading,i)=>{
            const count=def.category==='devices'?1:Math.min(3,screenSlots(n).filter(s=>s.kinds.includes('number')).length),x=def.w*(i+.5)/count;
            attrs['metricLabel'+i]={text:reading.label,fill:n.style.color,fontFamily:'Microsoft YaHei,sans-serif',transform:screenArtworkAt(n,x,def.pictureHeight+77)};
            attrs['metricValue'+i]={text:reading.text,fill:n.style.color,fontFamily:'Consolas,Microsoft YaHei,sans-serif',transform:screenArtworkAt(n,x,def.pictureHeight+100)};
          });
          if(n.params.compact){
            attrs.caption.visibility='hidden';
            const warning=!['运行','停止','只读监视'].includes(status);
            attrs.state.visibility=warning?'visible':'hidden';attrs.stateBadge.visibility=warning?'visible':'hidden';
            if(warning){Object.assign(attrs.state,{x:def.w-52,y:23,transform:screenArtworkAt(n,def.w-52,18)});Object.assign(attrs.stateBadge,{x:def.w-100,y:6,transform:screenArtworkAt(n,def.w-52,18)});}
            for(let i=0;i<3;i++){if(attrs['metricLabel'+i])attrs['metricLabel'+i].visibility='hidden';if(attrs['metricValue'+i])attrs['metricValue'+i].visibility='hidden';}
          }else{attrs.caption.visibility='visible';attrs.state.visibility='visible';attrs.stateBadge.visibility='visible';for(let i=0;i<3;i++){if(attrs['metricLabel'+i])attrs['metricLabel'+i].visibility='visible';if(attrs['metricValue'+i])attrs['metricValue'+i].visibility='visible';}}
          cell.attr('root/data-state',status);
        } else if (["pump", "fan", "valve", "status"].includes(n.symbol)) {
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
              fill: n.style.color,
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
          if (["pump", "fan"].includes(n.symbol))
            screenPumpBadges(n, p.points, attrs, state, reading);
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
          const monitor =
            n.symbol === "tank" && n.params.appearance === "monitor";
          const levelHeight = (n.symbol === "barGauge" ? 212 : 232) * ratio;
          const levelY = n.params.levelDirection === "down"
            ? 29
            : (n.symbol === "barGauge" ? 241 : 261) - levelHeight;
          const depth = n.symbol === "tank" && n.params.appearance === "depth";
          const valueY = monitor ? Math.max(83, Math.min(248, levelY + 20)) : 158;
          const captionY = monitor ? 52 : depth && n.params.labelPosition === "top" ? -10 : 289;
          attrs = {
            body: {
              stroke: n.style.stroke,
              fill:
                n.params.waterColor || n.params.theme
                  ? n.style.fill
                  : "#edf2f5",
            },
            water: {
              height: levelHeight,
              y: levelY,
              fill:
                n.params.waterColor ||
                (n.style.fill === "#e5edf2" ? "#66abc5" : n.style.fill),
            },
            value: {
              text: value.text,
              fill: n.style.color,
              y: valueY,
              transform: monitor || depth ? screenArtworkAt(n, 110, valueY) : "",
            },
            caption: {
              text: n.title,
              fill: n.style.color,
              fontSize: n.style.fontSize,
              y: captionY,
              transform: monitor || depth ? screenArtworkAt(n, 110, captionY) : "",
            },
          };
          if (n.symbol === "tank") {
            attrs.tankShell = { visibility: depth ? "visible" : "hidden" };
            const stubs = screenPorts(n).map(({ x, y }) => {
              const px = x * 2.2,
                py = y * 3;
              const insideX = Math.max(25, Math.min(195, px));
              const insideY = Math.max(25, Math.min(265, py));
              return `M${px} ${py}L${insideX} ${insideY}`;
            });
            attrs.tankStubs = {
              d: monitor || depth
                ? stubs.join(" ")
                : "M0 150H25M195 150H220M110 0V25M110 265V300",
              stroke: n.style.stroke,
            };
          }
        } else if (n.symbol === "readout") {
          const reading = screenDisplay(n, p.points, p.doc.mappings);
          const monitor = n.params.appearance === "monitor";
          const inline = n.params.appearance === "inline";
          const title = (n.params.icon ? n.params.icon + " " : "") + n.title;
          const separate = !!n.params.separateUnit && !monitor && !inline;
          const numeric = reading.value === null ? "—" : reading.value.toFixed(n.params.precision);
          const sx = n.w / 300, k = Math.min(sx, n.h / 150);
          const ux = 20 + (numeric.length * n.style.fontSize * .57 * k + 8) / sx;
          const valueX = inline ? 2 / sx : monitor ? 150 : 20;
          const valueY = inline ? 75 : monitor ? 142 : 93;
          const quality = screenQualityLabels[reading.quality] || "未绑定";
          const valueText = reading.quality === "good" ? reading.text : "— · " + quality;
          attrs = {
            body: {
              fill: inline ? "transparent" : n.style.fill,
              stroke: inline ? "none" : monitor ? "#49b9e5" : n.style.stroke,
              x: monitor ? 103 : 0,
              y: monitor ? 40 : 0,
              width: monitor ? 94 : 300,
              height: monitor ? 70 : 150,
              transform: monitor ? screenArtworkAt(n, 150, 75) : "",
            },
            stubs: {
              stroke: n.style.stroke,
              visibility: monitor ? "visible" : "hidden",
            },
            caption: {
              text: title,
              visibility: inline ? "hidden" : "visible",
              x: monitor ? 150 : 20,
              y: monitor ? 83 : 32,
              textAnchor: monitor ? "middle" : "start",
              fontSize: monitor ? 24 : 13/Math.min(n.w/300,n.h/150),
              transform: monitor ? screenArtworkAt(n, 150, 75) : screenArtworkAt(n,20,32),
            },
            value: {
              text: inline ? title + " · " + valueText : separate ? numeric : reading.text,
              fill: n.style.color,
              fontSize: inline ? n.style.fontSize / k : n.style.fontSize,
              x: valueX,
              y: valueY,
              textAnchor: monitor ? "middle" : "start",
              dominantBaseline: inline ? "central" : "auto",
              transform: screenArtworkAt(n, valueX, valueY),
            },
            quality: {
              text: quality,
              visibility: inline || monitor || (n.params.compact && reading.quality === "good") ? "hidden" : "visible",
            },
            unit:{text:' '+reading.unit,visibility:separate?'visible':'hidden',x:ux,y:93,fontSize:13/k,fill:n.style.color,transform:screenArtworkAt(n,ux,93)},
          };
        } else if (n.symbol === "checkValve") {
          attrs = {
            body: { fill: n.style.fill, stroke: n.style.stroke },
            stubs: { stroke: n.style.stroke },
          };
        } else if (n.symbol === "junction") {
          const detailed = ["detailed","depth"].includes(n.params.appearance);
          const process=n.params.appearance==='process';
          const connected=new Set(p.doc.pipes.flatMap(e=>[e.source,e.target]).filter(end=>end.nodeId===n.id).map(end=>end.portId));
          const ends={left:[0,10],right:[20,10],top:[10,0],bottom:[10,20]};
          attrs = {junctionLinks:{d:process?[...connected].filter(k=>ends[k]).map(k=>`M${ends[k].join(' ')}L10 10`).join(' '):'',stroke:n.style.fill},body: {
            fill: n.style.fill,stroke: n.style.stroke,
            r: process?2.5:detailed ? 6 : 8,strokeWidth:process?0:detailed ? 1.5 : 2,
          } };
        } else if (["rect", "ellipse", "text", "button"].includes(n.symbol)) {
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
          if (n.symbol === "tank" && n.params.appearance === "monitor")
            attrs.caption.visibility = "visible";
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
          const guarded = waterEquipment[n.symbol]
            ? !['运行','停止','只读监视'].includes(equipmentStatus(n,p.points))
            : ["pump", "fan", "valve", "status"].includes(n.symbol) && ["故障", "未知"].includes(screenState(n, p.points));
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
          const inlineReadout = n.symbol === "readout" && n.params.appearance === "inline";
          if (dynamic.text !== undefined && !guarded && !inlineReadout && attrs[textSelector])
            attrs[textSelector].text = dynamic.text;
          if (dynamic.color) {
            for (const key of ["label", "caption", "value", "state"])
              if (attrs[key]) attrs[key].fill = dynamic.color;
          }
        }
        if (
          attrs?.body &&
          ["pump", "fan", "valve", "tank", "readout", "checkValve"].includes(n.symbol)
        ) {
          const detailed = ["detailed","depth"].includes(n.params.appearance);
          attrs.body.style = {
            filter: detailed ? "drop-shadow(0px 2px 2px #304c5d33)" : "none",
          };
          attrs.body.strokeWidth = detailed ? 2 : 3;
          if (n.params.appearance === "depth" && n.symbol === "readout") {
            attrs.body.rx=8;
            attrs.body.style.filter="drop-shadow(2px 3px 2px #00000033)";
          } else if(n.symbol === "readout") attrs.body.rx=0;
          if (n.symbol === "tank" && !n.params.waterColor && !n.params.theme)
            attrs.body.fill = "#edf2f5";
          if (n.params.appearance === "detailed" && /^#[\da-f]{6}$/i.test(attrs.body.fill))
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
          ["pump", "fan", "valve", "tank"].includes(n.symbol) &&
          n.params.appearance !== "monitor"
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
          attrs.caption.transform=n.params.appearance === "depth"
            ? screenArtworkAt(n,screenSymbols[n.symbol].w/2,attrs.caption.y) : "";
        }
        if (attrs && screenAppearanceOptions(n.symbol).picture && !waterEquipment[n.symbol]) {
          const depth = n.params.appearance === "depth";
          const image = depth
            ? screenDepthArtwork[n.symbol]
            : n.params.appearance === "picture" && n.image;
          const def = screenSymbols[n.symbol];
          attrs.body.visibility = image ? "hidden" : "visible";
          if (attrs.rotor)
            attrs.rotor.visibility =
              image || n.params.appearance === "monitor" ? "hidden" : "visible";
          attrs.devicePicture = {
            "xlink:href": image || "",
            visibility: image ? "visible" : "hidden",
            transform: screenArtworkAt(n, def.w / 2, def.h / 2),
          };
          const pictureBounds = {
            pump: [31,35,108,90], fan: [31,35,108,90],
            valve: [25,25,100,86], checkValve: [17,6,66,48],
          }[n.symbol];
          const bounds = depth ? {
            pump: [12,33,146,86], fan: [12,33,146,86],
            valve: [17,15,116,90], checkValve: [10,4,80,52],
          }[n.symbol] : pictureBounds;
          if (bounds) {
            const [x,y,width,height]=bounds;
            Object.assign(attrs.devicePicture,{x,y,width,height});
          }
          if (depth && n.symbol === "valve") {
            const state=screenState(n,p.points);
            Object.assign(attrs.state,{
              fill: state === "故障" ? "#ff6565" : state === "开启" ? "#14855f" : n.style.color,
              transform:screenArtworkAt(n,75,138),
            });
            attrs.caption.transform=screenArtworkAt(n,75,attrs.caption.y);
          }
          if (n.symbol === "valve") {
            if (!depth) attrs.state.transform="";
            attrs.stubs.d="M0 70H30M120 70H150M75 70V20M56 20H94";
          }
          if (depth && bounds) attrs.stubs.d=screenPictureStubs(n,bounds);
          if (!depth && n.symbol === "checkValve") attrs.stubs.d="M0 30H30M70 30H100";
          if (n.params.appearance === "monitor")
            attrs.caption.visibility = "visible";
        }
        // Decorative overlays must not block equipment details in the published view.
        const decorative=['text','rect','ellipse','polygon','line','polyline','image'].includes(n.symbol);
        const passive=(n.action?.type??screenDefaultAction(n))==='none';
        cell.attr('root/pointerEvents',!p.editing&&decorative&&passive?'none':'auto');
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
        cell.attr("root/data-proposed",p.proposalIds?.includes(n.id)?"true":"false");
        const point = screenPoint(n, p.points, "flow"),
          dynamic = screenRuleProjection(n, p.points),
          flowing =
            (dynamic.flow ?? (point?.quality === "good" && point.value === true))&&n.style.animateFlow!==false;
        dynamic.visible === false && !p.editing ? cell.hide() : cell.show();
        const detailed = n.style.appearance === "detailed";
        const depth = n.style.appearance === "depth";
        const process=n.style.appearance==='process';
        const attrs = {
          rim: {
            stroke: process && n.style.pattern !== "dashed" ? p.doc.canvas.background : depth ? "#233947" : "none",
            strokeWidth: n.style.width + 2,strokeLinecap:"round",strokeLinejoin:"round",
          },
          line: {
            stroke: dynamic.fill || n.style.color,
            strokeWidth: n.style.width,strokeLinecap:"round",strokeLinejoin:"round",
            strokeDasharray: n.style.pattern === "dashed" ? "7 6" : "none",
            sourceMarker: null,
            targetMarker: null,
          },
          highlight: {
            stroke: detailed || depth ? "#ffffff" : "none",
            strokeOpacity: depth ? 0.27 : 0.13,
            strokeWidth: Math.max(1, n.style.width * (depth ? 0.32 : 0.54)),
          },
          flow: {
            stroke: flowing && n.style.pattern !== "dashed" ? n.style.flowColor || "#36c2ff" : "none",
            strokeWidth: Math.max(1, n.style.width * 0.46),
            strokeDasharray: process?"2 18":"12 8",
            strokeOpacity:process?.6:1,
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
          n.style.appearance,
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
                    d: n.style.appearance==='process'?(direction===1?"M-5 -3L0 0L-5 3":"M5 -3L0 0L5 3"):direction === 1 ? "M-8 -5L0 0L-8 5" : "M8 -5L0 0L8 5",
                    fill: "none",
                    stroke: n.style.color,
                    strokeWidth: n.style.appearance==='process'?1.5:3,
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
  moveEventPage(id, move) {
    const p = this.props();
    const n = p.doc.nodes.find((node) => node.id === id);
    const entry = this.charts.get(id);
    const pager = entry?.pager;
    if (p.editing || !n || !pager?.point) return;
    const page = move === "latest" ? 1 : pager.page + move;
    if (page < 1 || page > pager.pages || page === pager.page) return;
    const focused = document.activeElement;
    pager.page = page;
    pager.snapshot = page === 1 ? null : pager.snapshot || {
      point: pager.point,
      signature: JSON.stringify(pager.point.value),
      checked: pager.point.value,
      updated: false,
    };
    entry.host.scrollTop = 0;
    this.projectChart(n, entry);
    if (pager.nav.contains(focused) && (focused.disabled || focused.hidden))
      (pager.next.disabled ? pager.previous : pager.next).focus();
  }
  projectChart(n, entry) {
    const p = this.props(),
      dynamic = screenRuleProjection(n, p.points);
    entry.heading.textContent = dynamic.text ?? n.title;
    entry.heading.style.display=n.params.compact?'none':'';
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
    if(screenControlKinds.has(n.symbol)){projectScreenControl(n,entry,p,data=>this.emit('control',data));return;}
    if (screenTableKinds.has(n.symbol)) {
      entry.card.classList.toggle("is-compact", n.params.compact || n.h < 180);
      const showDevice = n.symbol === "events" && !!n.params.deviceRefField;
      const pager = entry.pager;
      const binding = n.bindings[screenRoleSlot(n, "value")?.key];
      const point = p.points[binding];
      if (pager) {
        const active = !p.editing && point?.quality === "good" && Array.isArray(point.value);
        if (!active || pager.sourceVersion !== p.sourceVersion || pager.binding !== binding) {
          pager.page = 1;
          pager.snapshot = null;
        }
        pager.sourceVersion = p.sourceVersion;
        pager.binding = binding;
        pager.point = active ? point : null;
      }
      const snapshot = pager?.snapshot;
      if (snapshot && !snapshot.updated && snapshot.checked !== point.value) {
        snapshot.checked = point.value;
        snapshot.updated = JSON.stringify(point.value) !== snapshot.signature;
      }
      const shown = snapshot ? { [binding]: snapshot.point } : p.points;
      const data = screenTableResult(n, shown, p.doc.mappings, p.doc.nodes, pager?.page),
        key = JSON.stringify([data, n.params, p.editing]);
      if (pager) {
        pager.page = data.page;
        pager.pages = data.pages;
        pager.nav.hidden = !pager.point || data.pages < 2;
        pager.previous.disabled = data.page <= 1;
        pager.next.disabled = data.page >= data.pages;
        pager.latest.hidden = !pager.snapshot;
        const status = `第 ${data.page} / ${data.pages} 页 · ${data.total} 条` +
          (snapshot ? " · 查阅快照" : "") +
          (snapshot?.updated ? " · 实时列表有更新" : "");
        if (pager.status.textContent !== status) pager.status.textContent = status;
      }
      entry.quality.textContent = data.quality + " · " + data.total + " 行";
      entry.quality.style.display =
        (n.params.compact || (pager && !pager.nav.hidden)) && data.quality === "有效" ? "none" : "";
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
      if (showDevice) {
        const th = document.createElement("th");
        th.textContent = "设备";
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
        if (showDevice) {
          const td = document.createElement("td");
          if (row.device && !p.editing) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "screen-event-device";
            button.textContent = "查看";
            button.setAttribute("aria-label", "查看设备 " + row.device.title);
            button.onclick = (event) => {
              event.stopPropagation();
              this.emit("faceplate", row.device.id);
            };
            td.append(button);
          } else td.textContent = "—";
          tr.append(td);
        }
        body.append(tr);
      }
      if (!data.rows.length) {
        const tr = document.createElement("tr"),
          td = document.createElement("td");
        td.colSpan = Math.max(1, data.columns.length + Number(showDevice));
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
      p.windows?.[n.id]?{...n,params:{...n.params,windowSeconds:p.windows[n.id],rangeActive:true}}:n,
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
      entry.quality.style.display=n.params.compact&&!/无效|未知|未绑定|过期|离线|待/.test(result.quality)?'none':'';
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
    "proposalIds",
    "diagnosticTarget",
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
    const demoValues=ref({}),windows=ref({}),controlError=ref({});
    const runtimePoints=computed(()=>Object.fromEntries(Object.entries(props.points).map(([id,p])=>[id,p.quality==='good'&&Object.hasOwn(demoValues.value,id)?{...p,value:demoValues.value[id]}:p])));
    const graphProps=()=>({...props,points:runtimePoints.value,windows:windows.value,controlError:controlError.value});
    watch(()=>[props.editing,props.sourceVersion,props.doc.title],()=>{demoValues.value={};windows.value={};controlError.value={};});
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
    const faceplateType = computed(() => {
      const symbol = object.value?.symbol;
      if (symbol === "pump" || symbol === "fan") return "转动设备";
      if (Object.hasOwn(screenPidSymbols,symbol)) return screenPidSymbols[symbol].label;
      if (waterEquipment[symbol]) return waterEquipment[symbol].label;
      if (symbol === "valve" || symbol === "checkValve") return "阀门";
      if (["tank", "readout", "gauge", "barGauge"].includes(symbol)) return "模拟量仪表";
      return "测点详情";
    });
    const status = computed(() =>
      waterEquipment[object.value?.symbol] ? equipmentStatus(object.value,runtimePoints.value) : object.value && ["pump", "fan", "valve"].includes(object.value.symbol)
        ? screenState(object.value, runtimePoints.value)
        : "",
    );
    const fields = computed(() =>
      object.value
        ? screenSlots(object.value).map((slot) => {
            const point = runtimePoints.value[object.value.bindings[slot.key]],
              map = props.doc.mappings.find(
                (m) => m.id === object.value.bindings[slot.key],
              );
            return {
              key: slot.key,
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
    const fieldSections = computed(() => {
      const parts = waterEquipment[object.value?.symbol]?.sections;
      if (!parts) return [{ id: "readings", fields: fields.value }];
      const byKey = new Map(fields.value.map(field => [field.key, field]));
      const sections = parts.map(part => {
        const rows = part.slots.map(key => {
          const field = byKey.get(key);
          byKey.delete(key);
          return field;
        }).filter(Boolean);
        return { ...part, fields: rows };
      }).filter(part => part.fields.length);
      if (byKey.size) sections.push({ id: "extras", label: "其他测点", fields: [...byKey.values()] });
      return sections;
    });
    const dispatch = (event, data) => {
      if(event==='control'){
        try{const result=screenControlTransition(props.doc,runtimePoints.value,data);
          if(result.updates)demoValues.value={...demoValues.value,...result.updates};
          if(result.window)windows.value={...windows.value,[result.window.id]:result.window.seconds};
          controlError.value={...controlError.value,[data.id]:''};
        }catch(error){controlError.value={...controlError.value,[data.id]:error.message};}
        adapter?.project();return;
      }
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
      adapter = new ScreenGraph(host.value, graphProps, dispatch);
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
    watch(() => props.diagnosticTarget, (target, previous) => {
      const graph = adapter?.graph;
      for (const [id, active] of [[previous, false], [target, true]]) {
        const cell = id && graph?.getCellById(id);
        if (cell) graph.findViewByCell(cell)?.container.classList.toggle("screen-diagnostic-target", active);
      }
    }, { flush: "post" });
    watch(
      () => [runtimePoints.value, props.sequence, props.sourceVersion,windows.value],
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
      runtimePoints,
      object,
      faceplateType,
      status,
      fieldSections,
      faceplate,
      pointObject,
      startPoint,
      selectedPipe,
      trendMode,
    };
  },
  template: `<div class="screen-stage" :class="{'is-design':editing,'is-connecting':editing&&(tool==='pipe'||selectedPipe)}"><div ref="host" class="screen-graph"></div><svg v-if="pointObject" class="screen-point-overlay" width="1920" height="1080"><g :transform="'translate('+pointObject.x+' '+pointObject.y+') rotate('+pointObject.angle+' '+pointObject.w/2+' '+pointObject.h/2+')'"><circle v-for="(point,i) in pointObject.points" :key="i" :cx="point.x*pointObject.w/100" :cy="point.y*pointObject.h/100" r="6" :data-shape-point="i" :aria-label="'图形顶点 '+(i+1)" @mousedown="startPoint($event,i)" /></g></svg><div v-if="!doc.nodes.length&&!doc.pipes.length&&editing" class="screen-empty"><b>从空白画布开始设计</b><span v-if="doc.canvas.purpose==='cockpit'">从左侧放入指标、图表或状态组件，再到右侧绑定测点。</span><span v-else>拖入设备或成套工艺单元，再连接接口并绑定测点。</span></div><section v-if="object&&!editing" class="screen-faceplate" :class="{'is-dark':doc.canvas.theme==='cockpit-dark'}" role="dialog" :aria-label="object.title+' 设备详情'"><header><div><small>{{faceplateType}}<template v-if="object.params.equipmentCode && object.params.equipmentCode !== object.title"> · {{object.params.equipmentCode}}</template> · 只读监视</small><b>{{object.title}}</b></div><button @click="faceplate=''">关闭详情</button></header><strong v-if="status" :data-state="status">{{status}}</strong><screen-runtime-trend v-if="trendMode" :key="object.id+':'+sourceVersion" :item="object" :doc="doc" :points="runtimePoints" :sequence="sequence"></screen-runtime-trend><section v-for="part in fieldSections" :key="part.id" class="faceplate-part"><h3 v-if="part.label">{{part.label}}</h3><dl><div v-for="field in part.fields" :key="field.key"><dt>{{field.label}}</dt><dd>{{field.value}} <small>{{field.quality}}</small></dd></div></dl></section></section></div>`,
};
