# Components

`industrial-components.css` 保留早期共用样式。`studio/native-data.mjs` 是 01/05 的声明式资产注册表，包含 DOM/SVG 对象、原版样式、图表参数、演示数据及源哈希；通过 `python -X utf8 scripts/build_studio_templates.py` 生成，不手工修改生成文件。

当前工艺组件库提供紧凑指标卡、双轴趋势图、设备卡、四池与回流组合、泵组管网组合。实例可展开、复制、移动和逐插槽绑定。跨模板组件携带限定作用范围的样式，不覆盖宿主模板。渲染与校验统一在 `packages/runtime/studio/`。
