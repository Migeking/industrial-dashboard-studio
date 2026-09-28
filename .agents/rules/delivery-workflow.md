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

5. **双语 Git 提交与远程推送**：
   - 必须使用中英文双语 Commit Message
   - 执行 `git push origin main`
