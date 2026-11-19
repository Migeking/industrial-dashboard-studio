import {screenControlKinds,screenControlProblem} from '../../../packages/runtime/studio/screen-controls.mjs';
import {
  types,
  fans,
  mapped,
  node,
  template,
  validate,
  csv,
  normalize,
  pointReasonLabels,
  effectivePollMs,
  protocolMappings,
  snapshotPointRows,
  snapshotPointMapping,
  compatibleMappings,
  bindingProblem,
  campusBindings,
  campusState,
} from "./model.mjs";
import { Widget } from "./widgets.mjs";
import { PointConversion, TagManager, pointPreview } from "./tag-manager.mjs";
import { isNative, nativeTypes, nativeSlots, nativeSlotMappings, nativeBranch, cloneNativeBranch, nativeRecipes, nativeRecipe, nativeBlank } from "../../../packages/runtime/studio/native-model.mjs";
import { NativeStage } from "../../../packages/runtime/studio/native-renderer.mjs";
import { isScreen, blankScreen, copyScreenSelection,validateScreenAsset,screenAssetProblem,screenMediumPipeStyle } from "../../../packages/runtime/studio/screen-model.mjs";
import { screenDepthArtwork } from "../../../packages/components/studio/screen-artwork.mjs";
import { waterArtwork } from '../../../packages/components/studio/water-artwork.mjs';
import { waterEquipment, waterEquipmentGroups } from '../../../packages/components/studio/water-equipment.mjs';
import { resizeScreenPorts, screenSymbols, screenPidSymbols } from "../../../packages/components/studio/screen-symbols.mjs";
import { ScreenStage } from "../../../packages/runtime/studio/screen-renderer.mjs";
import { executeScreenCommands } from "../../../packages/runtime/studio/screen-commands.mjs";
import { ScreenAssistant } from "./screen-assistant.mjs";
import { ScreenInspector } from "./screen-inspector.mjs";
import {ScreenLibrary} from "./screen-library.mjs";
import {placeScreenSymbol} from "../../../packages/runtime/studio/screen-library.mjs";
import {useScreenViewport,ScreenViewportTools,ScreenRulers} from "./screen-viewport.mjs";
import {screenPages,screenPageView,addScreenPage,screenPageForNode,screenPageItems,removeScreenPage,screenActionProblem} from "../../../packages/runtime/studio/screen-pages.mjs";
import {ScreenPageNavigator} from "./screen-pages.mjs";
import {screenDrawingAppearances,applyScreenAppearance,screenThemes,screenPurposes,applyScreenPurpose,applyScreenTheme,applyScreenNodeTheme,applyScreenNodeDefaults} from "../../../packages/runtime/studio/screen-themes.mjs";
const screenPaletteGroups = {
  devices: { label: "独立设备", symbols: ["pump", "valve", "checkValve", "tank", "fan", ...waterEquipmentGroups.devices] },
  units: { label:'成套工艺单元', symbols:waterEquipmentGroups.units },
  measurements: { label: "数据与素材", symbols: ["readout", "trend", "image"] },
  widgets: { label: "驾驶舱组件", symbols: ["modeSwitch", "numberStepper", "trendRange", "status", "barGauge", "gauge", "barChart", "pieChart", "table", "events", "button"] },
  pid: { label: "工业控制 · P&ID", symbols: Object.keys(screenPidSymbols) },
  shapes: { label:'基础图形与管网', symbols:['junction','rect','ellipse','line','polyline','polygon','text'] },
};
const offline = window.OFFLINE;
const clone = (v) => JSON.parse(JSON.stringify(v));
const kindNames = {
  number: "数值",
  boolean: "开关量",
  text: "文本",
  dataset: "数据表",
};
const projectKey = new URLSearchParams(location.search).get("project");
const projectScopedApis = new Set(["/api/draft", "/api/published", "/api/publish", "/api/versions", "/api/rollback"]);
async function api(url, data) {
  if (projectKey && projectScopedApis.has(url)) url += "?project=" + encodeURIComponent(projectKey);
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
  document.getElementById("app").classList.toggle("editor-shell", !viewer);
  Vue.createApp({
    components: { ScreenAssistant,Widget, TagManager, PointConversion, NativeStage, ScreenStage, ScreenInspector,ScreenLibrary,ScreenViewportTools,ScreenRulers,ScreenPageNavigator },
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
      const project=ref(initial),activePageId=ref(new URLSearchParams(location.search).get("page")||(viewer?initial.defaultPageId:undefined)||"main");
      const doc = computed({get:()=>screenPageView(project.value,activePageId.value),set:(value)=>{project.value=value;if(!isScreen(value)||activePageId.value!=="main"&&!value.pages?.some(p=>p.id===activePageId.value))activePageId.value="main";}}),
        ids = ref([]),
        stage = ref(),
        zoom = ref(1),
        preview = ref(false),
        dialog = ref(""),
        message = ref("");
      const assistantOpen=ref(new URLSearchParams(location.search).get("assistant")==="1"),assistantResult=shallowRef(null),assistantError=ref(""),assistantSession=ref({chat:[],allowed:[],prompt:""});
      let assistantPayload=null;
      const assistantApplied=new Set();
      const assistantDoc=computed(()=>assistantResult.value?screenPageView(assistantResult.value.project,activePageId.value):doc.value);
      function cancelAssistant(){assistantResult.value=null;assistantError.value="";assistantPayload=null;}
      function previewAssistant(payload){try{assistantPayload=payload;assistantResult.value=executeScreenCommands(project.value,payload.proposal,payload.allowed);assistantError.value="";ids.value=[];}catch(e){assistantResult.value=null;assistantError.value=e.message;}}
      function applyAssistant(){
        if(!assistantResult.value||!assistantPayload)return;
        try{
          if(assistantApplied.has(assistantPayload.proposal.id))throw Error("此批次已经应用，请重新生成");
          const result=executeScreenCommands(project.value,assistantPayload.proposal,assistantPayload.allowed);
          snapshot();project.value=result.project;assistantApplied.add(assistantPayload.proposal.id);
          ids.value=[...new Set(result.changes.map(c=>c.id))];
          cancelAssistant();message.value="AI 辅助设计已整批应用，可继续提需求或一次撤销。";
        }catch(e){assistantError.value=e.message;}
      }
      watch(activePageId,()=>{cancelAssistant();assistantOpen.value=false;assistantSession.value={chat:[],allowed:[],prompt:""};});
      const editing = computed(() => !viewer && !preview.value),
        sel = computed(() =>
          [...doc.value.nodes,...(isScreen(doc.value)?doc.value.pipes:[])].find((n) => n.id === ids.value.at(-1)),
        );
      const screen = computed(()=>isScreen(doc.value)), screenTool = ref("select"), libraryTab = ref("symbols");
      const componentQuery=ref(''),componentCategory=ref('all');
      const componentCategories={all:'全部组件',units:'成套工艺单元',devices:'独立设备',pid:'工业控制 · P&ID',measurements:'数据与素材',widgets:'驾驶舱组件',shapes:'基础图形与管网'};
      const componentArtwork={...screenDepthArtwork,...waterArtwork};
      const screenPaletteSections = computed(() => {
        const preset = screenPurposes[doc.value.canvas?.purpose] || screenPurposes.process;
        const order=preset.groups[0]==='widgets'?['widgets','measurements','pid','units','devices','shapes']:['units','devices','pid','measurements','widgets','shapes'];
        const query=componentQuery.value.trim().toLowerCase();
        return order.filter(key=>componentCategory.value==='all'||componentCategory.value===key).map(key=>({key,...screenPaletteGroups[key],symbols:screenPaletteGroups[key].symbols.filter(symbol=>!query||[symbol,screenSymbols[symbol].label,waterEquipment[symbol]?.keywords].join(' ').toLowerCase().includes(query))})).filter(group=>group.symbols.length);
      });
      const screenView=useScreenViewport(stage,screen,editing,zoom);
      const pages=computed(()=>screen.value?screenPages(project.value):[]),publishedUrl=computed(()=>{
        const params = new URLSearchParams();
        if (projectKey) params.set("project", projectKey);
        if (screen.value && activePageId.value !== "main") params.set("page", activePageId.value);
        return "/view" + (params.size ? "?" + params : "");
      });
      if(screen.value&&!pages.value.some(p=>p.id===activePageId.value))activePageId.value=project.value.defaultPageId||'main';
      watch(()=>[activePageId.value,screen.value],()=>{const url=new URL(location.href);if(screen.value&&activePageId.value!=='main')url.searchParams.set('page',activePageId.value);else url.searchParams.delete('page');window.history.replaceState(null,'',url.pathname+url.search+url.hash);});
      function switchScreenPage(id){if(!pages.value.some(p=>p.id===id)){message.value="目标画面已不存在";return;}if(activePageId.value===id)return;activePageId.value=id;ids.value=[];screenTool.value="select";screenView.fit();if(viewer)window.history.replaceState(null,"",publishedUrl.value);}
      function addPage(){snapshot();const page=addScreenPage(project.value,crypto.randomUUID());switchScreenPage(page.id);preview.value=false;activeStep.value="canvas";message.value="已添加空白画面，连接、点表和我的图元共用。";}
      function pageAction(key,value){try{if(key==="rename"){if(!value?.trim())throw Error("请填写画面名称");snapshot();doc.value.title=value.trim();}else if(key==="home"){snapshot();project.value.defaultPageId=activePageId.value;}else if(key==="remove"){removeScreenPage(clone(project.value),activePageId.value);snapshot();removeScreenPage(project.value,activePageId.value);switchScreenPage("main");}message.value="画面设置已更新";}catch(e){message.value=e.message;}}
      function openWorkspaceCategory(category) {
        componentCategory.value = category;
        componentQuery.value = "";
        libraryTab.value = "symbols";
        screenView.leftCollapsed = false;
        if (activeStep.value === "scene") goStep("canvas");
      }
      const screenItems = computed(()=>[...doc.value.nodes,...(screen.value?doc.value.pipes:[])]);
      function screenLayerName(item) {
        if (item.type !== "pipe" || item.title !== "工艺管道") return item.title;
        const label = (end) => doc.value.nodes.find((node) => node.id === end.nodeId)?.title ||
          ("开放端 (" + Math.round(end.x) + ", " + Math.round(end.y) + ")");
        return label(item.source) + " → " + label(item.target);
      }
      const screenLayerSections = computed(() => {
        const groups = [
          { key:"overlay", label:"前景 · 标注与数据", items:[] },
          { key:"equipment", label:"设备与工艺", items:[] },
          { key:"pipes", label:"管线与接头", items:[] },
          { key:"background", label:"背景与底板", items:[] },
        ];
        const query = layerSearch.value.trim().toLowerCase();
        const foreground = new Set([...screenPaletteGroups.measurements.symbols, ...screenPaletteGroups.widgets.symbols,
          "pidInstrument", "pidInterlock", "text"]);
        for (const node of [...screenItems.value].sort((a,b)=>(b.z??0)-(a.z??0))) {
          const description = screenLayerName(node) + " " + (screenSymbols[node.symbol]?.label || "管道");
          if (query && !description.toLowerCase().includes(query)) continue;
          const group = node.type === "pipe" || node.symbol === "junction" ? 2
            : node.z < 0 ? 3
            : foreground.has(node.symbol) ? 0 : 1;
          groups[group].items.push(node);
        }
        return groups.filter(group=>group.items.length);
      });
      function newScreen() {
        if(screen.value)return addPage();
        snapshot();
        const next=blankScreen(); next.source=clone(doc.value.source); next.mappings=clone(doc.value.mappings);next.symbols=clone(doc.value.symbols||[]);
        doc.value=next; ids.value=[]; screenTool.value="select"; libraryTab.value="symbols";screenView.fit();goStep("canvas");
        message.value="已新建空白画面，连接与点表已保留；可撤销恢复原画面。";
      }
      function setScreenTheme(id){try{snapshot();applyScreenTheme(doc.value,id);}catch(e){message.value=e.message;}}
      function setScreenPurpose(purpose) {
        if (!Object.hasOwn(screenPurposes, purpose) || screenItems.value.length) return;
        if (doc.value.canvas.purpose === purpose) return;
        snapshot();
        applyScreenPurpose(doc.value, purpose);
      }
      function setScreenDrawingAppearance(value) {
        if (!Object.hasOwn(screenDrawingAppearances,value)) return;
        snapshot(); doc.value.canvas.appearance=value;
      }
      function applyDrawingAppearance(selectedOnly) {
        const targets=selectedOnly?ids.value:undefined;
        if (selectedOnly&&!targets.length) { message.value="请先选择需要换外观的设备或管道。"; return; }
        snapshot();
        const count=applyScreenAppearance(doc.value,doc.value.canvas.appearance||"classic",targets);
        message.value=`已更新 ${count} 个对象的外观；锁定对象和自带图稿已保留。`;
      }
      function screenSelect(selected) { ids.value=selected; }
      function screenGeometry(change) {
        const n = doc.value.nodes.find((node) => node.id === change.id);
        if (!n || n.locked) return;
        const width = Math.max(16, Math.min(1920, Number.isFinite(change.w) ? change.w : n.w));
        const height = Math.max(16, Math.min(1080, Number.isFinite(change.h) ? change.h : n.h));
        if (n.ports && (n.w !== width || n.h !== height))
          n.ports = resizeScreenPorts(n, width, height);
        n.w = width;
        n.h = height;
        for (const key of ["x", "y", "angle"])
          if (Number.isFinite(change[key])) n[key] = change[key];
        if (change.points) n.points = clone(change.points);
        n.x = Math.max(0, Math.min(1920 - width, n.x));
        n.y = Math.max(0, Math.min(1080 - height, n.y));
      }
      function screenInsert(n) {if(componentArtwork[n.symbol])n.params.appearance="depth";applyScreenNodeDefaults(n,doc.value.canvas);doc.value.nodes.push(n);ids.value=[n.id];inspectorTab.value="appearance";}
      function screenPipe(pipe) {

        const index = doc.value.pipes.findIndex((p) => p.id === pipe.id);
        if (index >= 0) {
          // A drag emits geometry repeatedly from its original definition.
          // Keep defaults/inspector styling already applied to the saved edge.
          pipe.style = { ...pipe.style, ...doc.value.pipes[index].style };
          doc.value.pipes[index] = pipe;
          return;
        }
        if (doc.value.canvas.theme === "cockpit-dark")
          pipe.style = { ...pipe.style, color: "#224253", width: 8, appearance: "detailed" };
        if(doc.value.canvas.appearance) pipe.style.appearance=doc.value.canvas.appearance;
        if([pipe.source,pipe.target].some(e=>doc.value.nodes.find(n=>n.id===e.nodeId)?.params.appearance==="depth"))pipe.style={...pipe.style,appearance:"depth",width:5};
        Object.assign(pipe.style, screenMediumPipeStyle(doc.value, pipe));
        doc.value.pipes.push(pipe);
      }
      function setScreenTool(tool) {screenView.panTool=false;screenTool.value=tool;if(tool==="pipe")ids.value=[];}
      function screenDrag(event,symbol) {event.dataTransfer.setData("application/x-scada-symbol",symbol);}
      function screenLibraryPlace({id,x,y}){try{const symbol=doc.value.symbols?.find(s=>s.id===id);if(!symbol)throw Error("图元已不存在");ids.value=placeScreenSymbol(doc.value,symbol,x,y,()=>crypto.randomUUID());if(doc.value.canvas.theme)doc.value.nodes.filter(n=>ids.value.includes(n.id)).forEach(n=>applyScreenNodeTheme(n,doc.value.canvas.theme));inspectorTab.value="appearance";message.value="图元已放置，请为新实例选择测点。";}catch(e){message.value=e.message;}}
      function screenCommand({key,step=1,file}) {
        if(key==="undo")return undo(); if(key==="redo")return redo();
        if(key==="image")return loadImage(file);
        if(key==="device-picture")return loadImage(file, true);
        const selected=doc.value.nodes.filter((n)=>ids.value.includes(n.id)), movable=selected.filter((n)=>!n.locked);
        if(!selected.length&&!ids.value.some((id)=>doc.value.pipes.some((p)=>p.id===id)))return;
        snapshot();
        if (key === "copy" || key === "copy-bound") {
          const keepBindings = key === "copy-bound";
          ids.value = copyScreenSelection(doc.value, ids.value, () => crypto.randomUUID(), keepBindings);
          message.value = keepBindings ? "已复制，副本使用相同测点。" : "已复制；新设备的测点绑定为空，请独立选择。";
          return;
        }
        if(key==="delete"){const removed=new Set(movable.map((n)=>n.id));doc.value.nodes=doc.value.nodes.filter((n)=>!removed.has(n.id));doc.value.pipes=doc.value.pipes.filter((p)=>!ids.value.includes(p.id)&&!removed.has(p.source.nodeId)&&!removed.has(p.target.nodeId));ids.value=[];return;}
        if(key==="lock"){const value=!selected.every((n)=>n.locked);selected.forEach((n)=>n.locked=value);return;}
        if(key==="rotate"){movable.forEach((n)=>n.angle=(n.angle+90)%360);return;}
        if(key==="group"){const id=crypto.randomUUID();movable.forEach((n)=>n.group=id);return;}
        if(key==="ungroup"){movable.forEach((n)=>delete n.group);return;}
        if(key==="front"||key==="back"){const values=doc.value.nodes.map((n)=>n.z);movable.forEach((n)=>n.z=key==="front"?Math.max(...values)+1:Math.min(...values)-1);return;}
        if(!movable.length)return;
        const box={x:Math.min(...movable.map((n)=>n.x)),y:Math.min(...movable.map((n)=>n.y)),right:Math.max(...movable.map((n)=>n.x+n.w)),bottom:Math.max(...movable.map((n)=>n.y+n.h))};
        for(const n of movable){
          if(key==="left")n.x=box.x;if(key==="right")n.x=box.right-n.w;if(key==="center")n.x=(box.x+box.right-n.w)/2;
          if(key==="top")n.y=box.y;if(key==="bottom")n.y=box.bottom-n.h;if(key==="middle")n.y=(box.y+box.bottom-n.h)/2;
        }
        if(["horizontal","vertical"].includes(key)&&movable.length>=3){const axis=key==="horizontal"?"x":"y",dimension=axis==="x"?"w":"h",sorted=[...movable].sort((a,b)=>a[axis]-b[axis]);const gap=(sorted.at(-1)[axis]+sorted.at(-1)[dimension]-sorted[0][axis]-sorted.reduce((sum,n)=>sum+n[dimension],0))/(sorted.length-1);let position=sorted[0][axis];for(const n of sorted){n[axis]=position;position+=n[dimension]+gap;}}
        if(key.startsWith("Arrow")){const dx=key==="ArrowLeft"?-Math.min(step,box.x):key==="ArrowRight"?Math.min(step,1920-box.right):0,dy=key==="ArrowUp"?-Math.min(step,box.y):key==="ArrowDown"?Math.min(step,1080-box.bottom):0;movable.forEach((n)=>{n.x+=dx;n.y+=dy;});}
      }
      const nativeRects = ref({}), collapsed = ref([]), layerSearch = ref("");
      const native = computed(() => isNative(doc.value));
      const legacyTypes = Object.fromEntries(Object.entries(types).filter(([k]) => !nativeTypes.has(k)));
      const descendants = (n) => native.value ? nativeBranch(doc.value, n.id) : [n];
      const hasBindings = (n) => n && descendants(n).some((child) => mapped(child));
      const nativeBindingTargets = computed(() => sel.value ? descendants(sel.value).filter((n) => mapped(n)) : []);
      const nodeCount = computed(() => native.value ? doc.value.nodes.filter((n) => n.editable).length : screenItems.value.length);
      function parentChain(n) {
        const result = []; let p = n.parentId;
        while (p) { const parent = doc.value.nodes.find((x) => x.id === p); if (!parent) break; result.push(parent); p = parent.parentId; }
        return result;
      }
      const navigatorNodes = computed(() => native.value ? doc.value.nodes.filter((n) => n.editable && (!layerSearch.value || n.title.includes(layerSearch.value)) && (layerSearch.value || !parentChain(n).some((p) => collapsed.value.includes(p.id)))) : [...doc.value.nodes].reverse());
      const depth = (n) => native.value ? Math.min(4, parentChain(n).filter((p) => p.editable).length) : 0;
      const expandable = (n) => native.value && descendants(n).some((x) => x.id !== n.id && x.editable);
      function toggleTree(n) { collapsed.value = collapsed.value.includes(n.id) ? collapsed.value.filter((id) => id !== n.id) : [...collapsed.value, n.id]; }
      function nativeSelect(event) {
        if (!event) { ids.value = []; return; }
        const n = doc.value.nodes.find((n) => n.id === event.id);
        collapsed.value = collapsed.value.filter((id) => !parentChain(n).some((p) => p.id === id));
        pick(n, event);
      }
      function nativeMove({ id, dx, dy }) { const n = doc.value.nodes.find((n) => n.id === id); if (!n || n.locked) return; n.layout.dx = (n.layout.dx || 0) + dx; n.layout.dy = (n.layout.dy || 0) + dy; }
      function nativePatch(changes) { if (!doc.value.source.demo || doc.value.source.kind !== "json") return; raw.value = { ...raw.value, ...changes }; sequence.value++; }
      const rectValue = (n, key) => native.value ? Math.round(nativeRects.value[n.id]?.[key] || 0) : n[key];
      const rectDraft = Vue.reactive({ id: "", key: "", value: "" });
      const rectInputValue = (n, key) => rectDraft.id === n.id && rectDraft.key === key ? rectDraft.value : rectValue(n, key);
      function startRect(n, key, event) { Object.assign(rectDraft, { id: n.id, key, value: event.target.value }); }
      function nativeBinding(n, slot, value) {
        snapshot(); n.bindings[slot] = value;
        const series = n.chart?.series.find((s) => s.slot === slot), mapping = doc.value.mappings.find((m) => m.id === value);
        if (series && mapping) series.name = mapping.label || mapping.id;
      }
      const pipePoints = computed(() => {
        const n = sel.value, path = n?.attrs?.d;
        if (!native.value || !path || !/(flow|pipe)/.test(n.attrs.class || "") || /[^MLHVZmlhvz\d\s.,-]/.test(path)) return [];
        const chunks = path.match(/[MLHV][^MLHV]*/gi) || [], rows = [];
        let x = 0, y = 0;
        for (const chunk of chunks) { const command = chunk[0].toUpperCase(), values = chunk.slice(1).match(/-?\d+(?:\.\d+)?/g)?.map(Number) || []; if (["M", "L"].includes(command)) { x = values[0]; y = values[1]; } if (command === "H") x = values[0]; if (command === "V") y = values[0]; rows.push({ x, y, start: command === "M" }); }
        return rows;
      });
      function updatePipe(index, key, value) {
        if (!Number.isFinite(Number(value))) return;
        snapshot(); const rows = pipePoints.value.map((p) => ({ ...p })), old = sel.value.attrs.d;
        rows[index][key] = Number(value);
        const path = rows.map((p) => (p.start ? "M" : "L") + p.x + " " + p.y).join(" ");
        doc.value.nodes.filter((n) => n.parentId === sel.value.parentId && n.attrs.d === old).forEach((n) => n.attrs.d = path);
      }
      function nativeReadback(n, slot) { const p = points.value[n.bindings[slot.key]]; return p?.quality === "good" ? Array.isArray(p.value) ? p.value.length + " 个历史值" : String(p.value) + " " + (p.unit || "") : "— · " + ({ bad: "无效", stale: "过期", offline: "离线" }[p?.quality] || "未绑定"); }
      function addNative(key) {
        if (!native.value && doc.value.nodes.length) { message.value = "请先选择空白画布或 01 / 05 场景，再添加工艺组件。"; return; }
        snapshot();
        if (!native.value) { const blank = nativeBlank(); blank.source = clone(doc.value.source); blank.mappings = clone(doc.value.mappings); doc.value = blank; }
        const { recipe, doc: sampleDoc, root: sampleRoot } = nativeRecipe(key);
        const branch = cloneNativeBranch(sampleDoc, sampleRoot.id);
        const root = branch[0], stageNode = doc.value.nodes.find((n) => !n.parentId);
        root.parentId = stageNode.id;
        root.layout = { absolute: 1, x: 100, y: 140, width: recipe.width, height: recipe.height };
        root.attrs.id = "object-" + root.id;
        root.attrs["data-native-component"] = recipe.scene;
        stageNode.content.push({ child: root.id });
        doc.value.nodes.push(...branch);
        // Demo pages may reuse the template's named sample points. Real sources
        // keep their own catalogue and require explicit binding of new slots.
        if (doc.value.source.demo && doc.value.source.kind === "json") {
          const data = JSON.parse(doc.value.source.data), sample = JSON.parse(sampleDoc.source.data);
          const needed = new Set(branch.flatMap((n) => Object.values(n.bindings)));
          for (const m of sampleDoc.mappings.filter((m) => needed.has(m.id))) if (!doc.value.mappings.some((p) => p.id === m.id)) { doc.value.mappings.push(clone(m)); data[m.path] = sample[m.path]; }
          doc.value.source.data = JSON.stringify(data, null, 2);
        }
        ids.value = [root.id]; goStep("canvas");
      }
      const chosenDataMode = ref(initial.source.demo ? "demo" : "keep");
      const activeStep = ref("canvas"),
        inspectorTab = ref("appearance"),
        chosenTemplate = ref(initial.template);
      const sceneOptions = [
        {
          key: "01",
          name: "A²/O 生物处理",
          description: "工艺流程、运行指标与趋势",
          kind: "工艺监视",
        },
        {
          key: "05",
          name: "污泥回流泵站",
          description: "泵组状态、液位与回流流量",
          kind: "泵站监视",
        },
        {
          key: "30",
          name: "园区能源中心",
          description: "三维设备、运行反馈与特写",
          kind: "三维场景",
        },
        {
          key: "30-demo",
          name: "三维设备联动演示",
          description: "自带四台风机的本地样本与绑定",
          kind: "本地演示",
        },
        {
          key: "blank",
          name: "空白画布",
          description: "从组件库开始搭建页面",
          kind: "自由搭建",
        },
      ];
      const steps = [
        { key: "scene", label: "选择场景" },
        { key: "canvas", label: "编辑画布" },
        { key: "bind", label: "数据绑定" },
        { key: "preview", label: "预览发布" },
      ];
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
      const sampleSource = ref("");
      const sampleReceived = ref(0);
      const snapshotSelections = ref(null);
      const lastSaved = ref(JSON.stringify(initial)),
        saving = ref(false),
        published = ref(false);
      const dirty = computed(
        () => JSON.stringify(project.value) !== lastSaved.value,
      );
      function returnToProjects(event) {
        if (dirty.value && !window.confirm("当前画面有未保存修改。仍要返回项目管理？")) event.preventDefault();
      }
      watch(dirty, (value) => {
        if (value && published.value) {
          published.value = false;
          message.value = "页面有新修改，发布后才会更新展示端";
        }
      });
      function reviewIssue(n) {
        const binding = bindingProblem(n, doc.value.mappings);
        if (binding) return { tab: "binding", reason: binding };
        if (!screen.value) return null;
        const control=screenControlProblem(n,screenPages(project.value).find(p=>p.nodes.some(item=>item.id===n.id))||doc.value);
        if(control)return {tab:'appearance',reason:control};
        const asset = screenAssetProblem(n);
        if (asset) return { tab: "appearance", reason: asset };
        const action = screenActionProblem(n, project.value);
        return action ? { tab: "action", reason: action } : null;
      }
      const bindingNodes = computed(() => {
        const items = screen.value ? screenPageItems(project.value) : screenItems.value;
        return items.filter((n) => mapped(n) || (screen.value && (screenControlKinds.has(n.symbol) || screenAssetProblem(n) || n.action?.type && n.action.type !== "none")));
      });
      const bindingReason = (n) => reviewIssue(n)?.reason || "";
      const bindingIssueLabel = (n) => (reviewIssue(n)?.tab === "binding" ? "去绑定：" : "去配置：") + n.title;
      const bindingIssues = computed(() => bindingNodes.value.filter(bindingReason));
      const sourceTitle = computed(
        () =>
          ({
            json: "本地 JSON 样本",
            csv: "本地 CSV 样本",
            rest: "REST 接口",
            ws: "WebSocket",
            opcua: "OPC UA",
            modbus: "Modbus TCP",
          })[doc.value.source.kind],
      );
      const invalidPoints = computed(
        () =>
          doc.value.mappings.filter(m => livePoints.value[m.id]?.quality !== "good")
            .map(m => ({ id: m.id, label: m.label,
              reason: pointReasonLabels[livePoints.value[m.id]?.reason] || "暂无有效读数" })),
      );
      function selectBinding(n) {
        if(screen.value)switchScreenPage(screenPageForNode(project.value,n.id));
        preview.value = false;
        activeStep.value = screen.value ? "canvas" : "bind";
        inspectorTab.value = reviewIssue(n)?.tab || "binding";
        ids.value = [n.id];
      }
      function goStep(key) {
        if(screen.value&&key==="bind"){const n=sel.value&&(hasBindings(sel.value)||sel.value.action)?sel.value:bindingIssues.value[0]||bindingNodes.value[0];if(n)selectBinding(n);return;}
        dialog.value = "";
        activeStep.value = screen.value && key==="bind" ? "canvas" : key;
        preview.value = key === "preview";
        if (key === "bind") {
          inspectorTab.value = "binding";
          if (!hasBindings(sel.value))
            ids.value = [
              (bindingIssues.value[0] || bindingNodes.value[0])?.id,
            ].filter(Boolean);
        } else if (key === "canvas") inspectorTab.value = "appearance";
      }
      function openBindings() {
        goStep("bind");
      }
      function nextBinding() {
        const pending = bindingIssues.value.find((n) => n.id !== sel.value?.id);
        if (pending) selectBinding(pending);
        else goStep("preview");
      }
      const campusNode = computed(() =>
        sel.value?.type === "campus" ? sel.value : null,
      );
      function openCampus(n) {
        snapshot();
        selectBinding(n);
        if (!n.entities) n.entities = clone(campusBindings(n));
      }
      function openCampusOrBinding(n) {
        if (n.type === "campus") openCampus(n);
        else selectBinding(n);
      }
      function toggleCampus(entity, enabled) {
        const n = campusNode.value;
        snapshot();
        if (!n.entities) n.entities = clone(campusBindings(n));
        if (enabled) {
          n.entities.push({ entity, run: "", fault: "", value: "" });
          if (n.entities.length > 1) n.camera = "energy";
        } else n.entities = n.entities.filter((b) => b.entity !== entity);
        if (n.entities.length && !n.entities.some((b) => b.entity === n.entity))
          n.entity = n.entities[0].entity;
      }
      const campusEntry = (id) =>
        campusNode.value &&
        campusBindings(campusNode.value).find((e) => e.entity === id);
      function setCampusField(entity, key, value) {
        const n = campusNode.value;
        snapshot();
        if (!n.entities) n.entities = clone(campusBindings(n));
        n.entities.find((e) => e.entity === entity)[key] = value;
      }
      function selectEntity(n, id) {
        if (editing.value && n.entity !== id) {
          snapshot();
          n.entity = id;
        }
      }
      function bindingValue(n) {
        if (nativeTypes.has(n.type)) return nativeSlots(n).map((s) => s.label + " " + nativeReadback(n, s)).join(" · ");
        if (n.type === "campus")
          return (
            campusBindings(n).length +
            " 台设备 · " +
            (bindingProblem(n, doc.value.mappings) || "已绑定")
          );
        if (n.type === "table" && n.binding === "*") return "全部测点";
        const m = doc.value.mappings.find((m) => m.id === n.binding),
          p = points.value[n.binding];
        if (!m || !p) return "等待读取";
        const label = {
          good: "有效",
          bad: "无效",
          stale: "过期",
          offline: "离线",
        }[p.quality];
        const value =
          p.quality !== "good"
            ? "—"
            : ["flow", "status"].includes(n.type)
              ? p.value
                ? "运行"
                : "停止"
              : typeof p.value === "number"
                ? p.value.toFixed(m.precision)
                : Array.isArray(p.value)
                  ? p.value.length + " 行"
                  : String(p.value);
        return value + " " + (m.unit || "") + " · " + label;
      }
      const history = [], redoHistory = [],
        undoCount = ref(0), redoCount = ref(0);
      let stop = () => {},
        clockId,
        observer,
        drag;
      function snapshot() {
        redoHistory.length = 0; redoCount.value = 0;
        const value = JSON.stringify(project.value);
        if (history.at(-1) !== value) {
          history.push(value);
          if (history.length > 50) history.shift();
          undoCount.value = history.length;
        }
      }
      function undo() {
        if (history.length) {
          redoHistory.push(JSON.stringify(project.value)); redoCount.value = redoHistory.length;
          doc.value = JSON.parse(history.pop());
          ids.value = [];
          undoCount.value = history.length;
        }
      }
      function redo() { if (redoHistory.length) { history.push(JSON.stringify(project.value)); doc.value = JSON.parse(redoHistory.pop()); redoCount.value = redoHistory.length; undoCount.value = history.length; ids.value = []; } }
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
      watch(
        () => sel.value?.id,
        async () => {
          await nextTick();
          const inspector = document.querySelector(".inspector");
          if (inspector) inspector.scrollTop = 0;
          document
            .querySelector(".navigator .layer.active")
            ?.scrollIntoView({ block: "nearest" });
        },
      );
      function add(type) {
        snapshot();
        const n = node(type, crypto.randomUUID(), type === "table" ? "*" : "");
        doc.value.nodes.push(n);
        ids.value = [n.id];
        inspectorTab.value = "appearance";
      }
      function setRect(n, key, input) {
        const value = Number(input.value);
        if (!Number.isFinite(value)) {
          input.value = n[key];
          return;
        }
        snapshot();
        if (native.value) {
          const rect = nativeRects.value[n.id] || {};
          if (key === "w" || key === "h") {
            if (rect.svg && rect[key]) { const scale = key === "w" ? "scaleX" : "scaleY"; n.layout[scale] = (n.layout[scale] || 1) * Math.max(1, value) / rect[key]; }
            else n.layout[key === "w" ? "width" : "height"] = Math.max(1, value);
          } else { const offset = key === "x" ? "dx" : "dy"; n.layout[offset] = (n.layout[offset] || 0) + (value - (rect[key] || 0)) / (rect[key === "x" ? "sx" : "sy"] || 1); }
          return;
        }
        const max = {
          x: 1920 - n.w,
          y: 1080 - n.h,
          w: 1920 - n.x,
          h: 1080 - n.y,
        }[key];
        n[key] = Math.round(
          Math.max(key === "w" || key === "h" ? 100 : 0, Math.min(max, value)),
        );
        input.value = n[key];
      }
      function action(key) {
        if(screen.value)return screenCommand({key});
        const ns = selectedNodes(),
          movable = ns.filter((n) => !n.locked);
        if (!ns.length) return;
        snapshot();
        if (native.value) {
          if (key === "lock") ns.forEach((n) => n.locked = !n.locked);
          if (key === "copy") {
            const selected = ns.filter((n) => !parentChain(n).some((p) => ids.value.includes(p.id))), root = doc.value.nodes.find((n) => !n.parentId), copies = [];
            for (const n of selected) {
              const nodes = cloneNativeBranch(doc.value, n.id), first = nodes[0], rect = nativeRects.value[n.id];
              first.locked = false;
              if (["g", "path", "text", "rect"].includes(n.tag)) { first.layout.dx = (first.layout.dx || 0) + 25; first.layout.dy = (first.layout.dy || 0) + 25; doc.value.nodes.find((p) => p.id === n.parentId).content.push({ child: first.id }); }
              else { first.parentId = root.id; first.layout = { absolute: 1, x: Math.min(1700, (rect?.x || 100) + 25), y: Math.min(900, (rect?.y || 140) + 25), width: rect?.w || 300, height: rect?.h || 120 }; root.content.push({ child: first.id }); }
              doc.value.nodes.push(...nodes); copies.push(first.id);
            }
            ids.value = copies;
          }
          if (key === "delete") {
            const removed = new Set(movable.flatMap((n) => nativeBranch(doc.value, n.id).map((v) => v.id)));
            doc.value.nodes = doc.value.nodes.filter((n) => !removed.has(n.id));
            function clean(value) { if (Array.isArray(value)) return value.map(clean); if (value && typeof value === "object") { if (value.node && removed.has(value.node)) return "—"; const next = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)])); if (next.devices) next.devices = next.devices.filter((id) => !removed.has(id)); return next; } return value; }
            doc.value.nodes.forEach((n) => { n.content = clean(n.content.filter((p) => !removed.has(p?.child))); n.rules = clean(n.rules); if (removed.has(n.action?.target)) delete n.action; });
            ids.value = [];
          }
          if (key === "group" && movable.length > 1) {
            const chosen = movable.filter((n) => !parentChain(n).some((p) => ids.value.includes(p.id))), svg = chosen.every((n) => ["g", "text", "path", "rect"].includes(n.tag));
            if (!svg && chosen.some((n) => nativeRects.value[n.id]?.svg)) { message.value = "请在同一个工艺图内组合图元，或选择完整工艺面板组合。"; return; }
            if (!chosen.length || (svg && !chosen.every((n) => n.parentId === chosen[0].parentId))) return;
            const root = doc.value.nodes.find((n) => !n.parentId), parent = svg ? doc.value.nodes.find((n) => n.id === chosen[0].parentId) : root;
            const left = Math.min(...chosen.map((n) => nativeRects.value[n.id]?.x || 0)), top = Math.min(...chosen.map((n) => nativeRects.value[n.id]?.y || 0));
            const right = Math.max(...chosen.map((n) => (nativeRects.value[n.id]?.x || 0) + (nativeRects.value[n.id]?.w || 0))), bottom = Math.max(...chosen.map((n) => (nativeRects.value[n.id]?.y || 0) + (nativeRects.value[n.id]?.h || 0)));
            const group = { id: crypto.randomUUID(), parentId: parent.id, type: "element", tag: svg ? "g" : "div", role: "group", title: "设备组合", attrs: {}, bindings: {}, slots: [], style: {}, layout: svg ? {} : { absolute: 1, x: left, y: top, width: right-left, height: bottom-top }, content: chosen.map((n) => ({ child: n.id })), editable: true };
            const next = clone(doc.value);
            for (const selected of chosen) {
              const n = next.nodes.find((v) => v.id === selected.id), owner = next.nodes.find((p) => p.id === n.parentId);
              owner.content = owner.content.filter((p) => p.child !== n.id);
              n.parentId = group.id;
              if (!svg) { const r = nativeRects.value[n.id]; n.layout = { absolute: 1, x: r.x-left, y: r.y-top, width: r.w, height: r.h }; }
            }
            next.nodes.push(group); next.nodes.find((n) => n.id === parent.id).content.push({ child: group.id });
            doc.value = next; ids.value = [group.id];
          }
          if (key === "ungroup") {
            for (const n of movable.filter((n) => n.role === "group")) {
              const parent = doc.value.nodes.find((p) => p.id === n.parentId);
              parent.content = parent.content.filter((p) => p.child !== n.id);
              for (const p of n.content.filter((p) => p.child)) {
                const child = doc.value.nodes.find((v) => v.id === p.child);
                child.parentId = parent.id;
                if (n.tag === "g") {
                  const transform = (v) => `translate(${v.layout.dx || 0},${v.layout.dy || 0}) ${v.attrs.transform || ""} scale(${v.layout.scaleX || 1},${v.layout.scaleY || 1})`;
                  child.attrs.transform = transform(n) + " " + transform(child);
                  for (const key of ["dx", "dy", "scaleX", "scaleY"]) delete child.layout[key];
                } else {
                  child.layout.x = (n.layout.x || 0) + (n.layout.dx || 0) + (child.layout.x || 0) + (child.layout.dx || 0);
                  child.layout.y = (n.layout.y || 0) + (n.layout.dy || 0) + (child.layout.y || 0) + (child.layout.dy || 0);
                  delete child.layout.dx; delete child.layout.dy;
                }
                parent.content.push(p);
              }
              doc.value.nodes = doc.value.nodes.filter((v) => v.id !== n.id);
            }
            ids.value = [];
          }
          if (["left", "top"].includes(key)) { const axis = key === "left" ? "x" : "y", min = Math.min(...movable.map((n) => nativeRects.value[n.id]?.[axis] || 0)); movable.forEach((n) => { const offset = axis === "x" ? "dx" : "dy", rect = nativeRects.value[n.id]; n.layout[offset] = (n.layout[offset] || 0) + (min - (rect?.[axis] || 0)) / (rect?.[axis === "x" ? "sx" : "sy"] || 1); }); }
          if (["front", "back"].includes(key)) ns.forEach((n) => { n.style.zIndex = key === "front" ? 8 : 0; const parent = doc.value.nodes.find((p) => p.id === n.parentId); parent.content = parent.content.filter((p) => p.child !== n.id); parent.content[key === "front" ? "push" : "unshift"]({ child: n.id }); });
          return;
        }
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
        doc.value =
          key === "30-demo" || (["01", "05"].includes(key) && chosenDataMode.value === "demo")
            ? template(key)
            : {
                ...template(key),
                source: clone(doc.value.source),
                mappings: clone(doc.value.mappings),
              };
        ids.value = [];
        screenTool.value="select"; libraryTab.value="symbols";
        chosenTemplate.value = key;
        collapsed.value = doc.value.nodes.filter((n) => native.value && n.editable && expandable(n)).map((n) => n.id);
        goStep("canvas");
        message.value =
          key === "30-demo" || doc.value.source.demo
            ? "已载入本地联动演示，可撤销恢复原页面"
            : "模板已切换，数据连接已保留。请检查组件绑定";
      }
      async function guarded(fn) {
        try {
          await fn();
        } catch (e) {
          message.value = e.message;
        }
      }
      function save(publish) {
        if (saving.value) return;
        if (publish && bindingIssues.value.length) {
          openBindings();
          message.value =
            "请完成 " + bindingIssues.value.length + (screen.value?" 个元素的测点、外观或交互配置":" 个组件的测点绑定");
          return;
        }
        return guarded(async () => {
          saving.value = true;
          try {
            const value = clone(project.value);
            validate(value, publish);
            await api(publish ? "/api/publish" : "/api/draft", value);
            lastSaved.value = JSON.stringify(value);
            published.value = publish;
            if (publish) {
              dialog.value = "";
              clearRehearsal();
            }
            message.value = publish ? "已发布，可打开展示端核对" : "草稿已保存";
          } finally {
            saving.value = false;
          }
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
          published.value = false;
          await versions();
          message.value = "展示端已切换版本";
        });
      }
      const connectionDrafts = new Map();
      function openConfig() {
        config.value = clone({
          source: doc.value.source,
          mappings: doc.value.mappings,
        });
        connectionDrafts.clear();
        connectionDrafts.set(config.value.source.kind, config.value);
        resetConnectionPreview();
        mappingIndex.value = 0;
        dialog.value = "data";
      }
      const protocolBusy = ref(false),
        browseResults = ref([]),
        browsePath = ref([]);
      const browseNext = ref(null);
      function resetConnectionPreview() {
        sample.value = null;
        snapshotSelections.value = null;
        sampleSource.value = "";
        browseResults.value = [];
        browsePath.value = [];
        browseNext.value = null;
        message.value = "";
      }
      function sourceKindChanged(kind) {
        if (protocolBusy.value || kind === config.value.source.kind) return;
        if (!connectionDrafts.has(kind)) {
          const { source: current, mappings } = config.value;
          const source = {
            ...current,
            kind,
            demo: false,
          };
          delete source.connection;
          if (kind === "opcua") {
            source.connection = { protocol: kind, endpoint: "opc.tcp://127.0.0.1:49320", points: [] };
          } else if (kind === "modbus") {
            source.connection = { protocol: kind, host: "", port: 502, unitId: 1, points: [] };
          }
          const previousMappings = ["opcua", "modbus"].includes(current.kind) ? [] : clone(mappings);
          connectionDrafts.set(kind, { source, mappings: previousMappings });
        }
        config.value = connectionDrafts.get(kind);
        connectionDrafts.set(kind, config.value);
        mappingIndex.value = 0;
        resetConnectionPreview();
      }
      async function browseProtocol(entry, backIndex, append = false) {
        if (protocolBusy.value) return;
        message.value = "";
        protocolBusy.value = true;
        await guarded(async () => {
          const path =
            backIndex != null
              ? browsePath.value.slice(0, backIndex)
              : append
                ? browsePath.value
                : entry
                  ? entry.path || [...browsePath.value, entry]
                  : [];
          const result = await api("/api/opcua/browse", {
            endpoint: config.value.source.connection.endpoint,
            nodeId: path.at(-1)?.nodeId,
            offset: append ? browseNext.value : 0,
          });
          browsePath.value = path;
          browseResults.value = append
            ? [...browseResults.value, ...result.nodes]
            : result.nodes;
          browseNext.value = result.nextOffset ?? null;
        });
        protocolBusy.value = false;
      }
      async function once(s) {
        if (s.kind === "json") return JSON.parse(s.data);
        if (s.kind === "csv") return csv(s.data);
        if (s.kind === "rest") return api("/api/sample", { url: s.url });
        if (["opcua", "modbus"].includes(s.kind))
          return api("/api/protocol/sample", s);
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
      async function readSample() {
        if (protocolBusy.value) return;
        message.value = "";
        protocolBusy.value = true;
        await guarded(async () => {
          sample.value = null;
          const source = clone(config.value.source);
          for (let attempt = 0; attempt < 40; attempt++) {
            try {
              const value = await once(source);
              if (
                JSON.stringify(source) !== JSON.stringify(config.value.source)
              )
                throw Error("连接配置已变化，请重新读取样本");
              sample.value = value;
              sampleReceived.value = Date.now();
              sampleSource.value = JSON.stringify(source);
              if (["opcua", "modbus"].includes(source.kind)) bridgeMappings();
              return;
            } catch (error) {
              if (!error.message.includes("协议连接建立中") || attempt === 39)
                throw error;
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        });
        protocolBusy.value = false;
      }
      function bridgeMappings() {
        const rows = sample.value?.points;
        if (!Array.isArray(rows)) return;
        config.value.mappings = protocolMappings(
          rows,
          sample.value.protocol,
          config.value.mappings,
        );
        mappingIndex.value = 0;
      }
      const snapshotRows = computed(() =>
        config.value?.source.kind === "rest" &&
        sampleSource.value === JSON.stringify(config.value.source)
          ? snapshotPointRows(sample.value)
          : new Map(),
      );
      const snapshotChoices = computed(() => {
        const choices = new Map();
        for (const row of snapshotRows.value.values()) {
          if (!choices.has(row.kind)) choices.set(row.kind, []);
          choices.get(row.kind).push(row);
        }
        return choices;
      });
      function openSnapshotReview() {
        const selections = new Map();
        for (const mapping of config.value.mappings) {
          const prior = mapping.root === "points" && mapping.keyField === "id"
            ? snapshotRows.value.get(mapping.keyValue)
            : undefined;
          const sameId = snapshotRows.value.get(mapping.id);
          const match = [prior, sameId].find((row) => row?.kind === mapping.kind);
          selections.set(mapping.id, match?.id || "");
        }
        snapshotSelections.value = selections;
        nextTick(() => document.getElementById("snapshot-review-title")?.focus());
      }
      function closeSnapshotReview() {
        snapshotSelections.value = null;
        nextTick(() => document.getElementById("open-snapshot-review")?.focus());
      }
      const snapshotReview = computed(() => {
        if (!snapshotSelections.value) return [];
        const stamp = sampleReceived.value;
        return config.value.mappings.map((mapping) => {
          const selected = snapshotSelections.value.get(mapping.id);
          const row = snapshotRows.value.get(selected);
          const updated = row?.kind === mapping.kind
            ? snapshotPointMapping(mapping, selected)
            : null;
          const reading = updated
            ? normalize({ points: [row] }, updated, stamp, config.value.source.maxAgeMs, stamp)
            : null;
          return { mapping, selected, row, updated, readback: pointPreview(reading, mapping),
            choices: snapshotChoices.value.get(mapping.kind) || [] };
        });
      });
      const snapshotMatchCount = computed(() =>
        snapshotReview.value.filter(({ updated }) => updated).length,
      );
      function adoptSnapshotReview() {
        if (!snapshotMatchCount.value) return;
        const count = snapshotMatchCount.value;
        config.value.mappings = snapshotReview.value.map(({ mapping, updated }) => updated || mapping);
        message.value = `已对照 ${count} 个点位。应用数据配置后生效。`;
        closeSnapshotReview();
      }
      async function finishTags() {
        // Offline engineering is valid: acquisition quality is decided at runtime.
        await applyConfig(false);
      }
      function applyConfig(requireSample = true) {
        return guarded(async () => {
          const native = ["opcua", "modbus"].includes(config.value.source.kind);
          if (native) {
            const currentSample = sample.value && sampleSource.value === JSON.stringify(config.value.source);
            if (requireSample && !currentSample)
              throw Error("请读取当前连接配置的样本，再应用数据配置");
            if (currentSample) bridgeMappings();
            else config.value.mappings = protocolMappings(config.value.source.connection.points, config.value.source.kind, config.value.mappings);
          }
          const updated = { ...project.value, ...config.value };
          if (updated.source.kind !== "json") updated.source.demo = false;
          validate(updated, false);
          if (["csv", "json"].includes(config.value.source.kind))
            await once(config.value.source);
          snapshot();
          Object.assign(doc.value, clone(config.value));
          dialog.value = "";
          if(screen.value){preview.value=false;activeStep.value="canvas";inspectorTab.value="binding";}else goStep("bind");
          message.value = "数据配置已应用，已返回画布。请选择当前组件的测点";
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
      const mappingReadback = computed(() => {
        const source = config.value?.source;
        if (!source || !currentMap.value || sample.value == null ||
            sampleSource.value !== JSON.stringify(source)) return null;
        const stamp = sampleReceived.value;
        return normalize(sample.value, currentMap.value, stamp, source.maxAgeMs, stamp);
      });
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
      const previewSamples = shallowRef(new Map());
      const rehearsal = ref({ id: "", quality: "good", value: "", error: "" });
      const rehearsalPoints = computed(() =>
        doc.value.mappings.filter((m) => ["boolean", "number", "text"].includes(m.kind)),
      );
      const rehearsalPoint = computed(() =>
        rehearsalPoints.value.find((m) => m.id === rehearsal.value.id),
      );
      const canRehearse = computed(() =>
        !viewer && screen.value && preview.value &&
        doc.value.source.kind === "json" && doc.value.source.demo === true,
      );
      const rehearsalQualities = { good: "有效", bad: "无效", stale: "过期", offline: "离线" };
      function selectRehearsalPoint(id) {
        const sample = points.value[id];
        const mapping = rehearsalPoints.value.find((m) => m.id === id);
        rehearsal.value = {
          id,
          quality: previewSamples.value.get(id)?.quality || "good",
          value: sample?.value == null ? (mapping?.kind === "boolean" ? "false" : "") : String(sample.value),
          error: "",
        };
      }
      function applyRehearsal() {
        if (!canRehearse.value || !rehearsalPoint.value) return;
        const { id, quality, value } = rehearsal.value;
        const { kind, unit } = rehearsalPoint.value;
        let simulatedValue = null;
        if (!Object.hasOwn(rehearsalQualities, quality)) return;
        if (quality === "good") {
          if (kind === "number") {
            simulatedValue = Number(value);
            if (!String(value).trim() || !Number.isFinite(simulatedValue)) {
              rehearsal.value.error = "请输入有效的数值，零值可以直接输入 0。";
              return;
            }
          } else if (kind === "boolean") {
            simulatedValue = value === "true";
          } else {
            simulatedValue = value;
          }
        }
        const timestamp = Date.now();
        previewSamples.value = new Map(previewSamples.value).set(id, {
          value: simulatedValue, quality, timestamp, receivedAt: timestamp, unit,
        });
        rehearsal.value.error = "";
        sequence.value++;
      }
      function clearRehearsal(id) {
        if (id !== undefined && !previewSamples.value.has(id)) return;
        const next = id === undefined ? new Map() : new Map(previewSamples.value);
        if (id !== undefined) next.delete(id);
        if (next.size !== previewSamples.value.size) {
          previewSamples.value = next;
          // Discard rehearsal samples cached by runtime trend widgets.
          sourceVersion.value++;
          sequence.value++;
        }
        if (rehearsal.value.id) selectRehearsalPoint(rehearsal.value.id);
      }
      watch(canRehearse, (allowed) => {
        if (!allowed) {
          clearRehearsal();
          rehearsal.value = { id: "", quality: "good", value: "", error: "" };
        }
      });
      function restart() {
        previewSamples.value = new Map();
        rehearsal.value = { id: "", quality: "good", value: "", error: "" };
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
              : "已连接 · " + s.kind.toUpperCase() +
                (v?.configuredPollMs ? " · 扫描设定 " + v.configuredPollMs + " ms" : "") +
                (v?.sampleIntervalMs ? " · 实测 " + v.sampleIntervalMs + " ms" : "");
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
          if (!closed && ["rest", "opcua", "modbus"].includes(s.kind))
            timer = setTimeout(poll, effectivePollMs(s));
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
      const livePoints = computed(() =>
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
              p.reason = "disconnected";
              p.value = null;
            }
            return [m.id, p];
          }),
        ),
      );
      const points = computed(() =>
        canRehearse.value && previewSamples.value.size
          ? { ...livePoints.value, ...Object.fromEntries(previewSamples.value) }
          : livePoints.value,
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
      function closeProjectMenuOutside(event) {
        const menu = document.querySelector(".project-menu[open]");
        if (menu && !menu.contains(event.target)) menu.open = false;
      }
      onMounted(() => {
        if (!viewer) document.addEventListener("pointerdown", closeProjectMenuOutside, true);
        if (native.value) collapsed.value = doc.value.nodes.filter((n) => n.editable && expandable(n)).map((n) => n.id);
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
        if (!viewer) document.removeEventListener("pointerdown", closeProjectMenuOutside, true);
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
              doc: project.value,
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
          preview.value = false;
          activeStep.value = "canvas";
          inspectorTab.value = "appearance";
          screenTool.value = "select";
          document.querySelector(".project-menu")?.removeAttribute("open");
        });
      function loadImage(file, device = false) {
        if (!file || !sel.value) return;
        const n = sel.value;
        const reader = new FileReader();
        reader.onload = () => {
          if(screen.value){try{validateScreenAsset(reader.result);}catch(e){message.value=e.message;return;}}
          snapshot();
          n.image = reader.result;
          if (device) n.params.appearance = "picture";
        };
        reader.readAsDataURL(file);
      }
      return {
        componentQuery,componentCategory,componentCategories,componentArtwork,waterEquipment,
        returnToProjects,assistantOpen,assistantResult,assistantError,assistantSession,assistantDoc,cancelAssistant,previewAssistant,applyAssistant,screenDepthArtwork,screenDrawingAppearances,setScreenDrawingAppearance,applyDrawingAppearance,screen,screenSymbols,screenTool,libraryTab,screenItems,screenLayerName,screenLayerSections,openWorkspaceCategory,newScreen,screenSelect,screenGeometry,screenInsert,screenPipe,setScreenTool,screenDrag,screenCommand,screenLibraryPlace,screenView,screenThemes,setScreenTheme,screenPurposes,screenPaletteSections,setScreenPurpose,project,pages,activePageId,publishedUrl,bindingReason,bindingIssueLabel,switchScreenPage,addPage,pageAction,
        native, legacyTypes, nativeRecipes, addNative, nativeSelect, nativeMove, nativePatch, nativeRects, rectValue, rectDraft, rectInputValue, startRect, chosenDataMode, nodeCount, pipePoints, updatePipe,
        navigatorNodes, depth, expandable, collapsed, toggleTree, layerSearch, hasBindings, nativeBindingTargets, nativeSlots, nativeSlotMappings, nativeBinding, nativeReadback,
        activeStep,
        inspectorTab,
        chosenTemplate,
        sceneOptions,
        steps,
        openCampusOrBinding,
        sourceTitle,
        invalidPoints,
        goStep,
        selectBinding,
        nextBinding,
        setRect,
        setCampusField,
        campusNode,
        openCampus,
        toggleCampus,
        campusEntry,
        campusBindings,
        campusState,
        selectEntity,
        kindNames,
        saving,
        published,
        dirty,
        bindingNodes,
        bindingIssues,
        openBindings,
        bindingValue,
        compatibleMappings,
        bindingProblem,
        types,
        mapped,
        fans,
        viewer,
        offline,
        doc,
        ids,
        stage,
        zoom,
        preview,
        previewSamples, rehearsal, rehearsalPoints, rehearsalPoint, canRehearse, rehearsalQualities,
        selectRehearsalPoint, applyRehearsal, clearRehearsal,
        editing,
        dialog,
        message,
        sel,
        points,
        connection,
        clock,
        sequence,
        sourceVersion,
        config,
        currentMap,
        mappingReadback,
        mappingIndex,
        sample,
        sampleSource,
        sampleReceived,
        paths,
        versionInfo,
        undoCount,
        redoCount, redo,
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
        protocolBusy,
        browseResults,
        browsePath,
        sourceKindChanged,
        resetConnectionPreview,
        browseProtocol,
        finishTags,
        browseNext,
        applyConfig,
        bridgeMappings,
        snapshotRows,
        snapshotSelections,
        snapshotReview,
        snapshotMatchCount,
        openSnapshotReview,
        closeSnapshotReview,
        adoptSnapshotReview,
        addMap,
        loadImage,
        runExport,
        importDoc,
        exportDoc: () =>
          download(
            "project.json",
            JSON.stringify(project.value, null, 2),
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
boot().catch((e) => {
  const section = document.createElement("section");
  section.className = "empty-state";
  const title = document.createElement("h1");
  title.textContent = "页面暂时无法打开";
  const detail = document.createElement("p");
  detail.textContent = e.message;
  const link = document.createElement("a");
  link.href = "/projects";
  link.textContent = "返回项目管理";
  section.append(title, detail, link);
  document.body.replaceChildren(section);
});
