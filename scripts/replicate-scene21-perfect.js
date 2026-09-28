const fs = require('fs');
const path = require('path');

const srcHtml = path.resolve(__dirname, '../scenarios/water-treatment/21-粗格栅及进水提升泵房数字孪生SCADA.html');
const destVue = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\views\\scada\\PumpStationScada.vue';

const htmlContent = fs.readFileSync(srcHtml, 'utf8');

// 1. 提取原版 Style
const styleMatch = htmlContent.match(/<style>([\s\S]*?)<\/style>/);
if (!styleMatch) {
  console.error('未找到原版 style');
  process.exit(1);
}
let rawCss = styleMatch[1];

// 提取原版 CSS 变量定义块
const varMatch = rawCss.match(/:root\s*\{([\s\S]*?)\}/);
const varBlock = varMatch ? varMatch[1] : '';

// 2. 提取原版 Body (即 #screen 和 Faceplate 弹窗)
const bodyMatch = htmlContent.match(/<body>([\s\S]*?)<script>/);
if (!bodyMatch) {
  console.error('未找到原版 body');
  process.exit(1);
}
let rawBody = bodyMatch[1].trim();

// 去掉最外层 <div id="app" v-cloak> 和末尾的 </div>
rawBody = rawBody.replace(/^\s*<div id="app"[^>]*>/i, '');
rawBody = rawBody.replace(/<\/div>\s*$/i, '');

// 在 header.topbar 的 brand-title 后面，或者 brand 容器最前面，植入一个纯工业风格的“返回网关后台”轻量胶囊按钮
const brandMatch = '<div class="brand">';
const brandReplacement = `<div class="brand">
        <button class="gateway-nav-btn" @click="handleBackToGateway" title="返回网关控制台">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span>网关后台</span>
        </button>`;
rawBody = rawBody.replace(brandMatch, brandReplacement);

// 3. 提取原版 Script
const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!scriptMatch) {
  console.error('未找到原版 script');
  process.exit(1);
}
let rawJs = scriptMatch[1].trim();

// 提取 tags 对象定义
const tagsMatch = rawJs.match(/(const tags = \{[\s\S]*?\n\};)/);
const tagsCode = tagsMatch ? tagsMatch[1] : '';

// 提取 app 对象定义
const appMatch = rawJs.match(/const app = Vue\.createApp\(\{([\s\S]*?)\}\);\s*app\.mount\('#app'\);/);
if (!appMatch) {
  console.error('未找到 createApp');
  process.exit(1);
}
let appBody = appMatch[1];

// 拼装生成的 Vue 3 单文件组件
const outputVue = `<template>
  <div class="scada-page-container" ref="containerRef">
    ${rawBody.trim()}
  </div>
</template>

<script>
import { writeDevicePoint } from '@/api/device-monitor';

${tagsCode}

export default {
  name: 'PumpStationScada',
  ${appBody
    .replace('methods: {', `methods: {
      handleBackToGateway() {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        this.$router.push('/');
      },`)
    .replace('unmounted() {', 'beforeUnmount() {')}
};
</script>

<style>
/* 全局工业 CSS 变量注入，确保在任何组件或深层节点中 100% 生效 */
:root, .scada-page-container, #screen {
  ${varBlock}
}
</style>

<style scoped>
.scada-page-container {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: #03070d;
  color: #f0f5fa;
  font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 优雅的原生内嵌返回按钮，完全契合工业顶栏风格，绝不遮挡视口 */
.gateway-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(54, 194, 255, 0.12);
  border: 1px solid rgba(54, 194, 255, 0.35);
  color: #36c2ff;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  margin-right: 10px;
  transition: all 0.2s ease;
  line-height: 1;
}

.gateway-nav-btn:hover {
  background: rgba(54, 194, 255, 0.25);
  border-color: #36c2ff;
  box-shadow: 0 0 10px rgba(54, 194, 255, 0.35);
}

${rawCss}
</style>
`;

fs.writeFileSync(destVue, outputVue, 'utf8');
console.log('成功 100% 高保真复刻场景 21 到网关前端！');
