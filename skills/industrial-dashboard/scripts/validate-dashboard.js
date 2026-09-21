'use strict';

const fs = require('node:fs');
const path = require('node:path');

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('用法: node validate-dashboard.js <html-file> [more-html-files]');
  process.exit(2);
}

const files = inputs.flatMap((input) => {
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) return [input];
  if (!fs.statSync(abs).isDirectory()) return [input];
  return fs.readdirSync(abs, { recursive: true })
    .filter((name) => name.toLowerCase().endsWith('.html'))
    .map((name) => path.join(abs, name));
});

let failed = false;

function check(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error(`[失败] 文件不存在: ${abs}`);
    failed = true;
    return;
  }

  const html = fs.readFileSync(abs, 'utf8');
  const checks = [
    ['DOCTYPE', /<!DOCTYPE html>/i.test(html)],
    ['中文语言', /<html\s+lang=["']zh-CN["']/i.test(html)],
    ['1920×1080 画布', /width\s*:\s*1920px/i.test(html) && /height\s*:\s*1080px/i.test(html)],
    ['screen 根节点', /id=["']screen["']/i.test(html)],
    ['Vue 3 本地资源', /vue\.global\.prod\.js/i.test(html)],
    ['ECharts 5 本地资源', /echarts\.min\.js/i.test(html)],
    ['safeInit', /function\s+safeInit|const\s+safeInit/i.test(html)],
    ['空值保护', /if\s*\(\s*!?el\s*\)/i.test(html)],
    ['缩放适配', /style\.transform\s*=.*scale\(/i.test(html)],
    ['数据质量', /quality|数据质量/i.test(html)],
    ['更新时间', /更新时间|lastSeen|timestamp/i.test(html)],
  ];

  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  checks.push(['脚本结构（2D 三对，3D 最多六对）', scripts.length >= 3 && scripts.length <= 6]);

  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  let syntaxOk = inlineScripts.length === 1;
  if (syntaxOk) {
    try {
      new Function(inlineScripts[0][1]);
    } catch (error) {
      syntaxOk = false;
      console.error(`[语法] ${path.basename(abs)}: ${error.message}`);
    }
  }
  checks.push(['内联脚本语法', syntaxOk]);

  const errors = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (errors.length) {
    console.error(`[失败] ${path.basename(abs)}: ${errors.join('、')}`);
    failed = true;
  } else {
    console.log(`[通过] ${path.basename(abs)}`);
  }
}

for (const file of files) check(file);
process.exit(failed ? 1 : 0);
