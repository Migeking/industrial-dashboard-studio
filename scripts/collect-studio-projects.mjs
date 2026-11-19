import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { template, validate } from "../apps/scada-designer/studio/model.mjs";

// Import finished local deliverables. Existing project IDs and draft versions are retained.
const root = fileURLToPath(new URL("../", import.meta.url));
const target = path.resolve(process.argv[2] || path.join(root, "works/studio"));
if (!process.argv[2]) throw Error("请传入目标工程数据目录");
const completed = [
  {id:"scene01",caseId:"01",name:"01 · A²/O 精准调控驾驶舱",source:"editor-v2-implementation/project"},
  {id:"scene05",caseId:"05",name:"05 · 污泥回流泵站 2.5D",source:"scada-depth-acceptance/demo-project"},
  {id:"scene05-agent",caseId:"05",name:"05 · 泵站辅助设计验收",source:"scada-agent-acceptance/demo-project",fromPublished:true},
  {id:"scene07",caseId:"07",name:"07 · A²/O 经典上位 SCADA",source:"scene07-classic/delivery"},
  {id:"scene13",caseId:"13",name:"13 · 高密度絮凝沉淀",source:"scene13-real-model/server"},
  {id:"scene25",caseId:"25",name:"25 · 污泥浓缩脱水",source:"scene25-rebuild/delivery"},
  {id:"water-components",name:"水处理设备与成套组件图册",source:"water-components-acceptance/server"},
  {id:"water-pump",name:"供水泵组工艺监控",source:"screen-designer-implementation/project"},
  {id:"scene30",caseId:"30",name:"30 · 智慧园区模型演示",builtin:"30-demo"},
];

async function readState(file) {
  try {
    const content = await fs.readFile(file, "utf8");
    return JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

const localFile = path.join(target, "project.json");
const local = await readState(localFile);
const local07 = local?.draft?.title.startsWith("07 ") && local?.draft?.nodes.length > 0;
if (local07 && !local.caseId) {
  await fs.copyFile(localFile, path.join(target, "project-before-case-library.json"), fs.constants.COPYFILE_EXCL)
    .catch(error => { if (error.code !== "EEXIST") throw error; });
  await fs.writeFile(localFile + ".migration", JSON.stringify({ ...local, caseId:"07" }), { flag:"wx" });
  await fs.rename(localFile + ".migration", localFile);
}

for (const example of completed) {
  if (example.id === "scene07" && local07) {
    console.log("关联案例 07 → local");
    continue;
  }
  const archive = example.builtin
    ? {draft:template(example.builtin),versions:[],active:null}
    : await readState(path.join(root, "works", example.source, "project.json"));
  if (!archive) {
    console.log("本机未找到归档 " + example.id);
    continue;
  }
  if (example.fromPublished) {
    const publication = archive.versions.find(version => version.id === archive.active)?.doc;
    if (publication) archive.draft = publication;
  }
  validate(archive.draft, false);
  const folder = path.join(target, "projects", example.id);
  await fs.mkdir(folder, { recursive:true });
  const state = { ...archive, name:example.name, caseId:example.caseId || "",
    updatedAt:archive.updatedAt || archive.versions[0]?.time || new Date().toISOString() };
  try {
    await fs.writeFile(path.join(folder, "project.json"), JSON.stringify(state), { flag:"wx" });
    console.log("已收录 " + example.name);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    console.log("保留已有工程 " + example.name);
  }
}
