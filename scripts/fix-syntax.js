const fs = require('fs');

const vuePath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\views\\scada\\PumpStationScada.vue';
let content = fs.readFileSync(vuePath, 'utf8');

const oldPattern = /data\(\)\s*\{\s*return\s*\{[\s\S]*?pollGatewayTimer:\s*null,\s*return\s*\{/;
const newReplacement = `data() {
      return {
        showNav: true,
        isFullScreen: false,
        isGatewayLive: false,
        pollGatewayTimer: null,`;

content = content.replace(oldPattern, newReplacement);
fs.writeFileSync(vuePath, content, 'utf8');
console.log('修复 data() 重复 return 完成');
