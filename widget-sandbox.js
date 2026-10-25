// Runs inside a sandboxed page (no access to chrome.* APIs or to the new tab page).
(() => {
  'use strict';
  const BRIDGE = `(function(){
    var pend = {}, n = 0;
    function call(type, extra){ return new Promise(function(res){ var id = ++n; pend[id] = res; parent.postMessage(Object.assign({ type: type, rid: id }, extra), '*'); }); }
    window.addEventListener('message', function(e){ var m = e.data; if (m && m.rid && pend[m.rid]) { pend[m.rid](m.value); delete pend[m.rid]; } });
    window.Nova = {
      context: __CTX__,
      storage: {
        get: function(k){ return call('storage-get', { key: String(k) }); },
        set: function(k, v){ return call('storage-set', { key: String(k), value: v }); },
        remove: function(k){ return call('storage-remove', { key: String(k) }); }
      },
      setHeight: function(h){ parent.postMessage({ type: 'height', value: Number(h) || 0 }, '*'); }
    };
    function auto(){ parent.postMessage({ type: 'height', value: Math.ceil(document.body.scrollHeight) + 4 }, '*'); }
    window.addEventListener('load', function(){ auto(); if (window.ResizeObserver) new ResizeObserver(auto).observe(document.body); });
  })();`;

  const BASE_CSS = `
    :root{--text:__text__;--muted:__muted__;--accent:__accent__;--accent2:__accent2__;--field:__field__;--border:__border__}
    html,body{margin:0;background:transparent}
    body{color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:2px}
    button{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border:0;border-radius:10px;padding:7px 14px;font:inherit;font-weight:600;cursor:pointer}
    input,textarea,select{background:var(--field);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:7px 10px;font:inherit;outline:none}
    a{color:var(--accent2)}`;

  window.addEventListener('message', e => {
    const m = e.data;
    if (!m || m.type !== 'init') return;
    const ctx = m.ctx || {};
    const css = BASE_CSS.replace('__text__', ctx.text || '#f8fafc').replace('__muted__', ctx.muted || '#94a3b8').replace('__accent__', ctx.accent || '#8b5cf6')
      .replace('__accent2__', ctx.accent2 || '#06b6d4').replace('__field__', ctx.field || 'rgba(255,255,255,.08)').replace('__border__', ctx.border || 'rgba(255,255,255,.15)');
    const bridge = BRIDGE.replace('__CTX__', JSON.stringify(ctx).replace(/</g, '\\u003c'));
    document.open();
    document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style><script>' + bridge + '<\/script></head><body>' + String(m.html || '') + '</body></html>');
    document.close();
  }, { once: true });

  parent.postMessage({ type: 'ready' }, '*');
})();
