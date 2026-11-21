import {
  screenSlots,
  screenRoleSlot,
  screenDefaultAction,
} from "../../../packages/components/studio/screen-symbols.mjs";
import { waterEquipment } from "../../../packages/components/studio/water-equipment.mjs";
import {
  screenControlKinds,
  screenPanelEquipmentEnabled,
  screenEquipmentControlRoles,
  screenEquipmentControlSlots,
  screenEquipmentFrequencySlots,
  screenFrequencyMapping,
  screenEquipmentSummaryLimit,
  validateScreenEquipmentPanel,
} from "../../../packages/runtime/studio/screen-controls.mjs";
import { screenPages } from "../../../packages/runtime/studio/screen-pages.mjs";

export const ScreenActions = {
  props: ["item", "project"],
  emits: ["start", "data"],
  setup(props, { emit }) {
    const pages = Vue.computed(() => screenPages(props.project)),
      slots = Vue.computed(() =>
        screenSlots(props.item).filter((s) =>
          s.kinds.some((k) => ["number", "dataset"].includes(k)),
        ),
      );
    const panelTargets = Vue.computed(() => {
      if (props.item.symbol !== "controlPanel") return [];
      const allowed = props.item.params.targetKind === "local"
        ? item => screenControlKinds.has(item.symbol)
        : screenPanelEquipmentEnabled;
      return pages.value.flatMap(page => page.nodes.filter(allowed).map(item =>
        ({ id: item.id, name: item.title, label: item.title + " · " + page.title })));
    });
    const setPanelKind = kind => {
      if (props.item.params.targetKind === kind) return;
      emit("start");
      props.item.params.targetKind = kind;
      props.item.params.targetIds = [];
    };
    const setPanelTargets = ids => {
      emit("start");
      props.item.params.targetIds = ids;
    };
    const togglePanelTarget = (id, checked) => {
      const current = props.item.params.targetIds;
      setPanelTargets(checked ? [...current, id] : current.filter(target => target !== id));
    };
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
    const { computed, ref, watch } = Vue;
    const panelError = ref(""), pointQuery = ref("");
    watch(() => props.item.id, () => {
      panelError.value = "";
      pointQuery.value = "";
    });
    const allSlots = computed(() => screenSlots(props.item));
    const summarySlots = computed(() => waterEquipment[props.item.symbol]
      ? allSlots.value.filter(slot => slot.kinds.includes("number"))
      : []);
    const summaryLimit = computed(() => screenEquipmentSummaryLimit(props.item));
    const valve = computed(() => props.item.symbol === "valve");
    const operationTemplate = computed(() => props.item.params.valveMode === "control"
      ? null : screenEquipmentControlSlots(props.item));
    const operation = computed(() => props.item.panel?.operation);
    const enabled = computed(() => operation.value && operation.value.enabled !== false);
    const frequency = computed(() => operation.value?.frequency);
    const frequencyEnabled = computed(() => frequency.value && frequency.value.enabled !== false);
    const frequencyTemplate = computed(() => !frequency.value && screenEquipmentFrequencySlots(props.item));
    const roles = computed(() => screenEquipmentControlRoles(props.item));
    const frequencyFields = [
      { key: "min", label: "频率下限（Hz）" },
      { key: "max", label: "频率上限（Hz）" },
      { key: "step", label: "频率步长（Hz）" },
    ];
    const limits = Vue.reactive({ min: "", max: "", step: "" });
    watch([() => props.item.id, ...frequencyFields.map(({key}) => () => frequency.value?.[key])],
      () => {
        for (const { key } of frequencyFields) limits[key] = frequency.value?.[key] ?? "";
      }, { immediate: true });
    const controlPointOptions = (slot, kind) => {
      const query = pointQuery.value.trim().toLowerCase();
      const selected = props.item.bindings[slot];
      const actual = props.item.bindings[screenRoleSlot(props.item, "value")?.key];
      return props.project.mappings.filter(point =>
        (kind === "frequency" ? point.id !== actual && screenFrequencyMapping(point) : point.kind === "boolean") &&
        (point.id === selected || (point.label + " " + point.id).toLowerCase().includes(query)));
    };
    const changePanel = panel => {
      try {
        validateScreenEquipmentPanel({ ...props.item, panel });
        emit("start");
        props.item.panel = panel;
        panelError.value = "";
        return true;
      } catch (error) {
        panelError.value = error.message;
        return false;
      }
    };
    const custom = computed(() => props.item.panel?.custom);
    const dialogTargets = computed(() => pages.value.flatMap(page => page.nodes
      .filter(item => item.id !== props.item.id && screenPanelEquipmentEnabled(item))
      .map(item => ({ id: item.id, title: item.title + " · " + page.title }))));
    const setDialogTarget = targetId => {
      emit("start");
      props.item.action = targetId ? { type: "details", targetId } : { type: "details" };
    };
    const customKind = ref("read");
    const customKinds = { read: "数据字段", signal: "开关量按钮", setpoint: "数值设定" };
    const changeCustom = value => {
      const panel = { ...props.item.panel };
      if (value) panel.custom = value;
      else delete panel.custom;
      return changePanel(panel);
    };
    const enableCustom = value => changeCustom(value ? { title: "", items: [] } : null);
    const addCustom = () => {
      const type = customKind.value;
      const row = { id: crypto.randomUUID(), type, label: customKinds[type], slot: "" };
      if (type === "signal") Object.assign(row, { value: true, permit: "", interlock: "" });
      if (type === "setpoint") Object.assign(row, { min: 0, max: 100, step: 1, permit: "", interlock: "" });
      changeCustom({ ...custom.value, items: [...custom.value.items, row] });
    };
    const reviseCustom = (id, key, event) => {
      const row = custom.value.items.find(item => item.id === id);
      const value = event.target.value.trim();
      const next = { ...row, [key]: key === "value" ? value === "true" :
        ["min", "max", "step"].includes(key) ? (value === "" ? NaN : Number(value)) : value };
      if (key === "command" && !next.command) delete next.command;
      if (!changeCustom({ ...custom.value, items: custom.value.items.map(item => item.id === id ? next : item) }))
        event.target.value = row[key] ?? "";
    };
    const moveCustom = (index, offset) => {
      const items = [...custom.value.items];
      const [item] = items.splice(index, 1);
      if (offset) items.splice(index + offset, 0, item);
      changeCustom({ ...custom.value, items });
    };
    const customSlots = (kind) => allSlots.value.filter(slot => !kind || slot.kinds.includes(kind));
    const changeFields = (key, custom) => {
      const panel = { ...props.item.panel };
      if (!custom) delete panel[key];
      else panel[key] = key === "details" ? allSlots.value.map(slot => slot.key)
        : summarySlots.value.slice(0, summaryLimit.value).map(slot => slot.key);
      changePanel(panel);
    };
    const toggleField = (key, slot, checked) => {
      const prior = props.item.panel[key];
      const fields = checked ? [...prior, slot] : prior.filter(id => id !== slot);
      changePanel({ ...props.item.panel, [key]: fields });
    };
    const enable = value => {
      if (operation.value) {
        changePanel({ ...props.item.panel, operation: { ...operation.value, enabled: value } });
        return;
      }
      const template = operationTemplate.value;
      if (!value || !template) return;
      emit("start");
      props.item.dataSlots = template.slots;
      props.item.panel = { ...props.item.panel, operation: template.operation };
    };
    const changeCommand = (key, event) => {
      const next = { ...operation.value };
      const value = event.target.value.trim();
      if (value) next[key] = value;
      else delete next[key];
      if (!changePanel({ ...props.item.panel, operation: next }))
        event.target.value = operation.value[key] || "";
    };
    const updateFrequency = next => changePanel({
      ...props.item.panel, operation: { ...operation.value, frequency: next },
    });
    const enableFrequency = value => {
      if (frequency.value) {
        updateFrequency({ ...frequency.value, enabled: value });
        return;
      }
      const template = frequencyTemplate.value;
      if (!value || !template) return;
      emit("start");
      props.item.dataSlots = template.slots;
      props.item.panel = { ...props.item.panel, operation: template.operation };
    };
    const applyLimits = () => {
      const next = { ...frequency.value };
      for (const { key } of frequencyFields) {
        const value = String(limits[key]).trim();
        next[key] = value ? Number(value) : NaN;
      }
      updateFrequency(next);
    };
    const changeFrequencyCommand = event => {
      const next = { ...frequency.value };
      const value = event.target.value.trim();
      if (value) next.command = value;
      else delete next.command;
      if (!updateFrequency(next)) event.target.value = frequency.value.command || "";
    };
    const bind = (slot, event) => {
      const value = event.target.value;
      const roleSlots = roles.value.map(role => operation.value[role.key]);
      if (frequency.value) roleSlots.push(frequency.value.readback);
      const actual = screenRoleSlot(props.item, "value")?.key;
      if (value && slot === frequency.value?.readback && props.item.bindings[actual] === value) {
        panelError.value = "设定回读和实际运行频率需要分别绑定";
        event.target.value = props.item.bindings[slot] || "";
        return;
      }
      if (value && roleSlots.some(other => other !== slot && props.item.bindings[other] === value)) {
        panelError.value = "各控制角色需要绑定独立测点";
        event.target.value = props.item.bindings[slot] || "";
        return;
      }
      emit("start");
      props.item.bindings[slot] = value;
      panelError.value = "";
    };
    return { pages, slots, type, dataset, choose, change, changeEquipmentCode,
      panelTargets, setPanelKind, setPanelTargets, togglePanelTarget,
      custom, customKind, customKinds, dialogTargets, setDialogTarget, changeCustom, enableCustom, addCustom, reviseCustom, moveCustom, customSlots,
      allSlots, summarySlots, summaryLimit, operationTemplate, operation, enabled,
      roles, valve, pointQuery, controlPointOptions, panelError, changeFields, toggleField, enable, changeCommand, bind,
      frequency, frequencyEnabled, frequencyTemplate, frequencyFields, limits, enableFrequency, applyLimits, changeFrequencyCommand };

  },
  template: `<section v-if="item.symbol==='controlPanel'" class="screen-actions">
    <h2>控制面板</h2>
    <label>使用方式<select aria-label="控制面板用途" :value="item.params.targetKind" @change="setPanelKind($event.target.value)">
      <option value="equipment">设备操作</option><option value="local">画面交互</option>
    </select></label>
    <template v-if="item.params.targetKind==='equipment'">
      <label>目标设备<select aria-label="控制面板目标设备" :value="item.params.targetIds[0]||''"
        @change="setPanelTargets($event.target.value?[$event.target.value]:[])">
        <option value="">请选择设备</option><option v-for="target in panelTargets" :key="target.id" :value="target.id">{{target.label}}</option>
      </select></label>
      <p class="muted">{{panelTargets.length?'面板沿用所选设备的动作、测点和回读。':'先选中设备，在「交互」开启启停、开关或频率设定。'}}</p>
    </template>
    <template v-else>
      <fieldset class="definition-card"><legend>引用画面控件</legend>
        <p v-if="!panelTargets.length" class="muted">先放置并配置工况切换、数值加减或趋势时间切换。</p>
        <label v-for="target in panelTargets" :key="target.id" class="screen-check"><input type="checkbox"
          :aria-label="'引用 '+target.name" :checked="item.params.targetIds.includes(target.id)"
          :disabled="item.params.targetIds.length>=8&&!item.params.targetIds.includes(target.id)"
          @change="togglePanelTarget(target.id,$event.target.checked)" />{{target.label}}</label>
      </fieldset>
      <p v-if="panelTargets.length" class="muted">按勾选顺序显示，操作与画布原控件同步。</p>
    </template>
    <p v-if="item.params.targetIds.some(id=>!panelTargets.some(target=>target.id===id))" class="quality-note">
      部分引用已失效。<button @click="setPanelTargets(item.params.targetIds.filter(id=>panelTargets.some(target=>target.id===id)))">移除失效引用</button>
    </p>
  </section><section v-else class="screen-actions"><h2>点击元素时</h2><p class="muted">编辑时只选择元素。预览或发布后才执行显示动作。</p><label>点击动作<select aria-label="点击动作" :value="type" @change="choose($event.target.value)"><option value="none">不执行动作</option><option value="details">打开设备详情</option><option value="trend" :disabled="!slots.length">打开趋势面板</option><option value="navigate">切换画面</option><option value="link">打开链接</option></select></label><label v-if="type==='trend'">趋势测点槽位<select aria-label="趋势面板槽位" :value="item.action.slot" @change="change('slot',$event.target.value)"><option value="">请选择数值或数据集槽位</option><option v-for="s in slots" :value="s.key">{{s.label}}</option></select></label>
    <fieldset v-if="dataset">
      <legend>历史数据字段</legend>
      <label>时间字段<input aria-label="趋势面板时间字段" maxlength="128" placeholder="time" :value="item.action.timeField || ''" @change="change('timeField',$event.target.value.trim())" /></label>
      <label>数值字段<input aria-label="趋势面板数值字段" maxlength="128" placeholder="value" :value="item.action.valueField || ''" @change="change('valueField',$event.target.value.trim())" /></label>
      <label>质量字段<input aria-label="趋势面板质量字段" maxlength="128" placeholder="quality" :value="item.action.qualityField || ''" @change="change('qualityField',$event.target.value.trim())" /></label>
    </fieldset>
    <label v-if="type==='navigate'">目标画面<select aria-label="目标画面" :value="item.action.pageId" @change="change('pageId',$event.target.value)"><option value="">请选择画面</option><option v-for="page in pages" :value="page.id">{{page.title}}</option></select></label><label v-if="type==='link'">链接地址<input type="url" aria-label="链接地址" :value="item.action.url" @change="change('url',$event.target.value)" placeholder="https://..." /></label><template v-if="type==='details'"><label>设备编号<input aria-label="设备编号" maxlength="64"
      :value="item.params.equipmentCode || ''" placeholder="例如 DC-101"
      @change="changeEquipmentCode($event.target.value)" /></label>
      <p class="muted">告警列表按设备编号定位。</p>
      <label>弹窗目标<select aria-label="弹窗目标" :value="item.action?.targetId||''"
        @change="setDialogTarget($event.target.value)">
        <option value="">当前图元</option>
        <option v-for="target in dialogTargets" :value="target.id" :key="target.id">{{target.title}}</option>
      </select></label>
      <fieldset v-if="!item.action?.targetId" class="definition-card">
        <legend>弹窗内容</legend>
        <label class="screen-check"><input type="checkbox" :checked="!!custom" @change="enableCustom($event.target.checked)" />使用自定义弹窗</label>
        <template v-if="custom">
          <label>弹窗标题<input maxlength="80" :value="custom.title" :placeholder="item.title" @change="changeCustom({...custom,title:$event.target.value.trim()})" /></label>
          <p class="muted">按下方顺序显示。可在「元素定义」新增槽位，在「动态与测点」完成绑定。</p>
          <fieldset v-for="(row,i) in custom.items" :key="row.id" class="definition-card">
            <legend>{{i+1}}. {{customKinds[row.type]}}</legend>
            <label>控件名称<input maxlength="64" :value="row.label" @change="reviseCustom(row.id,'label',$event)" /></label>
            <label>{{row.type==='read'?'显示槽位':'回读槽位'}}<select :aria-label="row.type==='read'?'显示槽位':'回读槽位'" :value="row.slot||''" @change="reviseCustom(row.id,'slot',$event)">
              <option value="">请选择槽位</option><option v-for="s in customSlots(row.type==='signal'?'boolean':row.type==='setpoint'?'number':null)" :key="s.key" :value="s.key">{{s.label}}</option>
            </select></label>
            <template v-if="row.type!=='read'">
              <label>命令编号<input maxlength="64" :value="row.command||''" @change="reviseCustom(row.id,'command',$event)" /></label>
              <label v-for="(label,key) in {permit:'许可槽位',interlock:'联锁槽位'}" :key="key">{{label}}
                <select :aria-label="label" :value="row[key]||''" @change="reviseCustom(row.id,key,$event)">
                  <option value="">请选择槽位</option><option v-for="s in customSlots('boolean')" :key="s.key" :value="s.key">{{s.label}}</option>
                </select>
              </label>
              <label v-if="row.type==='signal'">动作目标<select :value="String(row.value)" @change="reviseCustom(row.id,'value',$event)"><option value="true">有效</option><option value="false">无效</option></select></label>
              <label v-for="(label,key) in row.type==='setpoint'?{min:'设定下限',max:'设定上限',step:'设定步长'}:{}" :key="key">{{label}}<input type="number" step="any" :value="row[key]" @change="reviseCustom(row.id,key,$event)" /></label>
            </template>
            <div class="tools"><button :disabled="i===0" @click="moveCustom(i,-1)">上移</button>
              <button :disabled="i===custom.items.length-1" @click="moveCustom(i,1)">下移</button><button @click="moveCustom(i,0)">移除</button></div>
          </fieldset>
          <label>控件类型<select aria-label="控件类型" v-model="customKind"><option v-for="(label,key) in customKinds" :key="key" :value="key">{{label}}</option></select></label>
          <button :disabled="custom.items.length>=16" @click="addCustom">添加弹窗控件</button>
        </template>
      </fieldset>
      <template v-if="!custom&&!item.action?.targetId">
      <fieldset v-if="summarySlots.length || allSlots.length" class="definition-card">
        <legend>面板显示</legend>
        <template v-if="summarySlots.length">
          <label class="screen-check"><input type="checkbox" :checked="item.panel?.summary!==undefined" @change="changeFields('summary',$event.target.checked)" />自选画布指标</label>
          <template v-if="item.panel?.summary">
            <p class="muted">最多选 {{summaryLimit}} 项。全部取消后隐藏指标。</p>
            <label v-for="slot in summarySlots" :key="slot.key" class="screen-check"><input type="checkbox" :checked="item.panel.summary.includes(slot.key)"
              :disabled="item.panel.summary.length>=summaryLimit&&!item.panel.summary.includes(slot.key)"
              @change="toggleField('summary',slot.key,$event.target.checked)" />{{slot.label}}（画布）</label>
          </template>
        </template>
        <label v-if="allSlots.length" class="screen-check"><input type="checkbox" :checked="item.panel?.details!==undefined" @change="changeFields('details',$event.target.checked)" />自选设备详情字段</label>
        <template v-if="item.panel?.details">
          <label v-for="slot in allSlots" :key="slot.key" class="screen-check"><input type="checkbox" :checked="item.panel.details.includes(slot.key)"
            @change="toggleField('details',slot.key,$event.target.checked)" />{{slot.label}}（详情）</label>
        </template>
      </fieldset>
      <fieldset v-if="operationTemplate" class="definition-card">
        <legend>{{valve?'阀门开关':'启停控制'}}</legend>
        <label class="screen-check"><input type="checkbox" :checked="!!enabled" @change="enable($event.target.checked)" />{{valve?'在设备面板显示开关':'在设备面板显示启停'}}</label>
        <template v-if="enabled">
          <label>{{valve?'开阀命令点':'启动命令点'}}<input maxlength="64" :placeholder="valve?'XV101.OPEN':'P101.START'" :value="operation.start || ''" @change="changeCommand('start',$event)" /></label>
          <label>{{valve?'关阀命令点':'停止命令点'}}<input maxlength="64" :placeholder="valve?'XV101.CLOSE':'P101.STOP'" :value="operation.stop || ''" @change="changeCommand('stop',$event)" /></label>
        </template>
      </fieldset>
      <fieldset v-if="frequencyTemplate||frequency" class="definition-card">
        <legend>变频泵频率设定</legend>
        <label class="screen-check"><input type="checkbox" :checked="!!frequencyEnabled" @change="enableFrequency($event.target.checked)" />在设备面板显示频率设定</label>
        <template v-if="frequencyEnabled">
          <label>频率设定命令点<input maxlength="64" placeholder="P101.FREQ" :value="frequency.command || ''" @change="changeFrequencyCommand($event)" /></label>
          <label v-for="field in frequencyFields" :key="field.key">{{field.label}}
            <input type="number" min="0" step="any" v-model="limits[field.key]" />
          </label>
          <button type="button" @click="applyLimits">应用频率范围</button>
          <small class="muted">当前 {{frequency.min}}–{{frequency.max}} Hz · 步长 {{frequency.step}} Hz</small>
        </template>
      </fieldset>
      <fieldset v-if="(operationTemplate&&enabled)||frequencyEnabled" class="definition-card">
        <legend>控制测点</legend>
        <p class="muted">点表提供反馈、许可和联锁。本地演示命令按业务编号识别。</p>
        <label>搜索控制测点<input v-model="pointQuery" placeholder="按测点名称或业务编号筛选" /></label>
        <label v-for="role in roles" :key="role.key">{{role.label}}
          <select :aria-label="role.label" :value="item.bindings[operation[role.key]]||''" @change="bind(operation[role.key],$event)">
            <option value="">请选择开关量点</option>
            <option v-for="point in controlPointOptions(operation[role.key],'boolean')" :key="point.id" :value="point.id">{{point.label}} · {{point.id}}</option>
          </select><small class="muted">{{role.meaning}}</small>
        </label>
        <label v-if="frequencyEnabled">频率设定回读点
          <select aria-label="频率设定回读点" :value="item.bindings[frequency.readback]||''" @change="bind(frequency.readback,$event)">
            <option value="">请选择 Hz 数值点</option>
            <option v-for="point in controlPointOptions(frequency.readback,'frequency')" :key="point.id" :value="point.id">{{point.label}} · {{point.id}}</option>
          </select><small class="muted">选择独立的给定回读。实际运行频率在「动态与测点」绑定。</small>
        </label>
        <button class="source-link wide" @click="$emit('data')">管理连接与点位</button>
      </fieldset>
      </template>
      <p v-if="panelError" role="alert">{{panelError}}</p>
    </template></section>`,
};
