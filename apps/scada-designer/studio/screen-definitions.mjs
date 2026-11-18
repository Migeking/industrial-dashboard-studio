import {
  screenPorts,
  screenSlots,
  screenPortSides,
  screenSlotRoles,
} from "../../../packages/components/studio/screen-symbols.mjs";
import { editScreenDefinition } from "../../../packages/runtime/studio/screen-model.mjs";

export const ScreenDefinitions = {
  props: ["item", "doc"],
  emits: ["start", "tool"],
  setup(props, { emit }) {
    const error = Vue.ref("");
    const ports = Vue.computed(() => screenPorts(props.item)),
      slots = Vue.computed(() => screenSlots(props.item));
    Vue.watch(
      () => props.item.id,
      () => (error.value = ""),
    );
    const apply = (section, operation, value) => {
      try {
        const next = editScreenDefinition(
          props.doc,
          props.item.id,
          section,
          operation,
          value,
          false,
        );
        emit("start");
        Object.assign(props.item, next);
        error.value = "";
      } catch (e) {
        error.value = e.message;
      }
    };
    const side = (p) =>
      p.x === 0
        ? "left"
        : p.x === 100
          ? "right"
          : p.y === 0
            ? "top"
            : p.y === 100
              ? "bottom"
              : "custom";
    const move = (p, edge, offset) => {
      const d = Number(offset),
        patch =
          edge === "custom"
            ? {}
            : edge === "left"
              ? { x: 0, y: d }
              : edge === "right"
                ? { x: 100, y: d }
                : edge === "top"
                  ? { x: d, y: 0 }
                  : { x: d, y: 100 };
      apply("ports", "edit", { id: p.id, ...patch });
    };
    const addPort = () => {
      let y = 50;
      while (ports.value.some((p) => p.x === 100 && p.y === y) && y < 95)
        y += 15;
      apply("ports", "add", {
        id: "port-" + crypto.randomUUID(),
        label: "连接点 " + (ports.value.length + 1),
        x: 100,
        y: Math.min(100, y),
        direction: "both",
      });
    };
    const addSlot = () => {
      let i = 1;
      while (slots.value.some((s) => s.key === "data_" + i)) i++;
      apply("slots", "add", {
        key: "data_" + i,
        label: "自定测点 " + i,
        kinds: ["number"],
        required: false,
        role: "extra",
      });
    };
    const setRole = (s, role) =>
      apply("slots", "edit", {
        key: s.key,
        role,
        kinds: ["run", "fault", "open", "flow"].includes(role)
          ? ["boolean"]
          : role === "value"
            ? ["number"]
            : s.kinds,
      });
    return {
      error,
      ports,
      slots,
      side,
      move,
      apply,
      addPort,
      addSlot,
      setRole,
      screenPortSides,
      screenSlotRoles,
    };
  },
  template: `<section class="screen-definitions">
    <p class="definition-error" role="alert" v-if="error">{{error}}</p>
    <template v-if="item.type!=='pipe'">
      <div class="definition-heading"><h2>连接点 · {{ports.length}}</h2><button @click="addPort">添加连接点</button></div>
      <p class="muted">位置按元素宽高的百分比定义，随元素缩放和旋转。切到“连管”可查看接口。</p>
      <fieldset v-for="(port,i) in ports" :key="port.id" class="definition-card" :data-port-definition="port.id"><legend>连接点 {{i+1}}</legend>
        <label>名称<input :aria-label="'连接点 '+(i+1)+' 名称'" :value="port.label" @change="apply('ports','edit',{id:port.id,label:$event.target.value})" /></label>
        <div class="pair"><label>所在位置<select :aria-label="'连接点 '+(i+1)+' 位置'" :value="side(port)" @change="move(port,$event.target.value,50)"><option v-for="(label,key) in screenPortSides" :value="key">{{label}}</option></select></label><label>沿边位置 %<input type="number" min="0" max="100" :aria-label="'连接点 '+(i+1)+' 沿边位置'" :value="['left','right'].includes(side(port))?port.y:port.x" @change="move(port,side(port),$event.target.value)" :disabled="side(port)==='custom'" /></label></div>
        <div class="pair"><label>X %<input type="number" min="0" max="100" :aria-label="'连接点 '+(i+1)+' X'" :value="port.x" @change="apply('ports','edit',{id:port.id,x:Number($event.target.value)})" /></label><label>Y %<input type="number" min="0" max="100" :aria-label="'连接点 '+(i+1)+' Y'" :value="port.y" @change="apply('ports','edit',{id:port.id,y:Number($event.target.value)})" /></label></div>
        <label>允许方向<select :aria-label="'连接点 '+(i+1)+' 方向'" :value="port.direction" @change="apply('ports','edit',{id:port.id,direction:$event.target.value})"><option value="both">双向</option><option value="in">仅流入</option><option value="out">仅流出</option></select></label>
        <button @click="apply('ports','remove',{id:port.id})" :aria-label="'移除连接点 '+(i+1)">移除连接点</button>
      </fieldset>
      <p v-if="!ports.length" class="muted">此元素没有连接点，可添加任意位置的接口。</p>
    </template>
    <div class="definition-heading"><h2>数据槽位 · {{slots.length}}</h2><button @click="addSlot">添加数据槽位</button></div>
    <p class="muted">定义需要接入的数据，再到“动态与测点”选择实际测点。附加测点可用于详情和显示规则。</p>
    <fieldset v-for="(slot,i) in slots" :key="slot.key" class="definition-card" :data-slot-definition="slot.key"><legend>数据槽位 {{i+1}}</legend>
      <label>名称<input :aria-label="'槽位 '+(i+1)+' 名称'" :value="slot.label" @change="apply('slots','edit',{key:slot.key,label:$event.target.value})" /></label>
      <label>用途<select :aria-label="'槽位 '+(i+1)+' 用途'" :value="slot.role||slot.key" @change="setRole(slot,$event.target.value)"><option v-for="(label,key) in screenSlotRoles" :value="key">{{label}}</option></select></label>
      <label>数据类型<select :aria-label="'槽位 '+(i+1)+' 类型'" :value="slot.kinds.join(',')" @change="apply('slots','edit',{key:slot.key,kinds:$event.target.value.split(',')})" :disabled="['run','fault','open','flow'].includes(slot.role||slot.key)"><option value="number">数值</option><option value="boolean">开关量</option><option value="text">文本</option><option value="dataset">行数据集</option><option value="number,dataset">数值或行数据集</option></select></label>
      <label class="screen-check"><input type="checkbox" :aria-label="'槽位 '+(i+1)+' 必需绑定'" :checked="slot.required" @change="apply('slots','edit',{key:slot.key,required:$event.target.checked})" />发布前必须绑定</label>
      <button @click="apply('slots','remove',{key:slot.key})" :aria-label="'移除槽位 '+(i+1)">移除数据槽位</button>
    </fieldset>
    <button v-if="slots.length" class="primary wide" @click="$emit('tool','binding')">为这些槽位选择测点</button>
  </section>`,
};
