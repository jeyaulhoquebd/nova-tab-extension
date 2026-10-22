(() => {
  'use strict';
  const left = document.getElementById('left');
  let until = 0;
  const fmt = ms => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };
  const tick = () => { left.textContent = until ? fmt(until - Date.now()) : '--:--'; };
  chrome.storage.local.get('focus', r => { until = r.focus ? r.focus.until : 0; tick(); });
  setInterval(tick, 1000);
  document.getElementById('back').addEventListener('click', () => { if (history.length > 1) history.back(); else location.href = 'chrome://newtab'; });
  document.getElementById('end').addEventListener('click', async () => {
    if (!confirm('End Focus Mode early?')) return;
    try {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: rules.map(r => r.id) });
    } catch (e) {}
    chrome.storage.local.remove('focus', () => history.back());
  });
})();
