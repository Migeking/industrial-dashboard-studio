const fs = require('fs');

const indexPath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\views\\index.vue';
let content = fs.readFileSync(indexPath, 'utf8');

const nativeCardHtml = `
        <!-- 上位监控 -->
        <div class="module-card scada" @click="goToScadaMonitor">
          <div class="card-glow"></div>
          <div class="card-header">
            <div class="card-icon scada">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
                <path d="M7 8h10M7 12h5"/>
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
            <p class="card-desc">1920×1080 粗格栅泵房数字孪生与控制</p>
          </div>
          <div class="card-footer">
            <span class="card-tag">SCADA</span>
          </div>
        </div>`;

// 1. 仅在 <div class="module-grid"> 后面追加这个卡片
content = content.replace('<div class="module-grid">', '<div class="module-grid">' + nativeCardHtml);

// 2. 注入跳转函数
const funcCode = `function goToScadaMonitor() {
  router.push('/scada/pump-station')
}

function goAcquistionDevace()`;
content = content.replace('function goAcquistionDevace()', funcCode);

// 3. 在 $module-colors 里声明 'scada' 主题
const scadaColor = `  'scada': (
    color: #58a6ff,
    bg: rgba(88, 166, 255, 0.12)
  ),
`;
content = content.replace(/\$module-colors:\s*\(/, '$module-colors: (\n' + scadaColor);

fs.writeFileSync(indexPath, content, 'utf8');
console.log('成功无损注入原版设计系统规范的上位监控卡片！');
