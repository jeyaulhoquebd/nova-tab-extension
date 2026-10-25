(() => {
  'use strict';
  const { $, el, state } = NT;
  const THEMES = [
    { id: 'aurora', name: 'Aurora', g1: '#0b1020', g2: '#312e81', g3: '#0e7490', accent: '#8b5cf6', accent2: '#06b6d4' },
    { id: 'sunset', name: 'Sunset', g1: '#240b45', g2: '#7a2a6b', g3: '#d9534f', accent: '#f97316', accent2: '#ec4899' },
    { id: 'ocean', name: 'Ocean', g1: '#021b2e', g2: '#0b4f6c', g3: '#12a4a0', accent: '#06b6d4', accent2: '#3b82f6' },
    { id: 'forest', name: 'Forest', g1: '#06251a', g2: '#14532d', g3: '#3f8f5b', accent: '#22c55e', accent2: '#14b8a6' },
    { id: 'rose', name: 'Rose', g1: '#2a0a1f', g2: '#7a1d4f', g3: '#d6567f', accent: '#ec4899', accent2: '#f97316' },
    { id: 'lavender', name: 'Lavender', g1: '#1a0b3b', g2: '#4c1d95', g3: '#a855f7', accent: '#a855f7', accent2: '#38bdf8' },
    { id: 'amber', name: 'Amber', g1: '#1c1203', g2: '#78350f', g3: '#d97706', accent: '#f59e0b', accent2: '#ef4444' },
    { id: 'midnight', name: 'Midnight', g1: '#05060d', g2: '#111827', g3: '#1f2a44', accent: '#6366f1', accent2: '#8b5cf6' }
  ];

  function applyTheme(id, persist = true) {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    const r = document.documentElement.style;
    r.setProperty('--g1', t.g1); r.setProperty('--g2', t.g2); r.setProperty('--g3', t.g3); r.setProperty('--accent', t.accent); r.setProperty('--accent2', t.accent2);
    document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.id === t.id));
    if (persist) NT.saveSync({ theme: t.id });
  }

  async function applyLook() {
    const s = state.settings;
    document.documentElement.dataset.mode = s.mode === 'light' ? 'light' : 'dark';
    let url = '';
    if (s.wallpaper === 'daily') url = `https://picsum.photos/seed/nova-${NT.todayStr()}/1920/1080`;
    else if (s.wallpaper === 'custom') url = (await NT.load(['bgImage'])).bgImage || '';
    $('bgImg').style.backgroundImage = url ? `url("${url}")` : '';
    document.documentElement.classList.toggle('has-image', !!url);
    document.documentElement.classList.toggle('lite', !!s.lite);
  }

  function set(key, value) {
    state.settings[key] = value;
    NT.saveSettings();
    if (key === 'timezone') NT.applyTimezone();
    NT.emit('settings');
    if (key === 'mode' || key === 'wallpaper' || key === 'lite') applyLook();
  }

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const sc = Math.min(1, 1920 / img.width), c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function exportData() {
    const [sync, local] = await Promise.all([NT.store.get('sync', null), NT.store.get('local', null)]);
    ['bgImage', 'weatherCache', 'prayerCache', 'focus', 'loc', 'ai', 'aiChat', 'linkMeta'].forEach(k => delete local[k]);
    const blob = new Blob([JSON.stringify({ app: 'nova-tab', version: 4, exported: new Date().toISOString(), sync, local }, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `nova-tab-backup-${NT.todayStr()}.json` });
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function importData(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'nova-tab' || (!data.sync && !data.local)) throw new Error('bad file');
      if (!confirm('Import this backup? It will replace your current data.')) return;
      await NT.store.clear('sync'); await NT.store.clear('local');
      if (data.sync) await NT.store.set('sync', data.sync);
      if (data.local) await NT.store.set('local', data.local);
      location.reload();
    } catch (e) { NT.toast('That file is not a valid Nova Tab backup.'); }
  }

  function row(label, control, hint) {
    return el('div', { class: 'set-row' }, el('div', {}, el('div', { text: label }), hint ? el('div', { class: 'muted small', text: hint }) : null), control);
  }
  const num = (key, min, max) => el('input', { type: 'number', min, max, value: String(state.settings[key]), onchange: ev => {
    let v = parseInt(ev.target.value, 10); if (isNaN(v)) v = state.settings[key];
    v = Math.min(max, Math.max(min, v)); ev.target.value = String(v); set(key, v);
  } });
  const check = key => el('input', { type: 'checkbox', checked: state.settings[key] !== false && !!state.settings[key], onchange: ev => set(key, ev.target.checked) });
  const sec = (title, ...rows) => el('section', { class: 'set-sec' }, el('h4', { text: title }), ...rows);

  function openSettings() {
    const s = state.settings;
    const name = el('input', { type: 'text', value: s.name, maxlength: 20, placeholder: 'Your name', onchange: ev => set('name', ev.target.value.trim()) });
    let liveLocation;
    const city = el('input', { type: 'text', value: s.city, maxlength: 40, placeholder: 'Auto (from time zone)', onchange: ev => {
      if (state.settings.liveLocation) {
        state.settings.liveLocation = false;
        liveLocation.checked = false;
      }
      set('city', ev.target.value.trim());
    } });
    liveLocation = el('input', { type: 'checkbox', checked: s.liveLocation === true, onchange: async ev => {
      const enabled = ev.target.checked;
      ev.target.disabled = true;
      try {
        if (enabled) await NT.world.enableLiveLocation();
        else await NT.world.disableLiveLocation();
        NT.toast(enabled ? 'Live location enabled for weather and prayer times.' : 'Live location disabled.');
      } catch (e) {
        ev.target.checked = false;
        NT.toast(e.message);
      } finally { ev.target.disabled = false; }
    } });
    const zoneOpts = [el('option', { value: 'auto', selected: !s.timezone || s.timezone === 'auto' }, `Auto-detect (${NT.deviceTz()})`),
      ...NT.allZones().map(z => el('option', { value: z, selected: s.timezone === z }, z.replace(/_/g, ' ')))];
    const zone = el('select', { onchange: ev => set('timezone', ev.target.value) }, zoneOpts);
    const file = el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try { const data = await readImage(f); await NT.save({ bgImage: data }); set('wallpaper', 'custom'); NT.toast('Wallpaper updated'); } catch (e) { NT.toast('Could not use that image.'); }
    } });
    const importFile = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: ev => { if (ev.target.files[0]) importData(ev.target.files[0]); } });
    const wall = el('select', { onchange: ev => { if (ev.target.value === 'custom') { file.click(); ev.target.value = state.settings.wallpaper; } else set('wallpaper', ev.target.value); } },
      [['none', 'Colour theme only'], ['daily', 'Daily photo (online)'], ['custom', 'My own photo…']].map(([v, l]) => el('option', { value: v, selected: v === s.wallpaper }, l)));
    const mode = el('select', { onchange: ev => set('mode', ev.target.value) }, [['dark', 'Dark'], ['light', 'Light']].map(([v, l]) => el('option', { value: v, selected: v === s.mode }, l)));

    const fetchChk = el('input', { type: 'checkbox', checked: s.linkFetch === true, onchange: async ev => {
      if (ev.target.checked) {
        let ok = false;
        try { ok = await chrome.permissions.request({ origins: ['<all_urls>'] }); } catch (e) { ok = false; }
        if (!ok) { ev.target.checked = false; NT.toast('Permission was not granted.'); return; }
        if (NT.linkPreview) NT.linkPreview.resetPermission();
      }
      set('linkFetch', ev.target.checked);
    } });

    const root = el('div', {},
      sec('Display', row('Your name', name, 'Shown in the greeting'), row('12-hour clock (AM/PM)', check('hour12')), row('Show seconds', check('showSeconds')), row('Lite mode', check('lite'), 'Fewer effects — faster on older computers'), row('Appearance', mode), row('Background', wall), file),
      sec('Time & location', row('Time zone', zone, 'Auto uses your device time zone'), row('City for weather & prayer', city, 'Leave empty to use your time zone'),
        row('Use live location', liveLocation, 'Allow location access to update weather and prayer times. Coordinates stay on this device.')),
      sec('Search', row('Search suggestions', check('suggest'), 'Sends what you type to Google to get suggestions'), row('Recent searches', check('recent'), 'Stored only on this device'),
        el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn ghost', text: 'Clear recent searches', onclick: async () => { await NT.suggest.clear(); NT.toast('Recent searches cleared'); } }))),
      sec('AI & tools',
        row('Groq AI', el('button', { type: 'button', class: 'btn ghost', text: 'Set up…', onclick: () => { document.getElementById('bigDialog').close(); NT.ai.open(); } }), 'API key and model'),
        row('Link previews', check('linkPreview'), 'Hover a saved site to see its note'),
        row('Fetch page titles', fetchChk, 'Needs permission to read pages you saved'),
        row('Widgets', el('button', { type: 'button', class: 'btn ghost', text: 'Manage…', onclick: () => { document.getElementById('bigDialog').close(); NT.widgets.open(); } }), 'Build your own mini apps')),
      sec('Study', row('Daily study goal (min)', num('dailyGoal', 10, 1000)), row('Focus session (min)', num('focusMin', 1, 180)), row('Short break (min)', num('shortMin', 1, 60)),
        row('Long break (min)', num('longMin', 1, 120)), row('Long break every (sessions)', num('longEvery', 2, 10)),
        row('Block sites during focus sessions', check('blockDuringPomodoro'), 'Uses the Focus Mode block list')),
      sec('About & support', el('div', { class: 'about' },
        el('div', { class: 'about-name', text: 'Nova Tab v' + ((typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : '4') }),
        el('p', { class: 'empty', text: 'Developed by Jeyaul Hoque. Found a bug or have an idea? Get in touch — I read every message.' }),
        el('div', { class: 'btn-row' },
          el('a', { class: 'btn ghost', href: 'https://jeyaulhoque.pages.dev/', target: '_blank', rel: 'noopener noreferrer', text: '🌐 Website' }),
          el('a', { class: 'btn ghost', href: 'mailto:jeyaulhoquejaber@gmail.com', text: '✉ Email' }),
          el('a', { class: 'btn ghost', href: 'https://github.com/jeyaulhoquebd/nova-tab-extension', target: '_blank', rel: 'noopener noreferrer', text: 'GitHub' }),
          el('button', { type: 'button', class: 'btn ghost', text: 'Copy email', onclick: async () => { try { await navigator.clipboard.writeText('jeyaulhoquejaber@gmail.com'); NT.toast('Email copied'); } catch (e) { NT.toast('jeyaulhoquejaber@gmail.com'); } } }),
          el('a', { class: 'btn primary', href: 'mailto:jeyaulhoquejaber@gmail.com?subject=' + encodeURIComponent('Nova Tab problem report') + '&body=' + encodeURIComponent('Hi Jeyaul,\n\nWhat happened:\n\n\nWhat I expected:\n\n\n---\nNova Tab v' + ((typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : '4') + '\nBrowser: ' + navigator.userAgent), text: '🐞 Report a problem' })))),
      sec('Your data', el('div', { class: 'btn-row', style: 'margin-bottom:10px' },
        el('button', { type: 'button', class: 'btn ghost', text: '🤝 Share with friends', onclick: () => { document.getElementById('bigDialog').close(); NT.share.openShare(); } }),
        el('button', { type: 'button', class: 'btn ghost', text: '☁ Chrome Sync', onclick: () => { document.getElementById('bigDialog').close(); NT.share.openSync(); } })),
        el('div', { class: 'btn-row' },
        el('button', { type: 'button', class: 'btn ghost', text: '⬇ Export backup', onclick: exportData }),
        el('button', { type: 'button', class: 'btn ghost', text: '⬆ Import backup', onclick: () => importFile.click() }),
        el('button', { type: 'button', class: 'btn danger', text: 'Reset all', onclick: async () => {
          if (!confirm('Delete ALL Nova Tab data and settings? This cannot be undone.')) return;
          await NT.store.clear('sync'); await NT.store.clear('local'); location.reload();
        } })), importFile));
    NT.bigDialog('Settings', root);
  }

  NT.register(async () => {
    const box = $('swatches');
    THEMES.forEach(t => box.append(el('button', { type: 'button', class: 'swatch', 'data-id': t.id, title: t.name, 'aria-label': t.name + ' theme', style: `background:linear-gradient(135deg, ${t.accent}, ${t.accent2})`, onclick: () => applyTheme(t.id) })));
    const r = await NT.loadSync(['theme']);
    applyTheme(r.theme || 'aurora', false);
    await applyLook();
    $('btnSettings').addEventListener('click', openSettings);
  });
})();
