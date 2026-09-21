(function attachRestAdapter(global) {
  'use strict';
  global.createRestAdapter = function createRestAdapter(url, timeoutMs) {
    return { async read() { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs || 5000); try { const response = await fetch(url, { signal: controller.signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.json(); } finally { clearTimeout(timer); } } };
  };
})(window);
