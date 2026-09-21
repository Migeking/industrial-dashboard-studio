(function attachDemoAdapter(global) {
  'use strict';
  function seeded(seed) { let value = seed || 17; return () => { value = (value * 9301 + 49297) % 233280; return value / 233280; }; }
  global.createDemoAdapter = function createDemoAdapter(options) {
    const next = seeded(options && options.seed);
    let timer = null;
    return {
      start(onData) {
        const emit = () => onData({ quality: 'good', timestamp: new Date().toISOString(), load: Math.round(72 + next() * 18), health: Math.round(86 + next() * 12) });
        emit(); timer = global.setInterval(emit, 2000);
      },
      stop() { if (timer) global.clearInterval(timer); timer = null; }
    };
  };
})(window);
