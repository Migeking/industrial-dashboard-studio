import { screenRoleSlot } from "../../components/studio/screen-symbols.mjs";
import { screenHistoryRows } from "./screen-widgets.mjs";

export const ScreenRuntimeTrend = {
  props: ["item", "doc", "points", "sequence"],
  setup(props) {
    const host = Vue.ref(),
      quality = Vue.ref("");
    let chart,
      observer,
      samples = [],
      last = "";
    const update = () => {
      if (!chart) return;
      const action = props.item.action,
        slot = action?.slot || screenRoleSlot(props.item, "value")?.key,
        binding = props.item.bindings[slot],
        point = props.points[binding],
        mapping = props.doc.mappings.find((m) => m.id === binding),
        now = props.doc.snapshotTime ?? Date.now();
      quality.value =
        point?.quality === "good"
          ? mapping?.kind === "dataset"
            ? "上游历史数据"
            : "从打开面板开始采样"
          : { bad: "无效", stale: "过期", offline: "离线" }[point?.quality] ||
            "未绑定";
      if (mapping?.kind === "dataset")
        samples =
          point?.quality === "good" && Array.isArray(point.value)
            ? screenHistoryRows(point.value, {
                xField: action?.timeField || "time",
                field: action?.valueField || "value",
                qualityField: action?.qualityField,
              }).map(({ x, y }) => [x, y])
            : [];
      else {
        const key = JSON.stringify([props.sequence, point?.quality, binding]);
        if (key !== last) {
          last = key;
          samples.push([
            point?.timestamp || now,
            point?.quality === "good" ? point.value : null,
          ]);
        }
        samples = samples
          .filter((r) => r[0] >= now - props.item.params.windowSeconds * 1000)
          .slice(-600);
      }
      chart.setOption(
        {
          animation: false,
          grid: { left: 55, right: 18, top: 30, bottom: 38 },
          tooltip: { trigger: "axis" },
          xAxis: {
            type: "time",
            ...(mapping?.kind === "number"
              ? { min: now - props.item.params.windowSeconds * 1000, max: now }
              : {}),
            axisLabel: { formatter: "{HH}:{mm}:{ss}", hideOverlap: true },
          },
          yAxis: {
            type: "value",
            name: props.item.params.unit || mapping?.unit || "",
            scale: true,
          },
          series: [
            {
              type: "line",
              data: samples,
              connectNulls: false,
              showSymbol: true,
              lineStyle: { color: "#227f9f" },
            },
          ],
        },
        true,
      );
    };
    Vue.onMounted(() => {
      chart = echarts.init(host.value);
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(host.value);
      update();
    });
    Vue.watch(() => [props.points, props.sequence], update, { flush: "post" });
    Vue.onBeforeUnmount(() => {
      observer?.disconnect();
      chart?.dispose();
    });
    return { host, quality };
  },
  template: `<section class="runtime-trend"><div ref="host" class="runtime-trend-host"></div><small>{{quality}}</small></section>`,
};
