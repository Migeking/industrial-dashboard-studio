#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function validateHmiFile(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`[错误] 文件不存在: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  const errors = [];

  // 1. 验证 1920x1080 自适应架构
  if (!content.includes('1920') || !content.includes('1080')) {
    errors.push('缺少 1920x1080 标准工程分辨率定义');
  }

  // 2. 验证 ISA-101 工业灰度基调
  if (!content.includes('#dde2e8') && !content.includes('#DDE2E8') && !content.includes('#e2e7ec') && !content.includes('#E2E7EC')) {
    errors.push('未检测到 ISA-101 标准工业灰度冷色基底');
  }

  // 3. 验证水务管网标准 P&ID 图元与正交/跨线特征
  if (!content.includes('pipe') && !content.includes('svg')) {
    errors.push('缺少标准 P&ID 工艺管网 SVG 图元');
  }

  // 4. 验证西门子标准立体下凹 I/O 域
  if (!content.includes('io-field') && !content.includes('inset')) {
    errors.push('缺少西门子标准立体下凹 I/O 域控件');
  }

  // 5. 验证西门子标准垂直彩色棒图 (Bar Graph)
  if (!content.includes('bargraph') && !content.includes('bar-graph') && !content.includes('棒图')) {
    errors.push('缺少西门子水务标准垂直彩色棒图 (Bar Graph) 监控特征');
  }

  // 6. 验证 SBO (Select-Before-Operate) 两步防误确认
  if (!content.includes('sbo') && !content.includes('SBO') && !content.includes('二次确认')) {
    errors.push('缺少 SBO 预选确认二次防误动机制');
  }

  // 7. 验证水务工段导航与操作权限指示
  if (!content.includes('生化') || !content.includes('权限')) {
    errors.push('缺少水厂工段导航或操作员权限指示');
  }

  // 8. 语言纯洁度校验：严禁出现常见普通双语堆叠
  const forbiddenWords = ['OPERATION STATUS', 'CENTRAL SUPERVISORY', 'ANAEROBIC PROCESS', 'AEROBIC PROCESS'];
  for (const word of forbiddenWords) {
    if (content.includes(word)) {
      errors.push(`检测到违规的非专业英文字符堆叠: "${word}"，请使用地道中文`);
    }
  }

  if (errors.length > 0) {
    console.error(`[经典上位机 HMI 验证失败] ${path.basename(filePath)}:`);
    errors.forEach(err => console.error(`  - ❌ ${err}`));
    process.exit(1);
  } else {
    console.log(`[经典上位机 HMI 验证通过] ${path.basename(filePath)}`);
  }
}

const target = process.argv[2];
if (!target) {
  console.log('用法: node validate-hmi.js <html-file>');
  process.exit(1);
}
validateHmiFile(target);
