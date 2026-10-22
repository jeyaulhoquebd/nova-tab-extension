(() => {
  'use strict';
  const { $, el, state } = NT;
  const THEMES = [
    { id: 'aurora', name: 'Aurora', g1: '#0f172a', g2: '#312e81', g3: '#0e7490', accent: '#8b5cf6' },
    { id: 'sunset', name: 'Sunset', g1: '#2b1055', g2: '#7a2a6b', g3: '#d9534f', accent: '#f97316' },
    { id: 'ocean', name: 'Ocean', g1: '#021b2e', g2: '#0b4f6c', g3: '#12a4a0', accent: '#06b6d4' },
    { id: 'forest', name: 'Forest', g1: '#06251a', g2: '#14532d', g3: '#3f8f5b', accent: '#22c55e' },
    { id: 'rose', name: 'Rose', g1: '#2a0a1f', g2: '#7a1d4f', g3: '#d6567f', accent: '#ec4899' },
    { id: 'midnight', name: 'Midnight', g1: '#05060d', g2: '#111827', g3: '#1f2a44', accent: '#6366f1' }
  ];

  function applyTheme(id, persist = true) {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    const r = document.documentElement.style;
    r.setProperty('--g1', t.g1); r.setProperty('--g2', t.g2); r.setProperty('--g3', t.g3); r.setProperty('--accent', t.accent);
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
  }

  function set(key, value) {
    state.settings[key] = value;
    NT.saveSettings();
    NT.emit('settings');
    if (key === 'mode' || key === 'wallpaper') applyLook();
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
    ['bgImage', 'weatherCache', 'prayerCache', 'focus', 'loc'].forEach(k => delete local[k]);
    const blob = new Blob([JSON.stringify({ app: 'nova-tab', version: 2, exported: new Date().toISOString(), sync, local }, null, 2)], { type: 'application/json' });
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
  const check = key => el('input', { type: 'checkbox', checked: !!state.settings[key], onchange: ev => set(key, ev.target.checked) });
  const sec = (title, ...rows) => el('section', { class: 'set-sec' }, el('h4', { text: title }), ...rows);

  function openSettings() {
    const s = state.settings;
    const name = el('input', { type: 'text', value: s.name, maxlength: 20, placeholder: 'Your name', onchange: ev => set('name', ev.target.value.trim()) });
    const city = el('input', { type: 'text', value: s.city, maxlength: 30, placeholder: 'Dhaka', onchange: ev => set('city', ev.target.value.trim() || 'Dhaka') });
    const file = el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try { const data = await readImage(f); await NT.save({ bgImage: data }); set('wallpaper', 'custom'); NT.toast('Wallpaper updated'); } catch (e) { NT.toast('Could not use that image.'); }
    } });
    const importFile = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: ev => { if (ev.target.files[0]) importData(ev.target.files[0]); } });
    const wall = el('select', { onchange: ev => { if (ev.target.value === 'custom') { file.click(); ev.target.value = state.settings.wallpaper; } else set('wallpaper', ev.target.value); } },
      [['none', 'Colour theme only'], ['daily', 'Daily photo (online)'], ['custom', 'My own photo…']].map(([v, l]) => el('option', { value: v, selected: v === s.wallpaper }, l)));
    const mode = el('select', { onchange: ev => set('mode', ev.target.value) }, [['dark', 'Dark'], ['light', 'Light']].map(([v, l]) => el('option', { value: v, selected: v === s.mode }, l)));

    const root = el('div', {},
      sec('Display', row('Your name', name, 'Shown in the greeting'), row('12-hour clock (AM/PM)', check('hour12')), row('Show seconds', check('showSeconds')), row('Appearance', mode), row('Background', wall), file),
      sec('Study', row('Daily study goal (min)', num('dailyGoal', 10, 1000)), row('Focus session (min)', num('focusMin', 1, 180)), row('Short break (min)', num('shortMin', 1, 60)),
        row('Long break (min)', num('longMin', 1, 120)), row('Long break every (sessions)', num('longEvery', 2, 10)),
        row('Block sites during focus sessions', check('blockDuringPomodoro'), 'Uses the Focus Mode block list')),
      sec('Location', row('City (Bangladesh)', city, 'For weather & prayer times')),
      sec('Your data', el('div', { class: 'btn-row' },
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
    THEMES.forEach(t => box.append(el('button', { type: 'button', class: 'swatch', 'data-id': t.id, title: t.name, style: `background:linear-gradient(135deg, ${t.g2}, ${t.accent})`, onclick: () => applyTheme(t.id) })));
    const r = await NT.loadSync(['theme']);
    applyTheme(r.theme || 'aurora', false);
    await applyLook();
    $('btnSettings').addEventListener('click', openSettings);
  });
})();
