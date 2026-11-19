import {
  screenSlots,
  screenDefaultAction,
} from "../../../packages/components/studio/screen-symbols.mjs";
import { screenPages } from "../../../packages/runtime/studio/screen-pages.mjs";

export const ScreenActions = {
  props: ["item", "project"],
  emits: ["start"],
  setup(props, { emit }) {
    const pages = Vue.computed(() => screenPages(props.project)),
      slots = Vue.computed(() =>
        screenSlots(props.item).filter((s) =>
          s.kinds.some((k) => ["number", "dataset"].includes(k)),
        ),
      );
    const type = Vue.computed(
      () => props.item.action?.type || screenDefaultAction(props.item),
    );
    const dataset = Vue.computed(() => {
      const id = props.item.bindings?.[props.item.action?.slot];
      return type.value === "trend" &&
        props.project.mappings.some((m) => m.id === id && m.kind === "dataset");
    });
    const choose = (type) => {
      emit("start");
      props.item.action = {
        type,
        ...(type === "trend"
          ? { slot: slots.value[0]?.key || "" }
          : type === "navigate"
            ? { pageId: "" }
            : type === "link"
              ? { url: "" }
              : {}),
      };
    };
    const change = (key, value) => {
      emit("start");
      props.item.action[key] = value;
    };
    const changeEquipmentCode = (value) => {
      const code = value.trim();
      if (code === (props.item.params.equipmentCode || "")) return;
      emit("start");
      if (code) props.item.params.equipmentCode = code;
      else delete props.item.params.equipmentCode;
    };
    return { pages, slots, type, dataset, choose, change, changeEquipmentCode };
  },
  template: `<section class="screen-actions"><h2>点击元素时</h2><p class="muted">编辑时只选择元素。预览或发布后才执行显示动作。</p><label>点击动作<select aria-label="点击动作" :value="type" @change="choose($event.target.value)"><option value="none">不执行动作</option><option value="details">打开设备详情</option><option value="trend" :disabled="!slots.length">打开趋势面板</option><option value="navigate">切换画面</option><option value="link">打开链接</option></select></label><label v-if="type==='trend'">趋势测点槽位<select aria-label="趋势面板槽位" :value="item.action.slot" @change="change('slot',$event.target.value)"><option value="">请选择数值或数据集槽位</option><option v-for="s in slots" :value="s.key">{{s.label}}</option></select></label>
    <fieldset v-if="dataset">
      <legend>历史数据字段</legend>
      <label>时间字段<input aria-label="趋势面板时间字段" maxlength="128" placeholder="time" :value="item.action.timeField || ''" @change="change('timeField',$event.target.value.trim())" /></label>
      <label>数值字段<input aria-label="趋势面板数值字段" maxlength="128" placeholder="value" :value="item.action.valueField || ''" @change="change('valueField',$event.target.value.trim())" /></label>
      <label>质量字段<input aria-label="趋势面板质量字段" maxlength="128" placeholder="quality" :value="item.action.qualityField || ''" @change="change('qualityField',$event.target.value.trim())" /></label>
    </fieldset>
    <label v-if="type==='navigate'">目标画面<select aria-label="目标画面" :value="item.action.pageId" @change="change('pageId',$event.target.value)"><option value="">请选择画面</option><option v-for="page in pages" :value="page.id">{{page.title}}</option></select></label><label v-if="type==='link'">链接地址<input type="url" aria-label="链接地址" :value="item.action.url" @change="change('url',$event.target.value)" placeholder="https://..." /></label><template v-if="type==='details'"><label>设备编号<input aria-label="设备编号" maxlength="64"
      :value="item.params.equipmentCode || ''" placeholder="例如 DC-101"
      @change="changeEquipmentCode($event.target.value)" /></label>
      <p class="muted">告警列表可使用设备编号定位。同一画面内请使用唯一编号。</p></template></section>`,
};
