import { blankScreen, isScreen } from "./screen-model.mjs";
import { screenSlots } from "../../components/studio/screen-symbols.mjs";

export const screenHomePage = "main";
export function screenPages(project) {
  return [
    {
      id: screenHomePage,
      title: project.title,
      canvas: project.canvas,
      nodes: project.nodes,
      pipes: project.pipes,
    },
    ...(project.pages || []),
  ];
}
export function screenPageView(project, id) {
  if (!isScreen(project) || id === screenHomePage) return project;
  const page = project.pages?.find((p) => p.id === id);
  if (!page) return project;
  const fields = new Set(["title", "canvas", "nodes", "pipes"]);
  return new Proxy(project, {
    get(target, key) {
      return fields.has(key) ? page[key] : target[key];
    },
    set(target, key, value) {
      if (fields.has(key)) page[key] = value;
      else target[key] = value;
      return true;
    },
  });
}
export function addScreenPage(project, id) {
  if (!isScreen(project)) throw Error("请先新建画面项目");
  const pages = screenPages(project);
  let i = 2;
  while (pages.some((p) => p.title === "画面 " + i)) i++;
  const blank = blankScreen(),
    page = {
      id,
      title: "画面 " + i,
      canvas: JSON.parse(JSON.stringify(project.canvas || blank.canvas)),
      nodes: [],
      pipes: [],
    };
  project.pages ||= [];
  project.pages.push(page);
  return page;
}
export function screenPageForNode(project, id) {
  return (
    screenPages(project).find((p) =>
      [...p.nodes, ...p.pipes].some((n) => n.id === id),
    )?.id || screenHomePage
  );
}
export function screenPageItems(project) {
  return screenPages(project).flatMap((p) => [...p.nodes, ...p.pipes]);
}
export function removeScreenPage(project, id) {
  if (id === screenHomePage) throw Error("主画面需保留，可清空内容或修改名称");
  if (
    screenPages(project)
      .filter((p) => p.id !== id)
      .flatMap((p) => [...p.nodes, ...p.pipes])
      .some((n) => n.action?.type === "navigate" && n.action.pageId === id)
  )
    throw Error("该画面仍被导航动作引用，请先修改导航目标");
  project.pages = (project.pages || []).filter((p) => p.id !== id);
  if (project.defaultPageId === id) project.defaultPageId = screenHomePage;
}
export function screenActionProblem(n, project) {
  const action = n.action;
  if (!action || action.type === "none") return "";
  if (action.type === "details")
    return action.targetId && !screenPages(project).some(page => page.nodes.some(node => node.id === action.targetId))
      ? "弹窗目标已不存在，请重新选择" : "";
  if (action.type === "trend") {
    const slot = screenSlots(n).find((s) => s.key === action.slot),
      mapping = project.mappings.find(
        (m) => m.id === n.bindings?.[action.slot],
      );
    return !slot || !mapping || !["number", "dataset"].includes(mapping.kind)
      ? "趋势动作需要绑定数值或历史数据槽位"
      : "";
  }
  if (
    action.type === "navigate" &&
    !screenPages(project).some((p) => p.id === action.pageId)
  )
    return "请选择有效的目标画面";
  if (action.type === "link") {
    try {
      const url = new URL(action.url);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        return "请使用 HTTP 或 HTTPS 链接";
    } catch {
      return "请填写有效的链接地址";
    }
  }
  return "";
}
