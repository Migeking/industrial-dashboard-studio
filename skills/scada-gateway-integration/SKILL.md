---
name: scada-gateway-integration
description: 工业大屏与 SCADA 工艺场景无缝集成至 Smart Gateway 边缘网关前端（Vue 3 + Vite）的标准化规范与实施指南。涵盖“大屏（全局态势）”与“SCADA（上位监控与双向控制）”的分类原则、单文件 HTML 到 Vue 3 SFC 的 5 分钟极速平移骨架、网关数据采集（REST/WebSocket）与 SBO 反向控制闭环绑定。
---

# 工业大屏与 SCADA 网关集成指南 (SCADA Gateway Integration)

本指南规范了如何将由 AI 或人类设计制作的独立工艺大屏/SCADA场景，低成本、零污染、高效稳定地集成到工业边缘网关（如 `smart-edge-gateway` 的 Vue 3 + Vite 前端体系）中，实现一体化交付与上位闭环控制。

---

## 一、 核心定位与用途分类：大屏 vs SCADA

在集成到网关前端之前，必须首先明确该场景的业务用途：

| 维度 | 大屏看板 (Big Screen / Dashboard) | 上位监控 (Web SCADA / HMI) **[核心侧重]** |
| :--- | :--- | :--- |
| **核心受众** | 厂级领导、参观来宾、调度大屏、综合管理人员 | 中控值班员、自控工程师、电气维保人员、站所操作工 |
| **主要功能** | 全厂综合态势、水质/电耗 KPI 指标、日/月处理量、设备开机率统计 | 工艺流程拓扑、单台设备微观状态监视、**反向启停控制、频率调节、阀门开度设定** |
| **交互要求** | 极少交互或仅支持只读点击下钻、全屏自动轮播巡检 | **必须支持 Faceplate 设备小面板、预选-执行两步确认 (SBO)、参数限幅与防误** |
| **告警等级** | 汇总式告警计数、告警轮播横幅 | **ISA-18.2 声光报警、未确认高亮闪烁、操作员一键确认 (ACK)、操作审计记录** |
| **网关对应** | 主要消费网关历史数据、统计接口、运行日记 | **强绑定网关实时点表 (`/device/points`)、WebSocket 高频广播、写指令 (`/device/write`)** |

> **关键准则**：若场景包含设备启停、频率设定、阀门调节等操作，必须按 **SCADA 上位监控** 规格集成，禁止随意降级为纯只读展示页面。

---

## 二、 5 分钟极速平移范式：HTML 到 Vue 3 SFC

独立场景（如单文件 HTML）平移为网关 Vue 3 单文件组件（`.vue`）时，遵循以下结构映射规则：

```
[独立 HTML 文件]
  ├── 1. <style> 样式定义       ──> 放入 Vue 的 <style scoped>，顶层必须挂载 .scada-workbench
  ├── 2. <body> 工艺画卷与 DOM   ──> 放入 Vue 的 <template> 模板
  └── 3. <script> 缩放与交互     ──> 放入 Vue 的 <script setup>，由 onMounted / onUnmounted 管理
```

### 1. 标准 Vue SFC 骨架模板

