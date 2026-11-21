import { projectScreenControl } from "./screen-controls.mjs";

const ScreenPanelLocalAction = {
  props: ["item", "doc", "points", "windows", "controlError", "blocked"],
  emits: ["run"],
  setup(props, { emit }) {
    const card = Vue.ref(null), heading = Vue.ref(null), host = Vue.ref(null), quality = Vue.ref(null);
    const entry = {};
    Vue.watchEffect(() => {
      if (!card.value || !heading.value || !host.value || !quality.value) return;
      Object.assign(entry, { card: card.value, heading: heading.value, host: host.value, quality: quality.value });
      const item = { ...props.item, params: { ...props.item.params, hideLabel: false } };
      projectScreenControl(item, entry, { ...props, editing: props.blocked }, action => emit("run", action));
    });
    return { card, heading, host, quality };
  },
  template: `<div ref="card" class="screen-panel-local-action"><b ref="heading"></b><div ref="host" class="screen-chart-host"></div><small ref="quality"></small></div>`,
};

export const ScreenControlPanel = {
  components: { ScreenPanelLocalAction },
  props: ["state", "node", "doc", "targets", "points", "windows", "controlError", "demo", "editing", "blocked"],
  emits: ["command", "local"],
  template: `<div class="screen-control-panel" @click.stop @mousedown.stop @pointerdown.stop @dblclick.stop>
    <p v-if="editing" class="screen-panel-note">{{targets?.length ? targets.map(target=>target.title).join('、') : '在「交互」选择控制面板目标'}}</p>
    <section v-else-if="state" class="faceplate-part faceplate-operation" aria-label="设备控制">
      <h3 v-if="node||!state.customRows">{{state.customRows ? state.customTitle : (node ? state.title : (state.valve ? '阀门开关' : '设备控制'))}}</h3>
      <p v-if="node&&state.deviceStatus" class="screen-panel-device-state" :data-state="state.deviceStatus">{{state.deviceStatus}}</p>
      <p v-if="state.frequency&&!state.customRows" aria-label="频率设定回读">频率设定回读 <b>{{state.readback===null?'—':state.readback+' Hz'}}</b></p>
      <p v-if="!demo && (!state.customRows || state.customRows.some(row=>row.action))">当前数据连接只读</p>
      <div v-if="demo&&state.pending" class="faceplate-confirm" role="group" aria-label="确认设备操作">
        <p>确认对「{{state.title}}」{{state.pending.label}}？</p>
        <small>演示命令点 {{state.pending.commandId}}</small>
        <div><button @click="$emit('command','cancel',state.id)">取消</button>
          <button :disabled="blocked" @click="$emit('command','confirm',state.id)">{{typeof state.pending.target==='number'?(state.pending.actionId?'确认设定':'确认频率设定'):'确认'+state.pending.label}}</button></div>
      </div>
      <template v-if="state.customRows">
        <p v-if="!state.customRows.length">尚未添加弹窗控件</p>
        <div v-for="row in state.customRows" :key="row.id" class="screen-custom-faceplate-row" :data-faceplate-row="row.type">
          <div v-if="row.type==='read'" class="screen-custom-read">
            <span>{{row.label}}</span><span>{{row.text}} {{row.text==='—'?'':row.unit}} <small>{{row.quality}}</small></span>
          </div>
          <template v-else-if="row.type==='signal'">
            <button :disabled="!demo||state.locked||!!state.pending||!!row.action.problem" @click="$emit('command','select',state.id,row.action)">{{row.label}}</button>
            <small v-if="demo&&!state.locked&&!state.pending&&row.action.problem">{{row.action.problem}}</small>
          </template>
          <template v-else>
            <div class="screen-custom-read"><span>{{row.label}}</span><span>回读 {{row.text}} {{row.unit}} <small>{{row.quality}}</small></span></div>
            <div v-if="demo" class="faceplate-frequency">
              <label>{{row.label}}给定值<input type="number" :min="row.min" :max="row.max" :step="row.step"
                :value="row.input" :disabled="state.locked||!!state.pending"
                @input="$emit('command','custom-input',state.id,{row:row.id,input:$event.target.value})" /></label>
              <small>{{row.min}}–{{row.max}} {{row.unit}} · 步长 {{row.step}}</small>
              <button :disabled="state.locked||!!state.pending||!!row.action.problem" @click="$emit('command','select',state.id,row.action)">预选{{row.label}}</button>
              <small v-if="!state.locked&&!state.pending&&row.action.problem">{{row.action.problem}}</small>
            </div>
          </template>
        </div>
      </template>
      <template v-else-if="demo&&!state.pending">
        <div v-if="state.actions.length" class="faceplate-actions">
          <div v-for="action in state.actions" :key="action.label">
            <button :disabled="state.locked||!!action.problem" @click="$emit('command','select',state.id,action)">{{action.label}}</button>
            <small v-if="!state.locked&&action.problem">{{action.problem}}</small>
          </div>
        </div>
        <div v-if="state.frequency" class="faceplate-frequency">
          <label>给定频率（Hz）<input type="number" :min="state.frequency.min" :max="state.frequency.max" :step="state.frequency.step"
            :value="state.input" :disabled="state.locked" @input="$emit('command','input',state.id,$event.target.value)" /></label>
          <small>{{state.frequency.min}}–{{state.frequency.max}} Hz · 步长 {{state.frequency.step}} Hz</small>
          <button :disabled="state.locked||!!state.request.problem" @click="$emit('command','select',state.id,state.request)">预选频率设定</button>
          <small v-if="!state.locked&&state.request.problem">{{state.request.problem}}</small>
        </div>
      </template>
      <p v-if="state.error" role="alert">{{state.error}}</p>
      <p v-if="state.progress" role="status">{{state.progress}}</p>
    </section>
    <template v-else-if="node?.params.targetKind==='local'&&targets?.length">
      <screen-panel-local-action v-for="item in targets" :key="item.id" :item="item" :doc="doc" :points="points"
        :windows="windows" :control-error="controlError" :blocked="blocked" @run="$emit('local',$event)"></screen-panel-local-action>
    </template>
    <p v-else-if="node" class="screen-panel-note">设备或控件未配置</p>
  </div>`,
};
