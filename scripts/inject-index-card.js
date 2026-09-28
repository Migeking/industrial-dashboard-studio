const fs = require('fs');

const indexPath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\views\\index.vue';
let content = fs.readFileSync(indexPath, 'utf8');

// 1. 注入卡片 HTML 到 <div class="module-grid"> 后面
const cardHtml = `
        <!-- 上位监控 (SCADA 数字孪生) 核心大卡片 -->
        <div class="module-card scada-featured-card" @click="goToScadaMonitor">
          <div class="card-glow scada-glow"></div>
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
            <p class="card-desc">1920×1080 工业级 SCADA 数字孪生、工艺拓扑动效与 SBO 二次确认防误控制</p>
          </div>
          <div class="card-footer">
            <span class="card-tag scada-tag">SCADA TWIN</span>
            <span class="scada-mode-hint">双向控制 / 态势大屏</span>
          </div>
        </div>
`;

if (!content.includes('goToScadaMonitor')) {
  // 注入卡片
  content = content.replace('<div class="module-grid">', '<div class="module-grid">' + cardHtml);

  // 注入 goToScadaMonitor 方法
  const funcMarker = 'function goAcquistionDevace()';
  const funcCode = `function goToScadaMonitor() {
  router.push('/scada/pump-station')
}

function goAcquistionDevace()`;
  content = content.replace(funcMarker, funcCode);

  // 注入样式到 style 末尾
  const styleMarker = '</style>';
  const styleCode = `
// ==================== SCADA 上位监控卡片专属样式 ====================
.card-icon.scada {
  background: rgba(54, 194, 255, 0.15) !important;
  color: #36c2ff !important;
  border: 1px solid rgba(54, 194, 255, 0.3) !important;
}

.scada-featured-card {
  border: 1px solid rgba(54, 194, 255, 0.35) !important;
  background: linear-gradient(135deg, rgba(10, 23, 34, 0.95), rgba(7, 16, 23, 0.98)) !important;
}

.scada-featured-card:hover {
  border-color: #36c2ff !important;
  transform: translateY(-4px) !important;
  box-shadow: 0 10px 30px rgba(54, 194, 255, 0.25) !important;
}

.scada-glow {
  background: radial-gradient(circle at top right, rgba(54, 194, 255, 0.25), transparent 70%) !important;
  opacity: 0.8 !important;
}

.card-tag.scada-tag {
  background: rgba(54, 194, 255, 0.15) !important;
  color: #36c2ff !important;
  border: 1px solid rgba(54, 194, 255, 0.3) !important;
  font-weight: 600;
}

.scada-mode-hint {
  font-size: 11px;
  color: #9ab0c2;
  margin-left: auto;
}
</style>`;
  content = content.replace(styleMarker, styleCode);

  fs.writeFileSync(indexPath, content, 'utf8');
  console.log('成功在 index.vue 中注入“上位监控”大卡片！');
} else {
  console.log('index.vue 已包含 goToScadaMonitor，跳过注入');
}
