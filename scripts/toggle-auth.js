const fs = require('fs');
const routerPath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\router\\index.js';
let content = fs.readFileSync(routerPath, 'utf8');
content = content.replace(/path:\s*'\/'[\s\S]*?requiresAuth:\s*true/, (match) => {
  return match.replace('requiresAuth: true', 'requiresAuth: false');
});
fs.writeFileSync(routerPath, content, 'utf8');
console.log('首页 requiresAuth 已成功修改为 false');
