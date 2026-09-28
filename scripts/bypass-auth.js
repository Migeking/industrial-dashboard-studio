const fs = require('fs');

const authPath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\utils\\auth.js';
let content = fs.readFileSync(authPath, 'utf8');

content = content.replace(/export function isAuthenticated\(\)\s*\{[\s\S]*?\}/, `export function isAuthenticated() {
  const token = getToken()
  return true // 联调与测试放行
}`);

fs.writeFileSync(authPath, content, 'utf8');
console.log('成功将 isAuthenticated 设为开发免密通行！');
