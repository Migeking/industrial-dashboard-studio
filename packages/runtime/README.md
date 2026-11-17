# Runtime

`dashboard-runtime.js` 服务原独立场景。配置工作台新增 `studio/native-model.mjs` 与 `studio/native-renderer.mjs`，负责 V2 对象图校验、绑定插槽、有限规则、复制引用、DOM/SVG/ECharts 生命周期和本地演示面板。编辑器、发布展示端及离线 HTML 共用该渲染器。

V1 读取与组件继续保留在 `apps/scada-designer/studio/`。两版本共用数据规范化、时间/质量、工业协议点表、保存和发布；不对原项目强制迁移。详见 [架构说明](../../docs/architecture.md)。
