# 工业大屏与现场 DCS 就地屏 Modbus TCP 极简极效对接方案

> **定位**：面向水务、冶炼、能源等现场工控场景，提供一套**轻量、免复杂部署、配置驱动且高可靠**的 Web 前端与 Modbus TCP PLC/DCS 对接实施指南。

---

## 一、 方案选型：为什么推荐“轻量微代理 (Sidecar Gateway) + JSON 点表驱动”？

在工控现场，我们面对的环境通常是：**配电柜嵌入式触摸屏（Linux/Win10 IoT）、工控一体机、现场维护平板或边缘网关盒子**。

### 1. 常见方案对比与第一性原理选型

| 对接方案 | 部署复杂度 | 稳定性与连接管理 | 点表修改成本 | 综合推荐度 |
| :--- | :--- | :--- | :--- | :--- |
| **A. 纯浏览器直连 (Direct Sockets)** | 极高（需特定实验版浏览器与证书） | 差（每个Tab占一个PLC连接，易冲垮PLC） | 高（前端手写字节反转与位运算） | ❌ 仅限实验 |
| **B. 重型 SCADA 中转 (WinCC/KingView/Kepware)** | 极重（笨重、依赖Windows、昂贵商业授权） | 强 | 中（需在第三方组态软件中配置变量） | ⚠️ 成本过高，违背轻量初衷 |
| **C. 【推荐】轻量配置型微网关 (Sidecar Bridge)** | **极简（单文件免安装，内存 < 15MB）** | **极高（单TCP连接复用，带断线重连与防抖）** | **极低（Excel导出 JSON/YAML 声明式点表）** | **⭐⭐⭐⭐⭐ 最佳实践** |

### 2. 推荐方案架构图

```
┌─────────────────────────────────────────────────────────────────┐
│               工业现场工控机 / 嵌入式触摸屏 (HMI)               │
│                                                                 │
│  ┌───────────────────────┐            ┌──────────────────────┐  │
│  │ 前端 Web 页面 (Vue 3) │            │ 本地轻量微网关服务   │  │
│  │                       │  WebSocket │ (单二进制免安装程序) │  │
│  │ 现场 DCS 就地控制屏   │ <========> │                      │  │
│  │ 威纶通风格 HMI 界面   │ (推送/写入)│ 点表解析引擎 (JSON)  │  │
│  └───────────────────────┘            └──────────┬───────────┘  │
└──────────────────────────────────────────────────┼──────────────┘
                                                   │ Modbus TCP (端口 502)
                                                   │ 独占长连接 / 防抖优化
                                                   ▼
                                        ┌──────────────────────┐
                                        │ 现场 PLC / DCS 控制器 │
                                        │ (西门子/汇川/施耐德) │
                                        └──────────────────────┘
```

**核心优势**：
1. **零学习成本**：前端工程师不用管二进制报文 CRC、大端小端颠倒、高低字交换，前端只看懂清晰的 JSON 字典对象；
2. **保护现场硬件**：由微代理独占 PLC 的唯一 Client 连接，高频轮询经过聚合优化，防止前端多个页面把小型 PLC 通讯板卡拖死；
3. **点表与界面完全解耦**：现场自控工程师更改寄存器地址时，只需要改动点表配置文件，前端 UI 零代码修改！

---

## 二、 拿到现场 PLC Modbus 点表后的“5 步操作法”

在冶炼与水务现场，自控工程师或电气工程师通常会交给你一张 Excel 点表。以下是标准的五步工程化处理流程：

### 第一步：辨识点表地址类型与 Modbus 功能码

根据现场点表中的地址前缀，快速归类其物理含义与读写属性：

| 地址前缀规范 | 物理含义 | 访问权限 | 对应 Modbus 功能码 | 典型现场信号举例 |
| :--- | :--- | :--- | :--- | :--- |
| **0x (00001~09999)** | 输出线圈 (Coil) | **读/写 (RW)** | FC 01(读) / FC 05(写单个) / FC 15(写多个) | 水泵就地启停控制、阀门全开/全关指令 |
| **1x (10001~19999)** | 离散输入 (Discrete Input) | **只读 (RO)** | FC 02(只读) | 运行反馈、过载跳闸、阀门开到位限位开关 |
| **3x (30001~39999)** | 输入寄存器 (Input Reg) | **只读 (RO)** | FC 04(只读) | 进水管压力变送器 (4-20mA)、电机轴温热电阻 |
| **4x (40001~49999)** | 保持寄存器 (Holding Reg) | **读/写 (RW)** | FC 03(读) / FC 06(写单个) / FC 16(写多个) | 变频器当前频率、目标频率设定值、PID 参数 |

