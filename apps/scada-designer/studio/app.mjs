import {
  types,
  fans,
  mapped,
  node,
  template,
  validate,
  csv,
  normalize,
  protocolMappings,
  compatibleMappings,
  bindingProblem,
  campusBindings,
  campusState,
} from "./model.mjs";
import { Widget } from "./widgets.mjs";
import { TagManager } from "./tag-manager.mjs";
const offline = window.OFFLINE;
const clone = (v) => JSON.parse(JSON.stringify(v));
const kindNames = {
  number: "数值",
  boolean: "开关量",
  text: "文本",
  dataset: "数据表",
};
async function api(url, data) {
  const r = await fetch(
    url,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  if (!r.ok) throw Error((await r.json()).error || r.statusText);
  return r.headers.get("Content-Type").startsWith("text/html")
    ? r.text()
    : r.json();
}
function download(name, data, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const viewer = !!offline || location.pathname === "/view";
async function boot() {
  const initial =
    offline || (await api(viewer ? "/api/published" : "/api/draft"));
  document.getElementById("app").classList.toggle("editor-shell", !viewer);
  Vue.createApp({
    components: { Widget, TagManager },
    setup() {
      const {
        ref,
        computed,
        watch,
        nextTick,
        onMounted,
        onBeforeUnmount,
        shallowRef,
      } = Vue;
      const doc = ref(initial),
        ids = ref([]),
        stage = ref(),
        zoom = ref(1),
        preview = ref(false),
        dialog = ref(""),
        message = ref("");
      const editing = computed(() => !viewer && !preview.value),
        sel = computed(() =>
          doc.value.nodes.find((n) => n.id === ids.value.at(-1)),
        );
      const activeStep = ref("canvas"),
        inspectorTab = ref("appearance"),
        chosenTemplate = ref(initial.template);
      const sceneOptions = [
        {
          key: "01",
          name: "A²/O 生物处理",
          description: "工艺流程、运行指标与趋势",
          kind: "工艺监视",
        },
        {
          key: "05",
          name: "污泥回流泵站",
          description: "泵组状态、液位与回流流量",
          kind: "泵站监视",
        },
        {
          key: "30",
          name: "园区能源中心",
          description: "三维设备、运行反馈与特写",
          kind: "三维场景",
        },
        {
          key: "30-demo",
          name: "三维设备联动演示",
          description: "自带四台风机的本地样本与绑定",
          kind: "本地演示",
        },
        {
          key: "blank",
          name: "空白画布",
          description: "从组件库开始搭建页面",
          kind: "自由搭建",
        },
      ];
      const steps = [
        { key: "scene", label: "选择场景" },
        { key: "canvas", label: "编辑画布" },
        { key: "bind", label: "数据绑定" },
        { key: "preview", label: "预览发布" },
      ];
      const raw = shallowRef(null),
        received = ref(0),
        clock = ref(Date.now()),
        connection = ref("等待数据"),
        connected = ref(false),
        sequence = ref(0),
        sourceVersion = ref(0);
      const config = ref(),
        mappingIndex = ref(0),
        sample = ref(null),
        versionInfo = ref({ versions: [] });
      const sampleSource = ref("");
      const lastSaved = ref(JSON.stringify(initial)),
        saving = ref(false),
        published = ref(false);
      const dirty = computed(
        () => JSON.stringify(doc.value) !== lastSaved.value,
      );
      watch(dirty, (value) => {
        if (value && published.value) {
          published.value = false;
          message.value = "页面有新修改，发布后才会更新展示端";
        }
      });
      const bindingNodes = computed(() =>
        doc.value.nodes.filter((n) => mapped(n.type)),
      );
      const bindingIssues = computed(() =>
        bindingNodes.value.filter((n) => bindingProblem(n, doc.value.mappings)),
      );
      const sourceTitle = computed(
        () =>
          ({
            json: "本地 JSON 样本",
            csv: "本地 CSV 样本",
            rest: "REST 接口",
            ws: "WebSocket",
            opcua: "OPC UA",
            modbus: "Modbus TCP",
          })[doc.value.source.kind],
      );
      const invalidPoints = computed(
        () =>
          doc.value.mappings.filter(
            (m) => points.value[m.id]?.quality !== "good",
          ).length,
      );
      function selectBinding(n) {
        preview.value = false;
        activeStep.value = "bind";
        inspectorTab.value = "binding";
        ids.value = [n.id];
      }
      function goStep(key) {
        dialog.value = "";
        activeStep.value = key;
        preview.value = key === "preview";
        if (key === "bind") {
          inspectorTab.value = "binding";
          if (!sel.value || !mapped(sel.value.type))
            ids.value = [
              (bindingIssues.value[0] || bindingNodes.value[0])?.id,
            ].filter(Boolean);
        } else if (key === "canvas") inspectorTab.value = "appearance";
      }
      function openBindings() {
        goStep("bind");
      }
      function nextBinding() {
        const pending = bindingIssues.value.find((n) => n.id !== sel.value?.id);
        if (pending) selectBinding(pending);
        else goStep("preview");
      }
      const campusNode = computed(() =>
        sel.value?.type === "campus" ? sel.value : null,
      );
      function openCampus(n) {
        snapshot();
        selectBinding(n);
        if (!n.entities) n.entities = clone(campusBindings(n));
      }
      function openCampusOrBinding(n) {
        if (n.type === "campus") openCampus(n);
        else selectBinding(n);
      }
      function toggleCampus(entity, enabled) {
        const n = campusNode.value;
        snapshot();
        if (!n.entities) n.entities = clone(campusBindings(n));
        if (enabled) {
          n.entities.push({ entity, run: "", fault: "", value: "" });
          if (n.entities.length > 1) n.camera = "energy";
        } else n.entities = n.entities.filter((b) => b.entity !== entity);
        if (n.entities.length && !n.entities.some((b) => b.entity === n.entity))
          n.entity = n.entities[0].entity;
      }
      const campusEntry = (id) =>
        campusNode.value &&
        campusBindings(campusNode.value).find((e) => e.entity === id);
      function setCampusField(entity, key, value) {
        const n = campusNode.value;
        snapshot();
        if (!n.entities) n.entities = clone(campusBindings(n));
        n.entities.find((e) => e.entity === entity)[key] = value;
      }
      function selectEntity(n, id) {
        if (editing.value && n.entity !== id) {
          snapshot();
          n.entity = id;
        }
      }
      function bindingValue(n) {
        if (n.type === "campus")
          return (
            campusBindings(n).length +
            " 台设备 · " +
            (bindingProblem(n, doc.value.mappings) || "已绑定")
          );
        if (n.type === "table" && n.binding === "*") return "全部测点";
        const m = doc.value.mappings.find((m) => m.id === n.binding),
          p = points.value[n.binding];
        if (!m || !p) return "等待读取";
        const label = {
          good: "有效",
          bad: "无效",
          stale: "过期",
          offline: "离线",
        }[p.quality];
        const value =
          p.quality !== "good"
            ? "—"
            : ["flow", "status"].includes(n.type)
              ? p.value
                ? "运行"
                : "停止"
              : typeof p.value === "number"
                ? p.value.toFixed(m.precision)
                : Array.isArray(p.value)
                  ? p.value.length + " 行"
                  : String(p.value);
        return value + " " + (m.unit || "") + " · " + label;
      }
      const history = [],
        undoCount = ref(0);
      let stop = () => {},
        clockId,
        observer,
        drag;
      function snapshot() {
        const value = JSON.stringify(doc.value);
        if (history.at(-1) !== value) {
          history.push(value);
          if (history.length > 50) history.shift();
          undoCount.value = history.length;
        }
      }
      function undo() {
        if (history.length) {
          doc.value = JSON.parse(history.pop());
          ids.value = [];
          undoCount.value = history.length;
        }
      }
      function pick(n, e) {
        if (!editing.value) return;
        if (e?.shiftKey) {
          ids.value = ids.value.includes(n.id)
            ? ids.value.filter((id) => id !== n.id)
            : [...ids.value, n.id];
        } else if (!ids.value.includes(n.id)) {
          ids.value = n.group
            ? doc.value.nodes
                .filter((v) => v.group === n.group)
                .map((v) => v.id)
            : [n.id];
        }
      }
      const selectedNodes = () =>
        doc.value.nodes.filter((n) => ids.value.includes(n.id));
      watch(
        () => sel.value?.id,
        async () => {
          await nextTick();
          const inspector = document.querySelector(".inspector");
          if (inspector) inspector.scrollTop = 0;
          document
            .querySelector(".navigator .layer.active")
            ?.scrollIntoView({ block: "nearest" });
        },
      );
      function add(type) {
        snapshot();
        const n = node(type, crypto.randomUUID(), type === "table" ? "*" : "");
        doc.value.nodes.push(n);
        ids.value = [n.id];
        inspectorTab.value = "appearance";
      }
      function setRect(n, key, input) {
        const value = Number(input.value);
        if (!Number.isFinite(value)) {
          input.value = n[key];
          return;
        }
        snapshot();
        const max = {
          x: 1920 - n.w,
          y: 1080 - n.h,
          w: 1920 - n.x,
          h: 1080 - n.y,
        }[key];
        n[key] = Math.round(
          Math.max(key === "w" || key === "h" ? 100 : 0, Math.min(max, value)),
        );
        input.value = n[key];
      }
      function action(key) {
        const ns = selectedNodes(),
          movable = ns.filter((n) => !n.locked);
        if (!ns.length) return;
        snapshot();
        if (key === "lock") {
          const lock = !ns.every((n) => n.locked);
          ns.forEach((n) => (n.locked = lock));
        }
        if (key === "group") {
          const id = crypto.randomUUID();
          movable.forEach((n) => (n.group = id));
        }
        if (key === "ungroup") movable.forEach((n) => delete n.group);
        if (key === "left" && movable.length) {
          const x = Math.min(...movable.map((n) => n.x));
          movable.forEach((n) => (n.x = x));
        }
        if (key === "top" && movable.length) {
          const y = Math.min(...movable.map((n) => n.y));
          movable.forEach((n) => (n.y = y));
        }
        if (key === "front" || key === "back") {
          const rest = doc.value.nodes.filter((n) => !movable.includes(n));
          doc.value.nodes =
            key === "front" ? [...rest, ...movable] : [...movable, ...rest];
        }
        if (key === "delete") {
          doc.value.nodes = doc.value.nodes.filter((n) => !movable.includes(n));
          ids.value = [];
        }
        if (key === "copy") {
          ids.value = ns.map((n) => {
            const c = clone(n);
            c.id = crypto.randomUUID();
            delete c.group;
            c.locked = false;
            c.x = Math.min(1920 - c.w, c.x + 25);
            c.y = Math.min(1080 - c.h, c.y + 25);
            doc.value.nodes.push(c);
            return c.id;
          });
        }
      }
      function replace(key) {
        snapshot();
        doc.value =
          key === "30-demo"
            ? template(key)
            : {
                ...template(key),
                source: clone(doc.value.source),
                mappings: clone(doc.value.mappings),
              };
        ids.value = [];
        chosenTemplate.value = key;
        goStep("canvas");
        message.value =
          key === "30-demo"
            ? "已载入本地联动演示，可撤销恢复原页面"
            : "模板已切换，数据连接已保留。请检查组件绑定";
      }
      async function guarded(fn) {
        try {
          await fn();
        } catch (e) {
          message.value = e.message;
        }
      }
      function save(publish) {
        if (saving.value) return;
        if (publish && bindingIssues.value.length) {
          openBindings();
          message.value =
            "请完成 " + bindingIssues.value.length + " 个组件的测点绑定";
          return;
        }
        return guarded(async () => {
          saving.value = true;
          try {
            const value = clone(doc.value);
            validate(value, publish);
            await api(publish ? "/api/publish" : "/api/draft", value);
            lastSaved.value = JSON.stringify(value);
            published.value = publish;
            if (publish) dialog.value = "";
            message.value = publish ? "已发布，可打开展示端核对" : "草稿已保存";
          } finally {
            saving.value = false;
          }
        });
      }
      async function versions() {
        await guarded(async () => {
          versionInfo.value = await api("/api/versions");
          dialog.value = "versions";
        });
      }
      async function rollback(id) {
        await guarded(async () => {
          await api("/api/rollback", { id });
          await versions();
          message.value = "展示端已切换版本";
        });
      }
      function openConfig() {
        config.value = clone({
          source: doc.value.source,
          mappings: doc.value.mappings,
        });
        mappingIndex.value = 0;
        sample.value = null;
        dialog.value = "data";
        message.value = "";
        browsePath.value = [];
        browseResults.value = [];
      }
      const protocolBusy = ref(false),
        browseResults = ref([]),
        browsePath = ref([]);
      function sourceKindChanged() {
        sample.value = null;
        browseResults.value = [];
        browsePath.value = [];
        const s = config.value.source;
        if (
          ["opcua", "modbus"].includes(s.kind) &&
          s.connection?.protocol !== s.kind
        )
          s.connection =
            s.kind === "opcua"
              ? {
                  protocol: s.kind,
                  endpoint: "opc.tcp://127.0.0.1:49320",
                  points: [],
                }
              : {
                  protocol: s.kind,
                  host: "",
                  port: 502,
                  unitId: 1,
                  points: [],
                };
      }
      const browseNext = ref(null);
      async function browseProtocol(entry, backIndex, append = false) {
        if (protocolBusy.value) return;
        message.value = "";
        protocolBusy.value = true;
        await guarded(async () => {
          const path =
            backIndex != null
              ? browsePath.value.slice(0, backIndex)
              : append
                ? browsePath.value
                : entry
                  ? entry.path || [...browsePath.value, entry]
                  : [];
          const result = await api("/api/opcua/browse", {
            endpoint: config.value.source.connection.endpoint,
            nodeId: path.at(-1)?.nodeId,
            offset: append ? browseNext.value : 0,
          });
          browsePath.value = path;
          browseResults.value = append
            ? [...browseResults.value, ...result.nodes]
            : result.nodes;
          browseNext.value = result.nextOffset ?? null;
        });
        protocolBusy.value = false;
      }
      async function once(s) {
        if (s.kind === "json") return JSON.parse(s.data);
        if (s.kind === "csv") return csv(s.data);
        if (s.kind === "rest") return api("/api/sample", { url: s.url });
        if (["opcua", "modbus"].includes(s.kind))
          return api("/api/protocol/sample", s);
        return new Promise((ok, no) => {
          const ws = new WebSocket(s.url);
          const timer = setTimeout(() => {
            ws.close();
            no(Error("等待 WebSocket 样本超时"));
          }, 6000);
          ws.onmessage = (e) => {
            try {
              ok(JSON.parse(e.data));
            } catch (err) {
              no(err);
            } finally {
              clearTimeout(timer);
              ws.close();
            }
          };
          ws.onerror = () => {
            clearTimeout(timer);
            no(Error("WebSocket 连接失败"));
          };
        });
      }
      async function readSample() {
        if (protocolBusy.value) return;
        message.value = "";
        protocolBusy.value = true;
        await guarded(async () => {
          sample.value = null;
          const source = clone(config.value.source);
          for (let attempt = 0; attempt < 40; attempt++) {
            try {
              const value = await once(source);
              if (
                JSON.stringify(source) !== JSON.stringify(config.value.source)
              )
                throw Error("连接配置已变化，请重新读取样本");
              sample.value = value;
              sampleSource.value = JSON.stringify(source);
              if (["opcua", "modbus"].includes(source.kind)) bridgeMappings();
              return;
            } catch (error) {
              if (!error.message.includes("协议连接建立中") || attempt === 39)
                throw error;
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        });
        protocolBusy.value = false;
      }
      function bridgeMappings() {
        const rows = sample.value?.points;
        if (!Array.isArray(rows)) return;
        config.value.mappings = protocolMappings(
          rows,
          sample.value.protocol,
          config.value.mappings,
        );
        mappingIndex.value = 0;
      }
      async function finishTags() {
        if (
          !sample.value ||
          sampleSource.value !== JSON.stringify(config.value.source)
        )
          await readSample();
        if (
          sample.value &&
          sampleSource.value === JSON.stringify(config.value.source)
        )
          await applyConfig();
      }
      function applyConfig() {
        return guarded(async () => {
          const native = ["opcua", "modbus"].includes(config.value.source.kind);
          if (native) {
            if (
              !sample.value ||
              sampleSource.value !== JSON.stringify(config.value.source)
            )
              throw Error("请读取当前连接配置的样本，再应用数据配置");
            bridgeMappings();
          }
          const updated = { ...doc.value, ...config.value };
          validate(updated, false);
          if (["csv", "json"].includes(config.value.source.kind))
            await once(config.value.source);
          snapshot();
          Object.assign(doc.value, clone(config.value));
          dialog.value = "";
          goStep("bind");
          message.value = "数据配置已应用，已返回画布。请选择当前组件的测点";
        });
      }
      function addMap() {
        const m = {
          id: "point" + (config.value.mappings.length + 1),
          label: "新测点",
          path: "$",
          kind: "number",
          unit: "",
          precision: 2,
          scale: 1,
          offset: 0,
        };
        config.value.mappings.push(m);
        mappingIndex.value = config.value.mappings.length - 1;
      }
      const currentMap = computed(
        () => config.value?.mappings[mappingIndex.value],
      );
      const paths = computed(() => {
        const list = [];
        function visit(v, p) {
          if (list.length >= 300) return;
          if (p) list.push(p);
          if (v && typeof v === "object")
            Object.keys(v)
              .slice(0, 40)
              .forEach((k) => visit(v[k], p ? p + "." + k : k));
        }
        visit(sample.value, "");
        return list;
      });
      function restart() {
        sourceVersion.value++;
        stop();
        let closed = false,
          timer,
          ws,
          delay = 1000;
        const s = clone(doc.value.source);
        raw.value = null;
        connected.value = false;
        connection.value = "等待数据";
        sequence.value++;
        const accept = (v) => {
          if (closed) return;
          received.value = offline?.sampleReceivedAt ?? Date.now();
          clock.value = received.value;
          raw.value = v;
          connected.value = true;
          sequence.value++;
          connection.value = offline
            ? "离线演示快照"
            : ["json", "csv"].includes(s.kind)
              ? "本地样本"
              : "已连接 · " + s.kind.toUpperCase();
        };
        const fail = (e) => {
          if (!closed) {
            connected.value = false;
            connection.value = "读取失败 · " + e.message;
            sequence.value++;
          }
        };
        async function poll() {
          try {
            accept(await once(s));
          } catch (e) {
            fail(e);
          }
          if (!closed && ["rest", "opcua", "modbus"].includes(s.kind))
            timer = setTimeout(poll, s.pollMs);
        }
        function connect() {
          if (closed) return;
          try {
            ws = new WebSocket(s.url);
            ws.onmessage = (e) => {
              try {
                accept(JSON.parse(e.data));
                delay = 1000;
              } catch (err) {
                fail(err);
              }
            };
            ws.onclose = () => {
              if (!closed) {
                fail(Error("连接中断"));
                timer = setTimeout(connect, delay);
                delay = Math.min(15000, delay * 2);
              }
            };
          } catch (e) {
            fail(e);
          }
        }
        stop = () => {
          closed = true;
          clearTimeout(timer);
          ws?.close();
        };
        s.kind === "ws" ? connect() : poll();
      }
      const points = computed(() =>
        Object.fromEntries(
          doc.value.mappings.map((m) => {
            const fixed = ["json", "csv"].includes(doc.value.source.kind);
            const p = normalize(
              raw.value,
              m,
              received.value,
              doc.value.source.maxAgeMs,
              offline?.snapshotTime ??
                (fixed && !m.timePath ? received.value : clock.value),
            );
            if (!connected.value) {
              p.quality = "offline";
              p.value = null;
            }
            return [m.id, p];
          }),
        ),
      );
      watch(() => JSON.stringify(doc.value.source), restart, {
        immediate: true,
      });
      function move(e) {
        const ns = selectedNodes();
        if (!editing.value || !ns.length || ns.some((n) => n.locked)) return;
        const dx = Math.max(
          -Math.min(...ns.map((n) => n.x)),
          Math.min(e.dx / zoom.value, ...ns.map((n) => 1920 - n.x - n.w)),
        );
        const dy = Math.max(
          -Math.min(...ns.map((n) => n.y)),
          Math.min(e.dy / zoom.value, ...ns.map((n) => 1080 - n.y - n.h)),
        );
        ns.forEach((n) => {
          n.x += dx;
          n.y += dy;
        });
      }
      onMounted(() => {
        clockId = setInterval(() => (clock.value = Date.now()), 500);
        observer = new ResizeObserver(
          () =>
            (zoom.value = Math.min(
              stage.value.clientWidth / 1920,
              stage.value.clientHeight / 1080,
            )),
        );
        observer.observe(stage.value);
        if (!viewer) {
          drag = interact(".panel")
            .draggable({
              allowFrom: ".node-title",
              listeners: { start: snapshot, move },
            })
            .resizable({
              edges: { right: ".handle", bottom: ".handle" },
              listeners: {
                start: snapshot,
                move: (e) => {
                  const n = doc.value.nodes.find(
                    (n) => n.id === e.target.dataset.id,
                  );
                  if (!editing.value || !n || n.locked) return;
                  n.w = Math.max(
                    160,
                    Math.min(1920 - n.x, n.w + e.deltaRect.width / zoom.value),
                  );
                  n.h = Math.max(
                    130,
                    Math.min(1080 - n.y, n.h + e.deltaRect.height / zoom.value),
                  );
                },
              },
            });
        }
      });
      onBeforeUnmount(() => {
        stop();
        clearInterval(clockId);
        observer?.disconnect();
        drag?.unset();
      });
      const runExport = () =>
        guarded(async () =>
          download(
            "监视页面-离线演示.html",
            await api("/api/export", {
              doc: doc.value,
              payload: connected.value ? raw.value : null,
              receivedAt: received.value,
            }),
            "text/html",
          ),
        );
      const importDoc = (file) =>
        guarded(async () => {
          if (!file) return;
          const value = validate(JSON.parse(await file.text()), false);
          snapshot();
          doc.value = value;
          ids.value = [];
        });
      function loadImage(file) {
        if (!file || !sel.value) return;
        const n = sel.value;
        const reader = new FileReader();
        reader.onload = () => {
          snapshot();
          n.image = reader.result;
        };
        reader.readAsDataURL(file);
      }
      return {
        activeStep,
        inspectorTab,
        chosenTemplate,
        sceneOptions,
        steps,
        openCampusOrBinding,
        sourceTitle,
        invalidPoints,
        goStep,
        selectBinding,
        nextBinding,
        setRect,
        setCampusField,
        campusNode,
        openCampus,
        toggleCampus,
        campusEntry,
        campusBindings,
        campusState,
        selectEntity,
        kindNames,
        saving,
        published,
        dirty,
        bindingNodes,
        bindingIssues,
        openBindings,
        bindingValue,
        compatibleMappings,
        bindingProblem,
        types,
        fans,
        mapped,
        viewer,
        offline,
        doc,
        ids,
        stage,
        zoom,
        preview,
        editing,
        dialog,
        message,
        sel,
        points,
        connection,
        sequence,
        sourceVersion,
        config,
        currentMap,
        mappingIndex,
        sample,
        sampleSource,
        paths,
        versionInfo,
        undoCount,
        snapshot,
        undo,
        pick,
        add,
        action,
        replace,
        save,
        versions,
        rollback,
        openConfig,
        readSample,
        protocolBusy,
        browseResults,
        browsePath,
        sourceKindChanged,
        browseProtocol,
        finishTags,
        browseNext,
        applyConfig,
        bridgeMappings,
        addMap,
        loadImage,
        runExport,
        importDoc,
        exportDoc: () =>
          download(
            "project.json",
            JSON.stringify(doc.value, null, 2),
            "application/json",
          ),
        fileData: (file) =>
          guarded(async () => {
            if (file) config.value.source.data = await file.text();
          }),
        setEnum: (value) =>
          guarded(() => {
            currentMap.value.enumMap = value.trim() ? JSON.parse(value) : {};
          }),
      };
    },
  }).mount("#app");
}
boot().catch((e) => {
  const section = document.createElement("section");
  section.className = "empty-state";
  const title = document.createElement("h1");
  title.textContent = "页面暂时无法打开";
  const detail = document.createElement("p");
  detail.textContent = e.message;
  const link = document.createElement("a");
  link.href = "/";
  link.textContent = "返回配置工作台";
  section.append(title, detail, link);
  document.body.replaceChildren(section);
});
