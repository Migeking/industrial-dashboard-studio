# 数据契约

## 实时点位

```json
{
  "tagId": "A2O.DO.AEROBIC_01",
  "name": "好氧池1溶解氧",
  "value": 2.3,
  "unit": "mg/L",
  "quality": "GOOD",
  "timestamp": "2026-09-19T17:30:00+08:00",
  "alarmState": "NORMAL",
  "writable": false
}
```

`quality` 使用 `GOOD`、`UNCERTAIN`、`BAD`、`STALE`。界面应将质量与业务报警分开表达。

## 设备

```json
{
  "deviceId": "BLW-01",
  "name": "1#磁悬浮鼓风机",
  "state": "RUNNING",
  "mode": "AUTO",
  "health": 88,
  "alarmLevel": "WARNING",
  "lastSeen": "2026-09-19T17:30:00+08:00"
}
```

设备状态至少区分 `RUNNING`、`STOPPED`、`FAULT`、`OFFLINE`；模式至少区分 `AUTO`、`MANUAL`、`LOCAL`、`BYPASS`。

## 工况脚本

演示数据按工况定义固定变化，不使用无边界随机数：

```json
{
  "id": "high-load",
  "label": "高负荷",
  "durationSec": 60,
  "changes": {
    "A2O.INFLOW": [12800, 13600],
    "A2O.DO.AEROBIC_01": [1.8, 2.2],
    "A2O.BLOWER.HZ": [42, 48]
  }
}
```

每个样板至少提供：稳态、高负荷或偏差、设备/传感器故障、恢复四种状态中的三种。

