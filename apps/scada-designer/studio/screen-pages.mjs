export const ScreenPageNavigator = {
  props: ["project", "active", "pages", "editing"],
  emits: ["change", "add", "rename", "remove", "home"],
  setup(props, { emit }) {
    const name = Vue.ref(""),
      menu = Vue.ref(null);
    const close = () => {
      if (menu.value) menu.value.open = false;
    };
    const outside = (event) => {
      if (menu.value && !menu.value.contains(event.target)) close();
    };
    Vue.onMounted(() => document.addEventListener("pointerdown", outside));
    Vue.onBeforeUnmount(() =>
      document.removeEventListener("pointerdown", outside),
    );
    Vue.watch(() => props.active, close);
    Vue.watch(
      () => [
        props.active,
        props.pages.find((p) => p.id === props.active)?.title,
      ],
      () =>
        (name.value =
          props.pages.find((p) => p.id === props.active)?.title || ""),
      { immediate: true },
    );
    return { name, menu, close };
  },
  template: `<nav class="screen-page-nav" aria-label="画面导航"><button v-for="page in pages" :key="page.id" :aria-current="active===page.id?'page':undefined" :data-page-id="page.id" @click="$emit('change',page.id)">{{(project.defaultPageId||'main')===page.id?'⌂ ':''}}{{page.title||'未命名画面'}}</button><button v-if="editing" @click="$emit('add')">＋ 添加画面</button><details v-if="editing" ref="menu" class="screen-page-menu"><summary>当前画面</summary><div><label>画面名称<input aria-label="当前画面名称" v-model="name" @change="$emit('rename',name)" /></label><button @click="$emit('home');close()" :disabled="(project.defaultPageId||'main')===active">设为首页</button><button @click="$emit('remove');close()" :disabled="active==='main'">移除当前画面</button></div></details></nav>`,
};
