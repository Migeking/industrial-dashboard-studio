const fs = require('fs');

const routerPath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\router\\index.js';
const indexPath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\views\\index.vue';

// 1. 修改 router/index.js
let routerContent = fs.readFileSync(routerPath, 'utf8');
if (!routerContent.includes('/scada/pump-station')) {
  const targetStr = "const routes = [";
  const replacement = `const routes = [
  {
    path: '/scada/pump-station',
    name: 'PumpStationScada',
    component: () => import('@/views/scada/PumpStationScada.vue'),
    meta: {
      title: '粗格栅泵房上位监控',
      requiresAuth: false
    }
  },`;
  routerContent = routerContent.replace(targetStr, replacement);
  fs.writeFileSync(routerPath, routerContent, 'utf8');
  console.log('成功在 router/index.js 中注册 /scada/pump-station 路由！');
} else {
  console.log('router/index.js 已包含 /scada/pump-station');
}

// 2. 查看 index.vue
let indexContent = fs.readFileSync(indexPath, 'utf8');
const gridIdx = indexContent.indexOf('<div class="module-grid">');
console.log('Found grid at:', gridIdx);
if (gridIdx !== -1) {
  console.log(indexContent.slice(gridIdx, gridIdx + 500));
}
