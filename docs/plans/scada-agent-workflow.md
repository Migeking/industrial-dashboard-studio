# SCADA 画面助手：选型与实施计划

建议采用 **(a) 在现有画布里接入有限的 Agent 能力**。先把手工绘图和辅助绘图共用的命令做稳，再用 05 泵站评估模型直连、Pi 核心和 DSH 最小组合。现有监视、离线浏览、保存和发布继续独立运行。本文件是后续实施方案；调研依据为公开产品文档，尚未安装或实测这些 Agent 框架。2.5D 前置交付已具备完整的绘图、绑定、跨页复用和发布链路，见 [2.5D 验收](../acceptance/scada-depth.md)。A1 / A2 已实现并通过空白四泵实测，见 [命令与预演验收](../acceptance/scada-agent-commands.md)。A3 已实现「AI 画图」对话入口、Ollama 调用、图结构编译与预演流程；模拟接口回归通过，本机 7B 模型已重新下载并校验，13 号真实模型已跑通增量补图、接管、绑点、整批撤销与发布，见 [13 号实测](../acceptance/scene13-real-model.md)。原版三维还原与手工/辅助效率对照仍未完成。

## 同类产品里真正值得搬过来的做法

| 参考 | 已查证的能力 | 本项目采用的做法 |
| --- | --- | --- |
| Siemens WinCC Unified、TIA Openness / SiVArc | 通过工程 API 和规则、模板生成画面及对象；Engineering Copilot 可建立含页眉和导航的初版 HMI | 用户给出拓扑与规则后生成可编辑的对象、连线和绑定，画面仍由编辑器所有；从一个局部任务开始 |
| Ignition Perspective | 组件属性可直接或间接绑定 Tag；拖放能创建绑定，可复用视图参数 | 选设备后按槽位列出匹配点，显示类型、单位和来源；复制支路时可复用槽位，换设备后重新绑点 |
| FUXA | 浏览器内设计 SCADA/HMI，提供工业通信与图形编辑 | 借鉴通道、点表与画面编辑的衔接；保留本项目已有 X6、采集桥接和离线模型，不再并入另一套编辑器 |
| 威纶通 EasyBuilder Pro、PTC Kepware | 地址标签库可分类与搜索；Kepware 有通道、设备、点和点组的命名层级 | 用「设备组 → 测点」选点，模型只能在工程师选定的点组中找候选；地址配置留在原点表 |

## 三种接入方式的取舍

| 方式 | 适用场景 | 代价与取舍 | 决定 |
| --- | --- | --- | --- |
| (a) 编辑器内置画面助手，直连支持工具调用的模型 | 单画面或选中区域的布局、拓扑、绑点与检查 | 只维护命令和短调用循环，但要自行处理超时、取消、结果校验；可先用固定回放，无需账号 | **首选**。DeepSeek 模型只是一个可替换的调用适配器 |
| (b) DeepSeek Harness（DSH） | DSH 真实存在，是公开预览的开源插件框架；核心有会话、工具注册和循环，仓库文档另有 `dsh-sdk-minimal` | 可复用会话与插件机制；整平台接入会扩大依赖和回归，仍需自己定义泵、端口和绑定命令 | **不整合进整个 HMI**。只有明确出现跨文件、长会话或可复用插件需求时，再测最小 SDK |
| (c) Pi | Pi 提供 `@earendil-works/pi-agent-core`、TypeScript SDK 和 RPC；Pi 1.0 与实验性的 Pi Durable 是不同选择 | 核心适合轻量循环；完整 CLI 带有工作区工具，Pi 官方明确没有内建的进程/文件/网络权限系统 | **第二候选**。只用核心跑同一组任务；不引入完整 CLI 或 Durable 作为首版产品依赖 |

(a) 是产品形态，(b)/(c) 是实现选择，可以组合。首版先用单个模型、有限轮次，避免同时建插件系统、后台代理和聊天中心。

## 工程师在画布上如何使用

1. 在空白画面选一组模拟点，打开顶部的「AI 画图」，输入「画集泥井、两台并联泵、各一个止回阀和出水母管；运行反馈使用 P-01、P-02；第三台不要画」。也可框选一条现有支路，让助手在原位对齐、补端口或检查绑定。
2. 助手放置通用图元，端口和管道沿现有定义，连接后的正交走线由编辑器计算。若用户没说明所用端口或介质、槽位与多个点都可能匹配，则标出待选项；不按名字猜测 PLC 地址、实际接线或状态含义。对可判定的一对一匹配仍在预览标注来源。
3. 原画布上显示新增、移动、接管和绑点，侧栏按对象列出变化和未决项。工程师能点中对象回原属性面板，也能先应用已校验的绘图部分，再手工补足绑定。整批应用形成一个撤销步骤。草稿状态正常保存，发布仍走原有预检。
4. 用模拟数据检查运行、停止、故障、坏质量及恢复，确认读数和流动指示。辅助设计关闭或不可用时仍能完成上述手工流程。

