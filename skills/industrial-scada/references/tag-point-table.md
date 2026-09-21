# 工业点表与读写契约 (Tag Point Dictionary)

SCADA 系统的底层基石是变量点表（Tag / Point Database）。本文件以四台并联变频污泥回流泵站为基准案例，定义符合 OPC UA / Modbus-TCP 标准的完整点位定义。

---

## 一、点位类型与编码规范

- **命名规范**：`[系统].[区域].[设备].[属性]`，例如 `SR.SUMP.LT101.PV`。
- **点位类型 (Tag Types)**：
  - `DI` (Digital Input)：数字量输入，只读；
  - `DO` (Digital Output)：数字量输出，可写；
  - `AI` (Analog Input)：模拟量输入，只读；
  - `AO` (Analog Output)：模拟量输出，可写。

---

## 二、污泥回流泵站标准点位表 (基准案例)

### 1. 公用测点与主回路 (Sump & Header)

| 位号 (TagId) | 中文描述 | 类型 | 读写 | 工程单位 | 量程范围 | 死区/精度 | 告警上下限 |
|---|---|---|---|---|---|---|---|
| `SR.SUMP.LT101.PV` | 二沉池集泥井实际液位 | `AI` | R | m | $0.00 \sim 5.00$ | 0.01 m | LL:1.20, HH:4.50 |
| `SR.SUMP.LT101.SP` | 液位控制目标设定值 | `AO` | R/W | m | $2.00 \sim 4.00$ | 0.01 m | 缺省 3.20 |
| `SR.HEADER.FT101.PV` | 回流总管瞬时流量 | `AI` | R | m³/h | $0 \sim 2000$ | 1 m³/h | L:300 |
| `SR.HEADER.PT101.PV` | 回流母管出水压力 | `AI` | R | MPa | $0.00 \sim 1.00$ | 0.01 MPa | H:0.60, HH:0.80 |
| `SR.SYS.MODE.CMD` | 系统主控模式选择 | `AO` | R/W | 枚举 | 1:PID变频, 2:分级备用 | - | - |
| `SR.SYS.DEMAND.CNT` | 当前算法计算需求台数 | `AI` | R | 台 | $0 \sim 4$ | 1 台 | - |
| `SR.SYS.RUNNING.CNT` | 当前实际运行台数 | `AI` | R | 台 | $0 \sim 4$ | 1 台 | - |
| `SR.SYS.EMERGENCY.HH`| 高高液位紧急外排联锁标志 | `DI` | R | BOOL | 0:正常, 1:动作 | - | 优先级 3 |
| `SR.SYS.DRYRUN.LL` | 低低防干转切断联锁标志 | `DI` | R | BOOL | 0:正常, 1:动作 | - | 优先级 2 |

### 2. 单泵测点表 (以 P-01 为例，P-02~P-04 顺延)

| 位号 (TagId) | 中文描述 | 类型 | 读写 | 范围/取值 | 说明 |
|---|---|---|---|---|---|
| `SR.P01.STATUS.RUN` | 1# 泵运行反馈 | `DI` | R | 0:停机, 1:运行 | 来自接触器/变频器运行触点 |
| `SR.P01.STATUS.TRIP`| 1# 泵综合故障跳闸 | `DI` | R | 0:正常, 1:故障 | 过载/变频器故障 |
| `SR.P01.STATUS.AUTO`| 1# 泵手/自动状态 | `DI` | R | 0:手动, 1:自动 | 来自 PLC 内部模式字 |
| `SR.P01.STATUS.RDY` | 1# 泵就绪状态 | `DI` | R | 0:未就绪, 1:就绪 | 满足所有工艺启动条件 |
| `SR.P01.CTRL.START` | 1# 泵启动指令 | `DO` | R/W | 0 -> 1 (脉冲) | 需 SBO 二步确认 |
| `SR.P01.CTRL.STOP`  | 1# 泵停止指令 | `DO` | R/W | 0 -> 1 (脉冲) | 需 SBO 二步确认 |
| `SR.P01.CTRL.RESET` | 1# 泵故障复位 | `DO` | R/W | 0 -> 1 (脉冲) | 操作员复位故障锁存 |
| `SR.P01.CTRL.MODE`  | 1# 泵模式切换请求 | `DO` | R/W | 0:转手动, 1:转自动 | 操作员切模式 |
| `SR.P01.VFD.FCMD`   | 1# 变频器频率命令 | `AO` | R/W | $28.0 \sim 50.0\ Hz$ | 手动模式下可直接下发 |
| `SR.P01.VFD.FACT`   | 1# 变频器实际输出频率 | `AI` | R | $0.0 \sim 50.0\ Hz$ | 变频器通讯回读值 |
| `SR.P01.ELEC.CURR`  | 1# 电机运行电流 | `AI` | R | $0.0 \sim 40.0\ A$ | CT 电流变送 |
| `SR.P01.MECH.TEMP`  | 1# 轴承/线圈温度 | `AI` | R | $0.0 \sim 120.0\ ℃$ | PT100 测温 |
| `SR.P01.TOTAL.HOURS`| 1# 泵累计运行时间 | `AI` | R | $0 \sim 99999\ h$ | 用于均时轮换算法判定 |
