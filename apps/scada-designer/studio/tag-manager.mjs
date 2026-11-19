import {
  analogRawRange, effectivePollMs, engineeringProblem, engineeringUnits,
  importNorthbound, minimumProtocolPollMs, modbusBatchPoints,
  normalize, pointReasonLabels, protocolPointMapping, syncProtocolMappings,
  configuredDatasetId, primarySourceSettings, snapshotPointMapping, snapshotPointRows,
  exportSnapshotCrosswalk, exportProtocolPointList, importProtocolCrosswalk, protocolPointAddress,
} from "./model.mjs";

function formatPointValue(value, precision) {
  if (value == null) return "—";
  if (Array.isArray(value)) return value.length + " 行";
  return typeof value === "number" && Number.isInteger(precision) && precision >= 0 && precision <= 10
    ? value.toFixed(precision)
    : String(value);
}

export function pointPreview(reading, mapping) {
  if (!reading) return { raw: "—", value: "—", quality: "未试读", reason: "" };
  return {
    raw: formatPointValue(reading.rawValue),
    value: reading.quality === "good"
      ? [formatPointValue(reading.value, mapping.precision),
          Array.isArray(reading.value) ? "" : mapping.unit].filter(Boolean).join(" ")
      : "—",
    quality: { good: "有效", bad: "无效", stale: "过期", offline: "离线" }[reading.quality],
    reason: pointReasonLabels[reading.reason] || "",
  };
}

function conversionSettings(mapping) {
  const { scale, offset, precision, unit, conversion, enumMap } = mapping;
  return JSON.parse(JSON.stringify({ scale, offset, precision, unit, conversion, enumMap }));
}

function applyConversion(mapping, settings) {
  delete mapping.conversion;
  delete mapping.enumMap;
  Object.assign(mapping, JSON.parse(JSON.stringify(settings)));
}

const conversionNames = {
  identity: "直接使用", linear: "自定义量程", raw420: "4–20 mA 原码",
  unit: "单位换算", legacy: "倍率与偏移",
};
function describeConversion(mapping) {
  const rule = mapping.conversion;
  const name = conversionNames[rule?.mode || "legacy"];
  const detail = rule?.mode === "unit" ? rule.inputUnit + " → " + mapping.unit :
    rule?.mode === "raw420" || rule?.mode === "linear"
      ? rule.engineeringMin + "–" + rule.engineeringMax + " " + mapping.unit :
    rule?.mode === "identity" ? mapping.unit : "×" + mapping.scale + "，偏移 " + mapping.offset + " " + mapping.unit;
  return [name, String(detail ?? "").trim()].filter(Boolean).join(" · ");
}

export const PointConversion = {
  props: ["mapping", "reading"],
  setup(props) {
    const { computed } = Vue;
    const rule = computed(() => props.mapping.conversion);
    const issue = computed(() => engineeringProblem(props.mapping));
    const display = computed(() => pointPreview(props.reading, props.mapping));
    function setMode(mode) {
      if (mode === "legacy") delete props.mapping.conversion;
      else props.mapping.conversion = { ...rule.value, mode };
    }
    return { rule, issue, display, setMode, range: analogRawRange, engineeringUnits };
  },
  template: `
    <div class="point-conversion">
      <template v-if="mapping.kind === 'number'">
        <label>换算方式<select aria-label="换算方式" :value="rule?.mode || 'legacy'" @change="setMode($event.target.value)">
          <option value="legacy">倍率与偏移</option>
          <option value="identity">已是工程值 · 直接使用</option>
          <option value="raw420">4–20 mA 原码</option>
          <option value="linear">自定义输入量程</option>
          <option value="unit">单位换算</option>
        </select></label>
        <div v-if="!rule" class="pair">
          <label>倍率<input type="number" step="any" v-model.number="mapping.scale" /></label>
          <label>偏移<input type="number" step="any" v-model.number="mapping.offset" /></label>
        </div>
        <p v-if="rule?.mode === 'raw420'" class="point-range-note">输入原码 {{ range.min }}–{{ range.max }}</p>
        <div v-if="rule?.mode === 'linear'" class="pair">
          <label>输入下限<input type="number" step="any" v-model.number="rule.rawMin" /></label>
          <label>输入上限<input type="number" step="any" v-model.number="rule.rawMax" /></label>
        </div>
        <label v-if="rule?.mode === 'unit'">输入单位<select v-model="rule.inputUnit">
          <option disabled :value="undefined">选择输入单位</option>
          <option v-for="unit in engineeringUnits" :value="unit">{{ unit }}</option>
        </select></label>
        <div v-if="rule?.mode === 'raw420' || rule?.mode === 'linear'" class="pair">
          <label>工程下限<input type="number" step="any" v-model.number="rule.engineeringMin" /></label>
          <label>工程上限<input type="number" step="any" v-model.number="rule.engineeringMax" /></label>
        </div>
        <label>小数位<input type="number" min="0" max="10" v-model.number="mapping.precision" /></label>
        <p v-if="issue" class="quality-note" role="alert">{{ issue }}</p>
      </template>
      <dl v-if="reading" class="tag-point-readback" aria-label="点位试读结果">
        <div><dt>原值</dt><dd>{{ display.raw }}</dd></div>
        <div><dt>工程值</dt><dd>{{ display.value }}</dd></div>
        <div><dt>质量</dt><dd>{{ display.quality }}<small v-if="display.reason"> · {{ display.reason }}</small></dd></div>
        <div><dt>样本读取</dt><dd>{{ new Date(reading.receivedAt).toLocaleTimeString() }}</dd></div>
      </dl>
    </div>
  `,
};