> **避坑提醒（1-based vs 0-based 偏移量）**：
> - 很多点表写 `40001`，在协议底层真实发送的偏移地址是 `0`（即 `Addr - 40001`）；
> - 写 `40005`，底层偏移地址通常是 `4`。在配置微代理时，需明确是填绝对地址还是偏移地址。

---

### 第二步：确认数据类型与字节顺序（大小端字交换）

工业现场 1 个 Modbus 寄存器为 16 位（2 字节）。如果点位是 32 位整型或单精度浮点数（FLOAT32），会占用连续的 2 个寄存器。必须在点表上与电气工程师确认**字节顺序（Byte Order）**：

- **INT16 / UINT16**（占 1 个寄存器）：
  - 通常为标准大端序（AB）；
- **FLOAT32 / INT32**（占 2 个寄存器，4 字节）：
  - **ABCD**：大端序（Big-Endian，高字高字节在前）
  - **CDAB**（**国内西门子、汇川 PLC 最常见！**）：大端字交换（Word-Swapped，小端字大端字节）
  - **BADC**：小端高字节前置
  - **DCBA**：纯小端序

---

### 第三步：工程量系数换算（Scale & Offset）

现场传感器原始值与界面物理读数通常存在线性倍率：
1. **定点小数放大**：
   - 变频器频率：寄存器存的是整数 `4500`，实际工程单位是 `45.00 Hz`，则换算系数：`scale = 0.01`；
2. **PLC 模拟量采样原生码值换算**：
   - 西门子标准 AI 模块：`0 ~ 27648` 对应压力变送器 `0.0 ~ 1.6 MPa`；
   - 换算公式：$P = \frac{\text{Raw}}{27648} \times 1.6$。

---

### 第四步：建立声明式点表配置文件 (`modbus-points.json`)

将 Excel 梳理出的结果直接填入声明式 JSON 配置文件：

```json
{
  "plc_connection": {
    "host": "192.168.1.50",
    "port": 502,
    "slave_id": 1,
    "poll_interval_ms": 200,
    "timeout_ms": 1000
  },
  "points": {
    "P1_RUN_CMD": {
      "desc": "1#变频泵启动指令",
      "address": 1,
      "type": "coil",
      "access": "rw"
    },
    "P1_RUN_FEEDBACK": {
      "desc": "1#变频泵运行状态反馈",
      "address": 10001,
      "type": "discrete",
      "access": "ro"
    },
    "P1_CURRENT_FREQ": {
      "desc": "1#变频泵当前运行频率",
      "address": 40002,
      "type": "int16",
      "scale": 0.1,
      "unit": "Hz",
      "access": "ro"
    },
    "P1_TARGET_FREQ": {
      "desc": "1#变频泵目标频率给定",
      "address": 40003,
      "type": "int16",
      "scale": 0.1,
      "unit": "Hz",
      "access": "rw"
    },
    "P1_RUN_CURRENT": {
      "desc": "1#变频泵运行电流",
      "address": 40005,
      "type": "float32_cdab",
      "scale": 1.0,
      "unit": "A",
      "access": "ro"
    },
    "PIPE_PRESS_OUT": {
      "desc": "出水总管母管压力",
      "address": 40010,
      "type": "float32_cdab",
      "scale": 1.0,
      "unit": "MPa",
      "access": "ro"
    }
  }
}
```

---

### 第五步：前端极简绑定（两行代码实现闭环）

前端无需解析 Modbus，微网关会通过 WebSocket 以毫秒级向前端广播最新的 JSON 数据字典。

#### 1. 前端接收遥测数据（UI 响应式自动同步）

```javascript
// 初始化工业适配器
const adapter = new IndustrialModbusAdapter('ws://127.0.0.1:8088/ws');

// 监听数据推送（每次 PLC 扫描周期后广播）
adapter.onTelemetry((telemetry) => {
  // 1. 状态指示灯与启停反馈绑定
  p1.running = telemetry.P1_RUN_FEEDBACK;
  
  // 2. 模拟量与浮点数读数绑定
  p1.currentFreq = telemetry.P1_CURRENT_FREQ;  // 45.0 Hz
  p1.currentAmp  = telemetry.P1_RUN_CURRENT;   // 116.8 A
  p1.pressOut    = telemetry.PIPE_PRESS_OUT;   // 0.62 MPa
});
```

