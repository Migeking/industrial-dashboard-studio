import { nativeCss, nativeClone, nativePoint, nativeText } from "./native-model.mjs";
import { beginEquipmentOperation, equipmentOperationProblem, updateEquipmentOperation } from "./equipment-operation.mjs";

const NativeTrend = {
  props: ["node", "doc", "points", "sequence"],
  setup(p) {
    const host = Vue.ref();
    let chart, observer;
    const history = new Map();
    function update() {
      if (!chart) return;
      const option = nativeClone(p.node.chart.options);
      const rows = p.node.chart.series.map((s) => {
        const point = p.points[p.node.bindings[s.slot]];
        if (point?.quality !== "good") return [];
        if (Array.isArray(point.value)) return point.value.filter((r) => ["string", "number"].includes(typeof r.time) && r.value != null && r.value !== "" && Number.isFinite(Number(r.value)));
        const values = history.get(s.slot) || [];
        if (!values.length || values.at(-1).sequence !== p.sequence) values.push({ time: new Date(point.receivedAt).toLocaleTimeString("zh-CN", { hour12: false }), value: point.value, sequence: p.sequence });
        if (values.length > 120) values.shift();
        history.set(s.slot, values);
        const axis = option.yAxis[s.axis], mapping = p.doc.mappings.find((m) => m.id === p.node.bindings[s.slot]);
        // A live point may use a different engineering unit/range than the
        // template history. Keep its samples visible after the user rebinds it.
        delete axis.min; delete axis.max;
        axis.scale = true;
        axis.name = mapping?.unit || "";
        return values;
      });
      option.animation = false;
      const times = [...new Set(rows.flatMap((r) => r.map((v) => v.time)))].sort();
      option.xAxis[0].data = times;
      option.series = p.node.chart.series.map((s, i) => { const values = new Map(rows[i].map((r) => [r.time, Number(r.value)])); return { ...option.series[i], name: s.name, type: s.type, yAxisIndex: s.axis, data: times.map((t) => values.get(t) ?? null) }; });
      option.legend[0].data = p.node.chart.series.map((s) => s.name);
      chart.setOption(option, true);
    }
    Vue.onMounted(() => { chart = echarts.init(host.value); observer = new ResizeObserver(() => chart.resize()); observer.observe(host.value); update(); });
    Vue.watch(() => [p.sequence, p.points, JSON.stringify(p.node.chart), JSON.stringify(p.node.bindings)], update);
    Vue.watch(() => JSON.stringify(p.node.bindings), () => { history.clear(); update(); });
    Vue.onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose(); });
    return () => Vue.h("div", { ref: host, style: "width:100%;height:100%", "data-native-chart": p.node.id });
  },
};

const nativeOverlayCss = `
[data-native-id]{box-sizing:border-box}.native-selected{outline:2px solid #87e1bc!important;outline-offset:-2px}.native-editing [data-editable]{cursor:move}.native-unknown{fill:#708594!important;stroke:#708594!important;color:#708594!important}.native-fault{color:#ff5d5d!important}.native-trend{width:100%;height:100%}
.native-data-invalid .flow-active,.native-data-invalid .bubble{animation-play-state:paused;opacity:.35}.native-data-invalid .equipment-dot{fill:#708594}
.native-source{position:absolute;bottom:0;right:0;z-index:9;background:#07131c;color:#8ba3b5;padding:3px 8px;font:10px 'Microsoft YaHei',sans-serif;pointer-events:none}
.native-faceplate{position:absolute;left:640px;top:220px;width:370px;z-index:40;color:#f2f7fa;background:#0b1a27;border:1px solid #31566d;border-radius:8px;box-shadow:0 22px 70px #000a;font:12px 'Microsoft YaHei',sans-serif}.native-faceplate header{display:flex;justify-content:space-between;align-items:center;padding:12px;background:#122b3c;border-bottom:1px solid #284355}.native-faceplate section{margin:12px;padding:12px;border:1px solid #284355;background:#071420;border-radius:6px}.native-faceplate h5{margin:0 0 10px;color:#8ba3b5}.native-faceplate p{line-height:1.6}.native-faceplate button,.native-faceplate input{font:inherit;background:#142b3b;border:1px solid #31566d;border-radius:4px;color:#eef7fc;padding:7px 12px;cursor:pointer}.native-faceplate button:disabled{opacity:.4;cursor:default}.native-faceplate button.active{border-color:#36c2ff;color:#36c2ff}.native-faceplate .native-row{display:flex;gap:10px;justify-content:space-between;align-items:center}.native-faceplate strong{display:block;font-size:18px;margin-top:5px;color:#36c2ff}.native-faceplate .native-help{font-size:11px;color:#8ba3b5}.native-confirm{position:absolute;inset:0;display:grid;place-items:center;background:#020a12b8;z-index:50}.native-confirm .native-faceplate{position:relative;left:auto;top:auto;width:440px}.native-confirm .native-actions{display:flex;justify-content:flex-end;gap:10px;padding:12px}.native-faceplate .native-error{color:#ffb547}.native-faceplate .native-stop{color:#ff8d8d}.native-faceplate .native-start{color:#35d07f}
`;

