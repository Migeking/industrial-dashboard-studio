# 场景完成与自动化交付闭环规则 (Delivery Workflow Rule)

## 核心约定

当任何工业大屏、3D 数字孪生或 SCADA/就地控制场景开发完成，且通过合规校验与交互回归测试后，必须主动执行或提醒用户执行标准化交付闭环。

## 闭环操作流水线

1. **测试验收**：
   - 运行 `node skills/industrial-dashboard/scripts/validate-dashboard.js scenarios`
   - 运行 `python -X utf8 tests/interaction_check.py`

2. **实机截图归档**：
   - 捕获 1920×1080 视口主图至 `docs/screenshots/<编号>-<英文语义>.png`
   - 捕获工况或微操特写至 `docs/screenshots/states/`
   - 更新主体验包截图 `docs/screenshots/showcase.png`

3. **体验包集成**：
   - 在 `apps/showcase/index.html` 侧边栏追加新场景卡片

4. **双语文档全量同步**：
   - 更新 `README.md` 与 `README_EN.md` 的场景总套数与效果总览分类表格
   - 撰写场景详解、工艺控制逻辑并嵌入对照画廊
   - 更新目录结构树

5. **本地验证与用户授权机制**：
   - 所有变更必须在本地完成验证与自测；
   - **严禁擅自执行 `git push`**：本项目包含内部工程与专用资产，未经用户明确授权许可，绝对禁止执行任何向远端仓库的推送命令（git push）。

## 核心安全与行为红线

1. **绝对禁止擅自推送**：内部工程严格保密，所有代码、设计图、配置及截图仅在本地工作区流转。严禁私自推送到 GitHub 等任何公共或远程平台。
2. **未经允许不能自行退出**：在任务执行、排查、演练或任何工程推进过程中，未经用户明确指令，绝不允许自行宣告终止、离线或退出会话。必须有始有终，按步汇报并持续等待用户下一步指令。

