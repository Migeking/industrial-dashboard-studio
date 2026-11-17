import {
  types,
  fans,
  mapped,
  node,
  template,
  validate,
  csv,
  normalize,
} from "./model.mjs";
import { Widget } from "./widgets.mjs";
const offline = window.OFFLINE;
const clone = (v) => JSON.parse(JSON.stringify(v));
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
        doc.value = template(key);
        ids.value = [];
      }
      async function guarded(fn) {
        try {
          await fn();
        } catch (e) {
          message.value = e.message;
        }
      }
      function save(publish) {
        return guarded(async () => {
          validate(doc.value, publish);
          await api(publish ? "/api/publish" : "/api/draft", doc.value);
          message.value = publish ? "已发布" : "草稿已保存";
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
      }
      async function once(s) {
        if (s.kind === "json") return JSON.parse(s.data);
        if (s.kind === "csv") return csv(s.data);
        if (s.kind === "rest") return api("/api/sample", { url: s.url });
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
      const readSample = () =>
        guarded(async () => {
          sample.value = null;
          sample.value = await once(config.value.source);
        });
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
        }));
        config.value.mappings = mappings;
        mappingIndex.value = 0;
      }
      function applyConfig() {
        return guarded(async () => {
          const updated = { ...doc.value, ...config.value };
          validate(updated, false);
          if (["csv", "json"].includes(config.value.source.kind))
            await once(config.value.source);
          snapshot();
          Object.assign(doc.value, clone(config.value));
          dialog.value = "";
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
          if (!closed && s.kind === "rest") timer = setTimeout(poll, s.pollMs);
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
boot().catch((e) => (document.body.textContent = e.message));
