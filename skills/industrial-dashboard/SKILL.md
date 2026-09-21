---
name: industrial-dashboard
description: 创建或重构可交付、可离线运行的工业监控大屏，输出 1920×1080 自适应单文件 HTML，适用于水处理、设备健康、化工安全、能源和制造驾驶舱。使用克制的工业精密视觉、稳定状态语义和可验证的 Vue 3 + ECharts 5 本地资源实现；不用于需要真实控制写入的 SCADA/HMI 操作界面或普通商业 BI 报表。
---

# Industrial Precision Dashboard

创建能够演示、投标并继续接入真实数据的工业监控大屏。优先保证信息层级、状态辨识和长期可维护性，不以堆叠霓虹、装饰动画或图表数量为目标。

## 开始前

1. 读取 [references/design-system.md](references/design-system.md)，所有页面都必须遵守状态色、字号和动效边界。
2. 根据主任务选择布局，并读取 [references/scene-layouts.md](references/scene-layouts.md)：
   - 工艺流程、物料或水处理：`process-overview`
   - 单机诊断、资产健康、预测维护：`asset-health`
   - 反应风险、联锁、应急处置：`safety-interlock`
3. 接入实时或模拟数据时读取 [references/data-contract.md](references/data-contract.md)。
4. 可从 [assets/base-dashboard.html](assets/base-dashboard.html) 复制基础骨架；不要覆盖用户已有成品。

## 输出契约

- 默认输出一个独立 HTML：引用随交付包提供的本地 Vue 3、ECharts 5 资源，加一个内联 IIFE，共三对 `script` 标签；需要三维设备时可追加本地 Three.js、控制器和模型脚本，总数不得超过六对。不得将 CDN 作为现场运行前提。
- 使用 1920×1080 固定画布和等比缩放，保留拼接屏安全边距。
- 页面必须包含：顶部态势栏、唯一主视觉、关键 KPI、报警/事件区、数据质量与更新时间状态栏。
- 颜色只能表达一种语义：青蓝为主数据，绿色为正常，琥珀色为警告，红色为报警，灰色为离线或未知。
- 主视觉优先使用内联 SVG；图表只承担趋势、频谱、分布或对比任务。
- 动效必须对应流动、旋转、扫描、报警或数值变化；停机设备停止动画。
- 模拟数据使用可重复的工况脚本，不使用每次刷新都改变业务结论的无约束随机数。

## 实现要求

- 所有 ECharts 容器有明确像素高度。
- 使用 `safeInit(id)` 初始化图表；DOM 查询后检查空值。
- `setInterval`、缩放回调和图表更新包含 `try/catch`。
- 页面明确展示 `quality`、`timestamp` 和通信状态；缺失数据不能伪装为正常的 `0`。
- 需要配置化或数据接入时，优先复用仓库的 `packages/runtime`、`packages/components` 和 `packages/data-adapters`，避免复制粘贴整页。
- 控制台零错误，文字无裁切，浅色文字不得叠在浅色面板上。
- 大屏默认只读。若用户要求可写控制，应停止沿用本 Skill 的单页交付方式，并将任务转为 SCADA/HMI 安全设计。

## 验证

完成后运行：

```bash
node scripts/validate-dashboard.js <html-file> [more-html-files]
```

再用浏览器分别以 1920×1080、1366×768、3840×2160 截图检查。验证内容应包括主状态、最高级报警、主视觉、图表、工况切换和控制台错误。
