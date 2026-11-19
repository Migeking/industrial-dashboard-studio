import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { csv, template, validate } from "./studio/model.mjs";

export const versionLimit = 5;
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const backupFormat = "studio-project-backup";
const isDigest = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

export function publicationMatchesDocument(doc, manifest) {
  return manifest.documentSha256 === sha256(JSON.stringify(doc)) &&
    manifest.mappingsSha256 === sha256(JSON.stringify(doc.mappings));
}

export function validatePublication(doc) {
  validate(doc, true);
  if (["json", "csv"].includes(doc.source.kind))
    (doc.source.kind === "json" ? JSON.parse : csv)(doc.source.data);
}

export function projectStore(dir) {
  const projectsDir = path.join(dir, "projects");
  const legacy = "local";
  const writes = new Map();

  function storePath(id) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw Error("工程编号无效");
    return id === legacy ? path.join(dir, "project.json") : path.join(projectsDir, id, "project.json");
  }

  async function read(id, blankLegacy = true) {
    const file = storePath(id);
    try {
      const contents = await fs.readFile(file, "utf8");
      return JSON.parse(contents.replace(/^\uFEFF/, ""));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (id === legacy && blankLegacy) return { draft: template("blank"), versions: [], active: null };
      throw Object.assign(Error("工程不存在"), { code: "ENOENT" });
    }
  }

  async function write(id, state) {
    const file = storePath(id);
    const temp = file + ".tmp";
    await fs.writeFile(temp, JSON.stringify(state));
    await fs.rename(temp, file);
  }

  function edit(id, change) {
    const next = (writes.get(id) || Promise.resolve()).then(async () => {
      const state = await read(id);
      const result = change(state);
      state.updatedAt = new Date().toISOString();
      await write(id, state);
      return result;
    });
    const settled = next.catch(() => {});
    writes.set(id, settled);
    void settled.then(() => { if (writes.get(id) === settled) writes.delete(id); });
    return next;
  }

  async function describe(id, state) {
    const draft = state.draft;
    return {
      id,
      name: state.name || draft.title,
      caseId: state.caseId || "",
      updatedAt: state.updatedAt || (await fs.stat(storePath(id))).mtime.toISOString(),
      published: state.versions.some(v => v.id === state.active),
      pages: 1 + (draft.pages?.length || 0),
      points: draft.mappings.length,
      source: draft.source.kind,
    };
  }

  async function list() {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true }).catch(error => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const ids = [legacy, ...entries.filter(entry => entry.isDirectory() &&
      /^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.name) && entry.name !== legacy).map(entry => entry.name)];
    const projects = await Promise.all(ids.map(async id => {
      try {
        return await describe(id, await read(id, false));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    }));
    return projects.filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function projectName(value) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 80)
      throw Error("请填写 1–80 字的工程名称");
    return value.trim();
  }

  async function create({ name, doc, from, caseId }) {
    const previous = from ? await read(from, false) : null;
    const draft = previous ? structuredClone(previous.draft) : doc || template("blank");
    name = projectName(name ?? (previous ? (previous.name || draft.title) + " 副本" : draft.title));
    if (!doc && !previous) draft.title = name;
    validate(draft, false);
    const state = { name, caseId: previous ? previous.caseId || "" : caseId || "",
      draft, versions: [], active: null };
    return createFromState(state);
  }

  async function createFromState(state) {
    const id = randomUUID();
    state.updatedAt = new Date().toISOString();
    await fs.mkdir(path.dirname(storePath(id)), { recursive: true });
    await write(id, state);
    return describe(id, state);
  }

  async function backup(id) {
    const { name, caseId, draft, versions, active } = await read(id, false);
    return {
      format: backupFormat, version: 1, projectId: id,
      project: { name: name || draft.title, caseId: caseId || "", draft, versions, active },
    };
  }

  async function restore(archive) {
    if (archive?.format && (archive.format !== backupFormat || archive.version !== 1))
      throw Error("工程备份格式或版本不受支持");
    const state = archive?.format ? archive.project : archive;
    if (!state?.draft || !Array.isArray(state.versions) || state.versions.length > versionLimit)
      throw Error("工程备份缺少草稿或发布版本无效");
    validate(state.draft, false);
    const ids = new Set();
    for (const edition of state.versions) {
      if (typeof edition?.id !== "string" || !edition.id || ids.has(edition.id) ||
          typeof edition.time !== "string" || !Number.isFinite(Date.parse(edition.time)))
        throw Error("工程备份中的发布版本编号或时间无效");
      ids.add(edition.id);
      validatePublication(edition.doc);
      const manifest = edition.manifest;
      if (manifest !== undefined &&
          (manifest?.format !== 1 || typeof manifest.projectId !== "string" ||
           !isDigest(manifest.deploymentSha256) ||
           manifest.points !== edition.doc.mappings.length ||
           manifest.pages !== 1 + (edition.doc.pages?.length || 0) ||
           !Array.isArray(manifest.assets) || manifest.assets.some(asset => !isDigest(asset?.sha256)) ||
           !publicationMatchesDocument(edition.doc, manifest)))
        throw Error("工程备份中的发布追溯记录与文档不一致");
    }
    if (state.active !== null && !ids.has(state.active))
      throw Error("工程备份的当前展示版本不存在");
    if (state.caseId != null && (typeof state.caseId !== "string" || state.caseId.length > 64))
      throw Error("工程备份的关联案例无效");
    const name = projectName(state.name || state.draft.title);
    return createFromState({
      name: name.slice(0, 77) + " 恢复", caseId: state.caseId || "",
      draft: state.draft, versions: state.versions, active: state.active,
    });
  }

  async function rename(id, name) {
    name = projectName(name);
    if (id === legacy) await read(id, false);
    return edit(id, state => { state.name = name; return { id, name }; });
  }

  return { read, edit, list, create, rename, backup, restore };
}
