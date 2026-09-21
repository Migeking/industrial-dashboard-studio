(function attachWebSocketAdapter(global) {
  'use strict';
  global.createWebSocketAdapter = function createWebSocketAdapter(url, onData, onState) {
    let socket; let closed = false; let retry = 1000;
    const connect = () => { if (closed) return; socket = new WebSocket(url); socket.onopen = () => { retry = 1000; if (onState) onState('online'); }; socket.onmessage = event => { try { onData(JSON.parse(event.data)); } catch (_) {} }; socket.onerror = () => socket.close(); socket.onclose = () => { if (onState) onState('offline'); if (!closed) { global.setTimeout(connect, retry); retry = Math.min(retry * 2, 15000); } }; };
    connect(); return { close() { closed = true; if (socket) socket.close(); } };
  };
})(window);
