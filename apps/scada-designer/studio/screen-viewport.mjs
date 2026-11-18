export function useScreenViewport(stage, screen, editing, fitZoom) {
  const { reactive, computed, onMounted, onBeforeUnmount, watch } = Vue;
  const view = reactive({
    manual: 0,
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    panTool: false,
    space: false,
    dragging: false,
    leftCollapsed: false,
    rightCollapsed: false,
    cursor: null,
  });
  view.scale = computed(() =>
    !screen.value || !editing.value
      ? fitZoom.value
      : view.manual ||
        Math.min(
          Math.max(1, view.width - 44) / 1920,
          Math.max(1, view.height - 44) / 1080,
        ),
  );
  view.style = computed(() => ({
    transform: `translate(calc(-50% + ${screen.value && editing.value ? view.x : 0}px),calc(-50% + ${screen.value && editing.value ? view.y : 0}px)) scale(${view.scale})`,
  }));
  const ticks = (axis) => {
    const step = view.scale < 0.35 ? 200 : view.scale < 0.75 ? 100 : 50,
      limit = axis === "x" ? 1920 : 1080,
      size = axis === "x" ? view.width : view.height,
      pan = axis === "x" ? view.x : view.y,
      values = [];
    for (let v = 0; v <= limit; v += step) {
      const p = size / 2 + pan + (v - limit / 2) * view.scale;
      if (p >= 22 && p <= size) values.push({ v, p });
    }
    return values;
  };
  view.xTicks = computed(() => ticks("x"));
  view.yTicks = computed(() => ticks("y"));
  view.fit = () => {
    view.manual = 0;
    view.x = 0;
    view.y = 0;
  };
  view.setZoom = (value, anchor) => {
    if (Number(value) === 0) {
      view.fit();
      return;
    }
    const old = view.scale,
      next = Math.max(0.1, Math.min(3, Number(value))),
      a = anchor || { x: 0, y: 0 };
    view.x = a.x - ((a.x - view.x) * next) / old;
    view.y = a.y - ((a.y - view.y) * next) / old;
    view.manual = next;
  };
  view.zoomBy = (factor) => view.setZoom(view.scale * factor);
  view.wheel = (event) => {
    if (!screen.value || !editing.value || !event.ctrlKey) return;
    event.preventDefault();
    const b = stage.value.getBoundingClientRect();
    view.setZoom(view.scale * (event.deltaY > 0 ? 1 / 1.15 : 1.15), {
      x: event.clientX - b.x - b.width / 2,
      y: event.clientY - b.y - b.height / 2,
    });
  };
  let drag, observer;
  view.start = (event) => {
    if (
      !screen.value ||
      !editing.value ||
      !(
        event.button === 1 ||
        (event.button === 0 && (view.panTool || view.space))
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    drag = { mx: event.clientX, my: event.clientY, x: view.x, y: view.y };
    view.dragging = true;
  };
  const move = (event) => {
    if (!screen.value || !editing.value || !stage.value) return;
    const b = stage.value.getBoundingClientRect();
    view.cursor = {
      x: Math.round(
        (event.clientX - b.x - b.width / 2 - view.x) / view.scale + 960,
      ),
      y: Math.round(
        (event.clientY - b.y - b.height / 2 - view.y) / view.scale + 540,
      ),
    };
    if (drag) {
      view.x = drag.x + event.clientX - drag.mx;
      view.y = drag.y + event.clientY - drag.my;
    }
  };
  const up = () => {
    drag = null;
    view.dragging = false;
  };
  const key = (event) => {
    if (
      event.code !== "Space" ||
      event.target.closest?.(
        "input,textarea,select,button,summary,[contenteditable=true]",
      ) ||
      !screen.value ||
      !editing.value
    )
      return;
    view.space = event.type === "keydown";
    event.preventDefault();
  };
  onMounted(() => {
    observer = new ResizeObserver(() => {
      view.width = stage.value.clientWidth;
      view.height = stage.value.clientHeight;
    });
    observer.observe(stage.value);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", up);
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    window.removeEventListener("keydown", key);
    window.removeEventListener("keyup", key);
    window.removeEventListener("blur", up);
  });
  watch(editing, () => {
    up();
    view.space = false;
  });
  return view;
}
export const ScreenViewportTools = {
  props: ["view"],
  emits: ["pan"],
  template: `<div class="screen-view-tools"><button :aria-label="view.leftCollapsed?'展开图元面板':'收起图元面板'" @click="view.leftCollapsed=!view.leftCollapsed">图元</button><button aria-label="缩小画布" @click="view.zoomBy(1/1.25)">−</button><select aria-label="画布缩放" :value="view.manual" @change="view.setZoom(Number($event.target.value))"><option :value="0">适应</option><option v-if="view.manual&&![.25,.5,.75,1,1.5,2,3].includes(view.manual)" :value="view.manual">{{Math.round(view.manual*100)}}%</option><option v-for="z in [.25,.5,.75,1,1.5,2,3]" :value="z">{{z*100}}%</option></select><button aria-label="放大画布" @click="view.zoomBy(1.25)">+</button><button :aria-pressed="view.panTool" @click="view.panTool=!view.panTool;$emit('pan')">平移</button><button @click="view.fit()">适应画面</button><button :aria-label="view.rightCollapsed?'展开属性面板':'收起属性面板'" @click="view.rightCollapsed=!view.rightCollapsed">属性</button></div>`,
};
export const ScreenRulers = {
  props: ["view"],
  template: `<div class="screen-rulers" aria-hidden="true"><div class="ruler-corner"></div><div class="ruler-horizontal"><i v-for="t in view.xTicks" :style="{left:t.p+'px'}">{{t.v}}</i></div><div class="ruler-vertical"><i v-for="t in view.yTicks" :style="{top:t.p+'px'}">{{t.v}}</i></div><small v-if="view.cursor" class="ruler-coordinates">X {{view.cursor.x}} · Y {{view.cursor.y}}</small></div>`,
};