#### 2. 前端下发就地控制命令（启停与调频）

```javascript
// 案例 A：点击就地启动按钮 (写 Coil 线圈)
function handleStartPump1() {
  if (p1.controlMode === 'remote') return; // 就地保护
  adapter.write('P1_RUN_CMD', true);
}

// 案例 B：通过数字小键盘写入新频率 (写保持寄存器)
function handleFreqKeypadConfirm(newFreq) {
  // 微网关自动处理 48.5 * 10 = 485，并打包成 FC 06/16 报文写入 40003 寄存器
  adapter.write('P1_TARGET_FREQ', newFreq);
}
```

---

## 三、 本地极简微网关的核心实现参考 (Node.js 极速原型)

在实际工程中，只需一个不到 100 行的极轻量 Node.js / Go 脚本即可跑通整套闭环：

```javascript
// gateway-sidecar.js (极简免配置微网关原型)
const ModbusRTU = require('modbus-serial');
const WebSocket = require('ws');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./modbus-points.json', 'utf8'));
const client = new ModbusRTU();
const wss = new WebSocket.Server({ port: 8088 });

// 1. 连入现场 PLC Modbus TCP Server
client.connectTCP(config.plc_connection.host, { port: config.plc_connection.port }, () => {
  console.log(`[Modbus] 已连入现场 PLC: ${config.plc_connection.host}:502`);
  startPolling();
});

// 2. 周期性打包轮询
async function startPolling() {
  setInterval(async () => {
    try {
      const result = {};
      // 批量读取保持寄存器 (示例读取 40001~40020)
      const data = await client.readHoldingRegisters(0, 20);
      
      // 按点表配置解析工程量
      result.P1_CURRENT_FREQ = data.data[1] * 0.1; // 40002
      result.P1_RUN_CURRENT  = Buffer.from([
        data.buffer[10], data.buffer[11], data.buffer[8], data.buffer[9]
      ]).readFloatBE(0); // 40005 CDAB 浮点数
      
      // 广播推送到所有已打开的前端触摸屏
      const json = JSON.stringify(result);
      wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(json);
      });
    } catch (err) {
      console.warn('[Modbus] 轮询异常:', err.message);
    }
  }, config.plc_connection.poll_interval_ms);
}

// 3. 处理前端控制写入指令
wss.on('connection', ws => {
  ws.on('message', async msg => {
    const { point, value } = JSON.parse(msg);
    if (point === 'P1_TARGET_FREQ') {
      await client.writeRegister(2, Math.round(value * 10)); // 写 40003
    } else if (point === 'P1_RUN_CMD') {
      await client.writeCoil(0, value); // 写 00001
    }
  });
});
```

---

## 四、 工业现场“防炸机”4大实战防御准则

1. **写保护与预选确认 (Select-Before-Operate, SBO)**：
   - 现场操作重型设备（如 160kW 循环泵），严禁在 UI 界面一点击立即发送下发报文！必须弹窗二次确认或者按下保持 1.5 秒（长按触发），避免操作员误碰屏幕；
2. **限幅与死区校验 (Sanity Clamping)**：
   - 前端与微网关必须对频率、开度强制设置硬件上下限（例如变频器严禁超过 50.0Hz，最低防烧结频率不低于 15.0Hz），非法值在进入 Modbus 报文前直接拦截；
3. **通信看门狗 (Heartbeat / Watchdog)**：
   - 网页必须监视微网关的最后推送时间戳；若超过 2.5 秒未收到 PLC 数据，屏幕中央立即亮起“通信中断”黄色警示横幅，并切断控制按钮，防止依据冻结的历史假数据进行盲操；
4. **单 Client 连接保持**：
   - 绝不允许每个页面单独开 TCP 连接去连现场 PLC；必须由微网关建立唯一长连接，前端只与微网关通信。

---

## 五、 千元以内高可靠工业屏幕选型与硬件“防炸机”落地指南

在工业现场（配电房、水泵房、冶炼车间），**“成本控制在 1000 元以内”与“7×24 小时不间断运行、绝对防炸机”不仅不矛盾，而且完全可以通过精准选型做到极致的高可靠性！**

