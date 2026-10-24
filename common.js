(() => {
  'use strict';
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hasChrome = typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);
  const $ = id => document.getElementById(id);

  /* ---------- storage ---------- */
  const store = {
    get(area, keys) {
      return new Promise(resolve => {
        if (hasChrome) { chrome.storage[area].get(keys, r => resolve(r || {})); return; }
        const out = {};
        (Array.isArray(keys) ? keys : [keys]).forEach(k => {
          try { const v = localStorage.getItem(area + ':' + k); if (v !== null) out[k] = JSON.parse(v); } catch (e) {}
        });
        resolve(out);
      });
    },
    set(area, obj) {
      return new Promise(resolve => {
        if (hasChrome) { chrome.storage[area].set(obj, () => resolve()); return; }
        Object.entries(obj).forEach(([k, v]) => { try { localStorage.setItem(area + ':' + k, JSON.stringify(v)); } catch (e) {} });
        resolve();
      });
    },
    clear(area) {
      return new Promise(resolve => {
        if (hasChrome) { chrome.storage[area].clear(() => resolve()); return; }
        localStorage.clear(); resolve();
      });
    }
  };
  const load = keys => store.get('local', keys);
  const save = obj => store.set('local', obj);

  /* ---------- state & events ---------- */
  const DEFAULTS = {
    hour12: true, showSeconds: true, name: '', mode: 'dark', wallpaper: 'none',
    dailyGoal: 120, focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4,
    blockDuringPomodoro: false, city: '', timezone: 'auto', suggest: true, recent: true,
    blockList: ['facebook.com', 'youtube.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 'reddit.com', 'netflix.com']
  };
  const state = { settings: { ...DEFAULTS } };
  const saveSettings = () => save({ settings: state.settings });

  const handlers = {};
  const on = (e, fn) => { (handlers[e] = handlers[e] || []).push(fn); };
  const emit = (e, ...a) => { (handlers[e] || []).forEach(fn => { try { fn(...a); } catch (err) { console.error(err); } }); };

  const inits = [];
  const register = fn => { inits.push(fn); };
  async function boot() {
    const r = await load(['settings']);
    state.settings = { ...DEFAULTS, ...(r.settings || {}) };
    applyTimezone();
    ['formDialog', 'bigDialog'].forEach(id => {
      const d = $(id);
      d.addEventListener('click', ev => { if (ev.target === d) d.close(); });
    });
    $('bigClose').addEventListener('click', () => $('bigDialog').close());
    for (const fn of inits) { try { await fn(); } catch (e) { console.error(e); } }
  }

  /* ---------- DOM helper ---------- */
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    });
    kids.flat(Infinity).forEach(c => { if (c == null || c === false) return; n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  }

  const favicon = (domain, size = 64) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
  const hostOf = url => { try { return new URL(url).hostname; } catch (e) { return ''; } };
  const uid = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function normalizeUrl(raw) {
    let v = (raw || '').trim();
    if (!v) return null;
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try {
      const u = new URL(v);
      if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
      return u.href;
    } catch (e) { return null; }
  }

  /* ---------- time zone (auto-detected from the device, or chosen manually) ---------- */
  const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } };
  const validTz = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; } };
  let TZ = deviceTz();
  function applyTimezone() {
    const s = state.settings.timezone;
    TZ = s && s !== 'auto' && validTz(s) ? s : deviceTz();
  }
  const FALLBACK_ZONES = ['Asia/Dhaka', 'Asia/Kolkata', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];
  const allZones = () => { try { if (Intl.supportedValuesOf) return Intl.supportedValuesOf('timeZone'); } catch (e) { /* old browser */ } return FALLBACK_ZONES; };

  const fmtCache = {}, offCache = {};
  function nowIn(tz = TZ, d = new Date()) {
    let f = fmtCache[tz];
    if (!f) f = fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = {};
    f.formatToParts(d).forEach(x => { p[x.type] = x.value; });
    return { day: DAYS.indexOf(p.weekday), minutes: (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10), ymd: `${p.year}-${p.month}-${p.day}` };
  }
  const nowTz = () => nowIn(TZ);
  const todayStr = (d = new Date()) => nowIn(TZ, d).ymd;

  function tzOffsetMs(ts, tz = TZ) {
    let f = offCache[tz];
    if (!f) f = offCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {};
    f.formatToParts(new Date(ts)).forEach(x => { p[x.type] = x.value; });
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ts / 1000) * 1000;
  }
  // wall-clock time in a time zone -> real timestamp
  function zonedToMs(ymd, hm, tz = TZ) {
    const [y, m, d] = ymd.split('-').map(Number);
    const [h, mi] = (hm || '00:00').split(':').map(Number);
    const guess = Date.UTC(y, m - 1, d, h || 0, mi || 0);
    let t = guess - tzOffsetMs(guess, tz);
    t = guess - tzOffsetMs(t, tz);
    return t;
  }
  const ALIASES = { Calcutta: 'Kolkata', Saigon: 'Ho Chi Minh City', Katmandu: 'Kathmandu', Rangoon: 'Yangon' };
  const cityName = tz => { if (tz === 'UTC') return 'UTC'; const c = tz.split('/').pop().replace(/_/g, ' '); return ALIASES[c] || c; };
  function tzInfo(tz = TZ) {
    const now = new Date();
    const get = style => { try { const x = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: style }).formatToParts(now).find(p => p.type === 'timeZoneName'); return x ? x.value : ''; } catch (e) { return ''; } };
    return { region: cityName(tz), long: get('long'), offset: get('shortOffset') };
  }

  const toMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null; };
  function fmtMin(mins, hour12 = state.settings.hour12) {
    mins = ((mins % 1440) + 1440) % 1440;
    const h = Math.floor(mins / 60), mm = String(mins % 60).padStart(2, '0');
    if (!hour12) return `${String(h).padStart(2, '0')}:${mm}`;
    return `${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
  }
  const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const daysUntil = ymd => Math.round((Date.parse(ymd + 'T00:00:00Z') - Date.parse(todayStr() + 'T00:00:00Z')) / 864e5);
  const prettyDate = ymd => new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  function fmtCountdown(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s % 60}s`;
  }

  /* ---------- UI helpers ---------- */
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function card(title, { icon = '', actions = [], cls = '' } = {}) {
    const body = el('div', { class: 'card-body' });
    const head = el('div', { class: 'card-head' },
      el('div', { class: 'card-title' }, icon ? el('span', { class: 'card-icon', text: icon }) : null, el('h3', { text: title })),
      el('div', { class: 'card-actions' }, actions));
    const root = el('article', { class: 'card ' + cls }, head, body);
    $('dashboard').appendChild(root);
    return { root, head, body };
  }

  function formDialog({ title, fields, submitText = 'Save', onSubmit }) {
    const dlg = $('formDialog'), form = $('formDialogForm');
    form.textContent = '';
    form.append(el('h2', { text: title }));
    const inputs = {};
    fields.forEach(f => {
      let input;
      if (f.type === 'days') {
        input = el('div', { class: 'days-pick' }, DAYS.map((d, i) =>
          el('label', { class: 'day-chip' }, el('input', { type: 'checkbox', value: String(i), checked: (f.value || []).includes(i) }), el('span', { text: d }))));
        form.append(el('div', { class: 'field' }, el('span', { class: 'field-label', text: f.label }), input));
      } else {
        if (f.type === 'select') {
          input = el('select', {}, f.options.map(o => el('option', { value: o.value, selected: String(o.value) === String(f.value) }, o.label)));
        } else if (f.type === 'textarea') {
          input = el('textarea', { rows: f.rows || 4, placeholder: f.placeholder || '' }, f.value || '');
        } else {
          input = el('input', { type: f.type || 'text', placeholder: f.placeholder || '', value: f.value == null ? '' : f.value, maxlength: f.maxlength, min: f.min, max: f.max, step: f.step, required: !!f.required });
          if (Array.isArray(f.list)) {
            const id = 'dl_' + f.name;
            form.append(el('datalist', { id }, f.list.map(v => el('option', { value: v }))));
            input.setAttribute('list', id);
          }
        }
        form.append(el('label', { class: 'field' }, el('span', { class: 'field-label', text: f.label }), input));
      }
      inputs[f.name] = input;
    });
    const err = el('p', { class: 'form-error', hidden: true });
    form.append(err, el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'btn ghost', text: 'Cancel', onclick: () => dlg.close() }),
      el('button', { type: 'submit', class: 'btn primary', text: submitText })));
    form.onsubmit = async ev => {
      ev.preventDefault();
      const v = {};
      fields.forEach(f => {
        const i = inputs[f.name];
        v[f.name] = f.type === 'days' ? [...i.querySelectorAll('input:checked')].map(x => parseInt(x.value, 10)) : (i.value || '').trim();
      });
      const msg = await onSubmit(v);
      if (msg) { err.textContent = msg; err.hidden = false; } else dlg.close();
    };
    dlg.showModal();
    const first = form.querySelector('input:not([type=checkbox]), select, textarea');
    if (first) first.focus();
  }

  function bigDialog(title, node, onClose) {
    const dlg = $('bigDialog');
    $('bigTitle').textContent = title;
    const body = $('bigBody');
    body.textContent = '';
    body.append(node);
    dlg.onclose = () => { dlg.onclose = null; if (onClose) onClose(); };
    dlg.showModal();
    return dlg;
  }

  window.NT = {
    tz: () => TZ, deviceTz, validTz, applyTimezone, cityName, allZones, nowIn, tzOffsetMs, zonedToMs, tzInfo, DAYS, DAY_NAMES, $, el, store, load, save, loadSync: k => store.get('sync', k), saveSync: o => store.set('sync', o),
    state, saveSettings, on, emit, register, boot, favicon, hostOf, uid, normalizeUrl,
    todayStr, nowTz, toMin, fmtMin, addDays, daysUntil, prettyDate, fmtCountdown,
    toast, card, formDialog, bigDialog
  };
})();
