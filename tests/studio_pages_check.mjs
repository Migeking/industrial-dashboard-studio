import assert from "node:assert/strict";
import {
  blankScreen,
  screenNode,
  editScreenDefinition,
  editScreenEndpoint,
} from "../packages/runtime/studio/screen-model.mjs";
import {
  screenPages,
  screenPageView,
  addScreenPage,
  screenPageForNode,
  screenPageItems,
  removeScreenPage,
  screenActionProblem,
} from "../packages/runtime/studio/screen-pages.mjs";
import { validate } from "../apps/scada-designer/studio/model.mjs";

const project = blankScreen();
project.nodes.push(screenNode("rect", "home-node", 100, 100));
const page = addScreenPage(project, "page-2"),
  view = screenPageView(project, page.id);
view.nodes.push(screenNode("text", "child-node", 200, 200));
view.title = "运行驾驶舱";
assert.equal(project.title, "新建监控画面");
assert.equal(project.pages[0].title, "运行驾驶舱");
assert.equal(project.nodes.length, 1);
assert.equal(project.pages[0].nodes.length, 1);
view.nodes = [screenNode("readout", "replaced", 200, 200)];
assert.equal(project.pages[0].nodes[0].id, "replaced");
assert.equal(project.nodes[0].id, "home-node");
view.source = { ...view.source, data: '{"a":1}' };
assert.equal(project.source.data, '{"a":1}');
project.mappings = [
  {
    id: "a",
    label: "共享点",
    kind: "number",
    path: "a",
    scale: 1,
    offset: 0,
    precision: 2,
  },
];
view.nodes[0].bindings.value = "a";
// Active page proxies expose root project metadata; editing must validate the
// current geometry once rather than treating its own page as a duplicate.
editScreenDefinition(view, "replaced", "ports", "add", {
  id: "outlet",
  label: "出口",
  x: 100,
  y: 50,
  direction: "out",
});
editScreenDefinition(view, "replaced", "slots", "add", {
  key: "temperature",
  label: "温度",
  kinds: ["number"],
  role: "extra",
  required: false,
});
view.pipes.push({
  id: "child-pipe",
  type: "pipe",
  title: "支路",
  source: { nodeId: "replaced", portId: "outlet" },
  target: { x: 900, y: 500 },
  vertices: [],
  style: { color: "#557f96", width: 7 },
  bindings: {},
});
editScreenEndpoint(view, "child-pipe", "target", { x: 1000, y: 600 });
assert.equal(project.pages[0].nodes[0].ports[0].id, "outlet");
assert.equal(project.pages[0].pipes[0].target.x, 1000);
project.defaultPageId = page.id;
validate(project, true);
assert.equal(screenPageForNode(project, "replaced"), page.id);
assert.equal(screenPageItems(project).length, 3);
assert.equal(screenPages(project).length, 2);
const navigation = project.nodes[0];
navigation.action = { type: "navigate", pageId: page.id };
validate(project, true);
assert.equal(screenActionProblem(navigation, project), "");
assert.throws(() => removeScreenPage(project, page.id), /导航/);
navigation.action.pageId = "missing";
validate(project, false);
assert.throws(() => validate(project, true), /导航/);
assert.match(screenActionProblem(navigation, project), /目标画面/);
navigation.action = { type: "link", url: "" };
validate(project, false);
assert.throws(() => validate(project, true), /链接/);
navigation.action = { type: "link", url: "javascript:alert(1)" };
assert.throws(() => validate(project, false), /HTTP/);
navigation.action = { type: "none" };
project.pages[0].nodes[0].action = { type: "trend", slot: "value" };
validate(project, true);
project.pages[0].nodes[0].bindings.value = "";
assert.match(screenActionProblem(project.pages[0].nodes[0], project), /趋势/);
project.pages[0].nodes[0].bindings.value = "a";
const duplicate = JSON.parse(JSON.stringify(project));
duplicate.pages[0].nodes[0].id = "home-node";
assert.throws(() => validate(duplicate, false), /不同画面/);
project.pages[0].nodes[0].action = { type: "navigate", pageId: page.id };
removeScreenPage(project, page.id);
assert.equal(project.pages.length, 0);
assert.equal(project.defaultPageId, "main");
console.log(
  "PASS: writable page views, shared source, all-page validation, stable identities, navigation guards, typed trend actions and safe page removal",
);