```vue
<template>
  <div class="scada-workbench" ref="workbenchRef">
    <!-- 顶部工业工具条：返回控制台与全屏切换 -->
    <header class="scada-toolbar" v-if="showToolbar">
      <div class="toolbar-left">
        <button class="nav-btn" @click="handleBack">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span>返回控制台</span>
        </button>
        <span class="scene-title">{{ sceneTitle }}</span>
        <span class="status-tag" :class="online ? 'online' : 'demo'">
          {{ online ? '网关实时驱动' : '仿真演示模式' }}
        </span>
      </div>
      <div class="toolbar-right">
        <button class="tool-btn" @click="toggleFullScreen">
          <span>{{ isFullScreen ? '退出全屏' : '中控全屏模式' }}</span>
        </button>
      </div>
    </header>

    <!-- 1920x1080 基准画布容器 -->
    <div class="scada-canvas-wrapper" :style="wrapperStyle">
      <div id="scada-canvas" :style="canvasStyle">
        <!-- 原始 SVG 拓扑网络、泵组、水池、仪表、右侧监控面板 -->
        <slot name="content"></slot>
      </div>
    </div>

    <!-- Faceplate 设备控制小面板与 SBO 确认模态框 -->
    <div v-if="activeFaceplate" class="faceplate-backdrop" @click.self="closeFaceplate">
      <!-- 包含参数调节、SBO 启停确认对话框 -->
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getDeviceMonitorPoints, writeDevicePoint } from '@/api/device-monitor'
import { createDeviceMonitorWs } from '@/utils/device-monitor-ws'

const router = useRouter()
const workbenchRef = ref(null)
const isFullScreen = ref(false)
const online = ref(false)

// 1. 1920x1080 视口自适应等比居中缩放
const scale = ref(1)
const updateScale = () => {
  const targetWidth = 1920
  const targetHeight = 1080
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight - (showToolbar.value ? 48 : 0)
  const scaleX = windowWidth / targetWidth
  const scaleY = windowHeight / targetHeight
  scale.value = Math.min(scaleX, scaleY)
}

// 2. 网关实时点位对接与优雅降级
let pollTimer = null
const initGatewayBinding = async (deviceSn) => {
  try {
    const res = await getDeviceMonitorPoints(deviceSn)
    if (res && res.code === 200 && res.data) {
      online.value = true
      applyPointsToScene(res.data)
    }
  } catch (err) {
    console.warn('[SCADA] 网关离线，自动切入平滑演示模式')
    online.value = false
    startDemoSimulation()
  }
}

// 3. SBO（Select-Before-Operate）安全控制下发
const executeSboControl = async (deviceSn, pointName, targetValue, deviceName) => {
  try {
    await ElMessageBox.confirm(
      `安全确认：即将向【${deviceName}】下发写入指令，设定值：${targetValue}。请确认现场无人员巡检且具备操作条件。`,
      '上位控制二次防误确认 (SBO)',
      {
        confirmButtonText: '确认下发',
        cancelButtonText: '取消操作',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )
    
    // 执行下发
    const res = await writeDevicePoint(deviceSn, pointName, targetValue)
    if (res && res.code === 200) {
      ElMessage.success(`指令已成功投递至网关：${pointName} -> ${targetValue}`)
    } else {
      ElMessage.warning(`下发完成（状态：${res ? res.message : '已记录'}）`)
    }
  } catch (action) {
    if (action !== 'cancel') {
      ElMessage.info('已取消操作')
    }
  }
}
</script>

<style scoped>
/* 必须将原有 SCADA 样式封在 .scada-workbench 内部，防止污染外层 */
.scada-workbench {
  width: 100vw;
  height: 100vh;
  background: #060b14;
  overflow: hidden;
  position: relative;
}
/* ...原有 CSS 规则原样迁移... */
</style>
```

---

## 三、 网关首页集成：增加“上位监控 (SCADA)”大卡片

在网关首页 `front/src/views/index.vue` 的 `modules-section` 中，上位监控作为网关的核心能力，应排在突出前列。

### 1. 卡片模板与样式设计
```html
<!-- 上位监控 (SCADA 数字孪生) 核心大卡片 -->
<div class="module-card scada-card" @click="goToScadaMonitor">
  <div class="card-glow scada-glow"></div>
  <div class="card-header">
    <div class="card-icon scada">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M3 3v18h18"/>
        <path d="M19 9l-5 5-4-4-3 3"/>
        <circle cx="9" cy="9" r="2"/>
        <circle cx="17" cy="5" r="2"/>
      </svg>
    </div>
    <div class="card-arrow">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </div>
  </div>
  <div class="card-content">
    <h3 class="card-title">上位监控</h3>
    <p class="card-desc">1920×1080 工业级 SCADA 数字孪生、工艺管网拓扑与 SBO 二次确认防误控制</p>
  </div>
  <div class="card-footer">
    <span class="card-tag scada-tag">SCADA TWIN</span>
  </div>
</div>
```

---

## 四、 验收清单 (Acceptance Checklist)

每次完成场景迁移后，必须核对以下项：
1. **缩放自适应**：在 1366×768、1920×1080、2560×1440 等分辨率下画布居中等比缩放，无滚动条溢出。
2. **样式无泄漏**：返回网关后台（`MainLayout`）时，后台侧边栏与文字样式未被大屏 CSS 破坏。
3. **SBO 闭环防误**：设备操作必须弹出二次确认，参数超出硬限幅（如频率 > 50Hz）必须阻断。
4. **容灾降级机制**：在未连接真实 PLC 网关时，自动进入平滑演示，无控制台红字报错。
