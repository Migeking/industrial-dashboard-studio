---
name: industrial-local-control-panel
description: Create premium, high-fidelity single-equipment on-site HMI / LCP control panels with standardized Chinese industrial terminology, skeuomorphic physical micro-textures, strict local/remote authority interlocks, and honest offline-demo behavior.
---

# 工业设备就地控制屏（Local Control Panel / 现场触控 HMI）

专用于工业现场单台核心机组、橇装成套设备或就地电气控制箱（LCP / 现场防爆操作柱 / 触摸屏 HMI）的人机交互系统设计。目标是让现场巡检人员与值班机修工在就地柜前**一目了然看清设备状态、掌握控制权归属、实施高可靠就地操作**，呈现沉稳精密、科技硬核的高品质工业微质感。

---

## 1. 核心设计原则

1. **纯正规范中文，拒绝生硬拼凑**：
   - 严格遵循中国工业人机工效标准（GB/T 14048、DL/T 5136、HG/T 20507）。
   - 模式、指令、状态与参数全部采用规范中文：坚决杜绝“就地 LOCAL”、“远程 REMOTE”等中英生硬混杂；统一使用“就地控制 / 远方受控”、“就地手动 / 远程自动”、“就地启动 / 就地停止 / 故障复位”等专业术语。详见 [chinese-industrial-terminology.md](file:///d:/code/industrial-dashboard-studio/skills/industrial-local-control-panel/references/chinese-industrial-terminology.md)。
2. **“哪怕单设备，也要极致质感”（Visual Excellence）**：
   - 彻底摒弃粗糙的白色扁平线框与简陋网页卡片风；
   - 采用深色冷轧钣金/防爆机柜质感、金属微拉丝底板、内六角沉头螺栓与激光蚀刻铭牌；
   - 深度运用微拟物（Skeuomorphic）工业元器件：三位万能转换开关（带手柄高光与旋转定位角度）、3D立体金属包边带灯按钮、黄色警戒底座红色急停蘑菇头、工业三色声光报警塔；
   - 详见 [lcp-visual-aesthetics-guide.md](file:///d:/code/industrial-dashboard-studio/skills/industrial-local-control-panel/references/lcp-visual-aesthetics-guide.md)。
3. **高精度单机工艺流体与机械剖面透视**：
   - 拒绝敷衍的粗线条简笔画，精细刻画设备机械工程细节（驱动电机散热片、联轴器、前后轴承温振测点、动叶轮、气/水流道导叶与蜗壳）；
   - 设备运转时配备高速流场粒子/流线动态映射，停机/故障时流态与测点真实联动。
4. **硬核权限互锁与安全闭锁边界**：
   - 就地模式激活就地启停，远方模式强制闭锁并明确提示；
   - 故障跳闸后强制“故障锁存（Latch）”，必须就地人工复位且复位后保持停机，严禁自起；
   - 物理急停与硬回路不可替代，详见 [safety-interlock-and-offline-contract.md](file:///d:/code/industrial-dashboard-studio/skills/industrial-local-control-panel/references/safety-interlock-and-offline-contract.md)。
5. **双分辨率无损自适应与 Scale 缩放**：
   - 基准分辨率为 1920×1080 原生高清；
   - 深度适配 1024×768 现场触摸屏一体机，通过响应式栅格与平滑 scale 居中缩放，保证触控键区高度 ≥ 48px，防误触且全局无拉伸变形。

---

## 2. 界面分区与标准布局架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [设备位号/标识]  单体设备就地控制屏 (中文标准标题)            [离线演示标牌] │ ← 顶部工控标牌区
├──────────────────────────────────────┬──────────────────────────────────────┤
│                                      │                                      │
│ 【设备高精透视与运行流态区】          │ 【就地操作箱 · 拟真物理控制区】      │
│  - 设备结构剖面（电机/轴承/叶轮/流道）│  - 3位万能转换开关 [就地 - 停 - 远方] │
│  - 动态流场粒子 / 转速联动投影       │  - 3D带灯按键 [就地启动] [就地停止]  │
│  - 现场温振测点热点标注              │  - [故障复位] & [物理急停蘑菇头]     │
│                                      ├──────────────────────────────────────┤
│ ──────────────────────────────────── │ 【变频器与电气数显单元】              │
│ 【机组核心运行状态横条】              │  - 高对比度荧光青段码数显            │
│  - 运行状态：[运行/停机/故障锁存]    │  - 设定频率 / 反馈频率 / 步进微调    │
│  - 控制权属：[就地控制权有效/远方受控]│  - 三相电流 (Ia, Ib, Ic) & 母线电压  │
│  - 声光塔灯状态：[绿 / 黄 / 红]      │  - 现场信号状态 (未接物理信号说明)   │
│                                      │                                      │
├──────────────────────────────────────┴──────────────────────────────────────┤
│ 底部安全警示条：实体急停与电气保护由现场硬件回路执行，本画面不提供任何旁路功能│ ← 安全免责底栏
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 标准化工业规范与术语表

| 功能区 | 推荐规范中文 | 严禁使用的不当表达 |
|---|---|---|
| **控制权限模式** | 就地控制、远方受控、检修切除 | LOCAL、REMOTE、就地 LOCAL、远程 REMOTE |
| **设备动作按键** | 就地启动、就地停止、故障复位 | START、STOP、RUN、RESET |
| **运行反馈状态** | 运行指示、停机备妥、故障锁存 | Running、Stopped、Fault |
| **电气与工艺量** | 设定频率 (Hz)、运行频率 (Hz)、A/B/C相电流 (A)、排气压力 (kPa) | SP、PV、Current、Press（缺乏中文主语） |
| **安全闭锁提示** | 远方受控中，就地操作闭锁 | Disabled、Locked |

---

## 4. 触屏交互与平滑 Scale 缩放规范

现场常见 1920×1080（主控/大屏）与 1024×768（现场嵌入式工控触摸屏）：
```js
function resizeScreen() {
  const el = safeInit('screen');
  if (!el) return;
  const isCompact = window.innerWidth <= 1100 || window.innerHeight <= 800;
  el.classList.toggle('compact', isCompact);
  const baseWidth = isCompact ? 1024 : 1920;
  const baseHeight = isCompact ? 768 : 1080;
  const scale = Math.min(window.innerWidth / baseWidth, window.innerHeight / baseHeight);
  el.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', resizeScreen);
```
- 在 `compact` 紧凑模式下，将两栏比例优化为 `1fr 1fr` 或自适应伸缩，隐藏冗余修饰说明，优先保证启停按键尺寸与遥测数值清晰可读。

---

## 5. 校验与交付流水线

1. 每次场景修改后，运行静态合规校验：
   ```bash
   node skills/industrial-dashboard/scripts/validate-dashboard.js scenarios
   ```
2. 运行自动化交互与多分辨率屏幕捕获测试：
   ```bash
   python tests/capture_28.py
   ```
3. 运行全场景回归测试：
   ```bash
   python -X utf8 tests/interaction_check.py
   ```
4. 严格遵守安全保密约定：**未经用户明确授权，绝不执行 `git push`**；未经允许绝不提前退出任务。
