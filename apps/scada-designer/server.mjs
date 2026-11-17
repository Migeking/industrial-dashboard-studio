import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { template, validate, csv } from "./studio/model.mjs";
import { browseNodes, protocolSample } from "./protocol.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)),
  root = path.resolve(here, "../..");
const dir = process.env.STUDIO_DATA_DIR || path.join(root, "works/studio");
const port = Number(process.env.STUDIO_PORT || 8099);
await fs.mkdir(dir, { recursive: true });
const store = path.join(dir, "project.json");
async function read() {
  try {
    return JSON.parse(await fs.readFile(store, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    return { draft: template(), versions: [], active: null };
  }
}
let writes = Promise.resolve();
function edit(change) {
  const job = writes.then(async () => {
    const state = await read();
    const result = change(state);
    const tmp = store + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(state));
    await fs.rename(tmp, store);
    return result;
  });
  writes = job.catch(() => {});
  return job;
}
async function body(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16 * 1024 * 1024) throw Error("配置过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
const files = new Map(
  Object.entries({
    "/": "studio/index.html",
    "/view": "studio/index.html",
    "/studio.css": "studio/studio.css",
    "/app.mjs": "studio/app.mjs",
    "/model.mjs": "studio/model.mjs",
    "/widgets.mjs": "studio/widgets.mjs",
    "/tag-manager.mjs": "studio/tag-manager.mjs",
    "/lib/interact.js": "studio/lib/interact.min.js",
    "/lib/vue.js": "../../vendor/vue.global.prod.js",
    "/lib/three.js": "../../vendor/three.min.js",
    "/lib/echarts.js": "../../vendor/echarts.min.js",
    "/lib/campus.js": "../../assets/models/campus30/campus30-scene.js",
  }),
);
const content = (p) => fs.readFile(path.resolve(here, files.get(p)), "utf8");
const inline = (s) => s.replace(/<\/script/gi, "<\\/script");
async function offline(doc, payload, receivedAt) {
  const copy = structuredClone(doc);
  copy.snapshotTime = Date.now();
  copy.sampleReceivedAt = Number.isFinite(receivedAt)
    ? receivedAt
    : copy.snapshotTime;
  copy.source = {
    kind: "json",
    data: JSON.stringify(payload),
    url: "",
    pollMs: 1000,
    maxAgeMs: doc.source.maxAgeMs,
  };
  let html = await content("/");
  const windowlessCss = await content("/studio.css");
  html = html.replace(
    '<link rel="stylesheet" href="/studio.css">',
    () => "<style>" + windowlessCss + "</style>",
  );
  for (const p of [
    "/lib/vue.js",
    "/lib/echarts.js",
    "/lib/three.js",
    "/lib/campus.js",
    "/lib/interact.js",
  ]) {
    const script = await content(p);
    html = html.replace(
      '<script src="' + p + '"></script>',
      () => "<script>" + inline(script) + "</script>",
    );
  }
  const modules = await Promise.all(
    ["/model.mjs", "/widgets.mjs", "/tag-manager.mjs", "/app.mjs"].map(content),
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
    const send = (status, value, type = "application/json") => {
      res.writeHead(status, {
        "Content-Type": type + "; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(type === "application/json" ? JSON.stringify(value) : value);
    };
    try {
      const p = new URL(req.url, "http://localhost").pathname;
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
        const state = await read();
        if (p === "/api/draft") return send(200, state.draft);
        if (p === "/api/published") {
          const v = state.versions.find((v) => v.id === state.active);
          return send(v ? 200 : 404, v?.doc || { error: "尚未发布页面" });
        }
        if (p === "/api/versions")
          return send(200, {
            active: state.active,
            versions: state.versions.map(({ id, time, doc }) => ({
              id,
              time,
              title: doc.title,
            })),
          });
      }
      if (req.method === "POST") {
        const data = await body(req);
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
          const headers = {};
          if (
            url.origin === process.env.STUDIO_API_ORIGIN &&
            process.env.STUDIO_API_TOKEN
          )
            headers.Authorization = "Bearer " + process.env.STUDIO_API_TOKEN;
          const r = await fetch(url, {
            headers,
            redirect: "error",
            signal: AbortSignal.timeout(5000),
          });
          if (!r.ok) throw Error("上游 HTTP " + r.status);
          return send(200, await r.json());
        }
        if (p === "/api/export") {
          validate(data.doc, true);
          if (data.payload == null) throw Error("请先取得数据样本");
          return send(
            200,
            await offline(data.doc, data.payload, data.receivedAt),
            "text/html",
          );
        }
        if (["/api/draft", "/api/publish"].includes(p)) {
          validate(data, p === "/api/publish");
          if (
            p === "/api/publish" &&
            ["json", "csv"].includes(data.source.kind)
          )
            (data.source.kind === "json" ? JSON.parse : csv)(data.source.data);
          return send(
            200,
            await edit((s) => {
              s.draft = data;
              if (p === "/api/publish") {
                const id = randomUUID();
                s.versions.unshift({
                  id,
                  time: new Date().toISOString(),
                  doc: data,
                });
                s.versions = s.versions.slice(0, 5);
                s.active = id;
              }
              return { active: s.active };
            }),
          );
        }
        if (p === "/api/rollback")
          return send(
            200,
            await edit((s) => {
              if (!s.versions.some((v) => v.id === data.id))
                throw Error("版本不存在");
              s.active = data.id;
              return { active: s.active };
            }),
          );
      }
      send(404, { error: "未找到" });
    } catch (e) {
      send(400, { error: e.message });
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log("配置工作台 http://127.0.0.1:" + port),
  );
