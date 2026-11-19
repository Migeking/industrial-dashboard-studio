# 2.5D 画面设计能力验收

本轮在 `codex/visual-config-platform` 本地实现与验证。范围是可编辑的 2.5D 工艺监视画面：图稿、端口、测点与实时显示分开保存和渲染，既可从空白绘图，也可为已有画面换外观。

## 可用能力

| 对象 / 操作 | 实现与证据 |
| --- | --- |
| 离心泵、风机、电动阀、止回阀 | 配套透明 WebP。素材四张合计约 69 KiB，保留 alpha；清单和 SHA256 位于 `apps/scada-designer/examples/assets/depth/manifest.json`。运行状态和故障不烘焙在图片中 |
| 水箱 / 池体 | 独立池壁和动态液位，保留量程、向上/向下填充和自定义接管。坏质量显示占位符 |
| 仪表、分支、管道 | 仪表有边框与阴影，分支采用小接头，管道增加管壁、高光；折线、开放端、箭头、反向流动继续可编辑 |
| 绘图入口 | 绘图外观统一选择，支持设备缩略图；新图元和新管道继承当前外观，批量应用到选中或本页。锁定对象和自带图片不被批量覆盖，用户仍可单独切换 |
| 编辑与撤销 | 换外观只改外观字段，不改几何、端口、规则或绑定；批量切换为一条撤销，单独设备仍可回经典或监控预设 |
| 复用与交付 | 2.5D 风机导出为“我的图元”，导入另一张空白页后保持外观，初始绑定清空；重新绑定后独立发布。内置图稿随离线 HTML 打包，项目不依赖本机素材路径 |

三种画面主题和 1920×1080 / 1366×768 视口均已截图检查。05 四泵画面中，模式并入状态行，避免上下支路的铭牌互相遮挡。趋势和统计图保持二维坐标与读数；2.5D 用于设备、容器和管壁的层次。

## 本轮实测

- `python -X utf8 tests/studio_depth_ui_check.py`：生产空白编辑器上运行工艺工具回归，再测批量切换、撤销、选中切换、自带图稿保护、新图元与连续拖画管道的外观继承、图元库跨页复用、三主题、运行/停机/故障/质量恢复、发布与离线。离线实际解码四种图稿，零 HTTP 请求、零页面错误。结果在 `works/scada-depth-acceptance/results-depth.json`。
- `python -X utf8 tests/studio_scene05_ui_check.py`：从空白重建 34 个对象和 21 条管道，33 个模拟点、51 处绑定；再给四泵、集泥井、四个止回阀与全管网更换外观。逐对象比较除外观外字段相同；运行、停止、故障、零值、坏质量、恢复及离线通过。结果在 `works/scene05-visual-acceptance/results.json`。
- `node tests/studio_screen_model_check.mjs`：空白模型、类型绑定、连接引用、边界、零/假值、故障质量优先和复制引用重映射通过。
- `node skills/industrial-dashboard/scripts/validate-dashboard.js scenarios` 与 `python -X utf8 tests/interaction_check.py`：原场景静态与交互回归通过。

[05 发布画面](../screenshots/states/designer-25d-scene05.png) · [设计器入口与缩略图](../screenshots/states/designer-25d-editor.png)

## 打开与复现

本机独立演示编辑器：`http://127.0.0.1:8136`，展示端：`http://127.0.0.1:8136/view`。采用项目内嵌的模拟点，不需要现场接口。可导入工程为 `apps/scada-designer/examples/scene05-depth.json`，离线演示为 `works/scene05-visual-acceptance/scene05-depth-offline.html`。编辑器也支持新建空白页，选择“2.5D 立体”，从设备图元开始自行绘制。

原编号场景没有改写。本轮是 2.5D 组态和软件模拟验收，不含完整三维建模、设备写入或物理验收。

最后补测修复了开放管道连续拖画时后续几何事件覆盖外观默认值的问题。专项回归明确验证新管道在多次指针移动后仍保留 2.5D 管壁，撤销后恢复原管网。本机演示再次经正式 UI 导入和发布，最终离线包含 21 条管道、8 张可见设备图稿，零 HTTP 请求、零页面错误。
