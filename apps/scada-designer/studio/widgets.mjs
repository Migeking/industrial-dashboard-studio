import { fans, campusBindings, campusState } from "./model.mjs";
export const Widget = {
  props: ["n", "point", "points", "mappings", "sequence", "editing"],
  emits: ["entity"],
  setup(props, { emit }) {
    const { ref, computed, watch, onMounted, onBeforeUnmount } = Vue;
    const host = ref(),
      failure = ref("");
    let chart,
      renderer,
      observer,
      frame,
      scene,
      camera,
      asset,
      prev = 0;
    const history = [];
    const activeEntity = ref(props.n.entity),
      viewCamera = ref(props.n.camera),
      labelPositions = ref({});
    let pickHandler;
    const entityRows = computed(() =>
      campusBindings(props.n)
        .map((binding) => ({
          binding,
          fan: fans.find((f) => f.id === binding.entity),
          state: campusState(binding, props.points),
        }))
        .filter((r) => r.fan),
    );
    watch(
      () => props.n.entity,
      (id) => {
        activeEntity.value = id;
      },
    );
    watch(
      () => props.n.camera,
      (value) => {
        viewCamera.value = value;
      },
    );
    function focusEntity(id) {
      activeEntity.value = id;
      viewCamera.value = "equipment";
      if (props.editing) emit("entity", id);
    }
    function entityValue(binding) {
      const m = props.mappings.find((m) => m.id === binding.value);
      return binding.value
        ? formatted(props.points[binding.value], m) + " " + (m?.unit || "")
        : "";
    }

    const state = computed(() =>
      props.point?.quality === "good"
        ? props.point.value
          ? "运行"
          : "停止"
        : "未知",
    );
    const labels = {
      good: "有效",
      bad: "无效",
      stale: "过期",
      offline: "离线",
    };
    const formatted = (p, m) =>
      !p || p.quality !== "good"
        ? "—"
        : typeof p.value === "number"
          ? p.value.toFixed(m?.precision ?? 2)
          : String(p.value);
    const mapping = computed(() =>
      props.mappings.find((m) => m.id === props.n.binding),
    );
    const rows = computed(() =>
      props.n.binding === "*"
        ? props.mappings
            .filter((m) => m.kind !== "dataset")
            .map((m) => ({
              测点: m.label || m.id,
              读数: formatted(props.points[m.id], m),
              单位: m.unit,
              质量: labels[props.points[m.id]?.quality] || "未知",
            }))
        : props.point?.quality === "good"
          ? props.point.value
          : [],
    );
    function draw() {
      if (!chart) return;
      chart.setOption({
        animation: false,
        grid: { left: 82, right: 25, top: 14, bottom: 34 },
        tooltip: { trigger: "axis" },
        xAxis: {
          type: "category",
          data: history.map((h) => h[0]),
          axisLabel: { color: "#a3b5bb", fontSize: 17 },
        },
        yAxis: {
          type: "value",
          scale: true,
          axisLabel: { color: "#a3b5bb", fontSize: 17 },
          splitLine: { lineStyle: { color: "#304953" } },
        },
        series: [
          {
            type: props.n.series || "line",
            showSymbol: history.filter((h) => h[1] != null).length < 2,
            data: history.map((h) => h[1]),
            itemStyle: { color: "#61ddbf" },
            connectNulls: false,
          },
        ],
      });
    }
    function samplePoint() {
      history.push([
        new Date().toLocaleTimeString(),
        props.point?.quality === "good" ? props.point.value : null,
      ]);
      if (history.length > 120) history.shift();
      draw();
    }
    watch(() => props.sequence, samplePoint);
    watch(
      () => props.point?.quality,
      (q) => {
        if (q !== "good" && history.at(-1)?.[1] != null) samplePoint();
      },
    );
    watch(
      () => props.n.binding,
      () => {
        history.length = 0;
        draw();
      },
    );
    watch(() => props.n.series, draw);
    function resize() {
      if (!host.value) return;
      const { clientWidth: w, clientHeight: h } = host.value;
      if (!w || !h) return;
      chart?.resize();
      if (renderer) {
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    }
    onMounted(() => {
      if (!host.value) return;
      if (props.n.type === "chart") {
        chart = echarts.init(host.value);
        samplePoint();
      }
      if (props.n.type === "campus")
        try {
          const T = THREE;
          scene = new T.Scene();
          scene.background = new T.Color(0xb5c9ce);
          camera = new T.PerspectiveCamera(39, 1, 0.1, 650);
          renderer = new T.WebGLRenderer({ antialias: true });
          renderer.outputEncoding = T.sRGBEncoding;
          host.value.appendChild(renderer.domElement);
          const root = new T.Group();
          scene.add(root, new T.HemisphereLight(0xfff9e7, 0x738795, 1.6));
          const light = new T.DirectionalLight(0xfff1d8, 1.3);
          light.position.set(60, 110, 55);
          scene.add(light);
          asset = Campus30.create(renderer, scene, root);
          asset.setLighting("daylight");
          const colors = {
            运行: 0x33a77e,
            停止: 0x647f89,
            故障: 0xe2a448,
            未知: 0x8a9298,
            未配置: 0x8a9298,
          };
          const materials = asset.fans.map((fan, index) => {
            fan.userData.entityId = fans[index].id;
            const copies = new Map();
            fan.traverse((mesh) => {
              mesh.userData.entityId = fans[index].id;
              if (mesh.material) {
                if (!copies.has(mesh.material))
                  copies.set(mesh.material, mesh.material.clone());
                mesh.material = copies.get(mesh.material);
              }
            });
            return [...copies.values()];
          });
          const ray = new T.Raycaster(),
            pointer = new T.Vector2();
          pickHandler = (e) => {
            const rect = renderer.domElement.getBoundingClientRect();
            pointer.set(
              ((e.clientX - rect.left) / rect.width) * 2 - 1,
              (-(e.clientY - rect.top) / rect.height) * 2 + 1,
            );
            ray.setFromCamera(pointer, camera);
            const hit = ray.intersectObjects(asset.fans, true)[0];
            if (hit) focusEntity(hit.object.userData.entityId);
          };
          renderer.domElement.addEventListener("pointerup", pickHandler);
          const previousStates = [];
          let lastProjection = 0;
          function render(t) {
            const selected =
                fans.find((f) => f.id === activeEntity.value) || fans[0],
              position = asset.fans[selected.index].position;
            if (viewCamera.value === "overview") {
              camera.position.set(98, 105, 136);
              camera.lookAt(0, 15, 0);
            } else if (viewCamera.value === "energy") {
              camera.position.set(-8, 56, 90);
              camera.lookAt(-47, 12, 39);
            } else {
              camera.position.set(
                position.x + 15,
                position.y + 15,
                position.z + 19,
              );
              camera.lookAt(position.x, position.y - 1, position.z);
            }
            const bindings = campusBindings(props.n);
            asset.fans.forEach((fan, index) => {
              const binding = bindings.find((b) => b.entity === fans[index].id),
                status = campusState(binding, props.points);
              if (status === "运行")
                fan.rotation.y += Math.min(0.1, (t - prev) / 1000) * 3;
              if (previousStates[index] !== status) {
                materials[index].forEach((mat) =>
                  mat.color.setHex(colors[status]).convertSRGBToLinear(),
                );
                previousStates[index] = status;
              }
            });
            prev = t;
            renderer.render(scene, camera);
            if (t - lastProjection > 150) {
              const positions = {};
              asset.fans.forEach((fan, index) => {
                const p = fan.getWorldPosition(new T.Vector3());
                p.y += 4;
                p.project(camera);
                if (
                  p.z > -1 &&
                  p.z < 1 &&
                  Math.abs(p.x) < 0.95 &&
                  Math.abs(p.y) < 0.95
                )
                  positions[fans[index].id] = {
                    left: (p.x + 1) * 50 + "%",
                    top: (1 - p.y) * 50 + "%",
                  };
              });
              labelPositions.value = positions;
              renderer.domElement.dataset.rotations = asset.fans
                .map((f) => f.rotation.y.toFixed(3))
                .join(",");
              renderer.domElement.dataset.states = previousStates.join(",");
              lastProjection = t;
            }
            frame = requestAnimationFrame(render);
          }
          frame = requestAnimationFrame(render);
        } catch (e) {
          failure.value = "三维渲染不可用：" + e.message;
        }
      observer = new ResizeObserver(resize);
      observer.observe(host.value);
      resize();
    });
    onBeforeUnmount(() => {
      observer?.disconnect();
      chart?.dispose();
      cancelAnimationFrame(frame);
      if (scene) {
        const resources = new Set();
        scene.traverse((o) => {
          if (o.geometry) resources.add(o.geometry);
          for (const m of [].concat(o.material || [])) {
            resources.add(m);
            Object.values(m)
              .filter((t) => t?.isTexture)
              .forEach((t) => resources.add(t));
          }
        });
        resources.forEach((r) => r.dispose());
        scene.environment?.dispose();
      }
      if (pickHandler)
        renderer?.domElement.removeEventListener("pointerup", pickHandler);
      renderer?.dispose();
      renderer?.forceContextLoss();
    });
    return {
      host,
      failure,
      state,
      formatted,
      mapping,
      rows,
      labels,
      fans,
      entityRows,
      activeEntity,
      viewCamera,
      labelPositions,
      focusEntity,
      entityValue,
    };
  },
  template: `<div class="widget">
 <template v-if="n.type==='kpi'"><strong class="number">{{formatted(point,mapping)}}</strong> <span>{{mapping?.unit}}</span></template>
 <div v-if="n.type==='status'" :class="['state',state==='运行'?'running':'']"><i></i>{{state}}</div>
 <p v-if="n.type==='text'">{{n.text}}</p><img v-if="n.type==='image'&&n.image" :src="n.image" :alt="n.title">
 <svg v-if="n.type==='flow'" viewBox="0 0 900 125"><path d="M80 64 H820" :stroke="state==='运行'?'#5adbb9':'#6e838a'" stroke-width="9"/><g v-for="(step,i) in n.steps.split(',').slice(0,6)" :transform="'translate('+((i+.5)*900/Math.min(6,n.steps.split(',').length))+',64)'"><rect x="-65" y="-32" width="130" height="64" rx="5" fill="#203b45" stroke="#76b8aa"/><text text-anchor="middle" y="9" fill="white" font-size="24">{{step}}</text></g></svg>
 <div class="data-table" v-if="n.type==='table'"><table v-if="rows?.length"><thead><tr><th v-for="(_,k) in rows[0]">{{k}}</th></tr></thead><tbody><tr v-for="r in rows"><td v-for="(_,k) in rows[0]">{{r[k]}}</td></tr></tbody></table><span v-else>暂无有效行</span></div>
 <div v-if="['chart','campus'].includes(n.type)" ref="host" class="host"></div><div v-if="n.type==='campus'" class="campus-labels"><button v-for="row in entityRows.filter(r=>labelPositions[r.fan.id])" :key="row.fan.id" :style="labelPositions[row.fan.id]" :data-object="row.fan.id" :data-state="row.state" @click="focusEntity(row.fan.id)">{{row.fan.label}} · {{row.state}}<br><span v-if="row.binding.value">{{entityValue(row.binding)}}</span></button></div>
 <div v-if="n.type==='campus'" class="campus-controls"><button @click="viewCamera='energy'">能源中心</button><button @click="viewCamera='overview'">园区全景</button><button v-for="row in entityRows" :data-device="row.fan.id" :data-state="row.state" @click="focusEntity(row.fan.id)">{{row.fan.label}} · {{row.state}}</button></div><small v-if="failure">{{failure}}</small>
 <footer v-if="['flow','status','kpi','chart'].includes(n.type)">{{mapping?.label||n.binding}} · {{labels[point?.quality]||'未知'}}</footer></div>`,
};
