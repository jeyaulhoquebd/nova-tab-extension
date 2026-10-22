(() => {
  'use strict';
  const { $, el, state } = NT;
  let focus = null;
  const chromeOk = () => typeof chrome !== 'undefined' && !!chrome.permissions;

  const cleanDomain = s => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
  const validDomain = d => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d);
  const fmt = ms => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  };

  async function ensurePerms() {
    if (!chromeOk()) return false;
    try { return await chrome.permissions.request({ permissions: ['declarativeNetRequest'], origins: ['<all_urls>'] }); } catch (e) { return false; }
  }

  async function applyRules(domains) {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const addRules = domains.map((d, i) => ({ id: i + 1, priority: 1, action: { type: 'redirect', redirect: { extensionPath: '/blocked.html' } }, condition: { urlFilter: '||' + d, resourceTypes: ['main_frame'] } }));
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map(r => r.id), addRules });
  }

  async function start({ until, source = 'manual' }) {
    // permission request must be the first await so it counts as part of the click
    const ok = await ensurePerms();
    if (!ok) { NT.toast('Focus Mode needs permission to block sites. Please allow it.'); return false; }
    const domains = [...new Set((state.settings.blockList || []).map(cleanDomain).filter(validDomain))];
    if (!domains.length) { NT.toast('Add at least one site to block (Focus ▸ blocked sites).'); return false; }
    try { await applyRules(domains); } catch (e) { NT.toast('Could not start Focus Mode.'); return false; }
    focus = { until, source, domains };
    await NT.save({ focus });
    if (chrome.alarms) chrome.alarms.create('focusEnd', { when: until });
    renderBanner();
    return true;
  }

  async function stop(onlySource) {
    if (!focus) return;
    if (onlySource && focus.source !== onlySource) return;
    focus = null;
    try { await applyRules([]); } catch (e) { /* ignore */ }
    if (chrome.alarms) chrome.alarms.clear('focusEnd');
    await NT.save({ focus: null });
    if (typeof chrome !== 'undefined' && chrome.storage) chrome.storage.local.remove('focus');
    renderBanner();
  }

  function renderBanner() {
    const on = !!focus && focus.until > Date.now();
    $('focusBanner').hidden = !on;
    if (on) $('focusLeft').textContent = fmt(focus.until - Date.now());
  }

  function openDialog() {
    const root = el('div');
    if (focus && focus.until > Date.now()) {
      const left = el('strong', { text: fmt(focus.until - Date.now()), style: 'font-size:36px' });
      const t = setInterval(() => { if (!document.body.contains(left)) clearInterval(t); else left.textContent = fmt(Math.max(0, focus ? focus.until - Date.now() : 0)); }, 1000);
      root.append(el('div', { class: 'result-box' }, el('div', {}, el('div', { class: 'muted small', text: 'Focus Mode is ON' }), el('span', { class: 'muted small', text: `${focus.domains.length} sites blocked` })), left),
        el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn danger', text: 'End Focus Mode', onclick: async () => { if (confirm('End Focus Mode early?')) { await stop(); $('bigDialog').close(); } } })));
    } else {
      const dur = el('select', {}, [15, 25, 45, 60, 90, 120].map(m => el('option', { value: String(m), selected: m === 45 }, `${m} minutes`)));
      const ta = el('textarea', { rows: 7, placeholder: 'one site per line, e.g. facebook.com' });
      ta.value = (state.settings.blockList || []).join('\n');
      root.append(
        el('p', { class: 'empty', text: 'Block distracting websites for a set time. Blocked sites show a calm "Stay focused" page instead.' }),
        el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Duration' }), dur),
        el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Sites to block' }), ta),
        el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn primary', text: '🎯 Start Focus Mode', onclick: async () => {
          state.settings.blockList = ta.value.split('\n').map(cleanDomain).filter(Boolean);
          NT.saveSettings();
          const ok = await start({ until: Date.now() + parseInt(dur.value, 10) * 60000, source: 'manual' });
          if (ok) { $('bigDialog').close(); NT.toast('Focus Mode started. Stay strong! 💪'); }
        } })));
    }
    NT.bigDialog('Focus Mode', root);
  }

  NT.focus = { start, stop };

  NT.register(async () => {
    const r = await NT.load(['focus']);
    focus = r.focus || null;
    if (focus && focus.until <= Date.now()) await stop();
    renderBanner();
    $('btnFocus').addEventListener('click', openDialog);
    $('focusEnd').addEventListener('click', () => { if (confirm('End Focus Mode early?')) stop(); });
    NT.on('tick', () => {
      if (!focus) { $('focusBanner').hidden = true; return; }
      if (focus.until <= Date.now()) stop(); else renderBanner();
    });
  });
})();
