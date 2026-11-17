# 产品架构基线

原有 30 套独立场景继续用于展示与设计参考。新建项目使用独立 `screen-document`：空白画布、单设备图元、端口管道和统一运行投影。既有 V1、01/05 的 V2 文档继续由原渲染器打开。三种格式共用连接、数据质量、草稿、版本和发布服务；不自动转换旧项目，不继续按模板数量迁移。新设计器首个贯通版本已集成，范围见 [验收记录](acceptance/screen-designer.md)，完整目标见 [实施方案](plans/scada-screen-designer.md)。

## 目录和职责

| 位置 | 当前职责 |
| --- | --- |
| `apps/scada-designer/server.mjs` | 本地 HTTP、只读代理与协议采集进程、原子保存、版本发布、离线打包 |
| `apps/scada-designer/studio/` | 用户流程、对象树、画布与属性、点表管理、V1 文档与组件 |
| `apps/scada-designer/studio/screen-inspector.mjs` | 新画面外观、几何输入草稿和按类型过滤的命名槽位选点 |
| `packages/runtime/studio/screen-model.mjs` | 空白文档、几何/端口校验、实例复制、绑定与质量显示语义 |
| `packages/runtime/studio/screen-renderer.mjs` | X6 小型适配、手势、端口管道、实时投影、图表及只读设备详情 |
| `packages/components/studio/screen-symbols.mjs` | 独立 SVG 图元、端口和槽位定义，不引用场景布局或 CSS |
| `vendor/x6.min.js` | 本地固定的 X6 3.1.7 UMD；许可与完整哈希见 `vendor/licenses/x6-notice.md` |
| `packages/runtime/studio/native-model.mjs` | V2 校验、插槽、有限显示规则、组合件提取和复制引用 |
| `packages/runtime/studio/native-renderer.mjs` | 编辑/发布/离线共用 DOM/SVG、ECharts 生命周期、演示面板 |
| `packages/components/studio/native-data.mjs` | 01/05 图元、样式、默认布局、演示数据和源文件哈希 |
| `scripts/build_studio_templates.py` | 从可信原版生成声明式资产，未知表达式使构建失败 |
| `scenarios/`、`apps/showcase/` | 原版作品与展示入口，不等同于全部已迁移模板 |

新文档保存 `format: "screen-document"`、`version: 1`、1920×1080 `canvas`、`nodes`、`pipes`、`source` 与 `mappings`。节点保存图元类型、几何、外观、参数和槽位绑定；管道保存 `{nodeId, portId}` 两端及转折点，不把绝对 SVG 路径当作设备连接关系。移动或变换设备时由端口重新求路。X6 只负责交互视图，不把引擎的原始 JSON 当业务文件。

实时值只投影到 SVG/ECharts，不修改文档或撤销记录。撤销沿用现有文档快照，一次指针手势对应一次记录；复制重映射内部端点并清空新设备绑定。编辑、预览、展示、离线复用同一新渲染器，展示端不启用绘图操作；设备面板只显示绑定读数。新代码不执行文档中的任意脚本。

旧 V2 是有父子关系的对象图。Shadow DOM 隔离原版 CSS 与编辑器，HTML/SVG 由旧共享渲染器生成；组合件可展开到设备、标签和管道。它作为兼容路径保留，不能替代新图元库。

## 数据边界

一个页面共用一条 JSON、CSV、REST、WebSocket、OPC UA 或 Modbus TCP 连接；多源聚合由上游网关提供快照。统一映射输出数值、布尔、文本或行数据集，并携带质量与时间。零和 false 有效，缺失、坏质量、过期、离线显示未知；真实源不回退到演示数据。历史序列接收 `time/value` 行，数值曲线从连接时开始采样。

演示工况只在标明 `source.demo=true` 的本地 JSON 页面可切换。05 的模式、启停、频率和液位设定使用本地两步确认与演示审计；真实连接只读，控制按钮禁用。通信通过不等于物理设备验收。

## 发布与交付

服务按格式分派校验，草稿和最近五个发布版本仍在 `works/studio/project.json` 原子保存。新格式校验画布边界、对象身份、图元参数、端口引用、转折点和必需槽位；引用错误阻止保存，缺少必需绑定阻止发布。`/view` 读取发布版本，修改草稿不直接改变展示端。离线 HTML 内含配置、当前样本和全部本地依赖（包括 X6），使用同一渲染器；真实源导出的快照保持只读。

## 横屏体验

全部画布以 1920×1080 为基准，验证 1366×768、1920×1080、3840×2160 等比展示。新画布以鼠标与表单从零作图作为主验收；旧 V2 的原版截图成绩仅用于兼容回归。首个贯通版本尚未完成标尺/手动缩放、通用显示规则、图元库保存、完整驾驶舱组件与规模性能验收；完整三维建模不在首版范围。

## 迁移原则

`MyWord` 中的原始成果保留为来源和运营资产；本工作区是后续产品开发的唯一工作目录。两边不做反向自动同步，避免内容项目和产品代码再次互相污染。
