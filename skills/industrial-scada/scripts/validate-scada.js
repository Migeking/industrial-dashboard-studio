'use strict';

const fs = require('node:fs');
const path = require('node:path');

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('用法: node validate-scada.js <html-file> [more-html-files]');
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
    ['DOCTYPE 声明', /<!DOCTYPE html>/i.test(html)],
    ['中文语言标头', /<html\s+lang=["']zh-CN["']/i.test(html)],
    ['SCADA 根视口节点', /id=["']screen["']|id=["']scada-shell["']|id=["']app["']/i.test(html)],
    ['本地离线 Vue/核心资源', /vue\.global\.prod\.js/i.test(html)],
    ['Faceplate 操作小面板机制', /faceplate/i.test(html) || /操作小面板|设备面板/.test(html)],
    ['SBO 两步确认/防误动机制', /confirm|sbo|两步确认|二次确认|防误/i.test(html)],
    ['双向读写点表声明', /writable|tag|点位|控制指令/i.test(html)],
    ['ISA-18.2 告警消音/确认机制', /silence|ack|消音|确认告警|报警/i.test(html)],
    ['操作审计追踪日志 (Audit Trail)', /audit|操作日志|审计/i.test(html)],
  ];

  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  let syntaxOk = inlineScripts.length >= 1;
  if (syntaxOk) {
    try {
      inlineScripts.forEach((s) => new Function(s[1]));
    } catch (error) {
      syntaxOk = false;
      console.error(`[语法错误] ${path.basename(abs)}: ${error.message}`);
    }
  }
  checks.push(['内联脚本语法正确', syntaxOk]);

  const errors = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (errors.length) {
    console.error(`[SCADA 验证失败] ${path.basename(abs)}: 缺失 ${errors.join('、')}`);
    failed = true;
  } else {
    console.log(`[SCADA 验证通过] ${path.basename(abs)}`);
  }
}

for (const file of files) check(file);
process.exit(failed ? 1 : 0);