export const TagManager = {
  components: { PointConversion },
  props: [
    "config",
    "existingMappings",
    "sample",
    "sampleSource",
    "sampleReceived",
    "busy",
    "path",
    "results",
    "nextOffset",
    "notice",
    "readDatasets",
    "downloadCrosswalk",
    "usedPointIds",
  ],
  emits: ["browse", "read", "finish", "kind-change", "endpoint-change"],
  setup(props, { emit }) {
    const { ref, computed, watch, nextTick } = Vue;
    const search = ref(""),
      selectedSearch = ref(""),
      checked = ref([]),
      removeIds = ref([]),
      selectedId = ref(""),
      cache = ref({});
    const source = computed(() => props.config.source);
    const pollChoices = [minimumProtocolPollMs, 1000, 2000, 5000];
    const configuredPollMs = computed(() => effectivePollMs(source.value));
    const showSystem = ref(false);
    const sampleMatches = computed(
      () => props.sampleSource === JSON.stringify(primarySourceSettings(source.value)),
    );
    const points = computed(() => source.value.connection.points);
    const crosswalkOpen = ref(false), crosswalkTitle = ref(null), crosswalkButton = ref(null);
    const crosswalkText = ref(null), crosswalkReadError = ref(""), crosswalkLoading = ref(false);
    const crosswalkInput = ref(null);
    let crosswalkRead = 0;
    const current = computed(
      () =>
        points.value.find((p) => p.id === selectedId.value) || points.value[0],
    );
    const selected = computed(() =>
      points.value.filter((p) =>
        (p.label + " " + (p.nodeId || p.address))
          .toLowerCase()
          .includes(selectedSearch.value.toLowerCase()),
      ),
    );
    const candidates = computed(() =>
      props.results.filter(
        (p) =>
          !p.folder &&
          (p.label + " " + p.nodeId)
            .toLowerCase()
            .includes(search.value.toLowerCase()),
      ),
    );
    const key = () => props.path.at(-1)?.nodeId || "i=85";
    const selectable = computed(() =>
      candidates.value.filter(
        (p) => p.kind && !points.value.some((t) => t.nodeId === p.nodeId),
      ),
    );
    watch(search, () => {
      checked.value = [];
    });
    watch(
      () => props.results,
      () => {
        cache.value[key()] = props.results.filter((n) => n.folder);
        checked.value = [];
      },
    );
    const folders = computed(() => {
      const list = [{ nodeId: "i=85", label: "服务器", depth: 0, path: [] }];
      function visit(parent, path, depth) {
        for (const entry of cache.value[parent] || []) {
          if (
            !showSystem.value &&
            (entry.label.startsWith("_") || entry.label === "Server")
          )
            continue;
          if (path.some((p) => p.nodeId === entry.nodeId)) continue;
          const next = [...path, entry];
          list.push({ ...entry, depth, path: next });
          if (cache.value[entry.nodeId]) visit(entry.nodeId, next, depth + 1);
        }
      }
      visit("i=85", [], 1);
      return list;
    });
    const existingIds = computed(() => new Set(props.existingMappings.map(mapping => mapping.id)));
    const mappedPoints = computed(() => new Map(props.config.mappings
      .filter(mapping => !mapping.protocolUnmapped && mapping.root === "points" && mapping.keyField === "id")
      .map(mapping => [mapping.keyValue, mapping])));
    const mapFor = (point) => mappedPoints.value.get(point.id);
    const unmappedBusiness = computed(() => props.config.mappings.filter(mapping =>
      mapping.protocolUnmapped && !configuredDatasetId(source.value.datasets, mapping)));
    const datasetMappings = computed(() => props.config.mappings.filter(mapping => mapping.kind === "dataset"));
    const datasetSample = ref(null), datasetReceived = ref(0), datasetBusy = ref(false), datasetError = ref("");
    const datasetRows = computed(() => snapshotPointRows(datasetSample.value));
    const datasetChoices = computed(() => [...datasetRows.value.values()].filter(row => row.kind === "dataset"));
    const datasetId = mapping => configuredDatasetId(source.value.datasets, mapping);
    const unusedDatasets = computed(() => {
      const linked = new Set(datasetMappings.value.map(datasetId));
      return datasetChoices.value.filter(row => !linked.has(row.id));
    });
    function addDataset(id) {
      const row = unusedDatasets.value.find(candidate => candidate.id === id);
      if (!row) return;
      const used = new Set(props.config.mappings.map(mapping => mapping.id));
      let suffix = 1;
      let pointId = /^[\w.-]+$/.test(row.id) && !used.has(row.id) ? row.id : "dataset.1";
      while (used.has(pointId)) pointId = "dataset." + ++suffix;
      const mapping = snapshotPointMapping({
        id: pointId, label: row.label || row.id, kind: "dataset", unit: "",
        scale: 1, offset: 0, precision: 0,
      }, row.id);
      props.config.mappings.push({ ...mapping, protocolUnmapped: true });
      selectDataset(mapping, row.id);
    }
    function changeDatasetUrl(value) {
      const url = value.trim();
      if (url === (source.value.datasets?.url || "")) return;
      if (url) source.value.datasets = { url, bindings: {} };
      else delete source.value.datasets;
      datasetSample.value = null;
      datasetError.value = "";
    }
    async function readDatasetSample() {
      const settings = source.value.datasets;
      if (!settings || datasetBusy.value) return;
      datasetBusy.value = true;
      datasetSample.value = null;
      datasetError.value = "";
      try {
        const sample = await props.readDatasets(settings.url);
        if (source.value.datasets !== settings) return;
        datasetReceived.value = Date.now();
        datasetSample.value = sample;
      } catch (error) {
        if (source.value.datasets === settings) datasetError.value = error.message;
      } finally {
        datasetBusy.value = false;
      }
    }
    function selectDataset(mapping, id) {
      const settings = source.value.datasets;
      if (!settings || (id && datasetRows.value.get(id)?.kind !== "dataset")) return;
      if (id) settings.bindings = { ...settings.bindings, [mapping.id]: id };
      else delete settings.bindings[mapping.id];
    }
    function datasetReading(mapping) {
      const id = datasetId(mapping);
      if (!datasetSample.value || !id) return "";
      const time = datasetReceived.value;
      const reading = pointPreview(normalize(datasetSample.value,
        snapshotPointMapping(mapping, id), time, source.value.maxAgeMs, time), mapping);
      return [reading.value, reading.quality, reading.reason].filter(Boolean).join(" · ");
    }
    const businessChoices = computed(() => unmappedBusiness.value.filter(mapping => mapping.kind === current.value?.kind));
    const isExisting = (mapping) => existingIds.value.has(mapping?.id);
    const businessMappings = computed(() => props.config.mappings.filter(mapping =>
      mapping.kind !== "dataset" && isExisting(mapping) &&
      (mapping.protocolUnmapped || mapping.id !== mapping.keyValue || props.usedPointIds.has(mapping.id))));
    const crosswalkResult = computed(() => {
      if (crosswalkReadError.value) return { rows: [], errors: [crosswalkReadError.value] };
      if (crosswalkText.value === null) return null;
      try {
        return importProtocolCrosswalk(crosswalkText.value, points.value, source.value.kind,
          props.config.mappings, props.existingMappings, props.usedPointIds);
      } catch (error) {
        return { rows: [], errors: [error.message] };
      }
    });
    const crosswalkRows = computed(() => (crosswalkResult.value?.rows || []).map(row => {
      const stamp = props.sampleReceived;
      const reading = sampleMatches.value && props.sample
        ? normalize(props.sample, row.mapping, stamp, source.value.maxAgeMs, stamp) : null;
      return { ...row, reading: pointPreview(reading, row.mapping) };
    }));
    function showCrosswalk() {
      crosswalkOpen.value = true;
      nextTick(() => crosswalkTitle.value?.focus());
    }
    function closeCrosswalk() {
      ++crosswalkRead;
      crosswalkOpen.value = false;
      crosswalkLoading.value = false;
      crosswalkText.value = null;
      crosswalkReadError.value = "";
      nextTick(() => crosswalkButton.value?.focus());
    }
    function exportBusinessCrosswalk() {
      props.downloadCrosswalk("设备点位对照.csv", exportSnapshotCrosswalk(
        businessMappings.value.map(mapping => ({
          mapping, selected: mapping.protocolUnmapped ? "" : mapping.keyValue,
        })),
      ));
    }
    async function loadProtocolCrosswalk(file) {
      if (!file) return;
      const request = ++crosswalkRead;
      crosswalkLoading.value = true;
      crosswalkText.value = null;
      crosswalkReadError.value = "";
      try {
        const text = await file.text();
        if (request === crosswalkRead) crosswalkText.value = text;
      } catch (error) {
        if (request === crosswalkRead) crosswalkReadError.value = error.message;
      } finally {
        if (request === crosswalkRead) crosswalkLoading.value = false;
      }
    }
    function applyProtocolCrosswalk() {
      const result = crosswalkResult.value;
      if (!result?.rows.length || result.errors.length || crosswalkLoading.value) return;
      props.config.mappings = result.mappings;
      conversionBatchOpen.value = false;
      conversionBatchUndo.value = [];
      localError.value = "";
      batchMessage.value = "已关联 " + result.rows.length + " 个画面业务位号";
      closeCrosswalk();
    }
    function sync() {
      props.config.mappings = syncProtocolMappings(points.value, source.value.kind,
        props.config.mappings, props.existingMappings);
    }
    sync();
    const mapping = computed(() => current.value && mapFor(current.value));
    function linkBusiness(id) {
      const choice = businessChoices.value.find(candidate => candidate.id === id);
      const prior = mapping.value;
      if (!choice || !prior) return;
      const updated = protocolPointMapping(current.value, source.value.kind, choice);
      props.config.mappings = props.config.mappings.flatMap(candidate => {
        if (candidate === choice) return [updated];
        if (candidate !== prior) return [candidate];
        return isExisting(prior) ? [{ ...prior, protocolUnmapped: true }] : [];
      });
      conversionBatchOpen.value = false;
      conversionBatchUndo.value = [];
    }
    function addItems() {
      for (const p of candidates.value.filter(
        (p) => p.kind && checked.value.includes(p.nodeId),
      )) {
        if (points.value.some((t) => t.nodeId === p.nodeId)) continue;
        const item = {
          id: "UA_" + crypto.randomUUID(),
          nodeId: p.nodeId,
          label: p.label,
          kind: p.kind,
          dataType: p.dataType,
        };
        points.value.push(item);
        selectedId.value = item.id;
      }
      checked.value = [];
      sync();
    }
    function selectAll(e) {
      checked.value = e.target.checked
        ? candidates.value
            .filter(
              (p) => p.kind && !points.value.some((t) => t.nodeId === p.nodeId),
            )
            .map((p) => p.nodeId)
        : [];
    }
    function remove() {
      source.value.connection.points = points.value.filter(
        (p) => !removeIds.value.includes(p.id),
      );
      removeIds.value = [];
      sync();
    }
    function addRegister() {
      const p = {
        id: "MB_" + crypto.randomUUID(),
        label: "新测点",
        kind: "number",
        function: 4,
        address: 0,
        format: "uint16",
      };
      points.value.push(p);
      selectedId.value = p.id;
      sync();
    }
    async function importFile(file) {
      try {
        if (!file) return;
        const values = importNorthbound(JSON.parse(await file.text()));
        source.value.connection.points = values;
        selectedId.value = values[0]?.id || "";
        sync();
        localError.value = "";
      } catch (e) {
        localError.value = e.message;
      }
    }
    const localError = ref("");
    const batchOpen = ref(false), batch = ref({prefix:"MB_",start:1,count:10,serial:1,step:1,function:4,format:"uint16",order:"AB"});
    const batchMessage = ref("");
    const batchFormat = () => {
      const wide = batch.value.function>2 && ["uint32","int32","float32"].includes(batch.value.format);
      batch.value.step = wide?2:1;batch.value.order=wide?"ABCD":"AB";
    };
    const addBatch = () => {
      try {const rows=modbusBatchPoints(batch.value,points.value);points.value.push(...rows);selectedId.value=rows[0].id;sync();localError.value="";batchMessage.value="已添加 "+rows.length+" 个点位，可在下表修改名称与工程量换算";batchOpen.value=false;}
      catch(e){localError.value=e.message;batchMessage.value="";}
    };
    function nameChanged() {
      if (mapping.value && !isExisting(mapping.value)) mapping.value.label = current.value.label;
    }
    function formatChanged() {
      current.value.kind = current.value.function <= 2 ? "boolean" : "number";
      const bytes = ['uint16','int16'].includes(current.value.format) ? 2 : 4;
      if (current.value.order && current.value.order.length !== bytes) delete current.value.order;
      if (current.value.kind === "boolean") {
        delete current.value.rawMin;
        delete current.value.rawMax;
        delete current.value.unit;
      }
      sync();
    }
    const readings = computed(() => {
      if (!sampleMatches.value || !props.sample) return new Map();
      const now = props.sampleReceived;
      return new Map(points.value.map(p => {
        const m = mapFor(p);
        return [p.id, m ? normalize(props.sample, m, now, source.value.maxAgeMs, now) : null];
      }));
    });
    const currentReading = computed(() => readings.value.get(current.value?.id));
    const previews = computed(() => new Map(points.value.map(p =>
      [p.id, pointPreview(readings.value.get(p.id), mapFor(p))]
    )));
    const conversionBatchOpen = ref(false);
    const conversionBatchUndo = ref([]);
    const conversionTargets = computed(() => points.value.filter(p =>
      p.id !== current.value?.id && removeIds.value.includes(p.id)
    ));
    const conversionDiffs = computed(() => {
      if (!conversionBatchOpen.value || !mapping.value) return [];
      const settings = conversionSettings(mapping.value);
      return conversionTargets.value.map(p => {
        const target = mapFor(p);
        const candidate = { ...target };
        applyConversion(candidate, settings);
        const before = conversionSettings(target);
        const validFormat = [candidate.scale, candidate.offset].every(Number.isFinite) &&
          Number.isInteger(candidate.precision) && candidate.precision >= 0 && candidate.precision <= 10;
        return {
          point: p, before, after: settings,
          from: describeConversion(target),
          to: describeConversion(candidate),
          issue: target.kind !== "number" ? "仅适用于数值点" :
            engineeringProblem(candidate) || (!validFormat ? "倍率、偏移或小数位无效" : ""),
          changed: JSON.stringify(before) !== JSON.stringify(settings),
        };
      });
    });
    const canApplyConversion = computed(() =>
      !conversionDiffs.value.some(row => row.issue) && conversionDiffs.value.some(row => row.changed)
    );
    function applyConversionBatch() {
      if (!canApplyConversion.value) return;
      const changes = conversionDiffs.value.filter(row => row.changed);
      for (const row of changes) applyConversion(mapFor(row.point), row.after);
      conversionBatchUndo.value = changes;
      conversionBatchOpen.value = false;
      localError.value = "";
      batchMessage.value = "已更新 " + changes.length + " 个点位的换算设置";
    }
    function undoConversionBatch() {
      const targets = conversionBatchUndo.value.map(row => ({
        row, target: points.value.some(p => p.id === row.point.id) ? mapFor(row.point) : null,
      }));
      if (targets.some(({ row, target }) => !target ||
          JSON.stringify(conversionSettings(target)) !== JSON.stringify(row.after))) {
        localError.value = "批量套用后有点位被移除或修改，无法整体撤销";
        return;
      }
      for (const { row, target } of targets) applyConversion(target, row.before);
      conversionBatchUndo.value = [];
      localError.value = "";
      batchMessage.value = "已撤销批量换算";
    }
    const typeNames = {
      boolean: "Boolean · 开关量",
      number: "Number · 数值",
      text: "String · 文本",
    };
    return {
      source,
      pollChoices,
      configuredPollMs,
      points,
      current,
      mapping,
      mappedPoints,
      unmappedBusiness,
      datasetMappings, datasetSample, datasetBusy, datasetError, datasetChoices, datasetRows,
      datasetId, changeDatasetUrl, readDatasetSample, selectDataset, datasetReading, unusedDatasets, addDataset,
      businessChoices,
      isExisting,
      linkBusiness,
      selected,
      candidates,
      folders,
      search,
      selectedSearch,
      checked,
      removeIds,
      selectedId,
      addItems,
      selectAll,
      remove,
      addRegister,
      batchOpen,batch,batchMessage,batchFormat,addBatch,
      importFile,
      nameChanged,
      formatChanged,
      previews,
      currentReading,
      conversionBatchOpen,
      conversionBatchUndo,
      conversionTargets,
      conversionDiffs,
      canApplyConversion,
      applyConversionBatch,
      undoConversionBatch,
      address: protocolPointAddress,
      businessMappings, crosswalkOpen, crosswalkTitle, crosswalkButton, crosswalkInput, crosswalkLoading,
      crosswalkResult, crosswalkRows, showCrosswalk, closeCrosswalk, exportBusinessCrosswalk,
      loadProtocolCrosswalk, applyProtocolCrosswalk,
      exportDevicePoints: () => props.downloadCrosswalk("已选设备点位.csv", exportProtocolPointList(points.value)),
      typeNames,
      localError,
      showSystem,
      selectable,
      has: (p) => points.value.some((t) => t.nodeId === p.nodeId),
      isCurrent: (p) => (props.path.at(-1)?.nodeId || "i=85") === p.nodeId,
      open: (p) => {
        search.value = "";
        emit("browse", p.nodeId === "i=85" ? null : p);
      },
    };
  },
  template: `
<div class="tag-manager">
  <div class="tag-connection">
    <label
      >来源<select
        aria-label="来源"
        :value="source.kind"
        @change="$emit('kind-change', $event.target.value)"
        :disabled="busy"
      >
        <option value="json">本地 JSON</option>
        <option value="csv">本地 CSV</option>
        <option value="rest">REST / 工业协议桥接</option>
        <option value="ws">WebSocket JSON</option>
        <option value="opcua">OPC UA</option>
        <option value="modbus">Modbus TCP</option>
      </select></label
    >
    <template v-if="source.kind === 'opcua'"
      ><label class="endpoint"
        >服务器地址<input
          aria-label="OPC UA 地址"
          v-model="source.connection.endpoint"
          :disabled="busy"
          @change="cache = {}; $emit('endpoint-change')" /></label
      ><button
        @click="
          cache = {};
          $emit('browse');
        "
        :disabled="busy || !source.connection.endpoint.trim()"
      >
        连接并浏览
      </button></template
    >
    <template v-else
      ><label class="endpoint"
        >设备 IP 或主机名<input
          aria-label="Modbus 主机"
          v-model="source.connection.host"
          placeholder="例如 192.168.1.10"
          :disabled="busy" /></label
      ><label class="short"
        >端口<input
          type="number"
          v-model.number="source.connection.port"
          :disabled="busy" /></label
      ><label class="short"
        >站号<input
          aria-label="单元 ID"
          type="number"
          v-model.number="source.connection.unitId"
          :disabled="busy" /></label
    ></template>
    <label class="short"
      >扫描周期<select
        aria-label="刷新周期（ms）"
        :value="configuredPollMs"
        @change="source.pollMs = Number($event.target.value)"
        :disabled="busy"
      >
        <option v-for="period in pollChoices" :value="period">{{ period }} ms</option>
        <option
          v-if="!pollChoices.includes(configuredPollMs)"
          :value="configuredPollMs"
        >
          {{ configuredPollMs }} ms
        </option>
      </select><small v-if="source.pollMs !== configuredPollMs">原设置 {{ source.pollMs }} ms，使用桥接下限 {{ configuredPollMs }} ms</small></label
    >
    <label class="short">
      超时判定（ms）
      <input
        aria-label="最大数据年龄（ms）"
        type="number"
        min="1"
        v-model.number="source.maxAgeMs"
        :disabled="busy"
      />
    </label>
  </div>
  <details class="tag-datasets">
    <summary>历史与告警接口<span v-if="source.datasets"> · 已关联 {{Object.keys(source.datasets.bindings).length}} 项</span></summary>
    <div class="tag-dataset-endpoint">
      <label>只读 REST 地址<input type="url" aria-label="历史与告警 REST 地址"
        :value="source.datasets?.url || ''" :disabled="busy || datasetBusy"
        @input="changeDatasetUrl($event.target.value)" /></label>
      <button type="button" :disabled="busy || datasetBusy || !source.datasets" @click="readDatasetSample">
        {{datasetBusy ? '正在读取…' : '试读历史与告警'}}
      </button>
    </div>
    <p v-if="datasetError" role="alert">{{datasetError}}</p>
    <p v-else-if="datasetSample && !datasetChoices.length" role="status">样本没有可用的数据集。</p>
    <div v-if="source.datasets" class="tag-dataset-mappings">
      <label v-for="mapping in datasetMappings" :key="mapping.id">
        {{mapping.label || mapping.id}}
        <select :aria-label="'数据集来源 ' + mapping.id" :value="datasetId(mapping)"
          :disabled="busy || datasetBusy || (!datasetSample && !datasetId(mapping))"
          @change="selectDataset(mapping,$event.target.value)">
          <option value="">未关联</option>
          <option v-if="datasetId(mapping) && datasetRows.get(datasetId(mapping))?.kind !== 'dataset'"
            :value="datasetId(mapping)">{{datasetId(mapping)}}</option>
          <option v-for="row in datasetChoices" :key="row.id" :value="row.id">{{row.label && row.label !== row.id ? row.label + ' · ' + row.id : row.id}}</option>
        </select>
        <small v-if="datasetReading(mapping)">{{datasetReading(mapping)}}</small>
      </label>
      <label v-if="unusedDatasets.length">从样本新增数据集
        <select aria-label="从样本新增数据集" :disabled="busy || datasetBusy"
          @change="addDataset($event.target.value);$event.target.value=''">
          <option value="">选择数据集</option>
          <option v-for="row in unusedDatasets" :key="row.id" :value="row.id">{{row.label || row.id}}</option>
        </select>
      </label>
    </div>
  </details>
  <section v-if="crosswalkOpen" class="tag-crosswalk snapshot-review">
    <h2 ref="crosswalkTitle" tabindex="-1">批量关联画面位号</h2>
    <p>填写对照 CSV 的「现场点位或字段」列，可用已选设备点编号或清单中的地址。</p>
    <div class="snapshot-review-files">
      <button type="button" @click="exportBusinessCrosswalk" :disabled="busy">导出位号对照 CSV</button>
      <button type="button" @click="exportDevicePoints" :disabled="busy">导出设备点清单</button>
      <button type="button" @click="crosswalkInput.click()" :disabled="busy || crosswalkLoading">导入对照 CSV</button>
      <input ref="crosswalkInput" hidden type="file" aria-label="导入设备对照 CSV" accept=".csv,text/csv"
        @change="loadProtocolCrosswalk($event.target.files[0]);$event.target.value=''" />
    </div>
    <div v-if="crosswalkResult?.errors.length" role="alert" class="snapshot-crosswalk-errors">
      <b>文件未采用，请修正后重新导入。</b>
      <ul><li v-for="(error,i) in crosswalkResult.errors" :key="i">{{error}}</li></ul>
    </div>
    <p v-else-if="crosswalkLoading" role="status">正在读取对照表…</p>
    <p v-else-if="crosswalkResult && !crosswalkRows.length" role="status">对照表没有需要变更的关联。</p>
    <p v-if="crosswalkRows.length" class="snapshot-crosswalk-notice" role="status">待确认 {{crosswalkRows.length}} 项关联</p>
    <div v-if="crosswalkRows.length" class="snapshot-review-list" tabindex="0" role="region" aria-label="设备点位关联预览">
      <table><thead><tr><th scope="col">画面位号</th><th scope="col">设备点与地址</th><th scope="col">原值 → 工程值</th><th scope="col">试读质量</th></tr></thead>
        <tbody><tr v-for="{point,mapping,previous,released,reading} in crosswalkRows" :key="mapping.id">
          <th scope="row"><b>{{mapping.label || mapping.id}}</b><small v-if="mapping.label && mapping.label !== mapping.id">{{mapping.id}}</small></th>
          <td>{{point.label || point.id}}<small>{{point.id}} · {{address(point)}}</small>
            <small v-if="previous">原关联 {{previous.id}} · {{address(previous)}}</small>
            <small v-if="released">替换未引用的设备默认位号 {{released}}</small></td>
          <td>{{reading.raw === reading.value ? reading.value : reading.raw + ' → ' + reading.value}}</td>
          <td>{{reading.quality}}<small v-if="reading.reason">{{reading.reason}}</small></td>
        </tr></tbody>
      </table>
    </div>
    <div class="snapshot-review-actions">
      <button type="button" @click="closeCrosswalk">返回设备点表</button>
      <button type="button" class="primary" @click="applyProtocolCrosswalk"
        :disabled="busy || crosswalkLoading || !crosswalkRows.length">确认关联</button>
    </div>
  </section>
  <div v-else
    class="tag-workspace"
    :class="{ 'modbus-tags': source.kind === 'modbus' }"
  >
    <aside class="tag-tree" v-if="source.kind === 'opcua'">
      <h2>设备目录</h2>
      <label class="system-folders"
        ><input type="checkbox" v-model="showSystem" /> 显示系统目录</label
      >
      <div class="tag-tree-scroll">
        <button
          v-for="f in folders"
          :key="f.nodeId"
          :style="{ paddingLeft: 10 + f.depth * 14 + 'px' }"
          :class="{ active: isCurrent(f) }"
          @click="open(f)"
          :disabled="busy"
          :title="f.label"
        >
          ▸ {{ f.label }}
        </button>
        <p v-if="!results.length">输入服务器地址，点击“连接并浏览”。</p>
      </div>
    </aside>
    <div class="tag-tables">
      <section v-if="source.kind === 'opcua'" class="tag-browser">
        <div class="tag-tools">
          <b>{{ path.at(-1)?.label || "服务器标签" }}</b
          ><input
            aria-label="搜索服务器标签"
            v-model="search"
            placeholder="搜索当前目录的名称或地址"
          /><button @click="addItems" :disabled="busy || !checked.length">
            添加所选 →
          </button>
        </div>
        <div class="tag-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="全选当前标签"
                    @change="selectAll"
                    :checked="
                      selectable.length > 0 &&
                      checked.length === selectable.length
                    "
                    :disabled="busy || !selectable.length"
                  />
                </th>
                <th>标签名称</th>
                <th>数据类型</th>
                <th>地址</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in candidates"
                :key="p.nodeId"
                @dblclick="
                  checked = [p.nodeId];
                  addItems();
                "
              >
                <td>
                  <input
                    type="checkbox"
                    :aria-label="'选择标签 ' + p.label"
                    :value="p.nodeId"
                    v-model="checked"
                    :disabled="busy || !p.kind || has(p)"
                  />
                </td>
                <td>{{ p.label }} <small v-if="has(p)">已添加</small></td>
                <td>{{ p.dataType || typeNames[p.kind] || "暂不支持" }}</td>
                <td :title="p.nodeId">{{ p.nodeId }}</td>
              </tr>
              <tr v-if="!candidates.length && (busy || results.length || search)">
                <td colspan="4">
                  {{
                    busy
                      ? "正在读取目录…"
                      : search
                        ? "当前已加载标签中没有匹配项"
                        : "从左侧选择设备目录"
                  }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!results.length && !search && !busy" class="tag-empty-state">
            <b>等待浏览 OPC UA 服务器</b>
            <p>确认上方的服务器地址，点击“连接并浏览”，然后勾选要使用的标签。</p>
          </div>
        </div>
        <div class="tag-table-foot">
          <span
            >{{ candidates.length }} 个标签 · 已勾选
            {{ checked.length }} 个</span
          ><button
            v-if="nextOffset != null"
            @click="$emit('browse', null, undefined, true)"
            :disabled="busy"
          >
            加载更多
          </button>
        </div>
      </section>
      <section class="tag-selected">
        <div class="tag-tools">
          <b>已选点位 · {{ points.length }}</b
          ><input
            aria-label="搜索已选点位"
            v-model="selectedSearch"
            placeholder="搜索已选点位"
          /><template v-if="source.kind === 'modbus'"
            ><button @click="addRegister" :disabled="busy">新建点位</button
            ><button @click="batchOpen=!batchOpen;batchMessage=''" :disabled="busy">批量地址</button
            ><label class="button"
              >导入点表<input
                type="file"
                aria-label="导入北向 JSON 点表"
                accept=".json"
                @change="
                  importFile($event.target.files[0]);
                  $event.target.value = '';
                "
                :disabled="busy" /></label></template
          ><button ref="crosswalkButton" @click="showCrosswalk" :disabled="busy || !points.length || !businessMappings.length">
            批量关联位号
          </button><button @click="conversionBatchOpen = !conversionBatchOpen"
            :disabled="busy || mapping?.kind !== 'number' || !conversionTargets.length">
            批量套用换算
          </button><button v-if="conversionBatchUndo.length" @click="undoConversionBatch" :disabled="busy">
            撤销批量换算
          </button><button @click="remove" :disabled="busy || !removeIds.length">
            移除
          </button>
        </div>
        <div class="tag-batch" v-if="source.kind==='modbus'&&batchOpen">
          <b>批量添加连续地址</b><p>序号从 1 开始；生成后可逐行改名。此操作只建立点表。</p>
          <div class="pair"><label>编号前缀<input aria-label="批量编号前缀" v-model="batch.prefix" /></label><label>编号起始<input type="number" aria-label="批量编号起始" v-model.number="batch.serial" min="0" /></label></div>
          <div class="pair"><label>地址区<select aria-label="批量读取功能" v-model.number="batch.function" @change="batchFormat"><option :value="1">0x · 线圈</option><option :value="2">1x · 离散输入</option><option :value="3">4x · 保持寄存器</option><option :value="4">3x · 输入寄存器</option></select></label><label v-if="batch.function>2">数据类型<select aria-label="批量数据格式" v-model="batch.format" @change="batchFormat"><option v-for="f in ['uint16','int16','uint32','int32','float32']">{{f}}</option></select></label></div>
          <div class="pair"><label>起始序号<input type="number" aria-label="批量起始序号" v-model.number="batch.start" min="1" /></label><label>点数<input type="number" aria-label="批量点数" v-model.number="batch.count" min="1" max="500" /></label><label>地址步长<input type="number" aria-label="批量地址步长" v-model.number="batch.step" min="1" /></label><label v-if="batch.function>2">字节顺序<select aria-label="批量字节顺序" v-model="batch.order"><option v-for="o in ['uint16','int16'].includes(batch.format)?['AB','BA']:['ABCD','CDAB','BADC','DCBA']">{{o}}</option></select></label></div>
          <p>将添加 {{batch.prefix}}{{String(batch.serial).padStart(3,'0')}} 起 {{batch.count}} 点；地址序号 {{batch.start}} ～ {{batch.start+(batch.count-1)*batch.step}}。</p><button class="primary" @click="addBatch" :disabled="busy">添加这批点位</button><button @click="batchOpen=false">取消批量</button>
        </div>
        <section class="tag-batch tag-conversion-batch" v-if="conversionBatchOpen" aria-label="批量换算差异">
          <b>从 {{ current?.label }} 套用换算</b>
          <p>已勾选 {{ conversionTargets.length }} 个目标点位。检查量程和单位后确认。</p>
          <table>
            <thead><tr><th>目标点位</th><th>当前</th><th>应用后</th></tr></thead>
            <tbody><tr v-for="row in conversionDiffs" :key="row.point.id">
              <td>{{ row.point.label }}</td>
              <td>{{ row.from }}</td>
              <td>{{ row.issue || (row.changed ? row.to : '相同') }}</td>
            </tr></tbody>
          </table>
          <button class="primary" @click="applyConversionBatch" :disabled="busy || !canApplyConversion">确认套用换算</button>
          <button @click="conversionBatchOpen = false">取消</button>
        </section>
        <p v-if="batchMessage" role="status">{{batchMessage}}</p>
        <div class="tag-scroll">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>点位名称</th>
                <th>地址</th>
                <th>原值</th>
                <th>工程值</th>
                <th>质量</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in selected"
                :key="p.id"
                :class="{ active: current?.id === p.id }"
                @click="selectedId = p.id"
                tabindex="0"
                @keydown.enter="selectedId = p.id"
              >
                <td>
                  <input
                    type="checkbox"
                    v-model="removeIds"
                    :value="p.id"
                    :aria-label="'选择点位 ' + p.label"
                    :disabled="busy"
                    @click.stop
                  />
                </td>
                <td>{{ p.label }}<small v-if="isExisting(mappedPoints.get(p.id))" class="tag-business-id">
                  {{mappedPoints.get(p.id).id}}</small></td>
                <td :title="address(p)">{{ address(p) }}</td>
                <td :title="previews.get(p.id).raw">{{ previews.get(p.id).raw }}</td>
                <td :title="previews.get(p.id).value">{{ previews.get(p.id).value }}</td>
                <td :title="previews.get(p.id).reason">
                  {{ previews.get(p.id).quality }}<template v-if="previews.get(p.id).reason"> · {{ previews.get(p.id).reason }}</template>
                </td>
              </tr>
              <tr v-if="!selected.length && points.length">
                <td colspan="6">
                  没有匹配的已选点位
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!points.length" class="tag-empty-state">
            <b>{{ source.kind === 'modbus' ? '尚未配置 Modbus 点位' : '尚未添加 OPC UA 点位' }}</b>
            <p v-if="source.kind === 'modbus'">填写上方的设备 IP 或主机名、端口和站号，再新建点位、批量添加地址或导入点表。</p>
            <p v-else>浏览服务器后，在上方勾选标签并点击“添加所选”。</p>
          </div>
        </div>
      </section>
    </div>
    <aside class="tag-properties">
      <h2>点位属性</h2>
      <fieldset :disabled="busy" v-if="current">
        <label
          >名称<input
            aria-label="点位名称"
            v-model="current.label"
            @input="nameChanged"
        /></label>
        <template v-if="current.nodeId"
          ><label
            >地址<textarea
              readonly
              :value="current.nodeId"
              rows="3"
            ></textarea></label
          ><label
            >数据类型<input
              readonly
              :value="current.dataType || typeNames[current.kind]" /></label
        ></template>
        <template v-else
          ><label
            >地址区<select
              aria-label="读取功能"
              v-model.number="current.function"
              @change="formatChanged"
            >
              <option :value="1">0x · 线圈</option>
              <option :value="2">1x · 离散输入</option>
              <option :value="3">4x · 保持寄存器</option>
              <option :value="4">3x · 输入寄存器</option>
            </select></label
          ><label
            >寄存器序号<input
              aria-label="寄存器序号"
              type="number"
              min="1"
              :value="current.address + 1"
              @input="
                current.address = Number($event.target.value) - 1
              " /></label
          ><small>序号从 1 开始，首个寄存器填 1。</small
          ><label v-if="current.function > 2"
            >数据类型<select aria-label="数据格式" v-model="current.format" @change="formatChanged">
              <option
                v-for="f in ['uint16', 'int16', 'uint32', 'int32', 'float32']"
                :value="f"
              >
                {{ f }}
              </option>
            </select></label
          ></template
        >
        <template v-if="mapping">
          <label v-if="businessChoices.length || isExisting(mapping)">关联画面业务位号
            <select aria-label="关联画面业务位号" :value="isExisting(mapping) ? mapping.id : ''"
              @change="linkBusiness($event.target.value)" :disabled="busy">
              <option v-if="isExisting(mapping)" :value="mapping.id">{{mapping.id}} · {{mapping.label}}</option>
              <option v-else value="" disabled>选择已有位号</option>
              <option v-for="candidate in businessChoices" :key="candidate.id" :value="candidate.id">
                {{candidate.id}} · {{candidate.label}}
              </option>
            </select>
          </label>
          <label v-if="current.kind === 'number'"
            >单位<input aria-label="点位单位" v-model="mapping.unit"
          /></label>
          <point-conversion :mapping="mapping" :reading="currentReading"></point-conversion>
          <details>
            <summary>高级设置</summary>
            <label
              >点位编号<input
                aria-label="业务编号"
                :readonly="isExisting(mapping)"
                v-model="mapping.id" /></label
            ><label v-if="!current.nodeId && current.function > 2"
              >字节顺序<select v-model="current.order">
                <option :value="undefined">默认 AB / ABCD</option>
                <option
                  v-for="o in ['uint16', 'int16'].includes(current.format)
                    ? ['AB', 'BA']
                    : ['ABCD', 'CDAB', 'BADC', 'DCBA']"
                  :value="o"
                >
                  {{ o }}
                </option>
              </select></label>
          </details>
        </template>
      </fieldset>
      <p v-else>在点位表中选择一行，查看或修改属性。</p>
    </aside>
  </div>
  <footer class="tag-footer">
    <small v-if="unmappedBusiness.length" class="tag-unlinked-summary">未关联 {{unmappedBusiness.length}} 个画面位号</small>
    <span role="status">{{
      localError ||
      notice ||
      (busy
        ? "正在连接，请稍候…"
        : sample
          ? "试读已完成" + (sample.sampleIntervalMs ? " · 实测扫描间隔 " + sample.sampleIntervalMs + " ms" : "，可查看点值和质量")
          : "选择点位后，可试读检查当前值。")
    }}</span
    ><button @click="$emit('read')" :disabled="busy || !points.length">
      {{ busy ? "正在连接…" : "试读点位" }}</button
    ><button
      class="primary"
      @click="$emit('finish')"
      :disabled="busy || datasetBusy || crosswalkOpen || !points.length"
    >
      完成并返回画布
    </button>
  </footer>
</div>
`,
};
