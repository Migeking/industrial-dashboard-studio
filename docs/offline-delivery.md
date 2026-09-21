# 离线交付说明

本项目的场景页不依赖外网 CDN：Vue 3 与 ECharts 5 已固化在根目录 `vendor/`。

## 生成交付包

在项目根目录执行：

```powershell
./scripts/build-release.ps1
```

输出为 `release/industrial-dashboard-offline.zip`。解压后打开 `apps/showcase/index.html`；手机端请横屏使用。

## 交付包内容

- 互动体验入口与 SCADA 场景设计器
- 三套离线可运行样板
- 本地 Vue 3、ECharts 5、Three.js 依赖
- NGT200 空气悬浮鼓风机参数化三维模型
- 运行时、组件、设计系统和数据适配器
- 产品文档与可复用 Skill

## 数据接入边界

当前交付包默认采用本地演示数据。接现场前，需要经项目确认数据字段、刷新频率、读写权限和失败降级策略；本包不包含任何控制写入能力。
