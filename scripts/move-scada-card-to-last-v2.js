const fs = require('fs');

const indexPath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\views\\index.vue';
let content = fs.readFileSync(indexPath, 'utf8');

// 1. 匹配上位监控卡片
const cardStart = '<!-- 上位监控 -->';
const cardEnd = '<div class="card-footer">\n            <span class="card-tag">SCADA</span>\n          </div>\n        </div>';

const startIdx = content.indexOf(cardStart);
const endIdx = content.indexOf(cardEnd);

if (startIdx === -1 || endIdx === -1) {
  console.error('未找到上位监控卡片起止');
  process.exit(1);
}

const fullCardHtml = content.slice(startIdx, endIdx + cardEnd.length);

// 2. 从当前位置（头部）删掉
content = content.slice(0, startIdx) + content.slice(endIdx + cardEnd.length);

// 3. 找到 ABOUT 卡片之后的位置
const aboutTag = '<span class="card-tag">ABOUT</span>';
const aboutTagIdx = content.indexOf(aboutTag);

if (aboutTagIdx === -1) {
  console.error('未找到 ABOUT 卡片');
  process.exit(1);
}

// 找到 ABOUT 卡片的闭合 </div>\n        </div>
const afterAboutIdx = content.indexOf('</div>\n        </div>', aboutTagIdx);
const insertPoint = afterAboutIdx + '</div>\n        </div>'.length;

content = content.slice(0, insertPoint) + '\n\n        ' + fullCardHtml + content.slice(insertPoint);

fs.writeFileSync(indexPath, content, 'utf8');
console.log('成功将上位监控卡片平移至最后一位！');
