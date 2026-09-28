const fs = require('fs');

const vuePath = 'D:\\code\\smart-edge-gateway\\.worktrees\\feature\\ai-code-generation\\front\\src\\views\\scada\\PumpStationScada.vue';
let content = fs.readFileSync(vuePath, 'utf8');

// 注入导航与全屏相关方法到 methods 中
const methodsMarker = 'methods: {';
const methodsInjection = `methods: {
    handleBackToGateway() {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      this.$router.push('/');
    },
    toggleFullScreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
          this.isFullScreen = true;
        }).catch(err => {
          console.warn('全屏请求被拒绝', err);
        });
      } else {
        document.exitFullscreen().then(() => {
          this.isFullScreen = false;
        }).catch(() => {});
      }
    },
    handleKeyDown(e) {
      if (e.key === 'Escape') {
        this.showNav = true;
      }
    },`;

content = content.replace(methodsMarker, methodsInjection);

// 增强 confirmSBO：联动 writeDevicePoint
const sboOld = `confirmSBO() {
      if (!this.sboPendingAction || !this.currentFaceplate) return;
      const tag = this.currentFaceplate.tag;
      const targetState = this.sboPendingAction === 'start' ? 'run' : 'stop';
      const targetFreq = this.sboPendingAction === 'start' ? (this.currentFaceplate.freq || 45.0) : 0;`;

const sboNew = `confirmSBO() {
      if (!this.sboPendingAction || !this.currentFaceplate) return;
      const tag = this.currentFaceplate.tag;
      const targetState = this.sboPendingAction === 'start' ? 'run' : 'stop';
      const targetFreq = this.sboPendingAction === 'start' ? (this.currentFaceplate.freq || 45.0) : 0;

      // 联动向 Smart Gateway 网关下发指令
      const pointName = tag + '_' + (this.sboPendingAction === 'start' ? 'CMD_START' : 'CMD_STOP');
      const pointValue = this.sboPendingAction === 'start' ? 1 : 0;
      writeDevicePoint('NETTY_DEVICE_01', pointName, pointValue)
        .then(res => {
          console.log('[SCADA SBO] 网关写入响应成功:', res);
        })
        .catch(err => {
          console.warn('[SCADA SBO] 网关当前处于离线/模拟环境，本地仿真驱动:', err);
        });`;

content = content.replace(sboOld, sboNew);

// 增强 initRadar：自动加载 /vendor/echarts.min.js
const radarOld = `initRadar(item) {
        this.$nextTick(() => {
          const dom = document.getElementById('faceplate-radar');
          if (!dom) return;
          if (this.radarInstance) this.radarInstance.dispose();
          this.radarInstance = echarts.init(dom);`;

const radarNew = `initRadar(item) {
        this.$nextTick(() => {
          const dom = document.getElementById('faceplate-radar');
          if (!dom) return;
          if (this.radarInstance) this.radarInstance.dispose();

          const doRender = () => {
            if (!window.echarts || !dom) return;
            this.radarInstance = window.echarts.init(dom);
            const option = {
              color: ['#36c2ff'],
              radar: {
                indicator: [
                  { name: '振动', max: 100 },
                  { name: '定子温度', max: 100 },
                  { name: '轴承温度', max: 100 },
                  { name: '绝缘阻抗', max: 100 },
                  { name: '效率比', max: 100 }
                ],
                splitNumber: 3,
                axisName: { color: '#9ab0c2', fontSize: 10 },
                splitLine: { lineStyle: { color: '#1b384e' } },
                splitArea: { show: false },
                axisLine: { lineStyle: { color: '#1b384e' } }
              },
              series: [{
                type: 'radar',
                data: [{
                  value: [92, 88, 85, 95, 90],
                  areaStyle: { color: 'rgba(54, 194, 255, 0.25)' }
                }]
              }]
            };
            this.radarInstance.setOption(option);
          };

          if (window.echarts) {
            doRender();
          } else {
            const script = document.createElement('script');
            script.src = '/vendor/echarts.min.js';
            script.onload = doRender;
            document.head.appendChild(script);
          }
        });
      },`;

// 替换整个 initRadar 函数块
content = content.replace(/initRadar\(item\)\s*\{[\s\S]*?this\.radarInstance\.setOption\(option\);\s*\}\);\s*\},/, radarNew);

// 增强 mounted：添加按键监听
const mountedOld = `mounted() {
      this.updateTime();
      this.timer = setInterval(this.updateTime, 1000);
      window.addEventListener('resize', this.handleResize);
      this.handleResize();
      this.initSimLoop();`;

const mountedNew = `mounted() {
      this.updateTime();
      this.timer = setInterval(this.updateTime, 1000);
      window.addEventListener('resize', this.handleResize);
      window.addEventListener('keydown', this.handleKeyDown);
      this.handleResize();
      this.initSimLoop();

      // 尝试探测网关点位接口
      getMonitorDevices().then(res => {
        if (res && (res.code === 200 || Array.isArray(res))) {
          this.isGatewayLive = true;
          console.log('[SCADA] 成功感知 Smart Gateway 网关设备在线');
        }
      }).catch(() => {
        this.isGatewayLive = false;
        console.log('[SCADA] 网关未就绪，保持仿真运行');
      });`;

content = content.replace(mountedOld, mountedNew);

// 增强 unmounted / beforeUnmount
const unmountedOld = `unmounted() {
      if (this.timer) clearInterval(this.timer);
      if (this.simTimer) clearInterval(this.simTimer);
      window.removeEventListener('resize', this.handleResize);
    },`;

const unmountedNew = `beforeUnmount() {
      if (this.timer) clearInterval(this.timer);
      if (this.simTimer) clearInterval(this.simTimer);
      window.removeEventListener('resize', this.handleResize);
      window.removeEventListener('keydown', this.handleKeyDown);
      if (this.radarInstance) {
        this.radarInstance.dispose();
      }
    },`;

content = content.replace(unmountedOld, unmountedNew);

fs.writeFileSync(vuePath, content, 'utf8');
console.log('优化与接口增强完成！');