## 最小实现合同

画布读取与写入都以现有 `screen-document`、图元目录和槽位定义为准。工具通过当前场景和当前选择的投影视图工作；首版不开放任意 JSON Patch、脚本或底层文件操作。

| 入口 | 输入与结果 |
| --- | --- |
| `get_scene`、`list_components` | 返回当前页的对象 ID、几何、已有端口、槽位、边及可用图元，不带工程资源文件 |
| `find_points` | 限定在工程师选择的点组；返回候选 ID、名称、类型、单位和质量，不返回现场协议地址、凭据和实时工艺值 |
| `propose_changes` | 输入 `{pageId, baseRevision, operations}`；每项只允许 `addNode`、`moveNode`、`setAppearance`、`addPort`、`connect`、`bindSlot`。用操作内临时 ID 引用新节点；绑定可指定候选点 ID 或保持待选。结果为预览、未决项和校验结果 |
| 编辑器「应用」 | 用户动作，非 Agent 工具。对照预览对应的修订版再次校验，在副本上执行后一次替换草稿并记一条撤销；用户在预览期间改动了草稿时要求重新生成，重复点击不二次提交 |

尽量复用 `screen-symbols.mjs` 的 `screenPorts` / `screenSlots`、`screen-model.mjs` 的校验和 `app.mjs` 的编辑与撤销入口。先抽一层可测试的纯命令执行函数，让按钮和辅助提议共用；既有 `/api/draft` 和 `/api/publish` 继续是现有工程入口，Agent 不持有调用能力。首轮做编辑器内部接口；当确有第三方接入方时，再用同一套命令封装 API 或 MCP，避免维护两套路由。

校验包括画面范围、有限坐标及对象数，端口存在与去重，连线属于当前页，测点类型和单位是否与槽位相符，输入键是否在白名单内。无效批次不得部分改写草稿。需要移除或覆盖的现有绑定一律视作待选。模型的结构化输出仅保证格式，关系和权限以编辑器校验为准。单次请求失败可重试或取消，画布不变；关闭 Agent 不影响应用。云端比较只发送合成点表和脱敏几何，不发送设备地址、凭据、现场读数或截图。

## 实施顺序与放行门槛

1. **命令与真画布验收。** 用固定回放从空白画出 05 双泵子网，补齐端口和折线，预演候选点，确认应用、撤销、保存重开与模拟发布；没有模型也必须通过。覆盖缺失端口、方向/拓扑不一致、跨页引用、未授权点及坏质量；覆盖旧修订、重复提交、半批失败和撤销完整性。
2. **单模型对照。** 同一人分别手工和辅助完成「从空白画双泵」「给已选支路补图和绑定」「整理支路且保持原有拓扑」。至少各重复三次并交错顺序，以从开始到工程师确认的总时长计入返工。放行目标：错绑、无效连接、越界改动均为零；所有歧义显式保留，保存和发布结果等价；辅助中位时间至少减少 30%。另记录采纳率、手工修订数、每次耗时与模型调用成本，未达标先优化点表和命令。
3. **条件触发框架对照。** 只有单模型循环出现可重复的会话恢复、多轮稳定性或工具复用缺口，才用同模型、同输入、同命令分别测试 Pi 核心和 DSH 最小 SDK。比较成功率、延迟、冷启动、新增依赖和持久化，实测能解决缺口才引入。首版无通用后台任务和全平台迁移。

## 首轮任务、文件落点与验收产物

