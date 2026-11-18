import {
  screenSymbols,
  screenSlots,
  screenSlotMappings,
  screenPorts,
  screenAppearanceOptions,
} from "../../../packages/components/studio/screen-symbols.mjs";
import {
  editScreenEndpoint,
  screenEndpointPosition,
} from "../../../packages/runtime/studio/screen-model.mjs";
import { ScreenDefinitions } from "./screen-definitions.mjs";
import { ScreenRules } from "./screen-rules.mjs";
import { ScreenActions } from "./screen-actions.mjs";
import {
  ScreenChartSettings,
  ScreenTableSettings,
} from "./screen-widget-settings.mjs";
import {
  screenChartKinds,
  screenTableKinds,
} from "../../../packages/runtime/studio/screen-widgets.mjs";

export const ScreenInspector = {
  components: {
    ScreenDefinitions,
    ScreenRules,
    ScreenActions,
    ScreenChartSettings,
    ScreenTableSettings,
  },
  props: ["item", "doc", "project", "points", "tab", "count"],
  emits: ["start", "geometry", "action", "tab", "data"],
  setup(props, { emit }) {
    const search = Vue.ref("");
    const pointDialog = Vue.ref(null);
    const picking = Vue.ref(null);
    const pointQuery = Vue.ref("");
    const pointPage = Vue.ref(0);
    const pointPageSize = 50;
    const endpointError = Vue.ref("");
    const waypointError = Vue.ref("");
    Vue.watch(
      () => props.item.id,
      () => {
        if (pointDialog.value?.open) pointDialog.value.close();
        waypointError.value = "";
        endpointError.value = "";
        search.value = "";
      },
    );
    function setWaypoints(points) {
      if (
        points.some(
          ({ x, y }) =>
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            x < 0 ||
            x > 1920 ||
            y < 0 ||
            y > 1080,
        )
      ) {
        waypointError.value = "转折点须在画布范围内：X 0～1920，Y 0～1080";
        return;
      }
      emit("start");
      props.item.vertices = points;
      waypointError.value = "";
    }
    function changeWaypoint(index, axis, event) {
      const point = props.item.vertices[index];
      setWaypoints(
        props.item.vertices.map((p, i) =>
          i === index ? { ...p, [axis]: event.target.valueAsNumber } : p,
        ),
      );
      event.target.value = props.item.vertices[index]?.[axis] ?? point[axis];
    }
    function addWaypoint() {
      const points = props.item.vertices;
      const from =
        points.at(-1) || screenEndpointPosition(props.doc, props.item.source);
      const to = screenEndpointPosition(props.doc, props.item.target);
      setWaypoints([
        ...points,
        {
          x: Math.round((from.x + to.x) / 2),
          y: Math.round((from.y + to.y) / 2),
        },
      ]);
    }
    const endpointNodes = Vue.computed(() =>
      props.doc.nodes.filter((n) => screenPorts(n).length),
    );
    const endPorts = (which) =>
      screenPorts(
        props.doc.nodes.find((n) => n.id === props.item[which]?.nodeId),
      ).filter((p) =>
        which === "source" ? p.direction !== "in" : p.direction !== "out",
      );
    const setEndpoint = (which, end) => {
      try {
        const next = editScreenEndpoint(
          props.doc,
          props.item.id,
          which,
          end,
          false,
        );
        emit("start");
        Object.assign(props.item, next);
        endpointError.value = "";
      } catch (e) {
        endpointError.value = e.message;
      }
    };
    const endpointNode = (which, id) => {
      if (!id)
        return setEndpoint(
          which,
          screenEndpointPosition(props.doc, props.item[which]),
        );
      const n = props.doc.nodes.find((n) => n.id === id),
        port = screenPorts(n).find((p) =>
          which === "source" ? p.direction !== "in" : p.direction !== "out",
        );
      if (!port) {
        endpointError.value = "该元素没有符合方向的连接点";
        return;
      }
      setEndpoint(which, { nodeId: id, portId: port.id });
    };
    const valveMode = (mode) => {
      emit("start");
      props.item.params.valveMode = mode;
      if (props.item.dataSlots)
        props.item.dataSlots = props.item.dataSlots.map((s) => {
          const role = s.role || s.key;
          return {
            ...s,
            required:
              role === "open"
                ? mode !== "control"
                : role === "value"
                  ? mode === "control"
                  : s.required,
          };
        });
    };
    const geometryDraft = Vue.reactive({ id: "", key: "", value: "" });
    const geometryValue = (key) =>
      geometryDraft.id === props.item.id && geometryDraft.key === key
        ? geometryDraft.value
        : props.item[key];
    const startGeometry = (key, event) => {
      Object.assign(geometryDraft, {
        id: props.item.id,
        key,
        value: event.target.value,
      });
      emit("start");
    };
    const commitGeometry = (key, event) => {
      if (event.target.value.trim() !== "")
        emit("geometry", {
          id: props.item.id,
          [key]: Number(event.target.value),
        });
      geometryDraft.id = "";
      event.target.value = props.item[key];
    };
    const slots = Vue.computed(() => screenSlots(props.item));
    const options = (slot) =>
      screenSlotMappings(slot, props.doc.mappings).filter(
        (m) =>
          (m.label + " " + m.id)
            .toLowerCase()
            .includes(search.value.toLowerCase()) ||
          props.item.bindings[slot.key] === m.id,
      );
    const qualityLabels = {
      good: "有效",
      bad: "无效",
      stale: "过期",
      offline: "离线",
    };
    const pointValue = (id, unit) => {
      const p = props.points[id];
      if (p?.quality !== "good") return "—";
      if (typeof p.value === "boolean") return p.value ? "有" : "无";
      if (Array.isArray(p.value)) return p.value.length + " 行数据";
      return String(p.value) + (unit ? " " + unit : "");
    };
    const pointQuality = (id) =>
      qualityLabels[props.points[id]?.quality] ||
      (id ? "未取得读数" : "未绑定");
    const read = (key) => {
      const id = props.item.bindings[key];
      const unit = props.doc.mappings.find((m) => m.id === id)?.unit;
      return pointValue(id, unit) + " · " + pointQuality(id);
    };
    const binding = (slot, value) => {
      emit("start");
      props.item.bindings[slot.key] = value;
    };
    const pointRows = Vue.computed(() => {
      if (!picking.value) return [];
      const query = pointQuery.value.trim().toLowerCase();
      return screenSlotMappings(picking.value, props.doc.mappings).filter(
        (row) => (row.label + " " + row.id).toLowerCase().includes(query),
      );
    });
    const visiblePoints = Vue.computed(() =>
      pointRows.value.slice(
        pointPage.value * pointPageSize,
        (pointPage.value + 1) * pointPageSize,
      ),
    );
    const typeNames = {
      number: "数值",
      boolean: "开关量",
      text: "文字",
      dataset: "数据集",
    };
    function openPointDialog(slot) {
      picking.value = slot;
      pointQuery.value = "";
      pointPage.value = 0;
      pointDialog.value.showModal();
    }
    function choosePoint(id) {
      if (id !== (props.item.bindings[picking.value.key] || ""))
        binding(picking.value, id);
      pointDialog.value.close();
    }
    const kind = Vue.computed(() =>
      props.item.type === "pipe"
        ? "工艺管道"
        : screenSymbols[props.item.symbol].label,
    );
    return {
      search,
      screenChartKinds,
      screenAppearanceOptions,
      screenTableKinds,
      endpointError,
      waypointError,
      setWaypoints,
      changeWaypoint,
      addWaypoint,
      endpointNodes,
      endPorts,
      setEndpoint,
      endpointNode,
      valveMode,
      slots,
      options,
      read,
      binding,
      pointDialog,
      picking,
      pointQuery,
      pointPage,
      pointPageSize,
      pointRows,
      visiblePoints,
      typeNames,
      pointValue,
      pointQuality,
      openPointDialog,
      choosePoint,
      kind,
      geometryDraft,
      geometryValue,
      startGeometry,
      commitGeometry,
    };
  },
  template: `<div class="screen-inspector">
    <div class="inspector-heading"><small>{{kind}}<span v-if="count>1"> · 已选 {{count}} 个对象</span></small><b>{{item.title}}</b></div>
    <div class="inspector-tabs" role="tablist" aria-label="图元设置"><button role="tab" :aria-selected="tab==='appearance'" @click="$emit('tab','appearance')">外观</button><button role="tab" :aria-selected="tab==='binding'" @click="$emit('tab','binding')">动态与测点</button><button role="tab" :aria-selected="tab==='definition'" @click="$emit('tab','definition')">元素定义</button><button v-if="item.type!=='pipe'" role="tab" :aria-selected="tab==='action'" @click="$emit('tab','action')">交互</button></div>
    <screen-definitions v-if="tab==='definition'" :item="item" :doc="doc" @start="$emit('start')" @tool="$emit('tab',$event)"></screen-definitions>
    <screen-actions v-else-if="tab==='action'&&item.type!=='pipe'" :item="item" :project="project" @start="$emit('start')"></screen-actions><template v-else-if="tab==='binding'">
      <button class="source-link wide" @click="$emit('data')">管理连接与点位</button>
      <p class="muted">选择测点后立即显示结果。{{doc.mappings.length}} 个测点可用。</p>
      <input aria-label="搜索测点" placeholder="查找名称或业务编号" v-model="search" />
      <div class="screen-slot-picker" v-for="slot in slots" :key="slot.key">
        <label>{{slot.label}}<span v-if="slot.required" class="required-mark"> *</span>
          <select :aria-label="slot.label+' · 绑定测点'" :value="item.bindings[slot.key]||''" @change="binding(slot,$event.target.value)"><option value="">{{slot.required?'请选择测点':'不绑定（可选）'}}</option><option v-for="m in options(slot)" :value="m.id">{{m.label}} · {{m.id}}{{m.unit?' / '+m.unit:''}}</option></select>
        </label>
        <div class="screen-slot-feedback"><small class="point-readback">{{read(slot.key)}}</small><button :aria-label="slot.label+' · 选择测点'" @click="openPointDialog(slot)" :disabled="!doc.mappings.length">选择测点…</button></div>
      </div>
      <p v-if="!doc.mappings.length" class="quality-note">尚未配置测点。先管理连接与点位，再返回当前图元选择测点。</p>
      <p v-if="!slots.length" class="quality-note">此元素没有数据槽位。可到“元素定义”添加所需的数据。</p>
      <p class="muted">* 为必需绑定。未知或失效数据显示“—”，不会替换为演示正常值。</p>
      <screen-rules :item="item" :doc="doc" @start="$emit('start')"></screen-rules>
    </template>
    <template v-else>
      <label>名称 / 位号<input aria-label="图元名称" v-model="item.title" @focus="$emit('start')" /></label>
      <template v-if="item.type!=='pipe'"><screen-chart-settings v-if="screenChartKinds.has(item.symbol)" :item="item" :doc="doc" :points="points" @start="$emit('start')"></screen-chart-settings><screen-table-settings v-if="screenTableKinds.has(item.symbol)" :item="item" :doc="doc" :points="points" @start="$emit('start')"></screen-table-settings>
 <label v-if="item.symbol==='readout'">指标符号<select aria-label="指标符号" :value="item.params.icon||''" @focus="$emit('start')" @change="item.params.icon=$event.target.value"><option value="">不显示</option><option v-for="icon in ['Σ','%','≈','⚙','●']" :value="icon">{{icon}}</option></select></label><template v-if="item.symbol==='status'"><div class="pair"><label>信号成立文字<input aria-label="状态成立文字" v-model="item.params.onText" @focus="$emit('start')" placeholder="运行" /></label><label>信号释放文字<input aria-label="状态释放文字" v-model="item.params.offText" @focus="$emit('start')" placeholder="停止" /></label></div><div class="pair"><label>成立颜色<input type="color" aria-label="状态成立颜色" :value="item.params.onColor||'#3c9c77'" @focus="$emit('start')" @change="item.params.onColor=$event.target.value" /></label><label>释放颜色<input type="color" aria-label="状态释放颜色" :value="item.params.offColor||'#d5dfe6'" @focus="$emit('start')" @change="item.params.offColor=$event.target.value" /></label></div></template>
 <div v-if="item.symbol==='barGauge'" class="pair"><label>仪表下限<input type="number" aria-label="仪表下限" v-model.number="item.params.min" @focus="$emit('start')" /></label><label>仪表上限<input type="number" aria-label="仪表上限" v-model.number="item.params.max" @focus="$emit('start')" /></label></div>
        <template v-if="Object.keys(screenAppearanceOptions(item.symbol)).length">
          <label>外观预设<select aria-label="外观预设" :value="item.params.appearance||'classic'" @focus="$emit('start')" @change="item.params.appearance=$event.target.value"><option v-for="(label,key) in screenAppearanceOptions(item.symbol)" :value="key">{{label}}</option></select></label>
          <template v-if="item.params.appearance==='picture'">
            <label class="button">载入设备图片<input aria-label="载入设备图片" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" @change="$emit('action',{key:'device-picture',file:$event.target.files[0]});$event.target.value=''" /></label>
            <p class="muted">{{item.image?'图片已内嵌，可更换。':'请选择透明 PNG、WebP 或其他本地图形。'}}连接点、测点和设备状态独立保存。</p>
          </template>
          <p v-if="item.params.appearance==='monitor' && ['pump','fan'].includes(item.symbol)" class="muted">位号显示在泵体内。频率读取运行数值，模式读取“显示文字”槽位。</p>
          <label v-if="['pump','fan','valve','tank'].includes(item.symbol)&&item.params.appearance!=='monitor'">位号位置<select aria-label="位号位置" :value="item.params.labelPosition||'bottom'" @focus="$emit('start')" @change="item.params.labelPosition=$event.target.value"><option value="bottom">设备下方</option><option value="top">设备上方</option><option value="none">隐藏位号</option></select></label>
        </template>
        <template v-if="item.symbol==='valve'"><label>阀门类型<select aria-label="阀门类型" :value="item.params.valveMode||'switch'" @change="valveMode($event.target.value)"><option value="switch">开关阀</option><option value="control">调节阀</option></select></label><div v-if="item.params.valveMode==='control'" class="pair"><label>开度下限<input type="number" aria-label="开度下限" :value="item.params.positionMin??0" @focus="$emit('start')" @change="item.params.positionMin=Number($event.target.value)" /></label><label>开度上限<input type="number" aria-label="开度上限" :value="item.params.positionMax??100" @focus="$emit('start')" @change="item.params.positionMax=Number($event.target.value)" /></label></div></template>
        <label v-if="['tank','barGauge'].includes(item.symbol)">液位 / 棒图颜色<input type="color" aria-label="液位颜色" :value="item.params.waterColor||'#66abc5'" @focus="$emit('start')" @change="item.params.waterColor=$event.target.value" /></label><label v-if="item.symbol==='tank'">液位填充方向<select aria-label="液位填充方向" :value="item.params.levelDirection||'up'" @focus="$emit('start')" @change="item.params.levelDirection=$event.target.value"><option value="up">从下向上</option><option value="down">从上向下</option></select></label>
        <div class="pair"><label v-for="(label,key) in {x:'位置 X',y:'位置 Y',w:'宽度',h:'高度',angle:'角度'}">{{label}}<input type="number" :aria-label="label" :value="geometryValue(key)" @focus="startGeometry(key,$event)" @input="geometryDraft.value=$event.target.value" @change="commitGeometry(key,$event)" @blur="geometryDraft.id=''" /></label></div>
        <label v-if="item.symbol==='text'">文字内容<textarea aria-label="文字内容" v-model="item.text" @focus="$emit('start')"></textarea></label>
        <template v-if="Array.isArray(item.points)"><h2>图形顶点</h2><p class="muted">拖动画布上的蓝色顶点，或按宽高百分比编辑位置。</p><div v-for="(point,i) in item.points" class="pair"><label>X {{i+1}} %<input type="number" min="0" max="100" :aria-label="'顶点 '+(i+1)+' X'" v-model.number="point.x" @focus="$emit('start')" /></label><label>Y {{i+1}} %<input type="number" min="0" max="100" :aria-label="'顶点 '+(i+1)+' Y'" v-model.number="point.y" @focus="$emit('start')" /></label><button v-if="item.symbol!=='line'" :disabled="item.points.length<=(item.symbol==='polygon'?3:2)" @click="$emit('start');item.points.splice(i,1)">移除顶点 {{i+1}}</button></div><button v-if="item.symbol!=='line'" @click="$emit('start');item.points.push({x:50,y:50})">添加顶点</button></template>
        <div v-if="item.symbol!=='image'" class="pair"><label v-if="!['pump','fan','valve','text','line','polyline'].includes(item.symbol)">填充颜色<input type="color" aria-label="填充颜色" :value="item.style.fill==='transparent'?'#ffffff':item.style.fill" @focus="$emit('start')" @input="item.style.fill=$event.target.value" /></label><label v-if="!['junction','line','polyline','polygon'].includes(item.symbol)">文字颜色<input type="color" aria-label="文字颜色" v-model="item.style.color" @focus="$emit('start')" /></label></div>
        <p v-if="['pump','fan','valve'].includes(item.symbol)" class="muted">设备填充色由运行、故障与数据质量决定。</p>
        <div v-if="item.symbol!=='image'" class="pair"><label v-if="item.symbol!=='text'">边线颜色<input type="color" aria-label="边线颜色" v-model="item.style.stroke" @focus="$emit('start')" /></label><label v-if="!['junction','line','polyline','polygon'].includes(item.symbol)">字号<input type="number" min="8" max="120" aria-label="字号" v-model.number="item.style.fontSize" @focus="$emit('start')" /></label></div>
        <label v-if="Array.isArray(item.points)">线宽<input type="number" min="1" max="30" aria-label="图形线宽" :value="item.style.lineWidth||3" @focus="$emit('start')" @change="item.style.lineWidth=Number($event.target.value)" /></label><template v-if="!['image','junction','line','polyline','polygon'].includes(item.symbol)"><label>字体<select aria-label="字体" :value="item.style.fontFamily||'Microsoft YaHei'" @focus="$emit('start')" @change="item.style.fontFamily=$event.target.value"><option value="Microsoft YaHei">微软雅黑</option><option value="SimSun">宋体</option><option value="Arial">Arial</option><option value="Consolas">Consolas</option></select></label><div class="pair"><label>字重<select aria-label="字重" :value="item.style.fontWeight||400" @focus="$emit('start')" @change="item.style.fontWeight=Number($event.target.value)"><option :value="400">常规</option><option :value="600">中粗</option><option :value="700">加粗</option></select></label><label v-if="['text','rect','ellipse'].includes(item.symbol)">对齐<select aria-label="文字对齐" :value="item.style.align||'center'" @focus="$emit('start')" @change="item.style.align=$event.target.value"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label></div></template>
        <template v-if="['pump','valve','fan','tank','readout','trend'].includes(item.symbol)||slots.some(s=>(s.role||s.key)==='value')">
          <label v-if="!screenTableKinds.has(item.symbol)">显示单位（留空跟随测点）<input aria-label="显示单位" v-model="item.params.unit" @focus="$emit('start')" /></label>
          <label>小数位<input aria-label="小数位" type="number" min="0" max="10" v-model.number="item.params.precision" @focus="$emit('start')" /></label>
          <div v-if="item.symbol==='tank'" class="pair"><label>液位下限<input type="number" aria-label="液位下限" v-model.number="item.params.min" @focus="$emit('start')" /></label><label>液位上限<input type="number" aria-label="液位上限" v-model.number="item.params.max" @focus="$emit('start')" /></label></div>
          <label v-if="item.symbol==='trend'">显示时长（秒）<input type="number" min="10" max="86400" aria-label="趋势时长" v-model.number="item.params.windowSeconds" @focus="$emit('start')" /></label>
        </template>
        <label v-if="item.symbol==='image'" class="button">载入本地图片<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" @change="$emit('action',{key:'image',file:$event.target.files[0]})" /></label>
        <label class="screen-check"><input type="checkbox" v-model="item.hidden" @focus="$emit('start')" />隐藏对象</label>
      </template>
      <template v-else>
        <p class="muted">端点：{{doc.nodes.find(n=>n.id===item.source.nodeId)?.title||'开放端'}} → {{doc.nodes.find(n=>n.id===item.target.nodeId)?.title||'开放端'}}。拖动端点手柄或在下方重新连接。</p>
        <p v-if="endpointError" role="alert" class="definition-error">{{endpointError}}</p><fieldset class="definition-card" v-for="(label,key) in {source:'起点',target:'终点'}"><legend>{{label}}</legend><label>连接元素<select :aria-label="label+'元素'" :value="item[key].nodeId||''" @change="endpointNode(key,$event.target.value)"><option value="">开放端（未连接）</option><option v-for="n in endpointNodes" :value="n.id">{{n.title}}</option></select></label><label v-if="item[key].nodeId">连接点<select :aria-label="label+'连接点'" :value="item[key].portId" @change="setEndpoint(key,{nodeId:item[key].nodeId,portId:$event.target.value})"><option v-for="p in endPorts(key)" :value="p.id">{{p.label}}</option></select></label><div v-else class="pair"><label>X<input type="number" :aria-label="label+' X'" :value="item[key].x" @change="setEndpoint(key,{...item[key],x:Number($event.target.value)})" /></label><label>Y<input type="number" :aria-label="label+' Y'" :value="item[key].y" @change="setEndpoint(key,{...item[key],y:Number($event.target.value)})" /></label></div></fieldset>
        <details class="definition-card"><summary>转折点 · {{item.vertices.length}}</summary>
          <p v-if="waypointError" role="alert" class="definition-error">{{waypointError}}</p>
          <div class="pair" v-for="(point,i) in item.vertices" :key="i">
            <label v-for="axis in ['x','y']">转折 {{i+1}} {{axis.toUpperCase()}}<input type="number" :aria-label="'转折 '+(i+1)+' '+axis.toUpperCase()" :value="point[axis]" @change="changeWaypoint(i,axis,$event)" /></label>
            <button @click="setWaypoints(item.vertices.filter((_,j)=>j!==i))">移除转折 {{i+1}}</button>
          </div><button @click="addWaypoint">添加转折点</button>
        </details>
        <div class="pair"><label>管道颜色<input type="color" aria-label="管道颜色" v-model="item.style.color" @focus="$emit('start')" /></label><label>管道宽度<input type="number" min="1" max="30" aria-label="管道宽度" v-model.number="item.style.width" @focus="$emit('start')" /></label></div>
        <div class="pair"><label>箭头<select aria-label="管道箭头" :value="item.style.arrow||'none'" @focus="$emit('start')" @change="item.style.arrow=$event.target.value"><option value="none">无</option><option value="forward">起点到终点</option><option value="reverse">终点到起点</option><option value="both">双向</option></select></label><label>流动方向<select aria-label="管道流动方向" :value="item.style.flowDirection||'forward'" @focus="$emit('start')" @change="item.style.flowDirection=$event.target.value"><option value="forward">起点到终点</option><option value="reverse">终点到起点</option></select></label></div>
        <label>流动颜色<input type="color" aria-label="管道流动颜色" :value="item.style.flowColor||'#36c2ff'" @change="$emit('start');item.style.flowColor=$event.target.value" /></label>
        <p class="muted">在画布选中管道后拖动管段或转折点；“动态与测点”可绑定流动状态。</p>
      </template>
      <h2>排列与操作</h2><div class="tools"><button v-for="(label,key) in item.type==='pipe'?{delete:'删除'}:{copy:'复制','copy-bound':'带测点复制',delete:'删除',rotate:'旋转 90°',lock:'锁定 / 解锁',front:'置顶',back:'置底',left:'左对齐',top:'顶对齐',right:'右对齐',bottom:'底对齐',center:'水平居中',middle:'垂直居中',horizontal:'横向等距',vertical:'纵向等距',group:'成组',ungroup:'解组'}" @click="$emit('action',{key})">{{label}}</button></div>
      <button v-if="slots.length" class="primary wide" @click="$emit('tab','binding')">绑定当前图元测点</button>
    </template>
    <dialog ref="pointDialog" class="screen-point-dialog" aria-labelledby="screen-point-dialog-title" @keydown.stop @close="picking=null">
      <header><div><h2 id="screen-point-dialog-title">选择测点</h2><p>{{item.title}} / {{picking?.label}} · {{picking?.kinds.map(k=>typeNames[k]||k).join(' / ')}}</p></div><button @click="pointDialog.close()">关闭</button></header>
      <label>查找名称或业务编号<input autofocus aria-label="查找候选测点" v-model="pointQuery" @input="pointPage=0" /></label>
      <div class="screen-point-results">
        <table><thead><tr><th>名称 / 业务编号</th><th>类型</th><th>当前值</th><th>质量</th><th>操作</th></tr></thead>
          <tbody><tr v-for="row in visiblePoints" :key="row.id">
            <td>{{row.label}}<small v-if="row.label!==row.id">{{row.id}}</small></td><td>{{typeNames[row.kind]}}</td><td>{{pointValue(row.id,row.unit)}}</td><td>{{pointQuality(row.id)}}</td>
            <td><button :aria-label="'选择 '+row.label+' · '+row.id" @click="choosePoint(row.id)">{{item.bindings[picking?.key]===row.id?'已绑定':'选择'}}</button></td>
          </tr><tr v-if="!visiblePoints.length"><td colspan="5">没有匹配的测点。请调整搜索条件或返回点位管理。</td></tr></tbody>
        </table>
      </div>
      <footer><span aria-live="polite">{{pointRows.length}} 个匹配点</span><button v-if="item.bindings[picking?.key]" @click="choosePoint('')">清除绑定</button><button :disabled="pointPage===0" @click="pointPage--">上一页</button><button :disabled="(pointPage+1)*pointPageSize>=pointRows.length" @click="pointPage++">下一页</button></footer>
    </dialog>
  </div>`,
};
