const fs = require('fs');

const indexPath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\views\\index.vue';
const lines = fs.readFileSync(indexPath, 'utf8').split('\n');

const scadaCardLines = [
  '        <!-- 上位监控 -->',
  '        <div class="module-card scada" @click="goToScadaMonitor">',
  '          <div class="card-glow"></div>',
  '          <div class="card-header">',
  '            <div class="card-icon scada">',
  '              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">',
  '                <rect x="2" y="3" width="20" height="14" rx="2"/>',
  '                <line x1="8" y1="21" x2="16" y2="21"/>',
  '                <line x1="12" y1="17" x2="12" y2="21"/>',
  '                <path d="M7 8h10M7 12h5"/>',
  '              </svg>',
  '            </div>',
  '            <div class="card-arrow">',
  '              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
  '                <path d="M5 12h14M12 5l7 7-7 7"/>',
  '              </svg>',
  '            </div>',
  '          </div>',
  '          <div class="card-content">',
  '            <h3 class="card-title">上位监控</h3>',
  '            <p class="card-desc">1920×1080 粗格栅泵房数字孪生与控制</p>',
  '          </div>',
  '          <div class="card-footer">',
  '            <span class="card-tag">SCADA</span>',
  '          </div>',
  '        </div>'
];

// 1. 查找第 377 行附近的 ABOUT 卡片闭合标签
let gridCloseIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<span class="card-tag">ABOUT</span>')) {
    // 往下找 module-grid 的闭合 </div>
    for (let j = i; j < i + 10; j++) {
      if (lines[j].trim() === '</div>' && lines[j+1] && lines[j+1].includes('</section>')) {
        gridCloseIdx = j;
        break;
      }
    }
    break;
  }
}

if (gridCloseIdx === -1) {
  console.error('未找到 module-grid 闭合位置');
  process.exit(1);
}

// 在 gridCloseIdx 前插入卡片行
lines.splice(gridCloseIdx, 0, ...scadaCardLines);

// 2. 插入跳转函数
let funcInsertIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('function goAboutOverview()')) {
    funcInsertIdx = i;
    break;
  }
}

if (funcInsertIdx !== -1) {
  const funcLines = [
    'function goToScadaMonitor() {',
    "  router.push('/scada/pump-station')",
    '}',
    ''
  ];
  lines.splice(funcInsertIdx, 0, ...funcLines);
}

// 3. 插入 SCSS 主题色
let colorInsertIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('$module-colors: (')) {
    colorInsertIdx = i + 1;
    break;
  }
}

if (colorInsertIdx !== -1) {
  const colorLines = [
    "  'scada': (",
    '    color: #58a6ff,',
    '    bg: rgba(88, 166, 255, 0.12)',
    '  ),'
  ];
  lines.splice(colorInsertIdx, 0, ...colorLines);
}

fs.writeFileSync(indexPath, lines.join('\n'), 'utf8');
console.log('成功精准将上位监控卡片添加到末尾（最后一位）！');
