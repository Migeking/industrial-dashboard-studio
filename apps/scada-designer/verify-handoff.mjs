import fs from "node:fs/promises";
import { publicationManifest } from "./deployment.mjs";
import { backupFormat, sha256, validateProjectBackup } from "./project-store.mjs";

try {
  const file = new URL("../../handoff/project-backup.json", import.meta.url);
  const raw = await fs.readFile(file);
  let backup;
  try {
    backup = JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw Error("工程交付备份不是有效 JSON");
  }
  if (backup?.format !== backupFormat || typeof backup.projectId !== "string")
    throw Error("请选择从项目管理下载的工程备份");

  const state = validateProjectBackup(backup);
  const edition = state.versions.find(version => version.id === state.active);
  const manifest = edition?.manifest;
  if (!manifest) throw Error("当前展示版本缺少发布追溯，请在对应运行版重新发布并下载备份");

  const actual = await publicationManifest(manifest.projectId, edition.doc);
  if (manifest.deploymentSha256 !== actual.deploymentSha256)
    throw Error("运行文件与工程发布时不一致，请核对使用的应用提交");
  if (manifest.sourceKind !== actual.sourceKind ||
      JSON.stringify(manifest.assets) !== JSON.stringify(actual.assets))
    throw Error("发布记录中的数据源类型或图源指纹与工程不一致");

  console.log(JSON.stringify({
    projectId: backup.projectId,
    publicationProjectId: manifest.projectId,
    releaseId: edition.id,
    pages: manifest.pages,
    points: manifest.points,
    artwork: manifest.assets.length,
    backupSha256: sha256(raw),
    documentSha256: manifest.documentSha256,
    mappingsSha256: manifest.mappingsSha256,
    deploymentSha256: manifest.deploymentSha256,
  }, null, 2));
} catch (error) {
  console.error(error.code === "ENOENT"
    ? "交付包缺少工程备份或应用文件"
    : error.message);
  process.exitCode = 1;
}
