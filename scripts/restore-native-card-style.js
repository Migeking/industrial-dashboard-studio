const fs = require('fs');

const indexPath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\views\\index.vue';
let content = fs.readFileSync(indexPath, 'utf8');

// 1. 删除注入的自定义 CSS 块
content = content.replace(/\/\/ ==================== SCADA[\s\S]*?<\/style>/, '</style>');

// 2. 在 $module-colors 顶部注册 'scada' 主题
const scadaColorConfig = `  'scada': (
    color: #58a6ff,
    bg: rgba(88, 166, 255, 0.12)
  ),
`;

if (!content.includes("'scada':")) {
  content = content.replace(/\$module-colors:\s*\(/, '$module-colors: (\n' + scadaColorConfig);
}

// 3. 将卡片结构 100% 恢复为原版标准
const originalCardPattern = /<!-- 上位监控[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;
const nativeCardHtml = `<!-- 上位监控 -->
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
            <p class="card-desc">1920×1080 工业级 SCADA 数字孪生与控制</p>
          </div>
          <div class="card-footer">
            <span class="card-tag">SCADA</span>
          </div>
        </div>`;

content = content.replace(originalCardPattern, nativeCardHtml);

fs.writeFileSync(indexPath, content, 'utf8');
console.log('成功将上位监控卡片完全恢复为原版设计系统规范！');
