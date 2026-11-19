import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { template, validate } from "./studio/model.mjs";
import { browseNodes, protocolSample } from "./protocol.mjs";
import { modelAssistant } from "./model-assistant.mjs";
import {
  projectStore, publicationMatchesDocument, validatePublication, versionLimit,
} from "./project-store.mjs";
import { createCaseLibrary } from "./case-library.mjs";
import { waterArtwork } from "../../packages/components/studio/water-artwork.mjs";
import { files, deploymentDigest, publicationManifest } from "./deployment.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)),
  root = path.resolve(here, "../..");
const dir = process.env.STUDIO_DATA_DIR || path.join(root, "works/studio");
const port = Number(process.env.STUDIO_PORT || 8099);
await fs.mkdir(dir, { recursive: true });
const assistant = modelAssistant(dir);
const projects = projectStore(dir);
const library = await createCaseLibrary(root);
// Existing single-project instances can keep their old landing URL.
const projectEntry = (process.env.STUDIO_ENTRY || (process.env.STUDIO_DATA_DIR ? "editor" : "projects")) === "projects";
async function body(req, limit = 16 * 1024 * 1024) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw Error("配置过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
const content = (p) => fs.readFile(path.resolve(here, files.get(p)), "utf8");

const restFrames = new Map();
function sharedRestFrame(url, requestedReuse) {
  const reuseMs = Number.isFinite(requestedReuse) && requestedReuse > 0
    ? Math.min(requestedReuse, 30000) : 0;
  url.hash = "";
  const key = url.href;
  const previous = restFrames.get(key);
  if (previous?.pending) {
    previous.reuseMs = Math.max(previous.reuseMs, reuseMs);
    return previous.pending;
  }
  if (previous && performance.now() - previous.completed < Math.min(reuseMs, previous.reuseMs))
    return previous.frame;
  clearTimeout(previous?.expiry);
  const entry = { reuseMs };
  entry.pending = (async () => {
    try {
      const headers = {};
      if (url.origin === process.env.STUDIO_API_ORIGIN && process.env.STUDIO_API_TOKEN)
        headers.Authorization = "Bearer " + process.env.STUDIO_API_TOKEN;
      const response = await fetch(url, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw Error("上游 HTTP " + response.status);
      const payload = await response.json();
      return { payload, receivedAt: Date.now() };
    } catch (error) {
      return { error: error?.message || "读取上游失败" };
    }
  })().then(frame => {
    entry.pending = null;
    entry.completed = performance.now();
    entry.frame = frame;
    if (entry.reuseMs)
      entry.expiry = setTimeout(() => {
        if (restFrames.get(key) === entry) restFrames.delete(key);
      }, entry.reuseMs).unref();
    else restFrames.delete(key);
    return frame;
  });
  restFrames.set(key, entry);
  return entry.pending;
}

const inline = (s) => s.replace(/<\/script/gi, "<\\/script");
async function offline(doc, payload, receivedAt, datasetFrame) {
  const copy = structuredClone(doc);
  copy.snapshotTime = Date.now();
  copy.sampleReceivedAt = Number.isFinite(receivedAt)
    ? receivedAt
    : copy.snapshotTime;
  if (copy.source.datasets) copy.datasetSnapshot = {
    bindings: copy.source.datasets.bindings,
    payload: datasetFrame?.payload ?? null,
    receivedAt: Number.isFinite(datasetFrame?.receivedAt) ? datasetFrame.receivedAt : null,
  };
  copy.source = {
    kind: "json",
    data: JSON.stringify(payload),
    url: "",
    pollMs: 1000,
    maxAgeMs: doc.source.maxAgeMs,
    demo: doc.source.demo === true,
  };
  const usedSymbols = new Set([doc, ...(doc.pages || [])].flatMap(page =>
    (page.nodes || []).filter(n => n.params?.appearance !== "picture").map(n => n.symbol)
  ));
  const embeddedArtwork = Object.fromEntries(
    Object.entries(waterArtwork).filter(([symbol]) => usedSymbols.has(symbol))
  );
  let html = await content("/editor");
  const windowlessCss = await content("/studio.css");
  html = html.replace(
    /<link rel="stylesheet" href="\/studio\.css"\s*\/?>/,
    () => "<style>" + windowlessCss + "</style>",
  );
  for (const p of [
    "/lib/vue.js",
    "/lib/echarts.js",
    "/lib/three.js",
    "/lib/campus.js",
    "/lib/interact.js",
    "/lib/x6.js",
  ]) {
    const script = await content(p);
    html = html.replace(
      '<script src="' + p + '"></script>',
      () => "<script>" + inline(script) + "</script>",
    );
  }
  const modules = await Promise.all(
    ["/packages/components/studio/water-equipment.mjs", "/packages/components/studio/water-artwork.mjs", "/packages/components/studio/native-data.mjs", "/packages/runtime/studio/native-model.mjs", "/packages/components/studio/screen-symbols.mjs", "/packages/components/studio/screen-artwork.mjs", "/packages/runtime/studio/screen-dynamics.mjs", "/packages/runtime/studio/screen-widgets.mjs", "/packages/runtime/studio/screen-themes.mjs", "/packages/runtime/studio/screen-controls.mjs", "/packages/runtime/studio/screen-model.mjs", "/packages/runtime/studio/screen-library.mjs", "/packages/runtime/studio/screen-pages.mjs", "/model.mjs", "/widgets.mjs", "/tag-manager.mjs", "/packages/runtime/studio/native-renderer.mjs", "/packages/runtime/studio/screen-trend-panel.mjs", "/packages/runtime/studio/equipment-display.mjs", "/packages/runtime/studio/screen-routing.mjs", "/packages/runtime/studio/screen-renderer.mjs", "/screen-definitions.mjs", "/screen-rules.mjs", "/screen-actions.mjs", "/screen-widget-settings.mjs", "/packages/runtime/studio/screen-commands.mjs", "/screen-assistant.mjs", "/screen-control-settings.mjs", "/screen-inspector.mjs", "/screen-library.mjs", "/screen-viewport.mjs", "/screen-pages.mjs", "/app.mjs"].map(p =>
      p === "/packages/components/studio/water-artwork.mjs"
        ? "const waterArtwork = " + JSON.stringify(embeddedArtwork) + ";"
        : content(p)
    ),
  );
  const code = modules
    .map((m) =>
      m
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*$/gm, "")
        .replace(/^export /gm, ""),
    )
    .join("\n");
  return html.replace(
    '<script type="module" src="/app.mjs"></script>',
    () =>
      "<script>window.OFFLINE=" +
      JSON.stringify(copy).replace(/</g, "\\u003c") +
      ';</script><script type="module">' +
      inline(code) +
      "</script>",
  );
}
http
  .createServer(async (req, res) => {
    const send = (status, value, type = "application/json", headers = {}) => {
      res.writeHead(status, {
        "Content-Type": type + "; charset=utf-8",
        "Cache-Control": "no-store",
        ...headers,
      });
      res.end(type === "application/json" && !Buffer.isBuffer(value) ? JSON.stringify(value) : value);
    };
    try {
      const url = new URL(req.url, "http://localhost");
      const p = url.pathname;
      const projectId = url.searchParams.get("project") ?? "local";
      if (
        !["localhost", "127.0.0.1"].includes(
          (req.headers.host || "").split(":")[0],
        )
      )
        return send(403, { error: "仅支持本机访问" });
      if (
        req.method === "POST" &&
        ((req.headers.origin &&
          req.headers.origin !== "http://" + req.headers.host) ||
          !req.headers["content-type"]?.startsWith("application/json"))
      )
        return send(403, { error: "请求来源无效" });
      if (req.method === "GET" && p === "/") {
        if (projectEntry) {
          res.writeHead(302, {Location:"/projects", "Cache-Control":"no-store"});
          return res.end();
        }
        return send(200, await content("/editor"), "text/html");
      }
      if (req.method === "GET" && files.has(p))
        return send(
          200,
          await content(p),
          p.endsWith("css")
            ? "text/css"
            : /\.m?js$/.test(p)
              ? "text/javascript"
              : "text/html",
        );
      if (req.method === "GET" && p.startsWith("/api/")) {
        if (p === "/api/assistant/config") return send(200, await assistant.publicConfig());
        if (p === "/api/projects") return send(200, { projects: await projects.list(), cases: library.cases });
        if (p === "/api/project-backup") return send(200, await projects.backup(projectId));
        const state = await projects.read(projectId);
        if (p === "/api/draft") return send(200, state.draft);
        if (p === "/api/published") {
          const v = state.versions.find((v) => v.id === state.active);
          return send(v ? 200 : 404, v?.doc || { error: "尚未发布页面" });
        }
        if (p === "/api/versions") {
          const deployment = state.versions.some(v => v.manifest)
            ? await deploymentDigest()
            : null;
          return send(200, {
            active: state.active,
            versions: state.versions.map(({ id, time, doc, manifest }) => ({
              id,
              time,
              title: doc.title,
              sourceKind: doc.source.kind,
              demo: doc.source.demo === true,
              datasets: !!Object.keys(doc.source.datasets?.bindings || {}).length,
              ...(manifest ? {
                manifest,
                deploymentMatches: manifest.deploymentSha256 === deployment,
                documentMatches: publicationMatchesDocument(doc, manifest),
              } : {}),
            })),
          });
        }
      }
      if (req.method === "POST") {
        if (p === "/api/project-restore")
          return send(201, await projects.restore(await body(req, 100 * 1024 * 1024)));
        const data = await body(req);
        if (p === "/api/projects") {
          if (data.caseId && !library.cases.some(item => item.id === data.caseId)) throw Error("案例不存在");
          return send(201, await projects.create(data));
        }
        if (p === "/api/projects/rename") return send(200, await projects.rename(data.id, data.name));
        if (p === "/api/assistant/config") return send(200, await assistant.save(data));
        if (p === "/api/assistant/propose") {
          const controller=new AbortController();
          res.on("close",()=>{if(!res.writableEnded)controller.abort();});
          return send(200, await assistant.propose(data,controller.signal));
        }
        if (p === "/api/opcua/browse")
          return send(200, await browseNodes(data));
        if (p === "/api/protocol/sample")
          return send(200, await protocolSample(data, dir));
        if (p === "/api/sample") {
          const url = new URL(data.url);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password
          )
            throw Error("请输入只读 HTTP 接口地址");
          const frame = await sharedRestFrame(url, data.reuseMs);
          if (frame.error) throw Error(frame.error);
          return send(200, frame.payload, "application/json", {
            "X-Studio-Received-At": String(frame.receivedAt),
          });
        }
        if (p === "/api/export") {
          validate(data.doc, true);
          if (data.payload == null) throw Error("请先取得数据样本");
          return send(
            200,
            await offline(data.doc, data.payload, data.receivedAt, data.datasetFrame),
            "text/html",
          );
        }
        if (["/api/draft", "/api/publish"].includes(p)) {
          const publishing = p === "/api/publish";
          if (publishing) validatePublication(data);
          else validate(data, false);
          const manifest = publishing ? await publicationManifest(projectId, data) : null;
          return send(
            200,
            await projects.edit(projectId, (s) => {
              s.draft = data;
              if (publishing) {
                const id = randomUUID();
                s.versions.unshift({
                  id,
                  time: new Date().toISOString(),
                  doc: data,
                  manifest,
                });
                s.versions = s.versions.slice(0, versionLimit);
                s.active = id;
              }
              return { active: s.active };
            }),
          );
        }
        if (p === "/api/rollback")
          return send(
            200,
            await projects.edit(projectId, (s) => {
              if (!s.versions.some((v) => v.id === data.id))
                throw Error("版本不存在");
              s.active = data.id;
              return { active: s.active };
            }),
          );
      }
      if (req.method === "GET") {
        const asset = await library.asset(p);
        if (asset) return send(200, asset.data, asset.type);
      }
      send(404, { error: "未找到" });
    } catch (e) {
      send(e.code === "ENOENT" ? 404 : 400, { error: e.message });
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log("配置工作台 http://127.0.0.1:" + port),
  );
