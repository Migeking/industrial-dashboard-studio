# Industrial Dashboard Studio

> 工业大屏产品化工作区 · 23 套离线可运行样板 + 可复用运行时 + SCADA 设计器 + 5 个可交付 Skill

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Canvas: 1920×1080](https://img.shields.io/badge/canvas-1920%C3%971080-0ea5e9)](docs/architecture.md)
[![Offline Ready](https://img.shields.io/badge/offline-ready-brightgreen)](docs/offline-delivery.md)
[![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D)](vendor/vue.global.prod.js)
[![ECharts 5](https://img.shields.io/badge/ECharts-5-AA344D)](vendor/echarts.min.js)
[![Three.js](https://img.shields.io/badge/Three.js-r160-black)](vendor/three.min.js)

[简体中文](README.md) | [English](README_EN.md)

![Showcase 总览](docs/screenshots/showcase.png)

**一键打开即演示，无需安装依赖。** 所有 Vue 3 / ECharts 5 / Three.js 已固化在 `vendor/`，1920×1080 基准画布等比缩放至 1366×768 / 3840×2160 与拼接屏，横屏优先，演示数据内置。

---

## 简介

`industrial-dashboard-studio` 把水务全流程、设备健康、化工安全、工艺控制、智能楼宇自控与现场 DCS 就地控制屏多类工业监控样板沉淀为**可复用运行时、场景配置、HMI/SCADA 基础能力**和**可交付 Skill** 的产品化仓库。

- **离线可运行**：零 CDN，`vendor/` 固化全部依赖，`release/industrial-dashboard-offline.zip` 解压即用
- **信息层级优先**：克制的工业精密视觉，状态色唯一语义（青蓝主数据 / 绿正常 / 琥珀预警 / 红报警 / 灰离线）
- **只读演示**：内置工况脚本（稳态/高负荷/故障/恢复），明确 `quality` / `timestamp` / 通信状态，不伪造现场接入
- **渐进式产品化**：`scenarios/` 独立可演示，`packages/` 逐步抽取运行时与适配器，不破坏现有样板

> 原始成果与运营素材保留在 `MyWord`，本仓库是产品开发唯一工作目录。

---

## 效果总览

> 以下截图基于 Playwright 在 1920×1080 视口下自动生成（`docs/screenshots/`），覆盖全部本地可运行页面。

| 入口 | 预览 |
|------|------|
| **Showcase 横屏互动入口 (23 套全量)** `apps/showcase/index.html` | ![showcase](docs/screenshots/showcase.png) |
| **SCADA 场景设计器** `apps/scada-designer/index.html` | ![scada-designer](docs/screenshots/scada-designer.png) |

<details open>
<summary><b>展开查看 23 套场景全量分类与截图</b></summary>

### 现场 DCS · 就地控制屏 (威纶通 HMI 风格)（最新上线）

| 场景 | 文件 | 预览 |
|------|------|------|
| 23 冶炼与水务循环水泵站现场 DCS 就地控制屏 | `scenarios/process-control/23-冶炼与水务循环水泵站现场DCS就地控制屏.html` | ![23](docs/screenshots/23-weintek-dcs-local-hmi.png) |

### 楼宇自控 · 空间与动环数字孪生

| 场景 | 文件 | 预览 |
|------|------|------|
| 22 智能楼宇自控与空间微气候数字孪生 | `scenarios/building-automation/22-智能楼宇自控与空间微气候数字孪生.html` | ![22](docs/screenshots/22-building-automation.png) |

### 水处理 · 工艺驾驶舱与全流程 SCADA

| 场景 | 文件 | 预览 |
|------|------|------|
| 01 A2O 脱氮除磷精准调控驾驶舱 | `scenarios/water-treatment/01-A2O脱氮除磷精准调控驾驶舱.html` | ![01](docs/screenshots/01-a2o-overview.png) |
| 04 污泥回流泵联动控制驾驶舱 | `scenarios/water-treatment/04-污泥回流泵联动控制驾驶舱.html` | ![04](docs/screenshots/04-sludge-pump.png) |
| 05 污泥回流泵站 SCADA 操作终端 | `scenarios/water-treatment/05-污泥回流泵站SCADA操作终端.html` | ![05](docs/screenshots/05-pump-station-scada.png) |
| 06 A2O 脱氮除磷 SCADA 操作终端 | `scenarios/water-treatment/06-A2O脱氮除磷SCADA操作终端.html` | ![06](docs/screenshots/06-a2o-scada.png) |
| 07 A2O 脱氮除磷经典上位 SCADA | `scenarios/water-treatment/07-A2O脱氮除磷经典上位SCADA.html` | ![07](docs/screenshots/07-a2o-classic-scada.png) |
| 21 粗格栅及进水提升泵房数字孪生SCADA | `scenarios/water-treatment/21-粗格栅及进水提升泵房数字孪生SCADA.html` | 经典 SCADA 集中监控 |

### 水处理 · 3D / 2.5D 数字孪生与工艺单元

| 场景 | 文件 | 预览 |
|------|------|------|
| 08 预处理进水井 3D 交互 HMI | `scenarios/water-treatment/08-预处理进水井3D交互HMI.html` | ![08](docs/screenshots/08-pretreatment-3d.png) |
| 09 预处理进水井浅色 3D 数字孪生 HMI | `scenarios/water-treatment/09-预处理进水井浅色3D数字孪生HMI.html` | ![09](docs/screenshots/09-pretreatment-light3d.png) |
| 10 地下调蓄池水力冲洗数字孪生 HMI | `scenarios/water-treatment/10-地下调蓄池水力冲洗数字孪生HMI.html` | ![10](docs/screenshots/10-storage-flush.png) |
| 11 MBR 膜生物反应池抽吸清洗数字孪生 HMI | `scenarios/water-treatment/11-MBR膜生物反应池抽吸清洗数字孪生HMI.html` | ![11](docs/screenshots/11-mbr-clean.png) |
| 12 调蓄池格栅预处理 3D 数字孪生 HMI | `scenarios/water-treatment/12-格栅预处理3D-HMI.html` | 格栅联动控制 |
| 13 高密度絮凝沉淀池 Densadeg 数字孪生 HMI | `scenarios/water-treatment/13-高密度絮凝沉淀池Densadeg数字孪生HMI.html` | 高效澄清工艺 |
| 14 A2O 生化处理 2.5D 工艺场景 | `scenarios/water-treatment/14-A2O生化处理2.5D工艺场景.html` | 轴测生化工艺 |
| 16 MBR 膜池上位监控画面 | `scenarios/water-treatment/16-MBR膜池上位监控画面.html` | 膜反应器上位 |
| 17 污水处理沉淀单元 2.5D 上位画面 | `scenarios/water-treatment/17-污水处理沉淀单元2.5D上位画面.html` | 现场写实上位 |
| 18 园区供水管网多节点平衡监控数字看板 | `scenarios/water-treatment/18-园区供水管网多节点平衡监控数字看板.html` | 水力平衡拓扑 |
| 19 PAM 三槽式全自动加药熟化微单元 | `scenarios/water-treatment/19-PAM三槽式全自动加药熟化微单元.html` | 精密加药微单元 |
| 20 紫外线渠式消毒与余氯闭环调控微单元 | `scenarios/water-treatment/20-紫外线渠式消毒与余氯闭环调控微单元.html` | 明渠紫外消毒 |

### 设备维护 / 反应安全 / 连续分离

| 场景 | 文件 | 预览 |
|------|------|------|
| 02 关键机组预测性维护驾驶舱 | `scenarios/predictive-maintenance/02-关键机组预测性维护驾驶舱.html` | ![02](docs/screenshots/02-predictive-maintenance.png) |
| 03 反应釜热失控安全联锁舱 | `scenarios/reactor-safety/03-反应釜热失控安全联锁舱.html` | ![03](docs/screenshots/03-reactor-safety.png) |
| 15 连续分离工艺驾驶舱 | `scenarios/process-control/15-连续分离工艺驾驶舱.html` | 精馏分离工艺 |

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

<details>
<summary>查看 01 多工况演练截图</summary>

| 标准稳态 | 高峰负荷 | 低温补偿 |
|---|---|---|
| ![01 stable](docs/screenshots/states/01-state-stable.png) | ![01 peak](docs/screenshots/states/01-state-peak.png) | ![01 lowtemp](docs/screenshots/states/01-state-lowtemp.png) |

> 点击顶部工况 Tab 切换，ECharts 趋势与 SVG 流速联动，`scenarioData` 驱动固定脚本而非随机数。

</details>

### 02 关键机组预测性维护驾驶舱
- **布局**：`asset-health` — 左翼风险排序设备列表，中央结构图+测点，中央下部频谱/RUL，右翼诊断证据与工单
- **信息问题**：哪台设备、什么异常、证据是什么、还能运行多久、需要采取什么动作

### 03 反应釜热失控安全联锁舱
- **布局**：`safety-interlock` — 顶部安全态势与最高报警，中央危险源+联锁链，左翼阈值/SIS，右翼事件时间线，底部关键趋势
- **信息问题**：风险是否发生、由什么触发、保护是否动作、当前是否受控、下一步做什么
- **安全语义**：红色仅用于报警与联锁动作，不作为主题色

### 04 污泥回流泵联动控制驾驶舱
- 厂区全景联动视角，泵组启停联动与回流比控制策略可视化

<details>
<summary>查看 04 多工况演练截图</summary>

| PID 智能变频稳态 | 洪峰增泵演练 | 分级液位备用 | 超限联锁演练 |
|---|---|---|---|
| ![04 pid](docs/screenshots/states/04-state-pid.png) | ![04 flood](docs/screenshots/states/04-state-flood.png) | ![04 level](docs/screenshots/states/04-state-level.png) | ![04 interlock](docs/screenshots/states/04-state-interlock.png) |

> 覆盖稳态/洪峰/液位/联锁四工况，验证泵组联锁链与回流比策略。

</details>

### 05 污泥回流泵站 SCADA 操作终端
- 经典 SCADA 终端形态，泵站工艺图 + 实时点位 + 报警条

### 06 A2O 脱氮除磷 SCADA 操作终端
- 生化池 SCADA 集中监控，支持手自动模式与 PID 回路

### 07 A2O 脱氮除磷经典上位 SCADA
- ISA-101 灰度低疲劳风格，西门子 Faceplate 规范，垂直彩色棒图与立体下凹 I/O 域

### 08 预处理进水井 3D 交互 HMI（深色）
- Three.js 程序化白模 + 混凝土/金属/水体材质差异，OrbitControls 交互，流动与格栅动作绑定运行状态

<details>
<summary>查看 08 交互细节与多分辨率</summary>

**Faceplate 阀门小面板（点击阀位触发）**

![08 faceplate](docs/screenshots/states/08-faceplate.png)

**多分辨率（1366 / 3840）**

| 1920 基准 | 1366×768 | 3840×2160 |
|---|---|---|
| ![08 1920](docs/screenshots/08-pretreatment-3d.png) | ![08 1366](docs/screenshots/responsive/08-1366.png) | ![08 3840](docs/screenshots/responsive/08-3840.png) |

> 深色主题，1.8–3.2s 管道循环，停机暂停，支持 `prefers-reduced-motion`。

**设计过程稿 `works/08-*`**

| 1366 | 1920 | 3840 |
|---|---|---|
| ![works 08 1366](works/08-hmi-1366.png) | ![works 08 1920](works/08-hmi-1920.png) | ![works 08 3840](works/08-hmi-3840.png) |

</details>

### 09 预处理进水井浅色 3D 数字孪生 HMI（浅色）
- 浅灰蓝单主题，双层顶栏，右侧单一控制面板，底部连续状态模块，长期值守低疲劳

<details>
<summary>查看 09 多分辨率与设计稿</summary>

| 1920 基准 | 1366×768 | 3840×2160 |
|---|---|---|
| ![09 1920](docs/screenshots/09-pretreatment-light3d.png) | ![09 1366](docs/screenshots/responsive/09-1366.png) | ![09 3840](docs/screenshots/responsive/09-3840.png) |

**设计过程稿 `works/`（1366/1920/3840 迭代）**

| 1366 v1 | 1366 v2 | 1920 v1 | 1920 v2 |
|---|---|---|---|
| ![works 1366 v1](works/09-light-hmi-1366.png) | ![works 1366 v2](works/09-light-hmi-1366-v2.png) | ![works 1920 v1](works/09-light-hmi-1920.png) | ![works 1920 v2](works/09-light-hmi-1920-v2.png) |

| 3840 v1 | 3840 v2 | 可读性优化 | 工艺精细化 |
|---|---|---|---|
| ![works 3840 v1](works/09-light-hmi-3840.png) | ![works 3840 v2](works/09-light-hmi-3840-v2.png) | ![works readable](works/09-readable-labels.png) | ![works refined](works/09-refined-process.png) |

</details>

### 10 地下调蓄池水力冲洗数字孪生 HMI
- 调蓄池冲洗工艺数字孪生，水力路径与阀位联动

### 11 MBR 膜生物反应池抽吸清洗数字孪生 HMI
- MBR 膜池抽吸与反洗工艺，高品质再生水产水链路，浅色 3D 数字孪生风格

### 21 粗格栅及进水提升泵房数字孪生 SCADA
- **定位**：污水厂进水总渠及提升泵房集中监控与防误操作 SCADA 操作站。
- **架构**：5 路粗格栅渠液位差监视、4 台大流量混流提升泵与 7 台潜污泵群控，集成工业级西门子/博途风格 Faceplate 微操弹窗与 SBO（Select-Before-Operate）双重确认防误闭环。
- **文件**：`scenarios/water-treatment/21-粗格栅及进水提升泵房数字孪生SCADA.html`

### 22 智能楼宇自控与空间微气候数字孪生（全新新增）
- **布局**：`spatial-twin` — 顶部楼层与动环状态栏，中央 2.5D/3D 空间孪生视界，左翼能源动力与舒适度面板，右翼 iCooling 智控与空间微气候中枢，右下垂直楼层快速滑块，左右侧栏支持平滑无折行展开/收拢。
- **信息问题**：高层建筑微气候分布如何、是否存在局部热岛过热、VAV 末端与冷热源系统如何动态匹配、IDC 机房动环与冷源动力机组运行效能如何。
- **多楼层专属三维切面解耦**：
  1. **27F 高阶智慧办公与空间微气候**：开放工位矩阵（双屏工作站与人体工学椅）、落地玻璃会议室、VAV 变风量末端箱与镀锌送风主管、**3D 连续空间温度场等温云图**（会议室内局部 36℃ 高温热岛实时起伏渲染）、倒锥形空间警报信标与一键强冷处置；
  2. **2F IDC 核心数据机房**：42U 刀片服务器机柜群、中心幽蓝发光超算机柜、**透明亚克力冷通道闭式密封顶棚（Cold Aisle Containment）**、列间空调（CRAC）、PDU 配电柜及机柜局部热点浮牌；
  3. **-1F 地下冷源动力站**：大型双筒离心冷水机组、变频冷冻循环水泵组、分集水器与双色大口径供回水管动态流动脉冲粒子；
  4. **全楼与标准办公总览**：全楼 32 层恒温恒湿整体态势感知与标准办公层。
- **双侧面板交互**：专为 1920×1080 工业大屏优化的单行防折行排版（`white-space: nowrap`），配备精致浮动把手，支持一键收拢进入超宽沉浸式三维视野。
- **联动体系**：楼层切换、受控区域（A~H 网格）、设备联动、工况演练、左右工业面板与顶部告警横幅 100% 严密同步。
- **文件**：`scenarios/building-automation/22-智能楼宇自控与空间微气候数字孪生.html`

<details open>
<summary><b>查看 22 号场景多切面与微气候孪生画廊</b></summary>

| 27F 智慧办公 · 3D 温度场等温云图 | 2F IDC 核心数据机房 · 冷通道密封 | -1F 地下冷源动力站 · 离心冷机泵组 |
|---|---|---|
| ![22-office](docs/screenshots/22-building-automation.png) | ![22-datacenter](docs/screenshots/22-datacenter.png) | ![22-chiller](docs/screenshots/22-chiller-plant.png) |

> 垂直楼层选择器支持在全景、32F、27F（办公）、2F（IDC）、-1F（冷源）间平滑切换视角与专属三维场景，并无缝联动左侧动环数据与右侧 iCooling 控制中枢。

</details>

### 23 冶炼与水务循环水泵站现场 DCS 就地控制屏（威纶通 HMI 风格）
- **定位**：还原钢铁冶炼（高炉/转炉冷却水）与市政水务加压泵房中，配电柜及现场控制箱普遍使用的**威纶通（Weintek / Weinview cMT / MT 系列）触控屏**。
- **威纶通拟真硬件设计**：
  - 经典工业冷灰蓝（`#324154`）基调，搭配铝合金外壳、面板铆钉与内嵌凹槽（Sunken Bevel）GroupBox 框；
  - 拟真 **3D 凸凹立体按键**（启动 START 绿色微凸、停止 STOP 红色下沉、点动 -0.5Hz/+0.5Hz、复位 RESET）；
  - 物理级黑胶木旋转旋钮（`就地 LOCAL / 远程 REMOTE`、`手动 MANUAL / 自动 AUTO`）；
  - 金属镀铬外圈圆型凸面透镜指示灯（运行、停止、故障、就地模式灯）；
  - 右上角带黄色警示底座的**红色大蘑菇头急停按钮 (Emergency Stop)**，拍下瞬间强切回路并声光告警，旋转顺时针解锁复位。
- **真实就地控制与安全闭锁**：
  - **远程闭锁保护**：当旋钮置于【远程 REMOTE】时，就地控制回路硬件级锁死，所有启停调频按键禁用并浮现“受中央 DCS 远程锁定中”，杜绝现场误操作；
  - **启停水锤联锁**：起泵时延时 3 秒自动开阀，停泵时先关出水电动阀再停泵，保护管网止回阀；
  - **威纶通触控弹出数字小键盘 (Numeric Keypad)**：点击目标频率、阀门开度、压力阈值时，屏幕居中弹出 1:1 还原的威纶通灰白立体小键盘，支持有效区间校验（Min/Max 限制提示）、清除（CLR）、退格（BS）、确认（ENT）与取消（ESC）。
- **底栏 F1~F5 多窗口系统**：`[F1 工艺主控]` `[F2 参数整定]` `[F3 报警一览]` `[F4 实时趋势]` `[F5 通信诊断]`。
- **文件**：`scenarios/process-control/23-冶炼与水务循环水泵站现场DCS就地控制屏.html`

<details open>
<summary><b>查看 23 号威纶通现场控制屏与交互特写画廊</b></summary>

| 威纶通工艺主控全屏 (F1) | 触控弹出数字小键盘 (Keypad) | 远程模式安全防误闭锁蒙层 |
|---|---|---|
| ![23-main](docs/screenshots/23-weintek-dcs-local-hmi.png) | ![23-numpad](docs/screenshots/states/23-state-numpad.png) | ![23-lock](docs/screenshots/states/23-state-remote-lock.png) |

> 纯 CSS 打造拟真物理按键、金属透镜与旋转旋钮，具备完整的启停联锁、急停强切与数字键盘闭环。

</details>

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

<details>
<summary><b>Showcase 多分辨率适配（点击展开）</b></summary>

| 1920×1080（基准） | 1366×768 | 3840×2160 |
|---|---|---|
| ![showcase 1920](docs/screenshots/showcase.png) | ![showcase 1366](docs/screenshots/responsive/showcase-1366.png) | ![showcase 3840](docs/screenshots/responsive/showcase-3840.png) |

> 基准画布 1920×1080 等比缩放，安全边距 16–24px，拼接屏直接可用。

</details>

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
  building-automation/ # 22 智能楼宇自控与空间微气候数字孪生
  water-treatment/     # 01,04,05,06,07,08,09,10,11,12,13,14,16,17,18,19,20,21 (水务全流程)
  predictive-maintenance/ # 02 关键机组预测性维护
  reactor-safety/      # 03 反应釜热失控安全联锁
  process-control/     # 15 连续分离工艺驾驶舱, 23 现场DCS就地控制屏
packages/
  runtime/             # 场景加载、主题、缩放、时钟、全屏、质量标签
  components/          # 工业组件样式 (industrial-components.css)
  data-adapters/       # demo / rest / websocket 三类适配器
  design-system/       # Token (tokens.css)
skills/                # 5 个可复用 Skill（工业大屏、HMI、SCADA、轻量3D、SCADA网关）
vendor/                # 固化依赖：vue.global.prod.js / echarts.min.js / three.min.js / OrbitControls.js
assets/models/         # 三维模型
docs/
  architecture.md      # 架构基线
  offline-delivery.md  # 离线交付说明
  screenshots/         # 28 张截图（含 states/ 多工况 + responsive/ 多分辨率）
    states/            # 01/04 多工况演练 + 08 Faceplate
    responsive/        # showcase/08/09 的 1366/3840 适配
  works/               # 11 张设计过程稿（本 README 画廊引用）
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

## English Version

Full English documentation lives in **[README_EN.md](README_EN.md)** — same structure, galleries, Skill contracts and usage as the Chinese version above.