const NativeTree = {
  props: ["doc", "points", "editing", "selected", "sequence", "clock", "connection"],
  emits: ["select", "patch", "move", "start", "geometry"],
  setup(p, { emit }) {
    const ui = Vue.reactive({ scenario: p.doc.demo?.initial || "stable", audit: p.doc.source.demo && p.doc.source.kind === "json" ? nativeClone(p.doc.demo?.audit || []) : [], ack: false, active: "", pid: false, pending: null, frequency: 35, setpoint: 3.2, error: "" });
    const stopOperation = Vue.shallowRef(null);
    let root, dragging, frame, stopTimers = [];
    const stopPending = () => ["submitted", "accepted", "unconfirmed"].includes(stopOperation.value?.status);
    const stopStatus = (operation) => ({
      submitted: "已提交，等待模拟服务回执",
      accepted: "模拟服务已接收，等待停机反馈",
      confirmed: operation.late ? "模拟停机反馈已确认（晚于超时）" : "模拟停机反馈已确认",
      rejected: "模拟服务拒绝" + (operation.reason ? " · " + operation.reason : ""),
      unconfirmed: "结果待确认，请查看最新有效反馈",
    })[operation.status];
    const byId = () => new Map(p.doc.nodes.map((n) => [n.id, n]));
    const runtime = () => ({ ...ui, clock: p.clock, byId: byId() });
    const point = (id, slot) => nativePoint({ node: id, slot }, p.doc, p.points, runtime());
    const demo = () => p.doc.source.demo === true && p.doc.source.kind === "json";
    function log(target, action, oldVal, newVal, sbo = true) {
      ui.audit.unshift({ time: new Date().toLocaleTimeString("zh-CN", { hour12: false }), user: "DEMO", target, action, oldVal, newVal, sbo, result: "演示已执行" });
      ui.audit.splice(100);
    }
    function action(a) {
      if (p.editing || ui.pending) return;
      ui.error = "";
      if (a.type === "scenario") {
        if (!demo()) return;
        const mode = p.doc.demo.scenarios.find((m) => m.id === a.target);
        if (mode) { ui.scenario = mode.id; emit("patch", nativeClone(mode.data)); }
      } else if (a.type === "faceplate") {
        ui.active = a.target;
        ui.frequency = point(a.target, "frequency").value || 35;
      } else if (a.type === "pid") { ui.pid = true; ui.active = a.target; const q = point(a.target, a.slot); ui.setpoint = q.quality === "good" ? q.value : ""; }
      else if (demo()) { if (a.type === "ack") ui.ack = true; log("ALARM-SYS", a.type === "ack" ? "确认告警" : "警报消音", "未处理", "已处理", false); }
    }
    function stopContext(node) {
      const feedback = node && point(node.id, "run");
      return {
        permitted: !p.editing && demo() && !!node,
        interlocked: false,
        pointId: node?.bindings.run,
        sequence: p.sequence,
        feedback,
      };
    }
    function clearStopTimers() {
      for (const timer of stopTimers) clearTimeout(timer);
      stopTimers = [];
    }
    function stopEvent(event) {
      const next = updateEquipmentOperation(stopOperation.value, { ...event, at: performance.now() });
      if (next === stopOperation.value) return;
      stopOperation.value = next;
      const entry = ui.audit.find((row) => row.operationId === next.id);
      if (entry) entry.result = stopStatus(next);
      if (["confirmed", "rejected"].includes(next.status)) clearStopTimers();
    }
    function performDemoStop(req, n) {
      const started = beginEquipmentOperation(req.intent, stopContext(n), performance.now(), 3000);
      clearStopTimers();
      stopOperation.value = started;
      ui.audit.unshift({
        operationId: started.id, time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        user: "DEMO", target: n.title, action: "停止设备", oldVal: "运行", newVal: "停机",
        sbo: true, result: stopStatus(started),
      });
      ui.audit.splice(100);
      const check = () => {
        const node = byId().get(req.target);
        if (!node || req.source !== JSON.stringify(p.doc.source) || req.bindings !== JSON.stringify(node.bindings))
          return "设备绑定或演示数据已变化";
        if (["fault", "auto"].some((slot) => point(node.id, slot).quality !== "good"))
          return "设备反馈无效";
        return equipmentOperationProblem(started, stopContext(node));
      };
      // The loopback simulator supplies a receipt and then a separate feedback update.
      stopTimers.push(setTimeout(() => {
        const reason = check();
        stopEvent({ type: "receipt", id: started.id, accepted: !reason, reason });
      }, 240));
      stopTimers.push(setTimeout(() => {
        if (stopOperation.value?.status !== "accepted") return;
        const reason = check();
        if (reason) {
          stopEvent({ type: "receipt", id: started.id, accepted: false, reason });
          return;
        }
        emit("patch", { [n.bindings.run]: false, [n.bindings.frequency]: 0, [n.bindings.current]: 0 });
      }, 900));
      stopTimers.push(setTimeout(() => stopEvent({ type: "timeout" }), Math.ceil(started.deadline - performance.now())));
    }
    Vue.watch(() => p.sequence, () => {
      const operation = stopOperation.value;
      if (!stopPending()) return;
      const node = byId().get(operation.deviceId);
      const state = stopContext(node);
      stopEvent({ type: "feedback", sequence: state.sequence, pointId: state.pointId,
        quality: state.feedback?.quality, value: state.feedback?.value });
    });
    function request(kind, value) {
      ui.error = "";
      if (stopPending() || ui.pending) return;
      if (!demo()) { ui.error = "当前为只读数据，设备操作仅供查看。"; return; }
      const n = byId().get(ui.active);
      if (kind === "setpoint" && point(n.id, "value").quality !== "good") { ui.error = "设定值反馈无效，请恢复数据后重试。"; return; }
      if (kind !== "setpoint") {
        const run = point(n.id, "run"), fault = point(n.id, "fault"), auto = point(n.id, "auto");
        if ([run, fault, auto].some((q) => q.quality !== "good")) { ui.error = "设备反馈无效，无法执行演示操作。"; return; }
        if (kind === "start" && fault.value) { ui.error = "设备故障，不能启动。"; return; }
        if (kind === "frequency" && auto.value) { ui.error = "请先切到远程手动。"; return; }
      }
      if ((kind === "frequency" && (!Number.isFinite(value) || value < 28 || value > 50)) || (kind === "setpoint" && (!Number.isFinite(value) || value < 2 || value > 4))) { ui.error = "设定值超出允许范围。"; return; }
      const intent = kind === "stop" ? {
        id: crypto.randomUUID(), deviceId: n.id, pointId: n.bindings.run,
        previous: true, target: false, confirmBy: performance.now() + 15000,
      } : null;
      if (intent) {
        const problem = equipmentOperationProblem(intent, stopContext(n));
        if (problem) { ui.error = problem; return; }
      }
      ui.pending = { kind, value, intent, target: ui.active, source: JSON.stringify(p.doc.source), bindings: JSON.stringify(n?.bindings), message: ({ start: "启动这台回流泵", stop: "停止这台回流泵", auto: "切换为远程自动", manual: "切换为远程手动", frequency: "修改频率为 " + value + " Hz", setpoint: "修改液位设定为 " + value + " m" })[kind] };
    }
    function confirm() {
      const req = ui.pending;
      ui.pending = null;
      if (!req || !demo() || req.source !== JSON.stringify(p.doc.source)) return;
      const n = byId().get(req.target), changes = {};
      if (!n || req.bindings !== JSON.stringify(n.bindings) || (req.kind === "setpoint" ? point(n.id, "value").quality !== "good" : ["run", "fault", "auto"].some((s) => point(n.id, s).quality !== "good"))) { ui.error = "反馈或绑定已变化，请重新操作。"; return; }
      const put = (slot, value) => { changes[n.bindings[slot]] = value; };
      if (req.kind === "start") { if (point(n.id, "fault").value) { ui.error = "设备故障，不能启动。"; return; } put("run", true); put("frequency", ui.frequency); put("current", 18); }
      if (req.kind === "stop") {
        try { performDemoStop(req, n); } catch (e) { ui.error = e.message; }
        return;
      }
      if (["auto", "manual"].includes(req.kind)) put("auto", req.kind === "auto");
      if (req.kind === "frequency") { if (point(n.id, "auto").value) return; put("frequency", req.value); }
      if (req.kind === "setpoint") { put("value", req.value); ui.pid = false; ui.active = ""; }
      emit("patch", changes);
      log(n?.title || "LIC-101", req.message, "演示原值", String(req.value ?? "已切换"));
    }
    function select(event) {
      if (!p.editing) return;
      let el = (!event.altKey && event.target.closest?.("[data-business-device]")) || event.target.closest?.("[data-native-id]");
      while (el && !byId().get(el.dataset.nativeId)?.editable) el = el.parentElement?.closest("[data-native-id]");
      if (!el) { emit("select", null); return; }
      let n = byId().get(el.dataset.nativeId);
      if (n.action?.type === "faceplate") n = byId().get(n.action.target) || n;
      emit("select", { id: n.id, shiftKey: event.shiftKey });
      if (!n.locked && event.button === 0) {
        const scale = root.getBoundingClientRect().width / 1920;
        const svgScale = el.ownerSVGElement ? el.parentElement.getScreenCTM()?.a : scale;
        dragging = { id: n.id, x: event.clientX, y: event.clientY, scale: Math.abs(svgScale || scale), started: false };
      }
      event.preventDefault();
    }
    function move(event) {
      if (!dragging || !p.editing) return;
      const dx = (event.clientX - dragging.x) / dragging.scale, dy = (event.clientY - dragging.y) / dragging.scale;
      if (!dragging.started && Math.abs(dx) + Math.abs(dy) < 3) return;
      if (!dragging.started) { emit("start"); dragging.started = true; }
      emit("move", { id: dragging.id, dx, dy });
      dragging.x = event.clientX; dragging.y = event.clientY;
    }
    Vue.onMounted(() => { window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); });
    function up() { dragging = null; }
    Vue.onBeforeUnmount(() => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      cancelAnimationFrame(frame);
      clearStopTimers();
    });
    function geometry() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!root) return;
        const b = root.getBoundingClientRect(), scale = b.width / 1920, rects = {};
        root.querySelectorAll("[data-native-id]").forEach((el) => { const r = el.getBoundingClientRect(), matrix = el.ownerSVGElement ? el.parentElement.getScreenCTM?.() : null; rects[el.dataset.nativeId] = { x: (r.x - b.x) / scale, y: (r.y - b.y) / scale, w: r.width / scale, h: r.height / scale, svg: !!matrix, sx: matrix ? Math.abs(matrix.a / scale) : 1, sy: matrix ? Math.abs(matrix.d / scale) : 1 }; });
        emit("geometry", rects);
      });
    }
    function renderNode(n, index) {
      const attrs = { ...n.attrs, key: n.id, "data-native-id": n.id, "data-editable": n.editable ? "true" : undefined, "data-business-device": ["device", "equipment"].includes(n.role) ? n.id : undefined };
      const cls = [attrs.class || "", p.editing && p.selected.includes(n.id) ? "native-selected" : ""];
      for (const [key, spec] of Object.entries(n.rules || {})) {
        const q = nativePoint(spec, p.doc, p.points, runtime());
        if (key === "class") cls.push(q.quality === "good" ? q.value : "native-unknown");
        else attrs[key] = q.quality === "good" ? q.value : key === "y" ? 384 : 0;
      }
      attrs.class = cls.join(" ");
      const layout = n.layout || {}, style = { ...n.style };
      if (layout.width) style.width = layout.width + "px";
      if (layout.height) style.height = layout.height + "px";
      if (layout.absolute) { style.position = "absolute"; style.left = (layout.x || 0) + "px"; style.top = (layout.y || 0) + "px"; style.zIndex = 6; }
      if (layout.dx || layout.dy || layout.scaleX || layout.scaleY) {
        if (["g", "text", "path", "rect", "circle"].includes(n.tag)) attrs.transform = `translate(${layout.dx || 0},${layout.dy || 0}) ` + (attrs.transform || "") + ` scale(${layout.scaleX || 1},${layout.scaleY || 1})`;
        else style.transform = `translate(${layout.dx || 0}px,${layout.dy || 0}px)`;
      }
      attrs.style = [attrs.style, style];
      if (n.hidden) attrs.style.push({ display: "none" });
      if (n.action) attrs.onClick = () => action(n.action);
      if (!n.parentId) { attrs.ref = (el) => { root = el; }; attrs.onPointerdown = select; attrs.class += p.editing ? " native-editing" : ""; if (Object.values(p.points).some((q) => q.quality !== "good")) attrs.class += " native-data-invalid"; }
      let children;
      if (n.role === "events") {
        const rows = point(n.id, "rows");
        children = rows.quality === "good" && Array.isArray(rows.value) ? rows.value.map((row) => Vue.h("div", { class: "alarm-item" }, [Vue.h("i", { style: row.level === "warning" ? "--level:#ffb547" : "" }), Vue.h("div", {}, [Vue.h("b", {}, row.title), Vue.h("span", {}, row.detail)]), Vue.h("time", { class: "num" }, row.time)])) : [Vue.h("span", { style: "font-size:12px;color:#8ba3b5" }, "暂无有效事件数据")];
      }
      else if (n.role === "auditRows") children = ui.audit.map((log) => Vue.h("tr", {
        "data-operation-id": log.operationId, title: log.operationId,
      }, ["time", "user", "target", "action", "oldVal", "newVal", "sbo", "result"].map((k) => Vue.h("td", { class: k === "time" ? "num" : "" }, k === "sbo" ? log[k] ? "两步确认通过" : "直接下发" : String(log[k])))));
      else if (n.type === "trend") children = [Vue.h(NativeTrend, { node: n, doc: p.doc, points: p.points, sequence: p.sequence })];
      else children = n.content.map((part) => part?.child ? renderNode(index.get(part.child), index) : nativeText(part, p.doc, p.points, runtime()));
      return Vue.h(n.tag, attrs, children);
    }
    function overlays() {
      const h = Vue.h, n = byId().get(ui.active), q = (key) => point(n.id, key), fmt = (key, unit) => q(key).quality === "good" ? Number(q(key).value).toFixed(1) + " " + unit : "—";
      const btn = (text, fn, disabled = false, cls = "") => h("button", { onClick: fn, disabled, class: cls }, text);
      const controlDisabled = !demo() || stopPending();
      const operation = stopOperation.value;
      const section = (title, content) => h("section", {}, [h("h5", {}, title), ...content]);
      const result = [];
      if (n || ui.pid) result.push(h("div", { class: "native-faceplate", role: "dialog", "aria-label": ui.pid ? "液位回路面板" : "设备面板" }, [
        h("header", {}, [h("b", {}, ui.pid ? "LIC-101 · 液位 PID 调节回路" : n.title), btn("关闭面板", () => { ui.active = ""; ui.pid = false; ui.pending = null; })]),
        h("section", {}, demo() ? "本地演示 · 操作不会写入现场设备" : "只读监视 · 不提供现场控制"),
        ...(ui.pid ? [section("液位设定值（2.00～4.00 m）", [h("input", { type: "number", min: 2, max: 4, step: .05, value: ui.setpoint, "aria-label": "液位设定", onInput: (e) => ui.setpoint = Number(e.target.value), disabled: controlDisabled }), btn("下发设定", () => request("setpoint", ui.setpoint), controlDisabled)])] : [
          section("设备实时状态", [h("div", { class: "native-row" }, [h("div", {}, ["运行状态", h("strong", {}, q("fault").quality === "good" && q("fault").value ? "故障" : q("run").quality !== "good" ? "未知" : q("run").value ? "运行中" : "停机")]), h("div", {}, ["实际频率", h("strong", {}, fmt("frequency", "Hz"))]), h("div", {}, ["电机电流", h("strong", {}, fmt("current", "A"))])])]),
          section("控制模式切换", [h("div", { class: "native-row" }, [btn("远程自动", () => request("auto"), controlDisabled, q("auto").value === true ? "active" : ""), btn("远程手动", () => request("manual"), controlDisabled, q("auto").value === false ? "active" : "")])]),
          section("频率设定（28.0～50.0 Hz）", [h("input", { type: "number", min: 28, max: 50, step: .5, "aria-label": "频率设定", value: ui.frequency, disabled: controlDisabled || q("auto").value !== false, onInput: (e) => ui.frequency = Number(e.target.value) }), btn("下发设定", () => request("frequency", ui.frequency), controlDisabled || q("auto").value !== false)]),
          section("手动动作控制 · 两步确认", [h("div", { class: "native-row" }, [btn("启动设备", () => request("start"), controlDisabled || q("run").quality !== "good" || q("run").value === true || q("fault").value !== false, "native-start"), btn("停止设备", () => request("stop"), controlDisabled || ["run", "fault", "auto"].some((slot) => q(slot).quality !== "good") || q("run").value !== true, "native-stop")])]),
          operation?.deviceId === n?.id ? h("section", { role: "status", "data-operation-id": operation.id },
            stopStatus(operation) + " · " + operation.id.slice(0, 8)) : null,
        ]),
        ui.error ? h("section", { role: "alert", class: "native-error" }, ui.error) : null,
      ]));
      if (ui.pending) result.push(h("div", { class: "native-confirm", role: "dialog", "aria-label": "操作二次确认", "aria-modal": "true" }, [h("div", { class: "native-faceplate" }, [h("header", {}, "操作二次确认"), h("section", {}, [h("p", {}, (byId().get(ui.pending.target)?.title || "集泥井") + "：" + ui.pending.message), h("p", { class: "native-help" }, ui.pending.kind === "stop" ? "提交后等待模拟服务回执及停机反馈。" : "本次操作会记录在演示日志中。")]), h("div", { class: "native-actions" }, [btn("取消操作", () => ui.pending = null), btn("确认下发执行", confirm)])])]));
      return result;
    }
    return () => {
      const index = byId(), main = p.doc.nodes.find((n) => !n.parentId);
      geometry();
      return Vue.h("div", { style: "position:relative;width:1920px;height:1080px" }, [Vue.h("style", {}, nativeCss(p.doc.skin) + nativeOverlayCss), renderNode(main, index), ...(!p.editing ? overlays() : []), Vue.h("div", { class: "native-source" }, (demo() ? "本地演示" : "只读数据") + " · " + p.connection)]);
    };
  },
};

// Shadow DOM keeps reviewed scene CSS and editor chrome independent.
export const NativeStage = {
  props: NativeTree.props,
  emits: NativeTree.emits,
  setup(p, { emit }) {
    const host = Vue.ref();
    let shadow, stop;
    Vue.onMounted(() => {
      shadow = host.value.attachShadow({ mode: "open" });
      stop = Vue.watchEffect(() => Vue.render(Vue.h(NativeTree, { ...p, onSelect: (v) => emit("select", v), onPatch: (v) => emit("patch", v), onStart: () => emit("start"), onMove: (v) => emit("move", v), onGeometry: (v) => emit("geometry", v) }), shadow));
    });
    Vue.onBeforeUnmount(() => { stop?.(); if (shadow) Vue.render(null, shadow); });
    return () => Vue.h("div", { ref: host, class: "native-host", style: "width:1920px;height:1080px;position:absolute;inset:0" });
  },
};