| 步骤 | 具体实现 | 验收产物与完成条件 |
| --- | --- | --- |
| A1，命令执行器 | 新建 `packages/runtime/studio/screen-commands.mjs`，把纯数据的加图元、移动、连接、外观和绑定命令与校验集中处理。显式接收当前页、允许点集、修订及数量上限，不操作 DOM 或文件。复用 `screenNode` 与现有模型校验 | 双泵子网命令 fixture、纯模型检查；坏引用、错误类型、越界和旧修订全部拒绝，原文档逐字段不变；正确批次产生可发布文档 |
| A2，原画布预演 | 在 `apps/scada-designer/studio` 增加一个辅助设计面板。`app.mjs` 维护原草稿与提议副本；`screen-renderer.mjs` 用同一渲染器显示预演，通过颜色边框标出变化，取消返回原草稿 | 从空白画双泵，以及在已选支路上整理位置；取消不改草稿，应用产生一条撤销，点位存在歧义时列出对象和候选，允许工程师就地选点 |
| A3，接一个模型 | `apps/scada-designer` 增加单请求模型适配器；服务端读取本地模型地址和密钥，仅执行本轮指定的只读工具和 `propose_changes`。连接值、凭据不进入保存工程或离线包。当前最多 3 次校验修正、总计 10 分钟，可取消；适配本机慢模型，不视为性能承诺 | 使用同一合成点表比较三类任务，记录耗时、采纳、返工、请求数和费用；故障时原画面照常编辑。没有模型配置时清楚显示不可用，可照常手工操作 |
| A4，工程工作流验收 | 把模型提议落到 05 同款通用图元：集泥井、两条泵支路、止回阀、母管和流量计，使用 2.5D 外观。沿现有数据连接配置页面选择 OPC UA / Modbus 测点；第一轮使用模拟数据 | `works/scada-agent-acceptance/` 保存人工与辅助计时、差异清单、工程、截图及发布/离线结果；零错绑和零无效连接，原有软件回归通过。接现场时沿既有只读链路验证，不把模拟结果当作现场结论 |

首批只需上述模块和面板。不增加任务队列、向量库、独立绘图服务、多 Agent、自动装插件或组件市场。工期在 A1/A2 实测后估算，避免在尚未提取命令入口前给出确定天数。

示例是提议合同草案，实施时应与 `screen-document` 实际字段联测；不是现有已开放的 HTTP 接口：

```json
{
  "pageId": "main",
  "baseRevision": "draft-17",
  "operations": [
    {"op":"addNode","tempId":"pumpA","symbol":"pump","x":620,"y":280},
    {"op":"setAppearance","id":"pumpA","appearance":"depth"},
    {"op":"bindSlot","id":"pumpA","slot":"run","pointId":"P-01.run"}
  ]
}
```

`tempId` 仅在该批次内有效，由编辑器生成正式 ID；连接必须显式提供双方的节点与端口。修订以当前文档内容的稳定指纹或本地单调版本判定，不能使用会每秒变化的实时点值。提议预演和应用必须使用同一批次标识；API 重发不重复添加设备。状态质量不允许被外观或生成规则盖过，图稿只能从内置目录或用户项目内资源选择。

首轮成功的判断是工程师从空白完成一张可发布画面更快、关系正确、可继续手工修改。聊天回答好看和生成一张图片均不能替代这个验收。

## 一手资料

以下为本轮重新访问的一手资料；运行时选型结论是结合现有 Node.js / Vue / X6 架构的工程判断，未进行框架性能跑分。


- [Siemens WinCC Unified Engineering](https://www.siemens.com/en-us/products/simatic-hmi/wincc-unified-engineering/)；[Siemens Engineering Copilot TIA](https://www.dex.siemens.com/industrialsoftware/automation-software/engineering-copilot-tia-essential-self-service)
- [Ignition Perspective 属性绑定](https://www.docs.inductiveautomation.com/docs/8.1/ignition-modules/perspective/working-with-perspective-components/bindings-in-perspective/tag-bindings-in-perspective)；[威纶通地址标签库](https://dl.weintek.com/public/EBPro/UserManual/eng/UserManual_separate_chapter/Chapter-16-Address-Tag-Library-UserManual-eng.pdf)；[PTC Kepware 点定义](https://support.ptc.com/help/kepware/kepware_server/en/kepware/server/what-is-a-tag.html)
- [FUXA 官方工程](https://github.com/frangoteam/FUXA)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)；[DSH 核心与最小组合](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md)；[DSH 最小组合 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/sdk-minimal/README.md)；[DeepSeek 工具调用](https://api-docs.deepseek.com/guides/tool_calls/)
- [Pi 官方源码和权限说明](https://github.com/earendil-works/pi)；[Pi 1.0 与 Pi Durable 公告](https://earendil.com/posts/pi-1-0/)


## A1 / A2 当前交付

命令执行器、05 泵站确定性任务、原画布预演、槽位选点、整批应用和单次撤销已完成。空白四泵实测为 18 个图元 / 20 段管道 / 34 处绑定；取消预演、先画后绑、删除后补图、保存发布及离线已覆盖。普通编辑与辅助设计共用 screen-document、图元构造、端口/槽位校验和撤销历史。A1 / A2 的固定任务不依赖模型；A3 已新增自然语言入口，将模型图结构转成同一命令合同，继续经过预演和人工应用，13 号真实模型工作流已通过，原版三维外观与效率对照仍待后续验证。详见 [验收及 API 合同](../acceptance/scada-agent-commands.md)。
