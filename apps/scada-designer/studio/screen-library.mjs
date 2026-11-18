import {
  makeScreenSymbol,
  validateScreenSymbol,
} from "../../../packages/runtime/studio/screen-library.mjs";

export const ScreenLibrary = {
  props: ["doc", "selected"],
  emits: ["start", "place"],
  setup(props, { emit }) {
    const name = Vue.ref(""),
      error = Vue.ref(""),
      notice = Vue.ref("");
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
        emit("start");
        props.doc.symbols ||= [];
        const index = props.doc.symbols.findIndex((s) => s.id === value.id);
        if (index < 0) props.doc.symbols.push(value);
        else props.doc.symbols[index] = value;
        error.value = "";
        notice.value =
          "图元已保存，连接点、数据槽位及规则已保留；新实例需重新选点。";
        if (!previous) name.value = "";
      } catch (e) {
        error.value = e.message;
      }
    };
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
    const importFile = async (file) => {
      try {
        if (!file) return;
        const symbol = validateScreenSymbol(JSON.parse(await file.text()));
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
    };
  },
  template: `<section class="screen-symbol-library"><h2>保存我的图元</h2><p class="muted">选中基础形状或设备，连同内部管道保存。Alt 点击可单独编辑组合内部元素。</p><label>图元名称<input aria-label="我的图元名称" v-model="name" placeholder="例如：单泵出水支路" /></label><button class="primary wide" @click="save()" :disabled="!canSave">保存选中为图元</button><p role="alert" class="definition-error" v-if="error">{{error}}</p><p role="status" class="muted" v-if="notice">{{notice}}</p><label class="button wide">导入图元文件<input type="file" accept=".json" aria-label="导入我的图元" @change="importFile($event.target.files[0]);$event.target.value=''" /></label>
 <article class="definition-card" v-for="symbol in doc.symbols||[]" :key="symbol.id" :data-user-symbol="symbol.id"><b>{{symbol.name}}</b><p class="muted">{{symbol.nodes.length}} 个元素 · {{symbol.pipes.length}} 条内部管道</p><button class="primary wide" @click="$emit('place',symbol.id)">放置 {{symbol.name}}</button><div class="tools"><button @click="exportFile(symbol)">导出图元</button><button @click="save(symbol)" :disabled="!canSave">用选中内容更新</button><button @click="remove(symbol)">移除图元</button></div></article>
 <p v-if="!doc.symbols?.length" class="muted">图元库为空。先从画布选取需要复用的内容。</p></section>`,
};
