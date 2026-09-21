'use strict';

const fs = require('node:fs');
const path = require('node:path');

const target = process.argv[2];
if (!target) {
  console.error('用法: node validate-light-3d-hmi.js <html-file>');
  process.exit(2);
}

const absolute = path.resolve(target);
if (!fs.existsSync(absolute)) {
  console.error(`[失败] 文件不存在: ${absolute}`);
  process.exit(1);
}

const html = fs.readFileSync(absolute, 'utf8');
const checks = [
  ['1920×1080 画布', /width\s*:\s*1920px/i.test(html) && /height\s*:\s*1080px/i.test(html)],
  ['浅色冷灰蓝主题', /#dfe8f3|#dfe7f1|#e1e9f3/i.test(html)],
  ['本地 Three.js', /three\.min\.js/i.test(html)],
  ['三维场景容器', /plant3d|twin3d|scene3d/i.test(html)],
  ['顶部双层导航', /topbar|primary-nav/i.test(html) && /subnav|section-nav/i.test(html)],
  ['右侧控制面板', /control-panel|control-card/i.test(html)],
  ['底部状态模块', /bottom-grid|status-grid/i.test(html)],
  ['演示模式声明', /演示模式|模拟数据/i.test(html)],
  ['离线资源', !/https?:\/\//i.test(html)],
];

const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
let syntaxOk = inlineScripts.length === 1;
if (syntaxOk) {
  try {
    new Function(inlineScripts[0][1]);
  } catch (error) {
    syntaxOk = false;
    console.error(`[语法] ${error.message}`);
  }
}
checks.push(['单一内联脚本语法正确', syntaxOk]);

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error(`[失败] ${path.basename(absolute)}: ${failed.join('、')}`);
  process.exit(1);
}
console.log(`[通过] ${path.basename(absolute)}`);
