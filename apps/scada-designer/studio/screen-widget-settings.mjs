import { datasetFieldSamples } from "./model.mjs";
import {
  screenSlots,
  screenRoleSlot,
  screenSlotMappings,
} from "../../../packages/components/studio/screen-symbols.mjs";
import {
  screenSeries,
  validateScreenWidget,
} from "../../../packages/runtime/studio/screen-widgets.mjs";

function screenWidgetForm(props, emit) {
  const form = Vue.ref({}),
    error = Vue.ref("");
  Vue.watch(
    () => JSON.stringify([props.item.id, props.item.params]),
    () => {
      form.value = JSON.parse(JSON.stringify(props.item.params));
      error.value = "";
    },
    { immediate: true },
  );
  const commit = (extra = {}) => {
    try {
      const params = JSON.parse(JSON.stringify(form.value));
      for (const key of ["leftMin", "leftMax", "rightMin", "rightMax"])
        if (params[key] === "") delete params[key];
      const next = { ...props.item, ...extra, params };
      validateScreenWidget(next);
      emit("start");
      Object.assign(props.item, next);
      error.value = "";
      return true;
    } catch (e) {
      error.value = e.message;
      return false;
    }
  };
  return { form, error, commit };
}
function widgetFieldSamples(point) {
  return point?.quality === "good" && Array.isArray(point.value)
    ? datasetFieldSamples(point.value) : [];
}

const ScreenWidgetSource = {
  props: ["slot", "doc", "item", "points", "label", "fields"],
  emits: ["bind"],
  setup(props) {
    const id = Vue.computed(() => props.item.bindings[props.slot?.key] || "");
    const options = Vue.computed(() => props.slot ? screenSlotMappings(props.slot, props.doc.mappings) : []);
    const mapping = Vue.computed(() => options.value.find(m => m.id === id.value));
    const readback = Vue.computed(() => {
      const point = props.points[id.value];
      if (!id.value) return "";
      if (point?.quality === "good")
        return Array.isArray(point.value) ? point.value.length + " 行" :
          [point.value, mapping.value?.unit].filter(v => v !== "" && v != null).join(" ");
      return { offline: "离线", stale: "已过期", bad: "无效" }[point?.quality] || "等待样本";
    });
    return { id, options, mapping, readback };
  },
  template: `<div v-if="slot" class="widget-source">
    <label>{{label}}
      <select :aria-label="label" :value="id" @change="$emit('bind', $event.target.value)">
        <option value="">选择测点</option>
        <option v-for="m in options" :key="m.id" :value="m.id">{{m.label}} · {{m.id}}</option>
      </select>
    </label>
    <small v-if="readback" class="point-readback">{{readback}}</small>
    <details v-if="mapping?.kind==='dataset'" class="widget-field-samples">
      <summary>字段样本<span v-if="fields.length"> · {{fields.length}} 列</span></summary>
      <p v-if="!fields.length" class="muted">当前没有可预览的行数据。</p>
      <div v-else class="widget-field-scroll" tabindex="0" role="region" aria-label="字段样本列表">
      <table aria-label="数据集字段样本">
        <thead><tr><th scope="col">字段</th><th scope="col">类型</th><th scope="col">样本</th></tr></thead>
        <tbody><tr v-for="f in fields" :key="f.field"><th scope="row">{{f.field}}</th><td>{{f.type}}</td><td>{{f.example}}</td></tr></tbody>
      </table>
      </div>
    </details>
  </div>`,
};

const ScreenChartFieldInput = {
  props: ["caption", "label", "value", "list", "placeholder"],
  emits: ["commit"],
  setup(props) {
    const draft = Vue.ref(props.value);
    Vue.watch(() => props.value, value => { draft.value = value; });
    return { draft };
  },
  template: `<label>{{caption}}
    <input v-model="draft" :aria-label="label" :list="list" :placeholder="placeholder"
      @change="$emit('commit', draft)" />
  </label>`,
};

