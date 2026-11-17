import { protocolMappings, importNorthbound, normalize } from "./model.mjs";

export const TagManager = {
  props: [
    "config",
    "sample",
    "sampleSource",
    "busy",
    "path",
    "results",
    "nextOffset",
    "notice",
  ],
  emits: ["browse", "read", "finish", "kind-change"],
  setup(props, { emit }) {
    const { ref, computed, watch } = Vue;
    const search = ref(""),
      selectedSearch = ref(""),
      checked = ref([]),
      removeIds = ref([]),
      selectedId = ref(""),
      cache = ref({});
    const source = computed(() => props.config.source);
    const showSystem = ref(false);
    const sampleMatches = computed(
      () => props.sampleSource === JSON.stringify(source.value),
    );
    const points = computed(() => source.value.connection.points);
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
    const mapFor = (p) =>
      props.config.mappings.find(
        (m) => (m.keyField === "id" && m.keyValue === p.id) || m.id === p.id,
      );
    function sync() {
      props.config.mappings = protocolMappings(
        points.value,
        source.value.kind,
        props.config.mappings,
      );
    }
    sync();
    const mapping = computed(() => current.value && mapFor(current.value));
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
    function nameChanged() {
      if (mapping.value) mapping.value.label = current.value.label;
    }
    function formatChanged() {
      current.value.kind = current.value.function <= 2 ? "boolean" : "number";
      if (current.value.kind === "boolean") {
        delete current.value.rawMin;
        delete current.value.rawMax;
        if (mapping.value?.unit === "原码") mapping.value.unit = "";
      }
      if (mapping.value) mapping.value.kind = current.value.kind;
    }
    function preview(p) {
      const m = mapFor(p),
        row = props.sample?.points?.find((r) => r.id === p.id);
      if (!row || !m || !sampleMatches.value)
        return { value: "—", quality: "未试读" };
      const r = normalize(props.sample, m, Date.now(), source.value.maxAgeMs);
      return {
        value:
          r.quality !== "good"
            ? "—"
            : typeof r.value === "number"
              ? r.value.toFixed(m.precision)
              : String(r.value),
        quality: { good: "有效", bad: "无效", stale: "过期" }[r.quality],
      };
    }
    function address(p) {
      return (
        p.nodeId ||
        { 1: "0x", 2: "1x", 3: "4x", 4: "3x" }[p.function] +
          " " +
          (p.address + 1)
      );
    }
    const typeNames = {
      boolean: "Boolean · 开关量",
      number: "Number · 数值",
      text: "String · 文本",
    };
    return {
      source,
      points,
      current,
      mapping,
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
      importFile,
      nameChanged,
      formatChanged,
      preview,
      address,
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
      >通信驱动<select
        aria-label="来源"
        v-model="source.kind"
        @change="$emit('kind-change')"
        :disabled="busy"
      >
        <option value="opcua">OPC UA</option>
        <option value="modbus">Modbus TCP/IP</option>
        <option value="rest">REST JSON</option>
        <option value="ws">WebSocket</option>
        <option value="json">本地 JSON</option>
        <option value="csv">本地 CSV</option>
      </select></label
    >
    <template v-if="source.kind === 'opcua'"
      ><label class="endpoint"
        >服务器地址<input
          aria-label="OPC UA 地址"
          v-model="source.connection.endpoint"
          :disabled="busy"
          @change="$emit('kind-change')" /></label
      ><button
        @click="
          cache = {};
          $emit('browse');
        "
        :disabled="busy"
      >
        连接并浏览
      </button></template
    >
    <template v-else
      ><label class="endpoint"
        >设备 IP<input
          aria-label="Modbus 主机"
          v-model="source.connection.host"
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
        v-model.number="source.pollMs"
        :disabled="busy"
      >
        <option :value="200">200 ms</option>
        <option :value="500">500 ms</option>
        <option :value="1000">1 秒</option>
        <option :value="2000">2 秒</option>
        <option :value="5000">5 秒</option>
        <option
          v-if="![200, 500, 1000, 2000, 5000].includes(source.pollMs)"
          :value="source.pollMs"
        >
          {{ source.pollMs }} ms
        </option>
      </select></label
    >
  </div>
  <div
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
              <tr v-if="!candidates.length">
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
          ><button @click="remove" :disabled="busy || !removeIds.length">
            移除
          </button>
        </div>
        <div class="tag-scroll">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>点位名称</th>
                <th>地址</th>
                <th>当前值</th>
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
                    :aria-label="'移除选择 ' + p.label"
                    :disabled="busy"
                    @click.stop
                  />
                </td>
                <td>{{ p.label }}</td>
                <td :title="address(p)">{{ address(p) }}</td>
                <td>{{ preview(p).value }}</td>
                <td>{{ preview(p).quality }}</td>
              </tr>
              <tr v-if="!selected.length">
                <td colspan="5">
                  {{
                    points.length
                      ? "没有匹配的已选点位"
                      : source.kind === "opcua"
                        ? "在上方勾选标签，点击“添加所选”"
                        : "点击“新建点位”，或导入设备点表"
                  }}
                </td>
              </tr>
            </tbody>
          </table>
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
            >数据类型<select aria-label="数据格式" v-model="current.format">
              <option
                v-for="f in ['uint16', 'int16', 'uint32', 'int32', 'float32']"
                :value="f"
              >
                {{ f }}
              </option>
            </select></label
          ></template
        >
        <template v-if="mapping"
          ><label v-if="current.kind === 'number'"
            >单位<input aria-label="点位单位" v-model="mapping.unit"
          /></label>
          <details v-if="current.kind === 'number'">
            <summary>工程量换算</summary>
            <label
              >倍率<input
                type="number"
                v-model.number="mapping.scale" /></label
            ><label
              >偏移<input
                type="number"
                v-model.number="mapping.offset" /></label
            ><label
              >小数位<input
                type="number"
                min="0"
                max="10"
                v-model.number="mapping.precision"
            /></label>
          </details>
          <details>
            <summary>高级设置</summary>
            <label
              >点位编号<input
                aria-label="业务编号"
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
              </select></label
            ><label
              >超时判定（ms）<input
                aria-label="最大数据年龄（ms）"
                type="number"
                min="1"
                v-model.number="source.maxAgeMs"
            /></label></details
        ></template>
      </fieldset>
      <p v-else>在点位表中选择一行，查看或修改属性。</p>
    </aside>
  </div>
  <footer class="tag-footer">
    <span role="status">{{
      localError ||
      notice ||
      (busy
        ? "正在连接，请稍候…"
        : sample
          ? "试读已完成，可查看点值和质量"
          : "选择点位后，可试读检查当前值。")
    }}</span
    ><button @click="$emit('read')" :disabled="busy || !points.length">
      {{ busy ? "正在连接…" : "试读点位" }}</button
    ><button
      class="primary"
      @click="$emit('finish')"
      :disabled="busy || !points.length"
    >
      完成并绑定
    </button>
  </footer>
</div>
`,
};
