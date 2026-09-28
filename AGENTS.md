# 工业大屏产品工作约定

## 语言与范围

- 说明文档默认使用简体中文；代码标识符使用有意义的英文。
- 本仓库只维护工业大屏产品、场景、运行时、Skill 与交付材料。
- 小红书文案、封面和运营素材继续放在 `D:\code\MyWord\content`，不复制进本仓库。

## 验收原则

- 所有场景保持 1920×1080 基准画布，并验证横屏缩放。
- 每次修改场景后运行 `node skills/industrial-dashboard/scripts/validate-dashboard.js scenarios`。
- 交互改动需运行 `python -X utf8 tests/interaction_check.py`。
- 保留场景的演示模式，不在未确认数据协议前伪造现场接入。

## 目录职责

- `apps/`：可运行应用入口，包含 `showcase` 和 `scada-designer`。
- `scenarios/`：按 `water-treatment`、`predictive-maintenance`、`reactor-safety`、`process-control`、`building-automation` 分组的场景页面与场景配置。
- `packages/`：后续抽取的运行时、组件和数据适配器。
- `skills/`：可复用 Codex Skill。
- `tests/`：自动化验收。
- `release/`：面向交付的压缩包和版本材料。

## 场景完成与自动化交付闭环

- **触发条件**：当新场景开发完成，并通过静态合规校验（`validate-dashboard.js`）与自动化交互回归测试（`interaction_check.py`）无重大问题后。
- **必须执行的交付闭环动作**（主动提醒或自动执行）：
  1. **高清截图与工况特写归档**：
     - 自动捕获 1920×1080 原生视口高清截图，保存至 `docs/screenshots/`（主图规范命名为 `<编号>-<英文语义>.png`）；
     - 捕获关键工况、弹窗或微操特写至 `docs/screenshots/states/`；
     - 同步刷新更新 `docs/screenshots/showcase.png` 总览截图。
  2. **体验包（Showcase）入口集成**：
     - 在 `apps/showcase/index.html` 侧边栏追加新场景卡片，保持场景索引与体验包 100% 同步。
  3. **中英文文档与画廊全量更新**：
     - 同步更新中文 `README.md` 与英文 `README_EN.md` 的场景总套数；
     - 在“效果总览 / Gallery”表格中增加专属工艺分类与主图嵌入；
     - 在“场景详解 / Scenario Details”中撰写工业背景、技术架构、就地/联锁控制机制与多图对照画廊；
     - 更新目录结构树中 `scenarios/` 的工段归属说明。
  4. **中英文双语提交与远端推送**：
     - Git 提交信息（Commit Message）必须使用**中英文双语**，清晰列出新增场景、硬件拟真、控制联锁、截图与文档明细；
     - 执行 `git push origin main` 确保同步推送到远端仓库，并向用户做闭环汇报。