### 1. 核心结论与主流硬件路线对比

| 硬件技术路线 | 采购成本 (RMB) | 工业可靠度 | 系统形态与部署 | 适用场景与评价 |
| :--- | :--- | :--- | :--- | :--- |
| **① 嵌入式 ARM 工业平板一体机 (RK3566/RK3568, Linux/Android)** | **¥450 ~ ¥750**<br>(7寸~10.1寸) | **极高 (⭐⭐⭐⭐⭐)**<br>无风扇被动散热、板载 eMMC、DC 24V、前面板 IP65 | **首选推荐**：系统直接以 Kiosk 模式全屏启动 Chromium 或 Android WebView，后台常驻 Go/Node 微网关。 | **性价比与稳定性之王**。功耗仅 5~8W，常年开机机身温热，抗震抗断电。 |
| **② 迷你工控小主机 + 工业触摸显示屏 (分体组合)** | **¥750 ~ ¥950**<br>(N100/J4125 + 10寸屏) | **高 (⭐⭐⭐⭐)**<br>x86 生态丰富，支持 Win10 LTSC / Ubuntu | 灵活但走线多：主机隐藏在电柜内，柜门开孔装触摸屏，中间需连 HDMI+USB 触摸线。 | 适合已有电柜内部空间、或需要兼顾其它 Windows 工业软件的现场。 |
| **③ 消费级安卓平板 (家用华为/联想等)** | **¥600 ~ ¥900** | **极危险 (❌ 严禁用于工业现场)** | 依靠电池供电，外接 Type-C 充电头，无安装固定卡扣。 | **现场必炸**：常年插电电柜内高温（40℃+）电池必鼓包甚至自燃；大电机启停浪涌极易击穿 5V 充电头；无看门狗死机无法自愈。 |

---

### 2. 工业级“防炸机”6 大硬核硬件选型指标（采购时逐条核对）

如果选择 1000 元以内的工业一体机，**必须在商务采购规格书中明确以下 6 条防炸机底线**：

#### ① 供电防炸（严禁 5V USB 供电，必须 DC 9V~36V 工业宽压）
- **现场实情**：水泵房、冶炼电柜内部存在大功率变频器、接触器通断动作，电网瞬态谐波与浪涌非常严重（经常出现数百伏尖峰脉冲）。
- **指标要求**：
  - 必须支持 **DC 12V 或 24V 工业宽压供电**（带防反接保护）；
  - 板载必须配备 **TVS 防浪涌瞬态抑制二极管** 与工业级光耦隔离。

#### ② 掉电防炸（防文件系统损坏，支持任意时刻直接拉闸断电）
- **现场实情**：现场操作工或电工维护时，从来不走“正常关机”流程，都是直接拉下配电柜空气开关断电。普通机械硬盘或廉价 TF 卡断电 3~5 次就会导致系统文件损坏无法开机。
- **指标要求**：
  - 存储必须采用 **板载焊接式 eMMC 固态芯片**（严禁外插 SD/TF 卡作为系统盘）；
  - **启用只读文件系统保护（Read-Only OverlayFS）**：系统盘只读挂载，运行中所有临时缓存写入内存（RAM-disk），现场哪怕每天暴力拉闸 100 次，重新上电 100% 正常启动！

#### ③ 环境与散热防炸（纯无风扇被动散热 + 前面板 IP65 密封）
- **现场实情**：
  - 水务场景：水雾、潮气、硫化氢轻微腐蚀；
  - 冶炼场景：导电金属粉尘、炭黑油污、高温烘烤。
- **指标要求**：
  - **整机必须为无风扇设计（Fanless）**，依靠背部铝合金鳍片大面积压铸散热（机械风扇在电柜内 3 个月必被粉尘卡死导致 CPU 保护停机）；
  - **前面板嵌入式安装防护等级达到 IP65**（带密封发泡橡胶圈），现场用水枪冲洗或粉尘飞扬时，水汽粉尘绝不渗入配电柜内部。

#### ④ 触控防误触与抗干扰选型（电容屏 vs 电阻屏）
- **如果现场有水雾水滴、或操作工戴厚绝缘手套/油污手套**：
  - **方案 A（推荐）**：选择**工业级五线电阻触摸屏**（通过压力感应，戴任何绝缘手套、沾水沾油均可精准点击，抗金属导电粉尘干扰极佳）；
  - **方案 B**：若追求现代手机般的滑动画质，可选用**带敦泰/汇顶工业级主控的投射电容屏**（必须具备“防水雾算法”和跳频抗干扰能力）。

