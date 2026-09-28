const fs = require('fs');
const path = require('path');

const srcHtmlPath = path.resolve(__dirname, '../scenarios/water-treatment/21-粗格栅及进水提升泵房数字孪生SCADA.html');
const destVuePath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\views\\scada\\PumpStationScada.vue';

const html = fs.readFileSync(srcHtmlPath, 'utf8');

// 提取 style
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (!styleMatch) {
  console.error('未找到 <style> 标签');
  process.exit(1);
}
let cssContent = styleMatch[1];
// 将 html,body 限制在当前容器中
cssContent = cssContent.replace(/html,body\s*\{[^}]*\}/g, '');
cssContent = cssContent.replace(/#app\s*\{[^}]*\}/g, '');

// 提取 template 区域（即 #screen 以及弹窗部分）
const bodyMatch = html.match(/<body>([\s\S]*?)<script>/);
if (!bodyMatch) {
  console.error('未找到 <body> 内容');
  process.exit(1);
}
let bodyContent = bodyMatch[1];
// 去掉最外层 <div id="app" v-cloak> 和末尾的 </div>
bodyContent = bodyContent.replace(/^\s*<div id="app"[^>]*>/i, '');
bodyContent = bodyContent.replace(/<\/div>\s*$/i, '');

// 提取 script 区域
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!scriptMatch) {
  console.error('未找到 <script> 内容');
  process.exit(1);
}
let jsContent = scriptMatch[1];

// 提取 tags 对象
const tagsMatch = jsContent.match(/(const tags = \{[\s\S]*?\n\};)/);
const tagsBlock = tagsMatch ? tagsMatch[1] : '';

// 提取 app 对象定义
// 原文: const app = Vue.createApp({ ... }); app.mount('#app');
const appDefMatch = jsContent.match(/const app = Vue\.createApp\(\{([\s\S]*?)\}\);\s*app\.mount\('#app'\);/);
if (!appDefMatch) {
  console.error('未找到 Vue.createApp 定义');
  process.exit(1);
}
let appOptionsBody = appDefMatch[1];

// 拼装最终 Vue 单文件组件
const vueComponentContent = `<template>
  <div class="scada-page-container" ref="containerRef">
    <!-- 顶部工业悬浮控制条（用于返回网关主系统与中控全屏切换） -->
    <transition name="fade">
      <div class="scada-floating-nav" v-show="showNav">
        <div class="nav-left">
          <button class="scada-nav-btn back-btn" @click="handleBackToGateway">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            <span>返回网关控制台</span>
          </button>
          <span class="scada-nav-title">粗格栅及进水提升泵房 SCADA 上位数字孪生监控</span>
          <span class="scada-gateway-badge" :class="isGatewayLive ? 'badge-live' : 'badge-sim'">
            <span class="badge-dot"></span>
            {{ isGatewayLive ? '网关点位驱动' : '仿真演练模式' }}
          </span>
        </div>
        <div class="nav-right">
          <button class="scada-nav-btn tool-btn" @click="toggleFullScreen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
            <span>{{ isFullScreen ? '退出全屏' : '中控全屏模式' }}</span>
          </button>
          <button class="scada-nav-btn hide-btn" @click="showNav = false" title="隐藏导航条 (按 ESC 重新唤出)">
            ✕
          </button>
        </div>
      </div>
    </transition>

    <!-- 唤出导航条快捷浮标 (当被隐藏时) -->
    <button v-show="!showNav" class="scada-nav-toggle" @click="showNav = true" title="唤出操作条">
      ☰ 菜单
    </button>

    <!-- 1920x1080 工业 SCADA 画布 -->
    ${bodyContent.trim()}
  </div>
</template>

<script>
import { getMonitorDevices, getDeviceMonitorPoints, writeDevicePoint } from '@/api/device-monitor';

${tagsBlock}

export default {
  name: 'PumpStationScada',
  ${appOptionsBody.replace(/data\(\)\s*\{/, `data() {
      return {
        showNav: true,
        isFullScreen: false,
        isGatewayLive: false,
        pollGatewayTimer: null,`)}
};
</script>

<style scoped>
.scada-page-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #03070d;
  position: relative;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scada-floating-nav {
  position: absolute;
  top: 10px;
  left: 20px;
  right: 20px;
  height: 42px;
  background: rgba(7, 16, 23, 0.88);
  border: 1px solid rgba(54, 194, 255, 0.35);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 9999;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.scada-floating-nav .nav-left, .scada-floating-nav .nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scada-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(54, 194, 255, 0.12);
  border: 1px solid rgba(54, 194, 255, 0.35);
  color: #36c2ff;
  padding: 5px 12px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.scada-nav-btn:hover {
  background: rgba(54, 194, 255, 0.25);
  box-shadow: 0 0 12px rgba(54, 194, 255, 0.35);
}

.scada-nav-title {
  font-size: 14px;
  font-weight: 600;
  color: #f0f5fa;
  letter-spacing: 0.5px;
}

.scada-gateway-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.scada-gateway-badge.badge-live {
  background: rgba(47, 214, 126, 0.15);
  border: 1px solid rgba(47, 214, 126, 0.4);
  color: #2fd67e;
}

.scada-gateway-badge.badge-sim {
  background: rgba(245, 170, 57, 0.15);
  border: 1px solid rgba(245, 170, 57, 0.4);
  color: #f5aa39;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}

.hide-btn {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.15);
  color: #9ab0c2;
  padding: 4px 8px;
}

.scada-nav-toggle {
  position: absolute;
  top: 10px;
  left: 20px;
  z-index: 9999;
  background: rgba(10, 23, 34, 0.85);
  border: 1px solid rgba(54, 194, 255, 0.4);
  color: #36c2ff;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0,0,0,0.5);
}

${cssContent}
</style>
`;

fs.writeFileSync(destVuePath, vueComponentContent, 'utf8');
console.log('成功生成 Vue 3 SCADA 组件到:', destVuePath);
