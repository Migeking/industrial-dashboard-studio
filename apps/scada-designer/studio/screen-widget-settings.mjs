import {
  screenSlots,
  screenRoleSlot,
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
export const ScreenChartSettings = {
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
      setSeries,
      add,
      remove,
      addThreshold,
    };
  },
  template: `<section class="screen-chart-settings"><h2>图表配置</h2><p class="definition-error" v-if="error" role="alert">{{error}}</p>
 <template v-if="cartesian"><label class="screen-check"><input type="checkbox" aria-label="平滑趋势线" :checked="!!form.smooth" @change="form.smooth=$event.target.checked;commit()" />平滑趋势线</label><label class="screen-check"><input type="checkbox" aria-label="显示数据标记" :checked="form.showSymbol!==false" @change="form.showSymbol=$event.target.checked;commit()" />显示数据标记</label></template>
 <label v-if="item.symbol!=='gauge'" class="screen-check"><input type="checkbox" aria-label="显示图例" :checked="form.legend!==false" @change="form.legend=$event.target.checked;commit()" />显示图例</label>
 <template v-if="cartesian||item.symbol==='pieChart'"><label v-if="cartesian">横轴类型<select aria-label="图表横轴类型" :value="form.xType||(item.symbol==='trend'?'time':'category')" @change="form.xType=$event.target.value;commit()"><option value="time">时间</option><option value="category">分类</option></select></label><label v-if="cartesian">时间刻度<select aria-label="趋势时间刻度" :value="form.timeFormat||'seconds'" @change="form.timeFormat=$event.target.value;commit()"><option value="seconds">时:分:秒</option><option value="hours">时:分</option></select></label><label>时间 / 分类字段<input aria-label="图表分类字段" :placeholder="item.symbol==='trend'?'time':'name'" v-model="form.xField" @change="commit()" /></label></template>
 <label v-if="item.symbol==='pieChart'" class="screen-check"><input type="checkbox" aria-label="环形图" :checked="form.donut!==false" @change="form.donut=$event.target.checked;commit()" />显示为环形</label>
 <template v-if="item.symbol==='gauge'"><div class="pair"><label>下限<input type="number" aria-label="仪表下限" v-model.number="form.min" @change="commit()" /></label><label>上限<input type="number" aria-label="仪表上限" v-model.number="form.max" @change="commit()" /></label></div></template>
 <template v-if="cartesian"><div class="definition-heading"><h2>数据序列</h2><button @click="add">添加序列</button></div><p class="muted">每个序列有独立测点槽位。添加后到“动态与测点”绑定；名称留空时跟随测点。</p>
 <fieldset class="definition-card" v-for="(s,i) in series" :key="s.id"><legend>序列 {{i+1}}</legend><label>名称<input :aria-label="'序列 '+(i+1)+' 名称'" :value="s.name" @change="setSeries(i,'name',$event.target.value)" placeholder="跟随测点" /></label><label>测点槽位<select :aria-label="'序列 '+(i+1)+' 槽位'" :value="s.slot" @change="setSeries(i,'slot',$event.target.value)"><option v-for="slot in slots" :value="slot.key">{{slot.label}}</option></select></label><div class="pair"><label>样式<select :aria-label="'序列 '+(i+1)+' 样式'" :value="s.type" @change="setSeries(i,'type',$event.target.value)"><option value="line">折线</option><option value="bar">柱形</option></select></label><label>坐标轴<select :aria-label="'序列 '+(i+1)+' 坐标轴'" :value="s.axis" @change="setSeries(i,'axis',Number($event.target.value))"><option :value="0">左轴</option><option :value="1">右轴</option></select></label></div><label>数据集数值字段<input :aria-label="'序列 '+(i+1)+' 数值字段'" :value="s.field" @change="setSeries(i,'field',$event.target.value)" /></label><label>颜色<input type="color" :aria-label="'序列 '+(i+1)+' 颜色'" :value="s.color||(i===0?'#227f9f':'#d68b45')" @change="setSeries(i,'color',$event.target.value)" /></label><button @click="remove(i)" :disabled="series.length===1">移除序列 {{i+1}}</button></fieldset>
 <fieldset class="definition-card" v-for="(label,side) in {left:'左轴',right:'右轴'}"><legend>{{label}}</legend><label>单位（留空跟随测点）<input :aria-label="label+'单位'" v-model="form[side+'Unit']" @change="commit()" /></label><div class="pair"><label>最小值<input type="number" :aria-label="label+'最小值'" v-model.number="form[side+'Min']" placeholder="自动" @change="commit()" /></label><label>最大值<input type="number" :aria-label="label+'最大值'" v-model.number="form[side+'Max']" placeholder="自动" @change="commit()" /></label></div></fieldset>
 <div class="definition-heading"><h2>参考线</h2><button @click="addThreshold">添加参考线</button></div><fieldset v-for="(line,i) in form.thresholds||[]" :key="i" class="definition-card"><legend>参考线 {{i+1}}</legend><label>数值<input type="number" :aria-label="'参考线 '+(i+1)+' 数值'" v-model.number="line.value" @change="commit()" /></label><label>名称<input :aria-label="'参考线 '+(i+1)+' 名称'" v-model="line.label" @change="commit()" /></label><label>坐标轴<select :aria-label="'参考线 '+(i+1)+' 坐标轴'" v-model.number="line.axis" @change="commit()"><option :value="0">左轴</option><option :value="1">右轴</option></select></label><label>颜色<input type="color" :aria-label="'参考线 '+(i+1)+' 颜色'" v-model="line.color" @change="commit()" /></label><button @click="form.thresholds.splice(i,1);commit()">移除参考线 {{i+1}}</button></fieldset></template>
 <template v-else-if="item.symbol==='pieChart'"><label>数据集数值字段<input aria-label="饼图数值字段" :value="form.series?.[0]?.field||'value'" @change="form.series=[{id:'primary',slot:slots[0]?.key||'value',name:'',type:'line',axis:0,field:$event.target.value}];commit()" /></label></template>
 </section>`,
};
export const ScreenTableSettings = {
  props: ["item", "doc", "points"],
  emits: ["start"],
  setup(props, { emit }) {
    const state = screenWidgetForm(props, emit);
    const sample = Vue.computed(() => {
      const slot = screenRoleSlot(props.item, "value"),
        point = props.points[props.item.bindings[slot?.key]];
      return point?.quality === "good" && Array.isArray(point.value)
        ? point.value[0]
        : null;
    });
    const fields = Vue.computed(() =>
      sample.value && typeof sample.value === "object"
        ? Object.keys(sample.value)
        : [],
    );
    const add = () => {
      state.form.value.columns ||= [];
      const field =
        fields.value.find(
          (f) => !state.form.value.columns.some((c) => c.field === f),
        ) || "value";
      state.form.value.columns.push({
        field,
        title: field,
        format: typeof sample.value?.[field] === "number" ? "number" : "text",
        unit: "",
      });
      state.commit();
    };
    const generate = () => {
      state.form.value.columns = fields.value.map((field) => ({
        field,
        title: field,
        format:
          /^(time|timestamp|receivedAt|eventTime|sourceTime|createdAt|updatedAt|时间)$/i.test(
            field,
          )
            ? "time"
            : typeof sample.value[field] === "number"
              ? "number"
              : typeof sample.value[field] === "boolean"
                ? "boolean"
                : "text",
        unit: "",
      }));
      state.commit();
    };
    return { ...state, fields, add, generate };
  },
  template: `<section class="screen-table-settings"><h2>列表字段</h2><p role="alert" v-if="error" class="definition-error">{{error}}</p><p class="muted">默认显示样本前六列。生成后可改字段、列名及格式。</p><div class="tools"><button @click="generate" :disabled="!fields.length">从样本生成列</button><button @click="add">添加列</button></div><fieldset v-for="(col,i) in form.columns||[]" :key="i" class="definition-card"><legend>列 {{i+1}}</legend><label>字段<input :aria-label="'列 '+(i+1)+' 字段'" v-model="col.field" @change="commit()" /></label><label>列名<input :aria-label="'列 '+(i+1)+' 名称'" v-model="col.title" @change="commit()" /></label><label>格式<select :aria-label="'列 '+(i+1)+' 格式'" v-model="col.format" @change="commit()"><option value="text">文本</option><option value="number">数值</option><option value="time">时间</option><option value="boolean">是 / 否</option></select></label><label v-if="col.format==='number'">单位<input :aria-label="'列 '+(i+1)+' 单位'" v-model="col.unit" @change="commit()" /></label><div class="tools"><button :disabled="i===0" @click="[form.columns[i-1],form.columns[i]]=[form.columns[i],form.columns[i-1]];commit()">上移列 {{i+1}}</button><button @click="form.columns.splice(i,1);commit()">移除列 {{i+1}}</button></div></fieldset><div class="pair"><label>最多显示行数<input type="number" min="1" max="200" aria-label="列表行数" :value="form.limit||8" @change="form.limit=Number($event.target.value);commit()" /></label><label>排序方向<select aria-label="列表排序方向" :value="form.sortDirection||'asc'" @change="form.sortDirection=$event.target.value;commit()"><option value="asc">升序</option><option value="desc">降序</option></select></label></div><label>排序字段<input aria-label="列表排序字段" v-model="form.sortField" @change="commit()" /></label><label v-if="item.symbol==='events'">告警级别字段<input aria-label="告警级别字段" :value="form.severityField||'level'" @change="form.severityField=$event.target.value;commit()" /></label></section>`,
};
