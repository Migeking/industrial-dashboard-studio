---
name: industrial-hmi-classic
description: 构建面向市政水务行业（污水厂/自来水厂/泵站/调蓄池）的西门子博途（TIA Portal / WinCC）风格经典工业上位机 SCADA。遵循 ISA-101 灰度低视疲劳标准、城镇水务流体管网标准色标、标准 P&ID 工业符号图元库、西门子经典 Faceplate 垂直彩色棒图与立体下凹 I/O 域规范。
---

# Industrial Classic HMI / SCADA (Water & Wastewater Edition)

构建符合市政水务行业（城镇污水处理厂、自来水厂、排水泵站、流域调蓄系统）中控室运行要求的**经典工业上位机 SCADA 系统**。

与展示型驾驶舱及暗色终端不同，本规范专为**水厂操作员、工艺工程师与运行班组（值守 8~12 小时）**设计，核心聚焦于：
- **ISA-101 灰度哲学**：无眩光工业冷灰基底（`#DDE2E8`），正常运行低饱和静默，异常报警高对比度激活，大幅降低人眼视疲劳；
- **城镇水务管网标准色标与正交走线**：污水、回流污泥、出水清水、曝气风管、碳源药液采用行业标准色标，正交转角并自带标准跨线弧（Jumper）；
- **标准水处理 P&ID 工业图元体系**：池体侧立面剖面带有效水深标高米标尺（m）、潜水回流泵/排污泵、离心鼓风机、隔膜计量加药泵、水质在线仪表气泡（`AIT/FIT/LIT`）与经典立体下凹 I/O 域；
- **西门子水务标准 Faceplate（画面窗口）**：具备量程 0~100%、标注 HH/H/L/LL 报警标尺与 SP 黄金三角游标针的**垂直彩色棒图**、点动微调按钮（`+0.1` / `-0.1`）、手自动模式切换、PID 整定曲线与 SBO 两步防误确认；
- **水厂中控专业交互**：顶栏工艺工段快速切换树（格栅 → 生化 → 二沉 → 脱水 → 消毒）、三级操作权限控制锁、S7-1500 PLC 通信状态看门狗、多笔同轴水质趋势图（Trend View）与常驻报警消音确认栏。

## 必读参考规范

1. [references/isa101-style-guide.md](references/isa101-style-guide.md)：水务中控 ISA-101 工业灰度低视疲劳配色与态势感知准则。
2. [references/water-treatment-pid-library.md](references/water-treatment-pid-library.md)：水厂标准 P&ID 图元库、流体管道色标与跨线规范。
3. [references/siemens-water-faceplate.md](references/siemens-water-faceplate.md)：西门子博途 / WinCC 水务标准 Faceplate 垂直棒图与立体控件设计规范。

## 校验验收工具

```bash
node skills/industrial-hmi-classic/scripts/validate-hmi.js <html-file>
```