#### ⑤ 硬件看门狗（Hardware Watchdog Timer，死机秒级自愈）
- **指标要求**：
  - 主板必须集成独立硬件看门狗芯片。系统开机后，微网关程序每隔 15 秒向看门狗“喂狗”。如果浏览器遭遇罕见的极端内存泄露或死锁卡住，看门狗在 30 秒超时后强行执行硬件冷重启，自动恢复画面，无需人工跑到现场按重启键。

#### ⑥ 通信接口电气隔离
- 网口必须具备 **1.5kV 电磁隔离**；
- 若走 RS-485 Modbus RTU，485 接口必须具备光耦隔离，防止地电位差击穿主板。

---

### 3. 千元预算推荐 BOM 采购清单 (真实市场参考)

| 配件/设备 | 推荐型号与规格参数 | 市场参考价 | 备注 |
| :--- | :--- | :--- | :--- |
| **嵌入式工业触控一体机** | **10.1 寸嵌入式工业平板 (RK3568 芯片方案)**<br>- 4核 64位 Cortex-A55 2.0GHz<br>- 内存: 2GB LPDDR4 / 存储: 16GB eMMC<br>- 屏幕: 10.1寸 IPS 液晶 (1280×800 或 1920×1080)<br>- 触摸: 工业级钢化电容屏 (或五线电阻屏)<br>- 接口: 双网口 (RJ45) + 2×RS485 + 2×USB<br>- 结构: 铝合金前面板 + IP65 + 卡扣嵌入式开孔安装<br>- 电源: DC 12V~24V 无风扇静音散热 | **约 ¥580 ~ ¥750** | 淘宝/阿里巴巴大量现货主板/整机品牌（如研越、前视、视美泰方案工控一体机）。 |
| **工业导轨电源** | 台湾明纬 (MEAN WELL) HDR-30-24 (24V 1.5A 36W) | **约 ¥45 ~ ¥55** | 卡在电柜导轨上，极度耐用。 |
| **软件系统环境** | Linux (Debian 11 / Buildroot) 或 Android 11 工控裁剪版 | **¥0 (开源)** | 零软件授权费。 |
| **总成本合计** | **整套系统硬件总成本** | **≈ ¥650 ~ ¥800 元** | **完全控制在 1000 元以内，留有充足预算！** |

---

### 4. 软件极速落地实施：让一体机变成“通电即显示”的专用触摸屏

#### 方式一：Linux 纯系统模式 (Kiosk 无头全屏，最稳定推荐)
在一体机的 Debian / Ubuntu 系统中，配置 `systemd` 开机自动全屏启动 Chromium，隐藏光标与警告：

```bash
# /etc/systemd/system/hmi-kiosk.service
[Unit]
Description=Industrial HMI Kiosk Browser
After=network.target

[Service]
Environment=DISPLAY=:0
User=root
# 一键开机进入全屏、禁用右键、禁用手势退出、禁用错误弹窗
ExecStart=/usr/bin/chromium-browser \
  --kiosk \
  --app=http://127.0.0.1:8088/23-weintek-dcs.html \
  --no-first-run \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --disable-features=TranslateUI \
  --noerrdialogs \
  --check-for-update-interval=31536000
Restart=always

[Install]
WantedBy=graphical.target
```

#### 方式二：Android 安卓工控模式 (打包极简 APK)
若一体机预装的是 Android 系统：
1. 制作一个极简的安卓原生 APP（仅包含一个满屏的 `WebView`，开启硬件加速和 LocalStorage）；
2. 在 `MainActivity` 中声明：
   ```java
   // 隐藏顶部状态栏与底部虚拟按键（沉浸式全屏）
   getWindow().getDecorView().setSystemUiVisibility(
       View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
       | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
       | View.SYSTEM_UI_FLAG_FULLSCREEN);
   
   // 载入本地打包的 HTML 页面
   webView.loadUrl("file:///android_asset/23-weintek-dcs.html");
   ```
3. 设置系统属性为 `Device Owner` 或通过工控主板自带的“开机自启助手”，锁定该 APP 为开机主屏幕，操作工无法退出到安卓桌面，实现纯粹的就地专用触摸屏体验！
