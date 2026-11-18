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
    return { pages, slots, type, choose, change };
  },
  template: `<section class="screen-actions"><h2>点击元素时</h2><p class="muted">编辑时只选择元素。预览或发布后才执行显示动作。</p><label>点击动作<select aria-label="点击动作" :value="type" @change="choose($event.target.value)"><option value="none">不执行动作</option><option value="details">打开设备详情</option><option value="trend" :disabled="!slots.length">打开趋势面板</option><option value="navigate">切换画面</option><option value="link">打开链接</option></select></label><label v-if="type==='trend'">趋势测点槽位<select aria-label="趋势面板槽位" :value="item.action.slot" @change="change('slot',$event.target.value)"><option value="">请选择数值或数据集槽位</option><option v-for="s in slots" :value="s.key">{{s.label}}</option></select></label><label v-if="type==='navigate'">目标画面<select aria-label="目标画面" :value="item.action.pageId" @change="change('pageId',$event.target.value)"><option value="">请选择画面</option><option v-for="page in pages" :value="page.id">{{page.title}}</option></select></label><label v-if="type==='link'">链接地址<input type="url" aria-label="链接地址" :value="item.action.url" @change="change('url',$event.target.value)" placeholder="https://..." /></label><p v-if="type==='details'" class="muted">显示该元素定义的测点与质量。当前设备详情只读。</p></section>`,
};
