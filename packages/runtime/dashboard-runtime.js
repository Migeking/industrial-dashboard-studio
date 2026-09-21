(function attachDashboardRuntime(global) {
  'use strict';
  const runtime = {
    isLandscape() { return global.innerWidth >= global.innerHeight; },
    requestFullscreen(element) {
      const target = element || document.documentElement;
      if (!document.fullscreenElement && target.requestFullscreen) return target.requestFullscreen().catch(() => false);
      if (document.exitFullscreen) return document.exitFullscreen().catch(() => false);
      return Promise.resolve(false);
    },
    bindFullscreen(button, element) {
      if (!button) return;
      button.addEventListener('click', () => runtime.requestFullscreen(element));
    },
    createClock(element) {
      if (!element) return () => {};
      const tick = () => { element.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false }); };
      tick();
      const id = global.setInterval(tick, 1000);
      return () => global.clearInterval(id);
    },
    qualityLabel(value) {
      return value === 'good' ? '数据质量 GOOD' : value === 'degraded' ? '数据延迟' : '数据未知';
    }
  };
  global.DashboardRuntime = runtime;
})(window);
