import { screenSlots } from "../../../packages/components/studio/screen-symbols.mjs";
import {
  screenRuleTargets,
  screenRuleOps,
  editScreenRule,
} from "../../../packages/runtime/studio/screen-dynamics.mjs";

export const ScreenRules = {
  props: ["item", "doc"],
  emits: ["start"],
  setup(props, { emit }) {
    const error = Vue.ref("");
    const slots = Vue.computed(() =>
      screenSlots(props.item).filter((s) => !s.kinds.includes("dataset")),
    );
    const targets = Vue.computed(() =>
      Object.fromEntries(
        Object.entries(screenRuleTargets).filter(([k]) =>
          props.item.type === "pipe"
            ? ["fill", "flow", "visible"].includes(k)
            : k !== "flow",
        ),
      ),
    );
    const kind = (r) =>
      slots.value.find((s) => s.key === r.slot)?.kinds[0] || "number";
    const apply = (op, r) => {
      try {
        const next = editScreenRule(props.doc, props.item.id, op, r, false);
        emit("start");
        props.item.rules = next;
        error.value = "";
      } catch (e) {
        error.value = e.message;
      }
    };
    const newValue = (type) =>
      type === "boolean" ? true : type === "number" ? 0 : "";
    const add = () => {
      const slot = slots.value[0];
      if (!slot) return;
      apply("add", {
        id: crypto.randomUUID(),
        slot: slot.key,
        op: "eq",
        value: newValue(slot.kinds[0]),
        target: "fill",
        result: "#d98b45",
      });
    };
    const slotChange = (r, key) => {
      const s = slots.value.find((s) => s.key === key);
      apply("edit", {
        id: r.id,
        slot: key,
        op: "eq",
        value: newValue(s.kinds[0]),
      });
    };
    const targetChange = (r, target) =>
      apply("edit", {
        id: r.id,
        target,
        result: ["fill", "color"].includes(target)
          ? "#d98b45"
          : ["flow", "visible"].includes(target)
            ? true
            : target === "angle"
              ? 90
              : "状态成立",
      });
    const condition = (r, key, value) =>
      apply("edit", {
        id: r.id,
        [key]:
          kind(r) === "number"
            ? Number(value)
            : kind(r) === "boolean"
              ? value === "true"
              : value,
      });
    return {
      error,
      slots,
      targets,
      kind,
      apply,
      add,
      slotChange,
      targetChange,
      condition,
      screenRuleOps,
    };
  },
  template: `<section class="screen-rules"><div class="definition-heading"><h2>显示规则</h2><button @click="add" :disabled="!slots.length">添加规则</button></div><p class="muted">上方规则优先。数据无效时显示未知；设备故障优先于正常颜色。规则只改变显示。</p><p role="alert" class="definition-error" v-if="error">{{error}}</p><p class="muted" v-if="!slots.length">先在“元素定义”添加单值数据槽位。</p>
 <fieldset class="definition-card" v-for="(rule,i) in item.rules||[]" :key="rule.id"><legend>规则 {{i+1}}</legend>
 <label>条件槽位<select :aria-label="'规则 '+(i+1)+' 槽位'" :value="rule.slot" @change="slotChange(rule,$event.target.value)"><option v-for="s in slots" :value="s.key">{{s.label}}</option></select></label>
 <div class="pair"><label>条件<select :aria-label="'规则 '+(i+1)+' 条件'" :value="rule.op" @change="apply('edit',{id:rule.id,op:$event.target.value,max:rule.value})"><option v-for="(label,key) in screenRuleOps" :value="key" :disabled="kind(rule)!=='number'&&!['eq','ne'].includes(key)">{{label}}</option></select></label><label>比较值<select v-if="kind(rule)==='boolean'" :aria-label="'规则 '+(i+1)+' 比较值'" :value="String(rule.value)" @change="condition(rule,'value',$event.target.value)"><option value="true">有效 / true</option><option value="false">无效 / false</option></select><input v-else :type="kind(rule)==='number'?'number':'text'" :aria-label="'规则 '+(i+1)+' 比较值'" :value="rule.value" @change="condition(rule,'value',$event.target.value)" /></label></div>
 <label v-if="rule.op==='between'">区间上限<input type="number" :aria-label="'规则 '+(i+1)+' 上限'" :value="rule.max" @change="condition(rule,'max',$event.target.value)" /></label>
 <label>改变属性<select :aria-label="'规则 '+(i+1)+' 属性'" :value="rule.target" @change="targetChange(rule,$event.target.value)"><option v-for="(label,key) in targets" :value="key">{{label}}</option></select></label>
 <label>结果<select v-if="['visible','flow'].includes(rule.target)" :aria-label="'规则 '+(i+1)+' 结果'" :value="String(rule.result)" @change="apply('edit',{id:rule.id,result:$event.target.value==='true'})"><option value="true">{{rule.target==='visible'?'显示':'流动'}}</option><option value="false">{{rule.target==='visible'?'隐藏':'静止'}}</option></select><input v-else :aria-label="'规则 '+(i+1)+' 结果'" :type="['fill','color'].includes(rule.target)?'color':rule.target==='angle'?'number':'text'" :value="rule.result" @change="apply('edit',{id:rule.id,result:rule.target==='angle'?Number($event.target.value):$event.target.value})" /></label>
 <div class="tools"><button @click="apply('up',{id:rule.id})" :disabled="i===0">提高优先级</button><button @click="apply('remove',{id:rule.id})">删除规则</button></div></fieldset></section>`,
};
