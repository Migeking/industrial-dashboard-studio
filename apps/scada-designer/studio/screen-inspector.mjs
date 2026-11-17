import {
  screenSymbols,
  screenSlots,
  screenSlotMappings,
} from "../../../packages/components/studio/screen-symbols.mjs";

export const ScreenInspector = {
  props: ["item", "doc", "points", "tab", "count"],
  emits: ["start", "geometry", "action", "tab", "data"],
  setup(props, { emit }) {
    const search = Vue.ref("");
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
    const read = (key) => {
      const p = props.points[props.item.bindings[key]],
        m = props.doc.mappings.find((m) => m.id === props.item.bindings[key]);
      return (
        (p?.quality === "good"
          ? typeof p.value === "boolean"
            ? p.value
              ? "有"
              : "无"
            : String(p.value) + (m?.unit ? " " + m.unit : "")
          : "—") +
        " · " +
        ({ good: "有效", bad: "无效", stale: "过期", offline: "离线" }[
          p?.quality
        ] || "未绑定")
      );
    };
    const binding = (slot, value) => {
      emit("start");
      props.item.bindings[slot.key] = value;
    };
    const kind = Vue.computed(() =>
      props.item.type === "pipe"
        ? "工艺管道"
        : screenSymbols[props.item.symbol].label,
    );
    return {
      search,
      slots,
      options,
      read,
      binding,
      kind,
      geometryDraft,
      geometryValue,
      startGeometry,
      commitGeometry,
    };
  },
  template: `<div class="screen-inspector">
    <div class="inspector-heading"><small>{{kind}}<span v-if="count>1"> · 已选 {{count}} 个对象</span></small><b>{{item.title}}</b></div>
    <div class="inspector-tabs" role="tablist" aria-label="图元设置"><button role="tab" :aria-selected="tab==='appearance'" @click="$emit('tab','appearance')">外观</button><button v-if="slots.length" role="tab" :aria-selected="tab==='binding'" @click="$emit('tab','binding')">动态与测点</button></div>
    <template v-if="tab==='binding'&&slots.length">
      <button class="source-link wide" @click="$emit('data')">管理连接与点位</button>
      <p class="muted">选择测点后立即显示结果。{{doc.mappings.length}} 个测点可用。</p>
      <input aria-label="搜索测点" placeholder="查找名称或业务编号" v-model="search" />
      <label v-for="slot in slots" :key="slot.key">{{slot.label}}<span v-if="slot.required" class="required-mark"> *</span>
        <select :aria-label="slot.label+' · 绑定测点'" :value="item.bindings[slot.key]||''" @change="binding(slot,$event.target.value)"><option value="">{{slot.required?'请选择测点':'不绑定（可选）'}}</option><option v-for="m in options(slot)" :value="m.id">{{m.label}} · {{m.id}}{{m.unit?' / '+m.unit:''}}</option></select><small class="point-readback">{{read(slot.key)}}</small>
      </label>
      <p v-if="!doc.mappings.length" class="quality-note">尚未配置测点。先管理连接与点位，再返回当前图元选择测点。</p>
      <p class="muted">* 为必需绑定。未知或失效数据显示“—”，不会替换为演示正常值。</p>
    </template>
    <template v-else>
      <label>名称 / 位号<input aria-label="图元名称" v-model="item.title" @focus="$emit('start')" /></label>
      <template v-if="item.type!=='pipe'">
        <div class="pair"><label v-for="(label,key) in {x:'位置 X',y:'位置 Y',w:'宽度',h:'高度',angle:'角度'}">{{label}}<input type="number" :aria-label="label" :value="geometryValue(key)" @focus="startGeometry(key,$event)" @input="geometryDraft.value=$event.target.value" @change="commitGeometry(key,$event)" @blur="geometryDraft.id=''" /></label></div>
        <label v-if="item.symbol==='text'">文字内容<textarea aria-label="文字内容" v-model="item.text" @focus="$emit('start')"></textarea></label>
        <div v-if="item.symbol!=='image'" class="pair"><label v-if="!['pump','fan','valve','text'].includes(item.symbol)">填充颜色<input type="color" aria-label="填充颜色" :value="item.style.fill==='transparent'?'#ffffff':item.style.fill" @focus="$emit('start')" @input="item.style.fill=$event.target.value" /></label><label v-if="!['junction','rect','ellipse'].includes(item.symbol)">文字颜色<input type="color" aria-label="文字颜色" v-model="item.style.color" @focus="$emit('start')" /></label></div>
        <p v-if="['pump','fan','valve'].includes(item.symbol)" class="muted">设备填充色由运行、故障与数据质量决定。</p>
        <div v-if="item.symbol!=='image'" class="pair"><label v-if="item.symbol!=='text'">边线颜色<input type="color" aria-label="边线颜色" v-model="item.style.stroke" @focus="$emit('start')" /></label><label v-if="!['junction','rect','ellipse'].includes(item.symbol)">字号<input type="number" min="8" max="120" aria-label="字号" v-model.number="item.style.fontSize" @focus="$emit('start')" /></label></div>
        <template v-if="['pump','valve','fan','tank','readout','trend'].includes(item.symbol)">
          <label>显示单位（留空跟随测点）<input aria-label="显示单位" v-model="item.params.unit" @focus="$emit('start')" /></label>
          <label>小数位<input aria-label="小数位" type="number" min="0" max="10" v-model.number="item.params.precision" @focus="$emit('start')" /></label>
          <div v-if="item.symbol==='tank'" class="pair"><label>液位下限<input type="number" aria-label="液位下限" v-model.number="item.params.min" @focus="$emit('start')" /></label><label>液位上限<input type="number" aria-label="液位上限" v-model.number="item.params.max" @focus="$emit('start')" /></label></div>
          <label v-if="item.symbol==='trend'">显示时长（秒）<input type="number" min="10" max="86400" aria-label="趋势时长" v-model.number="item.params.windowSeconds" @focus="$emit('start')" /></label>
        </template>
        <label v-if="item.symbol==='image'" class="button">载入本地图片<input type="file" accept="image/png,image/jpeg,image/webp" @change="$emit('action',{key:'image',file:$event.target.files[0]})" /></label>
        <label class="screen-check"><input type="checkbox" v-model="item.hidden" @focus="$emit('start')" />隐藏对象</label>
      </template>
      <template v-else>
        <p class="muted">端点：{{doc.nodes.find(n=>n.id===item.source.nodeId)?.title}} → {{doc.nodes.find(n=>n.id===item.target.nodeId)?.title}}。移动设备时接口保持连接。</p>
        <div class="pair"><label>管道颜色<input type="color" aria-label="管道颜色" v-model="item.style.color" @focus="$emit('start')" /></label><label>管道宽度<input type="number" min="1" max="30" aria-label="管道宽度" v-model.number="item.style.width" @focus="$emit('start')" /></label></div>
        <p class="muted">在画布选中管道后拖动管段或转折点；“动态与测点”可绑定流动状态。</p>
      </template>
      <h2>排列与操作</h2><div class="tools"><button v-for="(label,key) in item.type==='pipe'?{delete:'删除'}:{copy:'复制',delete:'删除',rotate:'旋转 90°',lock:'锁定 / 解锁',front:'置顶',back:'置底',left:'左对齐',top:'顶对齐',right:'右对齐',bottom:'底对齐',center:'水平居中',middle:'垂直居中',horizontal:'横向等距',vertical:'纵向等距',group:'成组',ungroup:'解组'}" @click="$emit('action',{key})">{{label}}</button></div>
      <button v-if="slots.length" class="primary wide" @click="$emit('tab','binding')">绑定当前图元测点</button>
    </template>
  </div>`,
};
