# Industrial Dashboard Studio

> Offline-first productization workspace for industrial dashboards · 23 ready-to-run templates + reusable runtime + SCADA designer + 5 deliverable Skills

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Canvas: 1920×1080](https://img.shields.io/badge/canvas-1920%C3%971080-0ea5e9)](docs/architecture.md)
[![Offline Ready](https://img.shields.io/badge/offline-ready-brightgreen)](docs/offline-delivery.md)
[![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D)](vendor/vue.global.prod.js)
[![ECharts 5](https://img.shields.io/badge/ECharts-5-AA344D)](vendor/echarts.min.js)
[![Three.js](https://img.shields.io/badge/Three.js-r160-black)](vendor/three.min.js)

[简体中文](README.md) | [English](#introduction)

![Showcase overview](docs/screenshots/showcase.png)

**Open and demo — zero install.** Vue 3 / ECharts 5 / Three.js are all vendored under `vendor/`. The 1920×1080 base canvas scales proportionally to 1366×768 / 3840×2160 and video walls. Landscape-first, demo data built in.

---

## Introduction

`industrial-dashboard-studio` productizes water treatment, asset health, chemical safety, process control, intelligent building automation, and on-site DCS local touch panels into a **reusable runtime, scenario configs, HMI/SCADA foundations**, and **deliverable Skills**.

- **Runs offline**: zero CDN, all dependencies vendored in `vendor/`, `release/industrial-dashboard-offline.zip` works right after unzipping
- **Information hierarchy first**: restrained industrial-precision visuals, single-meaning status colors (cyan-blue = primary data / green = normal / amber = warning / red = alarm / gray = offline)
- **Read-only demo**: built-in operating-condition scripts (steady / high-load / fault / recovery) with explicit `quality` / `timestamp` / comms status — never faked as live plant data
- **Incremental productization**: `scenarios/` stay independently demoable while `packages/` gradually extracts the runtime and adapters without breaking existing templates

> Original work and marketing assets remain in `MyWord`; this repo is the single working directory for product development.

---

## Gallery

> Screenshots auto-captured with Playwright at a 1920×1080 viewport (`docs/screenshots/`), covering every locally runnable page.

| Entry | Preview |
|------|------|
| **Showcase landscape entry (All 23 Scenarios)** `apps/showcase/index.html` | ![showcase](docs/screenshots/showcase.png) |
| **SCADA scenario designer** `apps/scada-designer/index.html` | ![scada-designer](docs/screenshots/scada-designer.png) |

<details open>
<summary><b>Expand: All 23 scenario categories & screenshots</b></summary>

### Field DCS · Local Control Panel (Weintek HMI Style) (Latest New)

| Scenario | File | Preview |
|------|------|------|
| 23 Smelting & Water Circulation Pump Station Local DCS Control Panel | `scenarios/process-control/23-冶炼与水务循环水泵站现场DCS就地控制屏.html` | ![23](docs/screenshots/23-weintek-dcs-local-hmi.png) |

### Building Automation · Spatial & Environmental Digital Twin

| Scenario | File | Preview |
|------|------|------|
| 22 Intelligent Building Automation & Spatial Microclimate Digital Twin | `scenarios/building-automation/22-智能楼宇自控与空间微气候数字孪生.html` | ![22](docs/screenshots/22-building-automation.png) |

### Water Treatment · Process Cockpits & Full-chain SCADA

| Scenario | File | Preview |
|------|------|------|
| 01 A2O nutrient-removal control dashboard | `scenarios/water-treatment/01-A2O脱氮除磷精准调控驾驶舱.html` | ![01](docs/screenshots/01-a2o-overview.png) |
| 04 Sludge-recirculation pump linkage dashboard | `scenarios/water-treatment/04-污泥回流泵联动控制驾驶舱.html` | ![04](docs/screenshots/04-sludge-pump.png) |
| 05 Sludge-recirculation pump station SCADA terminal | `scenarios/water-treatment/05-污泥回流泵站SCADA操作终端.html` | ![05](docs/screenshots/05-pump-station-scada.png) |
| 06 A2O SCADA operation terminal | `scenarios/water-treatment/06-A2O脱氮除磷SCADA操作终端.html` | ![06](docs/screenshots/06-a2o-scada.png) |
| 07 A2O classic upper-level SCADA | `scenarios/water-treatment/07-A2O脱氮除磷经典上位SCADA.html` | ![07](docs/screenshots/07-a2o-classic-scada.png) |
| 21 Raw screen & intake pumping station SCADA | `scenarios/water-treatment/21-粗格栅及进水提升泵房数字孪生SCADA.html` | Classic SCADA Supervisory |

### Water Treatment · 3D / 2.5D Digital Twin & Unit Processes

| Scenario | File | Preview |
|------|------|------|
| 08 Pretreatment inlet-well 3D interactive HMI | `scenarios/water-treatment/08-预处理进水井3D交互HMI.html` | ![08](docs/screenshots/08-pretreatment-3d.png) |
| 09 Pretreatment inlet-well light 3D twin HMI | `scenarios/water-treatment/09-预处理进水井浅色3D数字孪生HMI.html` | ![09](docs/screenshots/09-pretreatment-light3d.png) |
| 10 Underground detention-tank flushing twin HMI | `scenarios/water-treatment/10-地下调蓄池水力冲洗数字孪生HMI.html` | ![10](docs/screenshots/10-storage-flush.png) |
| 11 MBR suction-cleaning twin HMI | `scenarios/water-treatment/11-MBR膜生物反应池抽吸清洗数字孪生HMI.html` | ![11](docs/screenshots/11-mbr-clean.png) |
| 12 Detention-tank screen pretreatment 3D HMI | `scenarios/water-treatment/12-格栅预处理3D-HMI.html` | Screen Interlock Control |
| 13 High-density clarifier Densadeg twin HMI | `scenarios/water-treatment/13-高密度絮凝沉淀池Densadeg数字孪生HMI.html` | High-efficiency Clarification |
| 14 A2O biochemical treatment 2.5D process | `scenarios/water-treatment/14-A2O生化处理2.5D工艺场景.html` | Axonometric Biochemical Process |
| 16 MBR membrane-tank supervisory screen | `scenarios/water-treatment/16-MBR膜池上位监控画面.html` | Membrane Supervisory HMI |
| 17 Sedimentation unit 2.5D supervisory screen | `scenarios/water-treatment/17-污水处理沉淀单元2.5D上位画面.html` | Realistic Fixed View |
| 18 Park water network multi-node balance dashboard | `scenarios/water-treatment/18-园区供水管网多节点平衡监控数字看板.html` | Hydraulic Balance Topology |
| 19 PAM three-tank automatic dosing micro unit | `scenarios/water-treatment/19-PAM三槽式全自动加药熟化微单元.html` | Precision Dosing Unit |
| 20 UV channel disinfection & residual chlorine micro unit | `scenarios/water-treatment/20-紫外线渠式消毒与余氯闭环调控微单元.html` | Open Channel UV Disinfection |

### Asset Maintenance / Safety / Continuous Process

| Scenario | File | Preview |
|------|------|------|
| 02 Critical-unit predictive-maintenance dashboard | `scenarios/predictive-maintenance/02-关键机组预测性维护驾驶舱.html` | ![02](docs/screenshots/02-predictive-maintenance.png) |
| 03 Reactor thermal-runaway safety-interlock dashboard | `scenarios/reactor-safety/03-反应釜热失控安全联锁舱.html` | ![03](docs/screenshots/03-reactor-safety.png) |
| 15 Continuous separation process cockpit | `scenarios/process-control/15-连续分离工艺驾驶舱.html` | Distillation Separation Cockpit |

### 3D Models

| Model | Preview |
|------|------|
| NGT200 air-foil blower parametric model `assets/models/ngt200/preview.html` | ![ngt200](docs/screenshots/ngt200-model.png) |

</details>

> `works/` keeps 11 design-iteration drafts (1366/1920/3840), `release/` keeps proposal-ready previews `showcase-preview.png` / `scada-designer-preview.png`.

---

## Quick start

```bash
# 1. Clone
git clone https://github.com/Migeking/industrial-dashboard-studio.git
cd industrial-dashboard-studio

# 2. Open directly in a browser (no npm install needed)
# Windows
start apps/showcase/index.html
# macOS / Linux
open apps/showcase/index.html
# or just double-click the file
```

**Use landscape on phones/tablets** — portrait shows a rotate prompt. The entry layer handles orientation hints and fullscreen; the scenario layer focuses on the 1920×1080 information hierarchy.

```bash
# Try the SCADA designer
open apps/scada-designer/index.html
# Editable title, accent color, devices and states; exports JSON config
```

---

## Scenario details

### 01 A2O nutrient-removal control dashboard
- **Layout**: `process-overview` — 52–60% central SVG process flow, left wing for inlet conditions/quality KPIs, right wing for equipment groups/alarms, bottom compliance trends
- **Key questions**: where media comes from, where it flows, which stage deviates, whether the control strategy works
- **File**: `scenarios/water-treatment/01-A2O脱氮除磷精准调控驾驶舱.html`

<details>
<summary>Multi-condition drill screenshots (01)</summary>

| Steady | Peak load | Low-temp compensation |
|---|---|---|
| ![01 stable](docs/screenshots/states/01-state-stable.png) | ![01 peak](docs/screenshots/states/01-state-peak.png) | ![01 lowtemp](docs/screenshots/states/01-state-lowtemp.png) |

> Switch the top condition tabs; ECharts trends and SVG flow speeds react together, driven by fixed `scenarioData` scripts rather than random numbers.

</details>

### 02 Critical-unit predictive-maintenance dashboard
- **Layout**: `asset-health` — left risk-ranked equipment list, central structure diagram + measurement points, lower-center spectra/RUL curves, right diagnostic evidence and work orders
- **Key questions**: which unit, what anomaly, what evidence, remaining useful life, what action to take

### 03 Reactor thermal-runaway safety-interlock dashboard
- **Layout**: `safety-interlock` — top safety posture with highest alarm, central hazard unit + interlock chain, left thresholds/SIS, right event timeline, bottom key trends
- **Key questions**: whether risk is present, what triggered it, whether protection acted, whether it is under control, what to do next
- **Safety semantics**: red is reserved for alarms and interlock actions, never used as a theme color

### 04 Sludge-recirculation pump linkage dashboard
- Plant-wide linkage view: parallel pump start/stop interlocks and recirculation-ratio strategy visualization

<details>
<summary>Multi-condition drill screenshots (04)</summary>

| PID VFD steady | Flood drill | Staged level backup | Over-limit interlock drill |
|---|---|---|---|
| ![04 pid](docs/screenshots/states/04-state-pid.png) | ![04 flood](docs/screenshots/states/04-state-flood.png) | ![04 level](docs/screenshots/states/04-state-level.png) | ![04 interlock](docs/screenshots/states/04-state-interlock.png) |

> Covers steady / flood / level / interlock conditions to verify the pump interlock chain and recirculation-ratio strategy.

</details>

### 05 Sludge-recirculation pump station SCADA terminal
- Classic SCADA terminal form: pump-station P&ID + live tags + alarm banner

### 06 A2O SCADA operation terminal
- Centralized biochemical-tank SCADA monitoring with manual/auto modes and PID loops

### 07 A2O classic upper-level SCADA
- ISA-101 gray low-fatigue style, Siemens Faceplate spec, vertical color bar charts with recessed 3D I/O fields

### 08 Pretreatment inlet-well 3D interactive HMI (dark)
- Procedural Three.js clay models with distinct concrete/metal/water materials, OrbitControls interaction, flow and screen motion bound to running state

<details>
<summary>08 interaction details & multi-resolution</summary>

**Faceplate valve panel (triggered by clicking a valve)**

![08 faceplate](docs/screenshots/states/08-faceplate.png)

**Multi-resolution (1366 / 3840)**

| 1920 baseline | 1366×768 | 3840×2160 |
|---|---|---|
| ![08 1920](docs/screenshots/08-pretreatment-3d.png) | ![08 1366](docs/screenshots/responsive/08-1366.png) | ![08 3840](docs/screenshots/responsive/08-3840.png) |

> Dark theme, 1.8–3.2s pipe-flow loops that pause on stop, `prefers-reduced-motion` supported.

**Design iterations `works/08-*`**

| 1366 | 1920 | 3840 |
|---|---|---|
| ![works 08 1366](works/08-hmi-1366.png) | ![works 08 1920](works/08-hmi-1920.png) | ![works 08 3840](works/08-hmi-3840.png) |

</details>

### 09 Pretreatment inlet-well light 3D twin HMI (light)
- Light gray-blue single theme, double top nav, single right control panel, continuous bottom status modules — low fatigue for long shifts

<details>
<summary>09 multi-resolution & design drafts</summary>

| 1920 baseline | 1366×768 | 3840×2160 |
|---|---|---|
| ![09 1920](docs/screenshots/09-pretreatment-light3d.png) | ![09 1366](docs/screenshots/responsive/09-1366.png) | ![09 3840](docs/screenshots/responsive/09-3840.png) |

**Design iterations `works/` (1366/1920/3840)**

| 1366 v1 | 1366 v2 | 1920 v1 | 1920 v2 |
|---|---|---|---|
| ![works 1366 v1](works/09-light-hmi-1366.png) | ![works 1366 v2](works/09-light-hmi-1366-v2.png) | ![works 1920 v1](works/09-light-hmi-1920.png) | ![works 1920 v2](works/09-light-hmi-1920-v2.png) |

| 3840 v1 | 3840 v2 | Readability pass | Process refinement |
|---|---|---|---|
| ![works 3840 v1](works/09-light-hmi-3840.png) | ![works 3840 v2](works/09-light-hmi-3840-v2.png) | ![works readable](works/09-readable-labels.png) | ![works refined](works/09-refined-process.png) |

</details>

### 10 Underground detention-tank flushing twin HMI
- Detention-tank flushing digital twin with hydraulic paths linked to valve positions

### 11 MBR suction-cleaning twin HMI
- MBR suction and backwash process with reclaimed-water production chain, light 3D twin style

### 21 Raw screen & intake pumping station digital twin SCADA
- **Role**: centralized supervisory control and anti-misoperation SCADA workstation for wastewater plant inlet channels and lift pumps.
- **Architecture**: 5-channel coarse screen differential level monitoring, 4 mixed-flow pumps, 7 submersible lift pumps, integrated with Siemens/TIA Portal industrial faceplates and SBO (Select-Before-Operate) dual-confirmation safety interlocking.
- **File**: `scenarios/water-treatment/21-粗格栅及进水提升泵房数字孪生SCADA.html`

### 22 Intelligent Building Automation & Spatial Microclimate Digital Twin (Featured New)
- **Layout**: `spatial-twin` — top floor and environmental status bar, central 2.5D/3D digital twin viewport, left HVAC & energy metrics panel, right iCooling microclimate command center, bottom-right vertical floor selector, and dual collapsible drawers.
- **Information problem**: how spatial microclimate is distributed across floors, whether localized hot-spots/overheating occur, how VAV terminal units synchronize with cooling/heating plants, and operational efficiency of IDC data center & chiller plants.
- **Multi-Level Decoupled 3D Slicing Architecture**:
  1. **27F Smart Office & Microclimate**: open workstations (dual-monitor stations & ergonomic seating), glass-walled conference rooms, VAV terminal boxes, **3D real-time spatial thermal heatmap surface** (dynamically undulating 36℃ localized heat-island in Zone F), inverted cone warning beacons, and one-click quick cooling override;
  2. **2F IDC Core Data Center**: 42U high-density server rack arrays, signature glowing blue supercomputer cabinet, **transparent acrylic cold aisle containment (CAC)**, in-row precision CRAC units, PDU cabinets, and spatial rack temperature tags;
  3. **-1F Underground Chiller Energy Plant**: dual-barrel centrifugal chillers, variable-frequency chilled water circulation pumps, distribution headers, and high-speed dynamic fluid flow particle effects;
  4. **Whole-Building 32-Floor Overview**: macro-level thermal, humidity, and energy perception across all 32 floors.
- **Collapsible Industrial Panels**: single-line no-wrap layout (`white-space: nowrap`) engineered for 1920×1080 industrial command displays, with floating drawer handles for one-click ultra-wide panoramic immersion.
- **Full Linkage System**: floor selector, controlled zones (Grid A~H), mechanical equipment, operating scripts, industrial drawers, and alarm banners 100% synchronized.
- **File**: `scenarios/building-automation/22-智能楼宇自控与空间微气候数字孪生.html`

<details open>
<summary><b>View Scenario 22 multi-level spatial digital twin gallery</b></summary>

| 27F Smart Office · 3D Thermal Heatmap | 2F IDC Data Center · Cold Aisle Containment | -1F Chiller Plant · Centrifugal Pumps |
|---|---|---|
| ![22-office](docs/screenshots/22-building-automation.png) | ![22-datacenter](docs/screenshots/22-datacenter.png) | ![22-chiller](docs/screenshots/22-chiller-plant.png) |

> Seamlessly switch camera perspectives and dedicated 3D scenes across All-Floor, 32F, 27F (Office), 2F (IDC), and -1F (Chiller) via the vertical floor slider, with instant data telemetry binding.

</details>

### 23 Smelting & Water Circulation Pump Station Local DCS Control Panel (Weintek HMI Style)
- **Role**: replicates the rugged **Weintek / Weinview (cMT / MT EasyBuilder Pro) touchscreen panels** ubiquitous across metallurgy workshops (blast-furnace & converter cooling) and municipal booster pumping stations.
- **Physical Hardware Realism**:
  - Classic industrial cold slate-blue (`#324154`) foundation, aluminum bezel with corner hex bolts, and sunken-bevel GroupBoxes;
  - **Tactile 3D push buttons** (convex green START, concave red STOP, -0.5Hz/+0.5Hz jog adjustment, blue RESET);
  - Bakelite rotary selector switches (`LOCAL / REMOTE`, `MANUAL / AUTO`);
  - Chrome-rimmed domed lens indicator lamps (RUN, STOP, FAULT, LOCAL);
  - Industrial **Emergency Stop mushroom button** with yellow safety flange; slamming shuts down circuits with audible visual warnings, twist clockwise to reset.
- **True Local Control & Safety Interlocks**:
  - **Remote Lockout**: turning the rotary switch to `REMOTE` hard-locks local controls, disallowing field start/stop/jogging to prevent accidental intervention;
  - **Water-Hammer Protection Interlock**: 3-second delay between pump acceleration and discharge butterfly valve opening; valve pre-closes prior to motor stop;
  - **Touchscreen Numeric Keypad Modal**: tapping setpoints pops up an authentic Weintek-style numeric keypad with range limits, CLR, BS, ENT, and ESC.
- **Bottom F1~F5 Window Bar**: `[F1 Main Control]` `[F2 Parameters]` `[F3 Alarm Log]` `[F4 Real-time Trends]` `[F5 Comms Diagnostic]`.
- **File**: `scenarios/process-control/23-冶炼与水务循环水泵站现场DCS就地控制屏.html`

<details open>
<summary><b>View Scenario 23 Weintek Local HMI gallery</b></summary>

| Weintek Main Screen (F1) | Touch Numeric Keypad | Remote Safety Lockout Mask |
|---|---|---|
| ![23-main](docs/screenshots/23-weintek-dcs-local-hmi.png) | ![23-numpad](docs/screenshots/states/23-state-numpad.png) | ![23-lock](docs/screenshots/states/23-state-remote-lock.png) |

> Pure CSS physical-grade 3D push buttons, metallic lamps, and rotary switches with complete pump-valve sequencing, E-Stop cutoff, and keypad entry.

</details>

---

## App entries

### Showcase landscape entry `apps/showcase/index.html`
- Three-scenario switching, landscape orientation hints, fullscreen mode, 1920×1080 proportional scaling
- ~12 KB source, zero build, demo-ready offline for proposals

### SCADA scenario designer `apps/scada-designer/index.html`
- Editable: title, accent color, device list, device states
- Capabilities: live preview, JSON config export, works with `packages/runtime`
- Good for: quickly assembling new scenarios, on-site parametric configuration

![SCADA Designer](docs/screenshots/scada-designer.png)

<details>
<summary><b>Showcase multi-resolution fit (expand)</b></summary>

| 1920×1080 (baseline) | 1366×768 | 3840×2160 |
|---|---|---|
| ![showcase 1920](docs/screenshots/showcase.png) | ![showcase 1366](docs/screenshots/responsive/showcase-1366.png) | ![showcase 3840](docs/screenshots/responsive/showcase-3840.png) |

> 1920×1080 base canvas with proportional scaling, 16–24px safe margins, video-wall ready.

</details>

---

## 3D & assets

### NGT200 air-foil blower `assets/models/ngt200/`
- Parametric 3D model `ngt200-model.js` + preview page `preview.html`, reused for blower visuals in scenarios 01/04
- Local Three.js + OrbitControls, no external model dependencies

```
assets/models/ngt200/
  ngt200-model.js   # parametric geometry & materials
  preview.html      # standalone preview
  README.md
assets/models/water-process/water-process.js  # water-structure clay models
```

---

## Directory structure

```
apps/
  showcase/            # landscape interactive entry
  scada-designer/      # SCADA scenario designer
scenarios/
  building-automation/ # 22 Intelligent building automation & spatial microclimate twin
  water-treatment/     # 01,04,05,06,07,08,09,10,11,12,13,14,16,17,18,19,20,21 (full water chain)
  predictive-maintenance/ # 02 Critical-unit predictive maintenance
  reactor-safety/      # 03 Reactor safety interlock
  process-control/     # 15 Continuous separation process, 23 Local DCS panel
packages/
  runtime/             # loading, theming, scaling, clock, fullscreen, quality labels
  components/          # industrial component styles (industrial-components.css)
  data-adapters/       # demo / rest / websocket adapters
  design-system/       # tokens (tokens.css)
skills/                # 5 reusable Skills (industrial-dashboard, HMI, SCADA, light-3d, scada-gateway)
vendor/                # vendored deps: vue.global.prod.js / echarts.min.js / three.min.js / OrbitControls.js
assets/models/         # 3D models
docs/
  architecture.md      # architecture baseline
  offline-delivery.md  # offline delivery notes
  screenshots/         # 28 screenshots (states/ multi-condition + responsive/ multi-resolution)
    states/            # 01/04 drills + 08 Faceplate
    responsive/        # 1366/3840 fit for showcase/08/09
  works/               # 11 design-iteration drafts (referenced in gallery)
tests/interaction_check.py
release/               # offline bundle & preview images
works/                 # 11 design-iteration drafts (multi-resolution)
```

---

## Skills in detail

> Skills are reusable Codex / OpenCode delivery specs under `skills/`. Each Skill ships `SKILL.md`, `references/`, `scripts/validate-*.js`, and `agents/openai.yaml`.

### 1) industrial-dashboard — industrial precision dashboards

**Scope**: create or refactor deliverable, offline-capable industrial monitoring dashboards as single 1920×1080 adaptive HTML files. For water treatment, asset health, chemical safety, energy, and manufacturing dashboards. **Not for** SCADA/HMI operation screens requiring real control writes, nor generic BI reports.

**Read first**:
1. `references/design-system.md` — status colors, type scale, motion limits
2. `references/scene-layouts.md` — pick `process-overview` / `asset-health` / `safety-interlock` by task
3. `references/data-contract.md` — live tags and condition-script contracts
4. `assets/base-dashboard.html` — starter skeleton (never overwrite user work)

**Output contract**:
- Single HTML file: 2 local libs (Vue 3 + ECharts 5) + 1 inline IIFE = 3 `script` pairs; for 3D add Three.js/controller/model, max 6 pairs. **CDN must never be a runtime requirement**
- Fixed 1920×1080 canvas with proportional scaling and video-wall safe margins
- Must include: top situation bar, one hero visual, key KPIs, alarm/event zone, data-quality + update-time status bar
- Unique color semantics: cyan-blue = primary data, green = normal, amber = warning, red = alarm, gray = offline; hero visual prefers inline SVG
- Motion maps to flow/rotation/scan/alarm; stopped equipment freezes; demo data uses repeatable condition scripts

**Usage**:

```bash
# Load the Skill in any Codex / OpenCode session
# 1. Copy the skeleton
cp skills/industrial-dashboard/assets/base-dashboard.html my-dashboard.html

# 2. Pick a layout from scene-layouts and build

# 3. Validate (multiple files supported)
node skills/industrial-dashboard/scripts/validate-dashboard.js scenarios
node skills/industrial-dashboard/scripts/validate-dashboard.js my-dashboard.html
```

**Checks**: ECharts container heights, `safeInit`, null guards, `try/catch`, quality/timestamp display, zero console errors, no clipped text.

---

### 2) industrial-hmi-classic — classic water SCADA (upper-level)

**Scope**: Siemens TIA Portal / WinCC style classic SCADA for municipal water (WWTP / WTP / pump stations / detention tanks). Designed for **operators and process engineers on 8–12h shifts**.

**Highlights**:
- **ISA-101 gray philosophy**: `#DDE2E8` cool-gray base, low-saturation silence in normal operation, high-contrast activation on abnormality
- **Municipal pipe color codes**: industry-standard colors for sewage / return sludge / clean effluent / aeration air / carbon-source dosing + orthogonal routing with jumper arcs
- **P&ID symbol library**: tank side-section profiles with meter scales, submersible pumps / centrifugal blowers / diaphragm dosing pumps, AIT/FIT/LIT bubbles, recessed 3D I/O fields
- **Siemens Faceplate**: 0–100% range, HH/H/L/LL scales, SP golden-triangle cursor, ±0.1 jog, manual/auto, PID curves, SBO two-step confirm
- **Control-room interaction**: process-section switch tree, three-level permission lock, S7-1500 watchdog, multi-pen coaxial trends, persistent alarm silence/ack bar

**Read first**:
1. `references/isa101-style-guide.md`
2. `references/water-treatment-pid-library.md`
3. `references/siemens-water-faceplate.md`

**Usage**:
```bash
node skills/industrial-hmi-classic/scripts/validate-hmi.js scenarios/water-treatment/07-*.html
```

---

### 3) industrial-scada — Web SCADA / HMI operation terminals

**Scope**: Web SCADA for process control, equipment operation, and control-room monitoring. Unlike read-only dashboards, it centers on **closed-loop control, misoperation prevention, read-back verification, and safety interlocks**.

**Core contracts**:
- **Bidirectional data flow**: tags carry `writable`, writes separated from read-backs, no fake updates
- **SBO two-step confirm**: click equipment → Faceplate panel → second confirm for hazardous commands → watchdog timer → update on ACK
- **Faceplate family**: pumps/fans/motors (manual-auto/start-stop/reset/hours/interlocks), VFD (28.0–50.0 Hz clamped slider), PID loops (PV/SP/OP + trend)
- **Alarm banner**: persistent top banner with highest level, unacked red flashing + buzzer, silence/acknowledge actions
- **Audit trail**: bottom live log of time / operator / object / old / new / result

**Safety requirements**: front-end hard clamps, 1.5s watchdog timeout rollback, control-ownership indicator (central/local/locked), zero console errors.

**Read first**:
1. `references/control-safety-contract.md`
2. `references/faceplate-specification.md`
3. `references/tag-point-table.md` (DI/DO/AI/AO read-write + ranges)
4. `references/alarm-lifecycle.md` (ISA-18.2 state machine)

**Usage**:
```bash
node skills/industrial-scada/scripts/validate-scada.js scenarios/water-treatment/05-*.html
node skills/industrial-scada/scripts/validate-scada.js scenarios/water-treatment/06-*.html
```

---

### 4) light-3d-water-hmi — light 3D water HMI

**Scope**: light gray-blue digital-twin HMI with clay 3D water structures as hero visual. For WWTP / WTP / pump-station pretreatment 1920×1080 monitoring pages. **Not for** dark dashboards or classic P&ID screens.

**Output requirements**:
- Light single theme, double top nav, central clay structures, single right control panel, continuous bottom status modules
- Clearly distinct concrete/metal/water/pipe materials, overall low saturation, blue only for selection/primary data, green only for normal
- 3D motion only for water flow / valve positions / pump groups / screens; stops when halted; demo mode explicitly labeled

**Usage**:
```bash
node skills/light-3d-water-hmi/scripts/validate-light-3d-hmi.js scenarios/water-treatment/08-*.html
# Then check composition and camera framing at 1920×1080 / 1366×768 / 3840×2160
```

**Reference**: `references/visual-system.md`

---

### Loading Skills in Codex / OpenCode

```yaml
# Agent configs ship at skills/industrial-dashboard/agents/openai.yaml
# Reference directly in Skill-capable environments:
# - industrial-dashboard
# - industrial-hmi-classic
# - industrial-scada
# - light-3d-water-hmi
```

---

## Runtime & data adapters

### Runtime `packages/runtime/dashboard-runtime.js`
```js
DashboardRuntime.isLandscape()              // landscape/portrait check
DashboardRuntime.requestFullscreen(el)      // toggle fullscreen
DashboardRuntime.bindFullscreen(btn, el)    // bind fullscreen button
DashboardRuntime.createClock(el)            // 1s clock, returns cancel fn
DashboardRuntime.qualityLabel(value)        // GOOD/DEGRADED/UNKNOWN label
```

### Data adapters `packages/data-adapters/`
| Adapter | Use | Notes |
|--------|------|------|
| `demo-adapter.js` | demo / proposals | local timed condition scripts, default |
| `rest-adapter.js` | lightweight delivery | REST polling, unified contract |
| `websocket-adapter.js` | live integration | WebSocket push, needs agreed fields/rate/permissions |

Unified data contract (`skills/industrial-dashboard/references/data-contract.md`):

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

> Never present demo pages as live SCADA before the data contract is agreed. Control writes must move to the `industrial-scada` safety design.

---

## Design system

Tokens in `packages/design-system/tokens.css` and `skills/industrial-dashboard/references/design-system.md`:

```css
:root {
  --bg: #071019; --surface-1: #0b1622; --surface-2: #0f1d2a;
  --line: #20394a; --accent: #36c2ff;
  --success: #35d07f; --warning: #ffb547; --danger: #ff5d5d; --offline: #708594;
  --text-1: #f2f7fa; --text-2: #a8bac8;
  --radius: 8px; --gap: 14px;
}
```

- Titles 34–40px / KPIs 36–52px (`tabular-nums`) / panel titles 18–20px
- Panels: 1px low-contrast border + 8px radius + subtle inner highlight, no neon glow
- Grid: 12 columns, 12–16px gutters, 72–80px top bar, 40–48px bottom status bar, 16–24px safe margins
- Motion: 1.8–3.2s pipe loops; vertical-axis agitators use lateral-projection oscillation (not flat 360° rotation); `prefers-reduced-motion` supported

---

## Validation & offline delivery

### Validation

```bash
# All scenarios
node skills/industrial-dashboard/scripts/validate-dashboard.js scenarios
python -X utf8 tests/interaction_check.py

# Per-Skill checks
node skills/industrial-hmi-classic/scripts/validate-hmi.js <file>
node skills/industrial-scada/scripts/validate-scada.js <file>
node skills/light-3d-water-hmi/scripts/validate-light-3d-hmi.js <file>

# Screenshots (as used in this README)
node scripts/screenshot.js
# 1920×1080 viewport, output to docs/screenshots/
```

### Offline delivery

```powershell
./scripts/build-release.ps1
# Output -> release/industrial-dashboard-offline.zip (~1.07 MB)
```

Unzip and open `apps/showcase/index.html`. The bundle includes: entries + designer, all templates, local deps, 3D models, runtime + Skills, product docs. See `docs/offline-delivery.md`.

---

## Tech stack

- Vue 3 (vendored CDN prod build) · ECharts 5 · Three.js r160 + OrbitControls
- Pure HTML/CSS/JS, self-contained single-file output with `safeInit` / null guards / `try/catch` / explicit `quality` + `timestamp`

---

## Roadmap

- [x] 11 offline templates + landscape entry
- [x] Runtime / component / adapter skeletons + SCADA config editor
- [x] 4 Skills with validators
- [x] Offline bundle + full screenshots (28 incl. states/responsive, + NGT200)
- [ ] Agreed REST / WebSocket data contracts
- [ ] On-site deployment with permission / degradation strategy

---

## Contributing

Issues / PRs welcome. Please pass both validations before submitting:

```bash
node skills/industrial-dashboard/scripts/validate-dashboard.js scenarios
python -X utf8 tests/interaction_check.py
```

---

## License

[MIT](LICENSE) © 2026 Migeking
