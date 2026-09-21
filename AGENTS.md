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
- `scenarios/`：按 `water-treatment`、`predictive-maintenance`、`reactor-safety` 分组的场景页面与场景配置。
- `packages/`：后续抽取的运行时、组件和数据适配器。
- `skills/`：可复用 Codex Skill。
- `tests/`：自动化验收。
- `release/`：面向交付的压缩包和版本材料。
