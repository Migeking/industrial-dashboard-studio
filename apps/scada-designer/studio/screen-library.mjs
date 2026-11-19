import {
  makeScreenSymbol,
  planScreenSymbolUpgrade,
  screenSymbolChanges,
  validateScreenSymbol,
} from "../../../packages/runtime/studio/screen-library.mjs";

export const ScreenLibrary = {
  props: ["doc", "selected"],
  emits: ["start", "place", "select"],
  setup(props, { emit }) {
    const name = Vue.ref(""),
      error = Vue.ref(""),
      notice = Vue.ref("");
    const pending = Vue.shallowRef(null),
      review = Vue.ref(null);
    const canSave = Vue.computed(() =>
      props.doc.nodes.some((n) => props.selected.includes(n.id)),
    );
    const save = (previous) => {
      try {
        const value = makeScreenSymbol(
          props.doc,
          props.selected,
          previous?.name || name.value,
          previous?.id || crypto.randomUUID(),
        );
        if (previous) {
          reviewUpdate(previous, value);
          return;
        }
        emit("start");
        props.doc.symbols ||= [];
        props.doc.symbols.push(value);
        error.value = "";
        notice.value =
          "图元已保存，连接点、数据槽位及规则已保留；新实例需重新选点。";
        name.value = "";
      } catch (e) {
        error.value = e.message;
      }
    };
    function reviewUpdate(previous, value) {
      const revision = Math.max((previous.revision || 1) + 1, value.revision || 1);
      const next = validateScreenSymbol({
        ...value, id: previous.id, name: previous.name, revision,
      });
      if (!props.doc.symbols?.includes(previous)) throw Error("图元已变化，请重新打开更新");
      pending.value = { previous, next, changes: screenSymbolChanges(previous, next) };
      error.value = "";
      notice.value = "";
      Vue.nextTick(() => review.value?.showModal());
    }
    function reviewUpgrade(symbol) {
      const value = { instance: true, symbol, doc: props.doc, selected: [...props.selected] };
      try {
        Object.assign(value, planScreenSymbolUpgrade(props.doc, props.selected, symbol));
      } catch (e) {
        value.problem = e.message;
      }
      pending.value = value;
      error.value = "";
      notice.value = "";
      Vue.nextTick(() => review.value?.showModal());
    }
    function acceptUpgrade() {
      const { doc, selected, symbol } = pending.value;
      try {
        if (doc !== props.doc || !doc.symbols.includes(symbol) ||
            selected.join() !== props.selected.join())
          throw Error("选中的图元或库修订已变化，请重新预览");
        const upgrade = planScreenSymbolUpgrade(doc, selected, symbol);
        emit("start");
        doc.nodes = upgrade.nodes;
        doc.pipes = upgrade.pipes;
        emit("select", upgrade.memberIds);
        notice.value = `已升级到修订 ${symbol.revision || 1}` +
          (upgrade.unbound.length ? `，发布前需补绑 ${upgrade.unbound.length} 个测点。` : "，可撤销本次升级。");
        review.value.close();
      } catch (e) {
        pending.value = { ...pending.value, problem: e.message };
      }
    }
    function acceptUpdate() {
      if (!pending.value) return;
      const { previous, next } = pending.value;
      const index = props.doc.symbols?.indexOf(previous) ?? -1;
      if (index < 0) {
        error.value = "图元已变化，请重新打开更新";
      } else {
        emit("start");
        props.doc.symbols.splice(index, 1, next);
        notice.value = `图元库已更新到修订 ${next.revision}。后续放置使用新版。`;
      }
      review.value.close();
    }
    const remove = (symbol) => {
      emit("start");
      props.doc.symbols = props.doc.symbols.filter((s) => s.id !== symbol.id);
      notice.value = "已从图元库移除，已放入画面的实例继续保留。";
    };
    const exportFile = (symbol) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(symbol, null, 2)], {
          type: "application/json",
        }),
      );
      a.download = symbol.name + ".symbol.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    const importFile = async (file, previous) => {
      try {
        if (!file) return;
        const symbol = validateScreenSymbol(JSON.parse(await file.text()));
        if (previous) {
          reviewUpdate(previous, symbol);
          return;
        }
        emit("start");
        props.doc.symbols ||= [];
        props.doc.symbols.push({ ...symbol, id: crypto.randomUUID() });
        error.value = "";
        notice.value = "图元已导入，可在任意空白画面放置。";
      } catch (e) {
        error.value = e.message;
      }
    };
    return {
      name,
      error,
      notice,
      canSave,
      save,
      remove,
      exportFile,
      importFile,
      pending,
      review,
      acceptUpdate,
      reviewUpgrade,
      acceptUpgrade,
    };
  },
  template: `
  <section class="screen-symbol-library">
    <h2>保存我的图元</h2>
    <p class="muted">选中基础形状或设备，连同内部管道保存。Alt 点击可单独编辑组合内部元素。</p>
    <label>图元名称<input aria-label="我的图元名称" v-model="name" placeholder="例如：单泵出水支路" /></label>
    <button class="primary wide" @click="save()" :disabled="!canSave">保存选中为图元</button>
    <p role="alert" class="definition-error" v-if="error">{{error}}</p>
    <p role="status" class="muted" v-if="notice">{{notice}}</p>
    <label class="button wide">导入图元文件<input type="file" accept=".json" aria-label="导入我的图元" @change="importFile($event.target.files[0]);$event.target.value=''" /></label>
    <article class="definition-card" v-for="symbol in doc.symbols||[]" :key="symbol.id" :data-user-symbol="symbol.id">
      <b>{{symbol.name}}</b>
      <p class="muted">修订 {{symbol.revision || 1}} · {{symbol.nodes.length}} 个元素 · {{symbol.pipes.length}} 条内部管道</p>
      <button class="primary wide" @click="$emit('place',symbol.id)">放置 {{symbol.name}}</button>
      <div class="tools">
        <button @click="exportFile(symbol)">导出图元</button>
        <button @click="save(symbol)" :disabled="!canSave">用选中内容更新</button>
        <label class="button">导入修订<input type="file" accept=".json" :aria-label="'导入 '+symbol.name+' 的修订文件'" @change="importFile($event.target.files[0],symbol);$event.target.value=''" /></label>
        <button @click="reviewUpgrade(symbol)" aria-label="升级选中实例" :disabled="!canSave">升级实例</button>
        <button @click="remove(symbol)">移除图元</button>
      </div>
    </article>
    <p v-if="!doc.symbols?.length" class="muted">图元库为空。先从画布选取需要复用的内容。</p>
    <Teleport to="body">
      <dialog class="symbol-revision-dialog" ref="review" aria-labelledby="symbol-revision-title" @keydown.stop @close="pending=null">
        <template v-if="pending">
          <h2 id="symbol-revision-title">{{pending.instance ? '实例升级预览' : '图元更新预览'}}</h2>
          <template v-if="pending.instance">
            <p><b>{{pending.symbol.name}}</b> · {{pending.fromRevision ? '修订 '+pending.fromRevision : '原实例'}} → 修订 {{pending.symbol.revision || 1}}</p>
            <p v-if="pending.problem" class="definition-error" role="alert">{{pending.problem}}</p>
            <template v-else>
              <p>保留 {{pending.connected}} 条已接管线、{{pending.bindings}} 处测点绑定和画面位置。</p>
              <p v-if="!pending.fromRevision">旧实例按唯一图元名称和内部接管关系匹配。</p>
              <details v-if="pending.additions.nodes.length || pending.additions.pipes.length" open>
                <summary>新增 {{pending.additions.nodes.length}} 个图元、{{pending.additions.pipes.length}} 条内部管线</summary>
                <p v-if="pending.additions.nodes.length">图元 · {{pending.additions.nodes.join('、')}}</p>
                <p v-if="pending.additions.pipes.length">管线 · {{pending.additions.pipes.join('、')}}</p>
              </details>
              <details v-if="pending.unbound.length" open>
                <summary>发布前需补绑 {{pending.unbound.length}} 个测点</summary>
                <ul><li v-for="(slot,i) in pending.unbound" :key="i">{{slot}}</li></ul>
              </details>
            </template>
          </template>
          <template v-else>
          <p><b>{{pending.previous.name}}</b> · 修订 {{pending.previous.revision || 1}} → {{pending.next.revision}}</p>
          <p>{{pending.previous.nodes.length === pending.next.nodes.length ? pending.next.nodes.length : pending.previous.nodes.length+' → '+pending.next.nodes.length}} 个元素，
            {{pending.previous.pipes.length === pending.next.pipes.length ? pending.next.pipes.length : pending.previous.pipes.length+' → '+pending.next.pipes.length}} 条内部管道。确认后，新放置的实例使用新版。</p>
          </template>
          <div v-if="!pending.problem && pending.changes.length" class="symbol-revision-list" tabindex="0" role="region" aria-label="接口和测点变化">
            <table>
              <thead><tr><th scope="col">图元 / 项目</th><th scope="col">当前定义</th><th scope="col">更新后</th></tr></thead>
              <tbody>
                <tr v-for="(change,i) in pending.changes" :key="i">
                  <th scope="row">{{change.title}}<small>{{change.kind}} · {{change.key}}</small></th>
                  <td>{{change.from || '—'}}</td>
                  <td>{{change.to || '已移除'}}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else-if="!pending.problem">接口和测点槽位定义一致。</p>
          <footer>
            <button autofocus @click="review.close()">取消</button>
            <button v-if="pending.instance" class="primary" :disabled="!!pending.problem" @click="acceptUpgrade">确认升级实例</button>
            <button v-else class="primary" @click="acceptUpdate">确认更新图元库</button>
          </footer>
        </template>
      </dialog>
    </Teleport>
  </section>`,
};
