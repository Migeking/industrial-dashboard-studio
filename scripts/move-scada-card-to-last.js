const fs = require('fs');

const indexPath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\views\\index.vue';
let content = fs.readFileSync(indexPath, 'utf8');

// 1. 匹配当前位于头部的上位监控卡片
const cardRegex = /\s*<!-- 上位监控 -->[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;
const match = content.match(cardRegex);

if (!match) {
  console.error('未找到上位监控卡片');
  process.exit(1);
}

const cardHtml = match[0];

// 2. 从头部删除该卡片
content = content.replace(cardRegex, '');

// 3. 找到关于系统卡片的闭合标签位置，将其插入到关于系统之后（即 module-grid 的最后）
const aboutEndMarker = "<!-- 关于系统 -->";
const aboutIdx = content.indexOf(aboutEndMarker);
if (aboutIdx === -1) {
  console.error('未找到关于系统标记');
  process.exit(1);
}

// 找到关于系统卡片的结束 </div>（关于系统的卡片包含 card-header, card-content, card-footer，因此有 3 个内层 div 和 1 个外层 module-card div）
// 也可以直接在 `</div>\n      </section>` 的前一个 `</div>` 处插入！
const moduleGridEndMarker = "      </div>\n    </section>";
if (content.includes(moduleGridEndMarker)) {
  content = content.replace(moduleGridEndMarker, cardHtml + '\n      </div>\n    </section>');
} else {
  // 容错处理
  const altMarker = "</div>\n    </section>";
  content = content.replace(altMarker, cardHtml + '\n    </div>\n    </section>');
}

fs.writeFileSync(indexPath, content, 'utf8');
console.log('成功将上位监控卡片移动到 module-grid 最后一位！');
