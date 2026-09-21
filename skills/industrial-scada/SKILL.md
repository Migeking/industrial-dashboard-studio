---
name: industrial-scada
description: 构建面向工业过程控制、设备操作与中控监视的 Web SCADA / HMI 操作终端。支持基于预选-执行（SBO）两步确认的安全写入、可拖拽的标准设备小面板（Faceplates）、PID 闭环调节、ISA-18.2 工业告警生命周期、通信超时看门狗及操作审计日志（Audit Trail）。
---

# Industrial Supervisory Control & Data Acquisition (Web SCADA)

构建可交付、高可靠、满足工业过程控制安全要求的 Web SCADA / HMI 运行终端。与只读态势大屏不同，SCADA 系统以**闭环控制、操作防误、状态回读与安全联锁**为核心，服务于中控操作员、工艺调度与电气自控工程师。

## 开始前必读

1. 阅读 [references/control-safety-contract.md](references/control-safety-contract.md)，所有涉及写入与启停的交互必须严格遵守“预选-执行（SBO）”与通信看门狗契约。
2. 阅读 [references/faceplate-specification.md](references/faceplate-specification.md)，设备与回路交互必须通过标准操作小面板（Faceplate）承载，禁止在主流程图上盲点即发。
3. 阅读 [references/tag-point-table.md](references/tag-point-table.md)，明确 DI/DO/AI/AO 点位读写属性、工程量换算与死区限幅。
4. 阅读 [references/alarm-lifecycle.md](references/alarm-lifecycle.md)，告警遵循 ISA-18.2 / GB/T 工业告警状态机（未确认/已确认/复归/消音/确认）。

## 核心输出契约

- **双向数据流支持**：点位具备 `writable: true/false` 属性；下发写入与状态回读分离，禁止无现场回读的假更新。
- **预选-执行两步确认 (Select-Before-Operate / SBO)**：
  - 点击设备节点 -> 唤起专用 Faceplate 小面板；
  - 点击危险指令（如启停、切手动、跳闸复位） -> 弹出二级安全确认对话框；
  - 确认后发送指令并启动看门狗计时，收到 ACK 后更新。
- **标准操作小面板体系 (Faceplates)**：
  - 泵/风机/电机小面板：手/自动切换、启停控制、点动、故障复位、运行工时、联锁条件；
  - 变频器调速面板：给定频率滑块与数值步进输入（硬限幅 28.0~50.0 Hz）；
  - 模拟量 PID 回路小面板：PV 测量值、SP 设定值修改、OP 手动输出、PID 趋势。
- **全生命周期告警条 (Alarm Banner)**：
  - 页面顶部常驻当前最高等级告警条；
  - 未确认告警红色闪烁 + 蜂鸣提示；
  - 提供“一键消音 (Silence)”与“一键确认 (Acknowledge)”操作。
- **操作审计追踪 (Audit Trail)**：
  - 底部或独立抽屉常驻实时操作流水日志；
  - 完整记录时间、操作员工号、对象、旧值、新值与下发结果。

## 实现与安全要求

- 所有写入必须包含前端安全限幅（Range Clamp），禁止超出工艺与设备许可的设定值下发。
- 通信心跳与看门狗：指令发送后超过 1.5s 未收到应答自动判定超时并报警回退。
- 控制台零错误，界面提供清晰的“控制权（Control Ownership）”指示（中控/就地/锁定）。

## 验证验收

完成后运行校验脚本：

```bash
node skills/industrial-scada/scripts/validate-scada.js <html-file>
```
