import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./project-store.mjs";
import { waterArtwork } from "../../packages/components/studio/water-artwork.mjs";
import { screenDepthArtwork } from "../../packages/components/studio/screen-artwork.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const files = new Map(
  Object.entries({
    "/editor": "studio/index.html",
    "/projects": "project-platform/index.html",
    "/project-platform.css": "project-platform/platform.css",
    "/project-platform.mjs": "project-platform/platform.mjs",
    "/view": "studio/index.html",
    "/studio.css": "studio/studio.css",
    "/app.mjs": "studio/app.mjs",
    "/model.mjs": "studio/model.mjs",
    "/widgets.mjs": "studio/widgets.mjs",
    "/tag-manager.mjs": "studio/tag-manager.mjs",
    "/packages/components/studio/screen-artwork.mjs": "../../packages/components/studio/screen-artwork.mjs",
    "/packages/components/studio/water-equipment.mjs": "../../packages/components/studio/water-equipment.mjs",
    "/packages/components/studio/water-artwork.mjs": "../../packages/components/studio/water-artwork.mjs",
    "/packages/runtime/studio/screen-routing.mjs": "../../packages/runtime/studio/screen-routing.mjs",
    "/packages/runtime/studio/equipment-display.mjs": "../../packages/runtime/studio/equipment-display.mjs",
    "/packages/components/studio/screen-symbols.mjs": "../../packages/components/studio/screen-symbols.mjs",
    "/packages/runtime/studio/screen-model.mjs": "../../packages/runtime/studio/screen-model.mjs",
    "/packages/runtime/studio/screen-renderer.mjs": "../../packages/runtime/studio/screen-renderer.mjs",
    "/screen-assistant.mjs": "studio/screen-assistant.mjs",
    "/packages/runtime/studio/screen-commands.mjs": "../../packages/runtime/studio/screen-commands.mjs",
    "/screen-inspector.mjs": "studio/screen-inspector.mjs",
    "/screen-definitions.mjs": "studio/screen-definitions.mjs",
    "/screen-rules.mjs": "studio/screen-rules.mjs",
    "/screen-library.mjs": "studio/screen-library.mjs",
    "/screen-viewport.mjs": "studio/screen-viewport.mjs",
    "/screen-pages.mjs": "studio/screen-pages.mjs",
    "/screen-actions.mjs": "studio/screen-actions.mjs",
    "/screen-widget-settings.mjs": "studio/screen-widget-settings.mjs",
    "/packages/runtime/studio/screen-trend-panel.mjs": "../../packages/runtime/studio/screen-trend-panel.mjs",
    "/packages/runtime/studio/screen-pages.mjs": "../../packages/runtime/studio/screen-pages.mjs",
    "/packages/runtime/studio/screen-library.mjs": "../../packages/runtime/studio/screen-library.mjs",
    "/packages/runtime/studio/screen-dynamics.mjs": "../../packages/runtime/studio/screen-dynamics.mjs",
    "/packages/runtime/studio/screen-controls.mjs": "../../packages/runtime/studio/screen-controls.mjs",
    "/screen-control-settings.mjs": "studio/screen-control-settings.mjs",
    "/packages/runtime/studio/screen-widgets.mjs": "../../packages/runtime/studio/screen-widgets.mjs",
    "/packages/runtime/studio/screen-themes.mjs": "../../packages/runtime/studio/screen-themes.mjs",
    "/packages/components/studio/native-data.mjs": "../../packages/components/studio/native-data.mjs",
    "/packages/runtime/studio/native-model.mjs": "../../packages/runtime/studio/native-model.mjs",
    "/packages/runtime/studio/native-renderer.mjs": "../../packages/runtime/studio/native-renderer.mjs",
    "/lib/interact.js": "studio/lib/interact.min.js",
    "/lib/x6.js": "../../vendor/x6.min.js",
    "/lib/vue.js": "../../vendor/vue.global.prod.js",
    "/lib/three.js": "../../vendor/three.min.js",
    "/lib/echarts.js": "../../vendor/echarts.min.js",
    "/lib/campus.js": "../../assets/models/campus30/campus30-scene.js",
  }),
);

export async function deploymentDigest() {
  const dependencies = [...new Set([
    ...[...files.values()].filter(file => !file.startsWith("project-platform/")),
    "server.mjs", "deployment.mjs", "project-store.mjs", "protocol.mjs", "bridge.py", "bridge-requirements.txt",
    "model-assistant.mjs", "model-schema.mjs",
  ])].sort();
  const checksums = await Promise.all(dependencies.map(async file =>
    [file, sha256(await fs.readFile(path.resolve(here, file)))],
  ));
  return sha256(JSON.stringify(checksums));
}

export async function publicationManifest(projectId, doc) {
  const pages = [doc, ...(doc.pages || [])];
  const assets = new Map();
  for (const node of pages.flatMap(page => page.nodes || [])) {
    const symbol = node.symbol || node.type;
    const appearance = node.params?.appearance;
    const image = appearance === "picture" || symbol === "image"
      ? node.image
      : waterArtwork[symbol] || (appearance === "depth" ? screenDepthArtwork[symbol] : null);
    if (typeof image !== "string" || !image) continue;
    const asset = { symbol, version: node.equipmentVersion ?? null, sha256: sha256(image) };
    assets.set(JSON.stringify(asset), asset);
  }
  return {
    format: 1,
    projectId,
    pages: pages.length,
    points: doc.mappings.length,
    sourceKind: doc.source.kind,
    documentSha256: sha256(JSON.stringify(doc)),
    mappingsSha256: sha256(JSON.stringify(doc.mappings)),
    deploymentSha256: await deploymentDigest(),
    assets: [...assets.values()],
  };
}
