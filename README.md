# Industrial Dashboard Studio

> 工业大屏产品化工作区 · 11 套离线可运行样板 + 可复用运行时 + SCADA 设计器 + 4 个可交付 Skill

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Canvas: 1920×1080](https://img.shields.io/badge/canvas-1920%C3%971080-0ea5e9)](docs/architecture.md)
[![Offline Ready](https://img.shields.io/badge/offline-ready-brightgreen)](docs/offline-delivery.md)
[![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D)](vendor/vue.global.prod.js)
[![ECharts 5](https://img.shields.io/badge/ECharts-5-AA344D)](vendor/echarts.min.js)
[![Three.js](https://img.shields.io/badge/Three.js-r160-black)](vendor/three.min.js)

[简体中文](#简介) | [English](#english-summary)

![Showcase 总览](docs/screenshots/showcase.png)

**一键打开即演示，无需安装依赖。** 所有 Vue 3 / ECharts 5 / Three.js 已固化在 `vendor/`，1920×1080 基准画布等比缩放至 1366×768 / 3840×2160 与拼接屏，横屏优先，演示数据内置。

---

## 简介

`industrial-dashboard-studio` 把水务、设备健康、化工安全三类监控样板沉淀为**可复用运行时、场景配置、HMI/SCADA 基础能力**和**可交付 Skill** 的产品化仓库。

- **离线可运行**：零 CDN，`vendor/` 固化全部依赖，`release/industrial-dashboard-offline.zip` 解压即用
- **信息层级优先**：克制的工业精密视觉，状态色唯一语义（青蓝主数据 / 绿正常 / 琥珀预警 / 红报警 / 灰离线）
- **只读演示**：内置工况脚本（稳态/高负荷/故障/恢复），明确 `quality` / `timestamp` / 通信状态，不伪造现场接入
- **渐进式产品化**：`scenarios/` 独立可演示，`packages/` 逐步抽取运行时与适配器，不破坏现有样板

> 原始成果与运营素材保留在 `MyWord`，本仓库是产品开发唯一工作目录。

---

## 效果总览

> 以下截图基于 Playwright 在 1920×1080 视口下自动生成（`docs/screenshots/`），覆盖全部本地可运行页面。生成脚本见历史 `scripts/screenshot.js`，需 `playwright-core`。

| 入口 | 预览 |
|------|------|
| **Showcase 横屏互动入口** `apps/showcase/index.html` | ![showcase](docs/screenshots/showcase.png) |
| **SCADA 场景设计器** `apps/scada-designer/index.html` | ![scada-designer](docs/screenshots/scada-designer.png) |

<details>
<summary><b>点击展开 10 套场景全量截图</b></summary>

### 水处理 · 工艺驾驶舱

| 场景 | 文件 | 预览 |
|------|------|------|
| 01 A2O 脱氮除磷精准调控驾驶舱 | `scenarios/water-treatment/01-A2O脱氮除磷精准调控驾驶舱.html` | ![01](docs/screenshots/01-a2o-overview.png) |
| 04 污泥回流泵联动控制驾驶舱 | `scenarios/water-treatment/04-污泥回流泵联动控制驾驶舱.html` | ![04](docs/screenshots/04-sludge-pump.png) |

### 水处理 · SCADA 操作终端

| 场景 | 文件 | 预览 |
|------|------|------|
| 05 污泥回流泵站 SCADA 操作终端 | `scenarios/water-treatment/05-污泥回流泵站SCADA操作终端.html` | ![05](docs/screenshots/05-pump-station-scada.png) |
| 06 A2O 脱氮除磷 SCADA 操作终端 | `scenarios/water-treatment/06-A2O脱氮除磷SCADA操作终端.html` | ![06](docs/screenshots/06-a2o-scada.png) |
| 07 A2O 脱氮除磷经典上位 SCADA | `scenarios/water-treatment/07-A2O脱氮除磷经典上位SCADA.html` | ![07](docs/screenshots/07-a2o-classic-scada.png) |

### 水处理 · 3D 数字孪生 HMI

| 场景 | 文件 | 预览 |
|------|------|------|
| 08 预处理进水井 3D 交互 HMI | `scenarios/water-treatment/08-预处理进水井3D交互HMI.html` | ![08](docs/screenshots/08-pretreatment-3d.png) |
| 09 预处理进水井浅色 3D 数字孪生 HMI | `scenarios/water-treatment/09-预处理进水井浅色3D数字孪生HMI.html` | ![09](docs/screenshots/09-pretreatment-light3d.png) |
| 10 地下调蓄池水力冲洗数字孪生 HMI | `scenarios/water-treatment/10-地下调蓄池水力冲洗数字孪生HMI.html` | ![10](docs/screenshots/10-storage-flush.png) |
| 11 MBR 膜生物反应池抽吸清洗数字孪生 HMI | `scenarios/water-treatment/11-MBR膜生物反应池抽吸清洗数字孪生HMI.html` | ![11](docs/screenshots/11-mbr-clean.png) |

### 设备维护 / 反应安全

| 场景 | 文件 | 预览 |
|------|------|------|
| 02 关键机组预测性维护驾驶舱 | `scenarios/predictive-maintenance/02-关键机组预测性维护驾驶舱.html` | ![02](docs/screenshots/02-predictive-maintenance.png) |
| 03 反应釜热失控安全联锁舱 | `scenarios/reactor-safety/03-反应釜热失控安全联锁舱.html` | ![03](docs/screenshots/03-reactor-safety.png) |

### 三维模型

| 模型 | 预览 |
|------|------|
| NGT200 空气悬浮鼓风机 参数化模型 `assets/models/ngt200/preview.html` | ![ngt200](docs/screenshots/ngt200-model.png) |

</details>

> `works/` 目录另保留 11 张设计过程稿（1366/1920/3840 多分辨率），`release/` 保留投标用预览图 `showcase-preview.png` / `scada-designer-preview.png`。

---

## 快速开始

```bash
# 1. 克隆
git clone https://github.com/Migeking/industrial-dashboard-studio.git
cd industrial-dashboard-studio

# 2. 直接用浏览器打开（无需 npm install）
# Windows
start apps/showcase/index.html
# macOS / Linux
open apps/showcase/index.html
# 或直接双击文件
```

**手机/平板请横屏使用**，竖屏会自动提示旋转。入口层负责方向提示与全屏，场景层专注 1920×1080 信息层级。

```bash
# 体验 SCADA 设计器
open apps/scada-designer/index.html
# 可编辑标题、主题色、设备与状态，导出 JSON 配置
```

---

## 场景详解

### 01 A2O 脱氮除磷精准调控驾驶舱
- **布局**：`process-overview` — 中央 52%~60% SVG 工艺流程，左翼入口条件/质量指标，右翼设备群/报警，底部达标趋势
- **信息问题**：介质从哪里来、流向哪里、哪个环节偏离、控制策略是否有效
- **文件**：`scenarios/water-treatment/01-A2O脱氮除磷精准调控驾驶舱.html`

### 02 关键机组预测性维护驾驶舱
- **布局**：`asset-health` — 左翼风险排序设备列表，中央结构图+测点，中央下部频谱/RUL，右翼诊断证据与工单
- **信息问题**：哪台设备、什么异常、证据是什么、还能运行多久、需要采取什么动作

### 03 反应釜热失控安全联锁舱
- **布局**：`safety-interlock` — 顶部安全态势与最高报警，中央危险源+联锁链，左翼阈值/SIS，右翼事件时间线，底部关键趋势
- **信息问题**：风险是否发生、由什么触发、保护是否动作、当前是否受控、下一步做什么
- **安全语义**：红色仅用于报警与联锁动作，不作为主题色

### 04 污泥回流泵联动控制驾驶舱
- 厂区全景联动视角，泵组启停联动与回流比控制策略可视化

### 05 污泥回流泵站 SCADA 操作终端
- 经典 SCADA 终端形态，泵站工艺图 + 实时点位 + 报警条

### 06 A2O 脱氮除磷 SCADA 操作终端
- 生化池 SCADA 集中监控，支持手自动模式与 PID 回路

### 07 A2O 脱氮除磷经典上位 SCADA
- ISA-101 灰度低疲劳风格，西门子 Faceplate 规范，垂直彩色棒图与立体下凹 I/O 域

### 08 预处理进水井 3D 交互 HMI（深色）
- Three.js 程序化白模 + 混凝土/金属/水体材质差异，OrbitControls 交互，流动与格栅动作绑定运行状态

### 09 预处理进水井浅色 3D 数字孪生 HMI（浅色）
- 浅灰蓝单主题，双层顶栏，右侧单一控制面板，底部连续状态模块，长期值守低疲劳
- 多分辨率设计稿见 `works/09-*`

### 10 地下调蓄池水力冲洗数字孪生 HMI
- 调蓄池冲洗工艺数字孪生，水力路径与阀位联动

### 11 MBR 膜生物反应池抽吸清洗数字孪生 HMI
- MBR 膜池抽吸与反洗工艺，高品质再生水产水链路，浅色 3D 数字孪生风格

---

## 应用入口

### Showcase 横屏互动体验入口 `apps/showcase/index.html`
- 三场景切换、横屏方向提示、全屏体验、1920×1080 等比缩放
- 源码 `12304` 字节，零构建，离线可直接投标演示

### SCADA 场景设计器 `apps/scada-designer/index.html`
- 可编辑：标题、主题色、设备列表、设备状态
- 能力：实时预览、导出 JSON 配置、与 `packages/runtime` 联动
- 适合：快速拼装新场景、客户现场参数化配置

![SCADA Designer](docs/screenshots/scada-designer.png)

---

## 三维与素材

### NGT200 空气悬浮鼓风机 `assets/models/ngt200/`
- 参数化三维模型 `ngt200-model.js` + 预览页 `preview.html`，用于 01/04 等场景的鼓风机设备可视化
- 本地 Three.js + OrbitControls，无外部模型依赖

```
assets/models/ngt200/
  ngt200-model.js   # 参数化几何与材质
  preview.html      # 独立预览
  README.md
assets/models/water-process/water-process.js  # 水处理构筑物白模
```

---

## 目录结构

```
apps/
  showcase/            # 横屏互动体验入口
  scada-designer/      # SCADA 场景设计器
scenarios/
  water-treatment/     # 01,04,05,06,07,08,09,10,11 (水务全链路)
  predictive-maintenance/ # 02
  reactor-safety/      # 03
packages/
  runtime/             # 场景加载、主题、缩放、时钟、全屏、质量标签
  components/          # 工业组件样式 (industrial-components.css)
  data-adapters/       # demo / rest / websocket 三类适配器
  design-system/       # Token (tokens.css)
skills/                # 4 个可复用 Skill，见下节
vendor/                # 固化依赖：vue.global.prod.js / echarts.min.js / three.min.js / OrbitControls.js
assets/models/         # 三维模型
docs/
  architecture.md      # 架构基线
  offline-delivery.md  # 离线交付说明
  screenshots/         # 13 张自动截图（本 README 引用）
tests/interaction_check.py
release/               # 离线交付包与预览图
works/                 # 11 张设计过程稿（多分辨率）
```

---

## Skill 完整说明

> Skill 是可复用的 Codex / OpenCode 交付规范，位于 `skills/`，每个 Skill 包含 `SKILL.md`、 `references/`、 `scripts/validate-*.js` 与 `agents/openai.yaml`。

### 1) industrial-dashboard — 工业精密驾驶舱

**定位**：创建或重构可交付、可离线运行的工业监控大屏，输出 1920×1080 自适应单文件 HTML。适用于水处理、设备健康、化工安全、能源和制造驾驶舱。**不用于**需要真实控制写入的 SCADA/HMI 操作界面或普通商业 BI 报表。

**前置阅读**：
1. `references/design-system.md` — 状态色、字号、动效边界
2. `references/scene-layouts.md` — 按任务选 `process-overview` / `asset-health` / `safety-interlock`
3. `references/data-contract.md` — 实时点位与工况脚本契约
4. `assets/base-dashboard.html` — 基础骨架（勿覆盖用户成品）

**输出契约**：
- 单文件 HTML：2 个本地资源（Vue 3 + ECharts 5）+ 1 个内联 IIFE = 3 对 `script`；需 3D 时追加 Three.js/控制器/模型，总数 ≤6 对，**禁止 CDN 为运行前提**
- 1920×1080 固定画布等比缩放，保留拼接屏安全边距
- 必须包含：顶部态势栏、唯一主视觉、关键 KPI、报警/事件区、数据质量与更新时间状态栏
- 颜色语义唯一：青蓝主数据、绿正常、琥珀预警、红报警、灰离线；主视觉优先内联 SVG
- 动效对应流动/旋转/扫描/报警；停机设备停止动画；模拟数据使用可重复工况脚本

**使用方法**：

```bash
# 在任意 Codex / OpenCode 会话中加载 Skill
# 1. 复制骨架
cp skills/industrial-dashboard/assets/base-dashboard.html my-dashboard.html

# 2. 按 scene-layouts 选择布局并开发

# 3. 校验（支持多文件）
node skills/industrial-dashboard/scripts/validate-dashboard.js scenarios
node skills/industrial-dashboard/scripts/validate-dashboard.js my-dashboard.html
```

**校验项**：ECharts 容器高度、`safeInit`、空值检查、`try/catch`、quality/timestamp 展示、控制台零错误、文字无裁切。

---

### 2) industrial-hmi-classic — 经典工业上位机 SCADA（水务版）

**定位**：面向市政水务（污水厂/自来水厂/泵站/调蓄池）的西门子博途（TIA Portal / WinCC）风格经典 SCADA。服务于**值守 8~12 小时**的操作员与工艺工程师。

**核心特征**：
- **ISA-101 灰度哲学**：`#DDE2E8` 冷灰基底，正常低饱和静默，异常高对比激活
- **城镇水务管网色标**：污水/回流污泥/清水/曝气/碳源药液行业标准色 + 正交走线 + 跨线弧（Jumper）
- **P&ID 图元库**：池体侧立面剖面带米标尺、潜水泵/离心鼓风机/隔膜计量泵、AIT/FIT/LIT 气泡、立体下凹 I/O 域
- **西门子 Faceplate**：0~100% 量程、HH/H/L/LL 标尺、SP 黄金三角游标、±0.1 点动、手自动、PID 曲线、SBO 两步确认
- **中控交互**：工艺工段切换树、三级权限锁、S7-1500 看门狗、多笔同轴 Trend、常驻报警消音确认栏

**前置阅读**：
1. `references/isa101-style-guide.md`
2. `references/water-treatment-pid-library.md`
3. `references/siemens-water-faceplate.md`

**使用方法**：
```bash
node skills/industrial-hmi-classic/scripts/validate-hmi.js scenarios/water-treatment/07-*.html
```

---

### 3) industrial-scada — Web SCADA / HMI 操作终端

**定位**：面向过程控制、设备操作与中控监视的 **Web SCADA**。与只读驾驶舱不同，以**闭环控制、操作防误、状态回读与安全联锁**为核心。

**核心契约**：
- **双向数据流**：点位 `writable` 属性，写入与回读分离，禁止假更新
- **SBO 两步确认**：点击设备 → Faceplate 小面板 → 危险指令二级确认 → 看门狗计时 → ACK 更新
- **Faceplate 体系**：泵/风机/电机（手自动/启停/复位/工时/联锁）、变频器（28.0~50.0 Hz 限幅）、PID 回路（PV/SP/OP + 趋势）
- **告警条**：顶部常驻最高等级，未确认红色闪烁+蜂鸣，提供消音/确认
- **审计追踪**：底部流水日志记录时间/工号/对象/旧值/新值/结果

**安全要求**：前端硬限幅、1.5s 看门狗超时回退、控制权指示（中控/就地/锁定）、控制台零错误。

**前置阅读**：
1. `references/control-safety-contract.md`
2. `references/faceplate-specification.md`
3. `references/tag-point-table.md`（DI/DO/AI/AO 读写与量程）
4. `references/alarm-lifecycle.md`（ISA-18.2 状态机）

**使用方法**：
```bash
node skills/industrial-scada/scripts/validate-scada.js scenarios/water-treatment/05-*.html
node skills/industrial-scada/scripts/validate-scada.js scenarios/water-treatment/06-*.html
```

---

### 4) light-3d-water-hmi — 浅色 3D 水务 HMI

**定位**：浅灰蓝、白模三维水工构筑物为主视觉的数字孪生 HMI。适用于污水厂/自来水厂/泵站预处理 1920×1080 监控页。**不用于**深色驾驶舱或经典 P&ID。

**输出要求**：
- 浅色单主题，双层顶栏，中部白模构筑物，右侧单一控制面板，底部连续状态模块
- 混凝土/金属/水体/管道材质清晰区分，整体低饱和，蓝色仅选中/主数据，绿色仅正常
- 3D 动效仅表达水流/阀位/泵组/格栅，停机关停；明确标注演示模式

**使用方法**：
```bash
node skills/light-3d-water-hmi/scripts/validate-light-3d-hmi.js scenarios/water-treatment/08-*.html
# 再以 1920×1080 / 1366×768 / 3840×2160 检查构图与相机视野
```

**参考**：`references/visual-system.md`

---

### Skill 在 Codex / OpenCode 中的加载

```yaml
# skills/industrial-dashboard/agents/openai.yaml 已提供 Agent 配置
# 在支持 Skill 的环境中可直接引用：
# - industrial-dashboard
# - industrial-hmi-classic
# - industrial-scada
# - light-3d-water-hmi
```

---

## 运行时与数据适配器

### Runtime `packages/runtime/dashboard-runtime.js`
```js
DashboardRuntime.isLandscape()              // 横竖屏判断
DashboardRuntime.requestFullscreen(el)      // 全屏切换
DashboardRuntime.bindFullscreen(btn, el)    // 绑定全屏按钮
DashboardRuntime.createClock(el)            // 1s 时钟，返回取消函数
DashboardRuntime.qualityLabel(value)        // GOOD/DEGRADED/UNKNOWN 标签
```

### Data Adapters `packages/data-adapters/`
| 适配器 | 场景 | 说明 |
|--------|------|------|
| `demo-adapter.js` | 演示/投标 | 本地定时工况脚本，默认 |
| `rest-adapter.js` | 轻量交付 | REST 轮询，统一契约 |
| `websocket-adapter.js` | 实时接入 | WebSocket 推送，需确认字段/频率/权限 |

统一数据契约见 `skills/industrial-dashboard/references/data-contract.md`：

```json
{
  "tagId": "A2O.DO.AEROBIC_01",
  "value": 2.3,
  "unit": "mg/L",
  "quality": "GOOD",
  "timestamp": "2026-09-19T17:30:00+08:00",
  "alarmState": "NORMAL",
  "writable": false
}
```

> 在数据契约确认前，不将演示页宣称为现场 SCADA。控制写入需转入 `industrial-scada` 安全设计。

---

## 设计系统

Token 见 `packages/design-system/tokens.css` 与 `skills/industrial-dashboard/references/design-system.md`：

```css
:root {
  --bg: #071019; --surface-1: #0b1622; --surface-2: #0f1d2a;
  --line: #20394a; --accent: #36c2ff;
  --success: #35d07f; --warning: #ffb547; --danger: #ff5d5d; --offline: #708594;
  --text-1: #f2f7fa; --text-2: #a8bac8;
  --radius: 8px; --gap: 14px;
}
```

- 标题 34–40px / KPI 36–52px（`tabular-nums`）/ 面板标题 18–20px
- 面板 1px 低对比边框 + 8px 圆角 + 轻内高光，禁止霓虹外发光
- 网格：12 栏，间距 12–16px，顶部 72–80px，底部状态栏 40–48px，安全边距 16–24px
- 动效：管道 1.8–3.2s 循环，竖轴搅拌器用横向投影模拟绕竖轴旋转（非平面 360° 旋转），支持 `prefers-reduced-motion`

---

## 验证与离线交付

### 验证

```bash
# 全部场景
node skills/industrial-dashboard/scripts/validate-dashboard.js scenarios
python -X utf8 tests/interaction_check.py

# 单 Skill 校验
node skills/industrial-hmi-classic/scripts/validate-hmi.js <file>
node skills/industrial-scada/scripts/validate-scada.js <file>
node skills/light-3d-water-hmi/scripts/validate-light-3d-hmi.js <file>

# 截图（已用于本 README）
node scripts/screenshot.js
# 视口 1920×1080，输出至 docs/screenshots/
```

### 离线交付

```powershell
./scripts/build-release.ps1
# 输出 -> release/industrial-dashboard-offline.zip (约 1.07 MB)
```

解压后打开 `apps/showcase/index.html` 即可。交付包含：体验入口与设计器、三套样板、本地依赖、三维模型、运行时与 Skill、产品文档。详见 `docs/offline-delivery.md`。

---

## 技术栈

- Vue 3 (CDN prod 本地固化) · ECharts 5 · Three.js r160 + OrbitControls
- 纯 HTML/CSS/JS，单文件自包含输出，`safeInit` / 空值检查 / `try/catch` / `quality` 与 `timestamp` 显式展示

---

## 路线图

- [x] 11 套离线样板与横屏互动入口
- [x] 运行时/组件/适配器骨架与 SCADA 配置编辑器
- [x] 4 个 Skill 与校验脚本
- [x] 离线交付包与全量截图（14 张，含 NGT200）
- [ ] 接入经确认的 REST / WebSocket 数据契约
- [ ] 现场部署与权限/降级策略

---

## 贡献

欢迎 Issue / PR。提交前请跑通两项验证：

```bash
node skills/industrial-dashboard/scripts/validate-dashboard.js scenarios
python -X utf8 tests/interaction_check.py
```

---

## 许可

[MIT](LICENSE) © 2026 Migeking

---

<a id="english-summary"></a>
## English Summary

**Industrial Dashboard Studio** is an offline-first SCADA/HMI dashboard productization workspace. 11 ready-to-run 1920×1080 dashboards (water-treatment / predictive-maintenance / reactor-safety), a reusable runtime, a SCADA designer and 4 deliverable Skills. All deps vendored. Demo data by default; real data via `demo`/`rest`/`websocket` adapters after contract confirmation.

```bash
git clone https://github.com/Migeking/industrial-dashboard-studio.git
open apps/showcase/index.html          # showcase
open apps/scada-designer/index.html    # designer
```

- Skills: `industrial-dashboard` (precision dashboard), `industrial-hmi-classic` (ISA-101 + Siemens Faceplate), `industrial-scada` (SBO + alarm + audit), `light-3d-water-hmi` (light 3D twin)
- Validate: `node skills/industrial-dashboard/scripts/validate-dashboard.js scenarios`
- Screenshots: `docs/screenshots/` (14 images, 1920×1080, Playwright auto-captured)
- Offline bundle: `scripts/build-release.ps1` → `release/industrial-dashboard-offline.zip`

See `docs/screenshots/` for full gallery and `skills/*/SKILL.md` for detailed contracts.