export const ScreenChartSettings = {
  components: { ScreenWidgetSource, ScreenChartFieldInput },
  props: ["item", "doc", "points"],
  emits: ["start"],
  setup(props, { emit }) {
    const state = screenWidgetForm(props, emit),
      cartesian = Vue.computed(() =>
        ["trend", "barChart"].includes(props.item.symbol),
      );
    const series = Vue.computed(
      () => state.form.value.series || screenSeries(props.item),
    );
    const slots = Vue.computed(() =>
      screenSlots(props.item).filter((s) =>
        s.kinds.every((k) => ["number", "dataset"].includes(k)),
      ),
    );
    const primarySlot = Vue.computed(() => screenRoleSlot(props.item, "value"));
    const fieldsBySlot = Vue.computed(() => new Map(slots.value.map(slot => [
      slot.key, widgetFieldSamples(props.points[props.item.bindings[slot.key]]),
    ])));
    const fieldsFor = (key) => fieldsBySlot.value.get(key) || [];
    const sampleFields = Vue.computed(() => [...new Set(
      series.value.flatMap(s => fieldsFor(s.slot).map(f => f.field)),
    )].slice(0, 100));
    const bind = (key, value) => state.commit({ bindings: { ...props.item.bindings, [key]: value } });
    const setXField = (value) => {
      if (value.trim()) state.form.value.xField = value.trim();
      else delete state.form.value.xField;
      state.commit();
    };
    const setSeries = (index, key, value) => {
      state.form.value.series = JSON.parse(JSON.stringify(series.value));
      state.form.value.series[index][key] = value;
      state.commit();
    };
    const add = () => {
      const definitions = JSON.parse(JSON.stringify(screenSlots(props.item)));
      let i = 2;
      while (definitions.some((s) => s.key === "series_" + i)) i++;
      const key = "series_" + i;
      definitions.push({
        key,
        label: "序列 " + i,
        kinds: ["number", "dataset"],
        role: "extra",
        required: true,
      });
      state.form.value.series = JSON.parse(JSON.stringify(series.value));
      state.form.value.series.push({
        id: crypto.randomUUID(),
        slot: key,
        name: "",
        type: props.item.symbol === "barChart" ? "bar" : "line",
        axis: 0,
        field: "value",
      });
      state.commit({ dataSlots: definitions });
    };
    const remove = (index) => {
      const current = series.value[index];
      state.form.value.series = JSON.parse(JSON.stringify(series.value));
      state.form.value.series.splice(index, 1);
      let definitions = JSON.parse(JSON.stringify(screenSlots(props.item))),
        bindings = { ...props.item.bindings };
      if (
        !state.form.value.series.some((s) => s.slot === current.slot) &&
        !props.item.rules?.some((r) => r.slot === current.slot) &&
        !(
          props.item.action?.type === "trend" &&
          props.item.action.slot === current.slot
        )
      ) {
        definitions = definitions.filter((s) => s.key !== current.slot);
        delete bindings[current.slot];
      }
      state.commit({ dataSlots: definitions, bindings });
    };
    const addThreshold = () => {
      state.form.value.thresholds ||= [];
      state.form.value.thresholds.push({
        value: 0,
        axis: 0,
        label: "参考线",
        color: "#d98b45",
      });
      state.commit();
    };
    return {
      ...state,
      cartesian,
      series,
      slots,
      primarySlot,
      fieldsFor,
      sampleFields,
      bind,
      setXField,
      setSeries,
      add,
      remove,
      addThreshold,
    };
  },
  template: `<section class="screen-chart-settings"><h2>图表配置</h2><datalist :id="'chart-fields-'+item.id"><option v-for="field in sampleFields" :value="field"></option></datalist><p class="definition-error" v-if="error" role="alert">{{error}}</p>
 <template v-if="cartesian"><label class="screen-check"><input type="checkbox" aria-label="平滑趋势线" :checked="!!form.smooth" @change="form.smooth=$event.target.checked;commit()" />平滑趋势线</label><label class="screen-check"><input type="checkbox" aria-label="显示数据标记" :checked="form.showSymbol!==false" @change="form.showSymbol=$event.target.checked;commit()" />显示数据标记</label></template>
 <label v-if="item.symbol!=='gauge'" class="screen-check"><input type="checkbox" aria-label="显示图例" :checked="form.legend!==false" @change="form.legend=$event.target.checked;commit()" />显示图例</label>
 <template v-if="cartesian||item.symbol==='pieChart'"><label v-if="cartesian">横轴类型<select aria-label="图表横轴类型" :value="form.xType||(item.symbol==='trend'?'time':'category')" @change="form.xType=$event.target.value;commit()"><option value="time">时间</option><option value="category">分类</option></select></label><label v-if="cartesian">时间刻度<select aria-label="趋势时间刻度" :value="form.timeFormat||'seconds'" @change="form.timeFormat=$event.target.value;commit()"><option value="seconds">时:分:秒</option><option value="hours">时:分</option></select></label><screen-chart-field-input caption="时间 / 分类字段" label="图表分类字段"
   :list="'chart-fields-'+item.id" :placeholder="item.symbol==='trend'?'time':'name'"
   :value="form.xField||''" @commit="setXField" /></template>
 <screen-widget-source v-if="!cartesian&&primarySlot" :slot="primarySlot" :doc="doc" :item="item" :points="points" label="图表绑定测点" :fields="fieldsFor(primarySlot.key)" @bind="bind(primarySlot.key,$event)"></screen-widget-source>
 <label v-if="item.symbol==='pieChart'" class="screen-check"><input type="checkbox" aria-label="环形图" :checked="form.donut!==false" @change="form.donut=$event.target.checked;commit()" />显示为环形</label>
 <template v-if="item.symbol==='gauge'"><div class="pair"><label>下限<input type="number" aria-label="仪表下限" v-model.number="form.min" @change="commit()" /></label><label>上限<input type="number" aria-label="仪表上限" v-model.number="form.max" @change="commit()" /></label></div></template>
 <template v-if="cartesian"><div class="definition-heading"><h2>数据序列</h2><button @click="add">添加序列</button></div><p class="muted">在序列中选择测点和字段。名称留空时跟随测点。</p>
 <fieldset class="definition-card" v-for="(s,i) in series" :key="s.id"><legend>序列 {{i+1}}</legend><screen-chart-field-input caption="名称" :label="'序列 '+(i+1)+' 名称'" :value="s.name"
   @commit="setSeries(i,'name',$event)" placeholder="跟随测点" /><label>测点槽位<select :aria-label="'序列 '+(i+1)+' 槽位'" :value="s.slot" @change="setSeries(i,'slot',$event.target.value)"><option v-for="slot in slots" :value="slot.key">{{slot.label}}</option></select></label>
 <screen-widget-source :slot="slots.find(slot=>slot.key===s.slot)" :doc="doc" :item="item" :points="points"
   :label="'序列 '+(i+1)+' 绑定测点'" :fields="fieldsFor(s.slot)" @bind="bind(s.slot,$event)"></screen-widget-source>
 <datalist :id="'series-fields-'+item.id+'-'+i"><option v-for="f in fieldsFor(s.slot)" :key="f.field" :value="f.field">{{f.type}} · {{f.example}}</option></datalist>
 <screen-chart-field-input caption="序列时间 / 分类字段" :label="'序列 '+(i+1)+' 时间 / 分类字段'"
   :value="s.xField||''" :list="'series-fields-'+item.id+'-'+i"
   @commit="setSeries(i,'xField',$event.trim())" placeholder="沿用图表横轴字段" />
 <div class="pair"><label>样式<select :aria-label="'序列 '+(i+1)+' 样式'" :value="s.type" @change="setSeries(i,'type',$event.target.value)"><option value="line">折线</option><option value="bar">柱形</option></select></label><label>坐标轴<select :aria-label="'序列 '+(i+1)+' 坐标轴'" :value="s.axis" @change="setSeries(i,'axis',Number($event.target.value))"><option :value="0">左轴</option><option :value="1">右轴</option></select></label></div><screen-chart-field-input caption="数据集数值字段" :label="'序列 '+(i+1)+' 数值字段'"
   :value="s.field" :list="'series-fields-'+item.id+'-'+i" @commit="setSeries(i,'field',$event.trim())" /><screen-chart-field-input caption="数据集质量字段" :label="'序列 '+(i+1)+' 质量字段'"
   :value="s.qualityField||''" :list="'series-fields-'+item.id+'-'+i"
   @commit="setSeries(i,'qualityField',$event.trim())" placeholder="可留空" /><label>颜色<input type="color" :aria-label="'序列 '+(i+1)+' 颜色'" :value="s.color||(i===0?'#227f9f':'#d68b45')" @change="setSeries(i,'color',$event.target.value)" /></label><button @click="remove(i)" :disabled="series.length===1">移除序列 {{i+1}}</button></fieldset>
 <fieldset class="definition-card" v-for="(label,side) in {left:'左轴',right:'右轴'}"><legend>{{label}}</legend><label>单位（留空跟随测点）<input :aria-label="label+'单位'" v-model="form[side+'Unit']" @change="commit()" /></label><div class="pair"><label>最小值<input type="number" :aria-label="label+'最小值'" v-model.number="form[side+'Min']" placeholder="自动" @change="commit()" /></label><label>最大值<input type="number" :aria-label="label+'最大值'" v-model.number="form[side+'Max']" placeholder="自动" @change="commit()" /></label></div></fieldset>
 <div class="definition-heading"><h2>参考线</h2><button @click="addThreshold">添加参考线</button></div><fieldset v-for="(line,i) in form.thresholds||[]" :key="i" class="definition-card"><legend>参考线 {{i+1}}</legend><label>数值<input type="number" :aria-label="'参考线 '+(i+1)+' 数值'" v-model.number="line.value" @change="commit()" /></label><label>名称<input :aria-label="'参考线 '+(i+1)+' 名称'" v-model="line.label" @change="commit()" /></label><label>坐标轴<select :aria-label="'参考线 '+(i+1)+' 坐标轴'" v-model.number="line.axis" @change="commit()"><option :value="0">左轴</option><option :value="1">右轴</option></select></label><label>颜色<input type="color" :aria-label="'参考线 '+(i+1)+' 颜色'" v-model="line.color" @change="commit()" /></label><button @click="form.thresholds.splice(i,1);commit()">移除参考线 {{i+1}}</button></fieldset></template>
 <template v-else-if="item.symbol==='pieChart'"><screen-chart-field-input caption="数据集数值字段" label="饼图数值字段" :list="'chart-fields-'+item.id"
   :value="series[0]?.field||'value'" @commit="setSeries(0,'field',$event.trim())" /></template>
 </section>`,
};
export const ScreenTableSettings = {
  components: { ScreenWidgetSource },
  props: ["item", "doc", "points"],
  emits: ["start"],
  setup(props, { emit }) {
    const state = screenWidgetForm(props, emit);
    const slot = Vue.computed(() => screenRoleSlot(props.item, "value"));
    const fields = Vue.computed(() =>
      widgetFieldSamples(props.points[props.item.bindings[slot.value?.key]]),
    );
    const bind = (value) => state.commit({ bindings: { ...props.item.bindings, [slot.value.key]: value } });
    const column = ({ field, type }) => ({
      field, title: field, unit: "",
      format: /^(time|timestamp|receivedAt|eventTime|sourceTime|createdAt|updatedAt|时间)$/i.test(field)
        ? "time" : { 数值: "number", 布尔: "boolean" }[type] || "text",
    });
    const add = () => {
      state.form.value.columns ||= [];
      const field = fields.value.find(f =>
        !state.form.value.columns.some(c => c.field === f.field),
      ) || { field: "value", type: "" };
      state.form.value.columns.push(column(field));
      state.commit();
    };
    const generate = () => {
      state.form.value.columns = fields.value.map(column);
      state.commit();
    };
    return { ...state, slot, fields, bind, add, generate };
  },
  template: `<section class="screen-table-settings"><h2>列表字段</h2><p role="alert" v-if="error" class="definition-error">{{error}}</p><screen-widget-source :slot="slot" :doc="doc" :item="item" :points="points" label="列表绑定测点" :fields="fields" @bind="bind"></screen-widget-source>
  <datalist :id="'table-fields-'+item.id"><option v-for="f in fields" :key="f.field" :value="f.field">{{f.type}} · {{f.example}}</option></datalist><div class="tools"><button @click="generate" :disabled="!fields.length">从样本生成列</button><button @click="add">添加列</button></div><fieldset v-for="(col,i) in form.columns||[]" :key="i" class="definition-card"><legend>列 {{i+1}}</legend><label>字段<input :aria-label="'列 '+(i+1)+' 字段'" v-model="col.field" :list="'table-fields-'+item.id" @change="commit()" /></label><label>列名<input :aria-label="'列 '+(i+1)+' 名称'" v-model="col.title" @change="commit()" /></label><label>格式<select :aria-label="'列 '+(i+1)+' 格式'" v-model="col.format" @change="commit()"><option value="text">文本</option><option value="number">数值</option><option value="time">时间</option><option value="boolean">是 / 否</option></select></label><label v-if="col.format==='number'">单位<input :aria-label="'列 '+(i+1)+' 单位'" v-model="col.unit" @change="commit()" /></label><div class="tools"><button :disabled="i===0" @click="[form.columns[i-1],form.columns[i]]=[form.columns[i],form.columns[i-1]];commit()">上移列 {{i+1}}</button><button @click="form.columns.splice(i,1);commit()">移除列 {{i+1}}</button></div></fieldset><div class="pair"><label>{{item.symbol==='events'?'每页行数':'最多显示行数'}}<input type="number" min="1" max="200" aria-label="列表行数" :value="form.limit||8" @change="form.limit=Number($event.target.value);commit()" /></label><label>排序方向<select aria-label="列表排序方向" :value="form.sortDirection||'asc'" @change="form.sortDirection=$event.target.value;commit()"><option value="asc">升序</option><option value="desc">降序</option></select></label></div><label>排序字段<input aria-label="列表排序字段" v-model="form.sortField" :list="'table-fields-'+item.id" @change="commit()" /></label><label v-if="item.symbol==='events'">告警级别字段<input aria-label="告警级别字段" :list="'table-fields-'+item.id" :value="form.severityField||'level'" @change="form.severityField=$event.target.value;commit()" /></label>
    <template v-if="item.symbol==='events'">
      <label>告警定位字段<input aria-label="告警定位字段" v-model.trim="form.deviceRefField" maxlength="128"
        :list="'table-fields-'+item.id" @change="commit()" placeholder="例如 deviceRef" /></label>
      <p class="muted">字段值填写本画面的图元编号或唯一设备名称。</p>
    </template></section>`,
};
