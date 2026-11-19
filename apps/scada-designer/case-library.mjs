import fs from "node:fs/promises";
import path from "node:path";

const categories = {
  "water-treatment": "水处理",
  "process-control": "过程控制",
  "predictive-maintenance": "设备运维",
  "reactor-safety": "安全联锁",
  "building-automation": "楼宇与园区",
  "custom-cso": "定制工艺",
};
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".avif"]);
const types = {
  ".js":"text/javascript", ".mjs":"text/javascript", ".html":"text/html", ".css":"text/css",
  ".json":"application/json", ".png":"image/png", ".webp":"image/webp", ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg", ".svg":"image/svg+xml", ".avif":"image/avif",
};
const encodePath = value => value.split("/").map(encodeURIComponent).join("/");
const existsDir = file => fs.readdir(file, { withFileTypes:true }).catch(error => {
  if (error.code === "ENOENT") return [];
  throw error;
});

export async function createCaseLibrary(root) {
  const cases = [];
  const files = new Map();
  const screenshots = (await fs.readdir(path.join(root, "docs/screenshots"))).sort();
  for (const [category, categoryLabel] of Object.entries(categories)) {
    for (const file of await existsDir(path.join(root, "scenarios", category))) {
      const match = /^(\d{2})-(.+)\.html$/.exec(file.name);
      if (!file.isFile() || !match) continue;
      const [, number, title] = match;
      const id = category === "custom-cso" ? "cso-" + number : number;
      const scenario = "/scenarios/" + category + "/" + file.name;
      const thumbnail = category === "custom-cso" ? "" :
        screenshots.find(name => name.startsWith(number + "-") &&
          imageExtensions.has(path.extname(name)) && !/studio|showcase/.test(name) &&
          (number !== "22" || name.includes("building-automation")));
      const thumb = thumbnail ? "/docs/screenshots/" + thumbnail : "/case-thumbnails/" + id + ".jpg";
      files.set(scenario, path.join(root, scenario.slice(1)));
      if (thumbnail) files.set(thumb, path.join(root, thumb.slice(1)));
      else files.set(thumb, path.join(root, "apps/scada-designer/project-platform/thumbnails", id + ".jpg"));
      cases.push({ id, number, title, category, categoryLabel, url:encodePath(scenario), thumbnail:encodePath(thumb) });
    }
  }
  cases.sort((a, b) => a.id.localeCompare(b.id, "en"));

  async function asset(url) {
    const pathname = decodeURIComponent(url);
    const extension = path.extname(pathname).toLowerCase();
    let file = files.get(pathname);
    if (!file && types[extension] && extension !== ".html") {
      const prefix = ["/vendor/", "/assets/"].find(candidate => pathname.startsWith(candidate));
      if (prefix) {
        const publicDir = path.join(root, prefix.slice(1));
        const candidate = await fs.realpath(path.join(root, pathname.slice(1))).catch(() => null);
        if (candidate) {
          const relative = path.relative(publicDir, candidate);
          if (relative && !relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))
            file = candidate;
        }
      }
      if (pathname === "/packages/runtime/dashboard-runtime.js") file = path.join(root, pathname.slice(1));
    }
    if (!file || !types[extension]) return null;
    try {
      return { data: await fs.readFile(file), type: types[extension] };
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") return null;
      throw error;
    }
  }

  return { cases, asset };
}
