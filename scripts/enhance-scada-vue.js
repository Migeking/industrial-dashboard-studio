const fs = require('fs');

const vuePath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\views\\scada\\PumpStationScada.vue';
let content = fs.readFileSync(vuePath, 'utf8');

// 注入 echarts 自动兜底加载逻辑
const targetEcharts = 'this.radarInstance = echarts.init(dom);';
const replacementEcharts = `const doInit = () => {
            if (!window.echarts || !dom) return;
            this.radarInstance = window.echarts.init(dom);
          };
          if (!window.echarts) {
            const sc = document.createElement('script');
            sc.src = '/vendor/echarts.min.js';
            sc.onload = () => {
              doInit();
              if (this.radarInstance) this.radarInstance.setOption(option);
            };
            document.head.appendChild(sc);
            return;
          }
          doInit();`;

if (content.includes(targetEcharts)) {
  content = content.replace(targetEcharts, replacementEcharts);
}

// 联动 SBO 下发
const targetSbo = "const targetFreq = this.sboPendingAction === 'start' ? (this.currentFaceplate.freq || 45.0) : 0;";
const replacementSbo = `const targetFreq = this.sboPendingAction === 'start' ? (this.currentFaceplate.freq || 45.0) : 0;
      // 联动向 Smart Gateway 下发真实控制指令
      writeDevicePoint('NETTY_DEVICE_01', tag + '_' + (this.sboPendingAction === 'start' ? 'CMD_START' : 'CMD_STOP'), this.sboPendingAction === 'start' ? 1 : 0).catch(() => {});`;

if (content.includes(targetSbo)) {
  content = content.replace(targetSbo, replacementSbo);
}

fs.writeFileSync(vuePath, content, 'utf8');
console.log('ECharts 自动加载与 SBO 指令联动注入完成！');
