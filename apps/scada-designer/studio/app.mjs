import {
  types,
  fans,
  mapped,
  node,
  template,
  validate,
  csv,
  normalize,
  importNorthbound,
  compatibleMappings,
  bindingProblem,
} from "./model.mjs";
import { Widget } from "./widgets.mjs";
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
  Vue.createApp({
    components: { Widget },
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
      const bindingNodes = computed(() =>
        doc.value.nodes.filter((n) => mapped(n.type)),
      );
      const bindingIssues = computed(() =>
        bindingNodes.value.filter((n) => bindingProblem(n, doc.value.mappings)),
      );
      function openBindings() {
        snapshot();
        dialog.value = "bindings";
      }
      function bindingValue(n) {
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
      function add(type) {
        snapshot();
        const n = node(
          type,
          crypto.randomUUID(),
          type === "table"
            ? "*"
            : doc.value.mappings.find(
                (m) =>
                  m.kind ===
                  (["flow", "status", "campus"].includes(type)
                    ? "boolean"
                    : "number"),
              )?.id || "",
        );
        doc.value.nodes.push(n);
        ids.value = [n.id];
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
        doc.value = {
          ...template(key),
          source: clone(doc.value.source),
          mappings: clone(doc.value.mappings),
        };
        ids.value = [];
        message.value = "模板已切换，数据连接已保留。请检查组件绑定";
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
      async function browseProtocol(entry, backIndex) {
        if (protocolBusy.value) return;
        protocolBusy.value = true;
        await guarded(async () => {
          const path =
            backIndex != null
              ? browsePath.value.slice(0, backIndex)
              : entry
                ? [...browsePath.value, entry]
                : [];
          const result = await api("/api/opcua/browse", {
            endpoint: config.value.source.connection.endpoint,
            nodeId: path.at(-1)?.nodeId,
          });
          browsePath.value = path;
          browseResults.value = result.nodes;
          if (result.truncated)
            message.value = "该目录超过 500 个节点，请选择更小的目录";
        });
        protocolBusy.value = false;
      }
      function selectUa(entry) {
        const points = config.value.source.connection.points;
        if (points.some((p) => p.nodeId === entry.nodeId)) return;
        points.push({
          id: "UA_" + crypto.randomUUID(),
          label: entry.label,
          kind: entry.kind,
          nodeId: entry.nodeId,
        });
      }
      function addRegister() {
        config.value.source.connection.points.push({
          id: "MB_" + crypto.randomUUID(),
          label: "新测点",
          kind: "number",
          function: 4,
          address: 0,
          format: "uint16",
        });
      }
      const importRegisters = (file) =>
        guarded(async () => {
          if (file)
            config.value.source.connection.points = importNorthbound(
              JSON.parse(await file.text()),
            );
        });
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
        const mappings = rows.map((r) => ({
          id: r.id,
          label: r.label || r.id,
          unit: r.unit || "",
          kind: r.kind,
          path: "value",
          root: "points",
          keyField: "id",
          keyValue: r.id,
          timePath:
            sample.value.protocol === "opcua" ? "timestamp" : "receivedAt",
          fallbackTimePath: "receivedAt",
          qualityPath: "quality",
          scale: 1,
          offset: 0,
          precision: r.unit === "原码" ? 0 : 2,
          ...config.value.mappings.find(
            (m) =>
              (m.keyField === "id" && m.keyValue === r.id) || m.id === r.id,
          ),
        }));
        config.value.mappings = mappings;
        mappingIndex.value = 0;
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
          dialog.value = bindingIssues.value.length ? "bindings" : "";
          message.value = "数据配置已应用";
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
        selectUa,
        addRegister,
        importRegisters,
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
