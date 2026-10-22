(() => {
  'use strict';

  /* ---------- Config ---------- */
  const TZ = 'Asia/Dhaka';

  // q: URL that accepts a query. copy: site has no query URL, so the query is copied to clipboard.
  const ENGINES = [
    { id: 'google',     name: 'Google',      domain: 'google.com',      q: 'https://www.google.com/search?q=',   home: 'https://www.google.com' },
    { id: 'perplexity', name: 'Perplexity',  domain: 'perplexity.ai',   q: 'https://www.perplexity.ai/search?q=', home: 'https://www.perplexity.ai' },
    { id: 'chatgpt',    name: 'ChatGPT',     domain: 'chatgpt.com',     q: 'https://chatgpt.com/?q=',            home: 'https://chatgpt.com' },
    { id: 'claude',     name: 'Claude',      domain: 'claude.ai',       q: 'https://claude.ai/new?q=',           home: 'https://claude.ai/new' },
    { id: 'deepseek',   name: 'DeepSeek',    domain: 'deepseek.com',    q: null, copy: true,                      home: 'https://chat.deepseek.com' },
    { id: 'gemini',     name: 'Gemini',      domain: 'gemini.google.com', q: null, copy: true,                    home: 'https://gemini.google.com/app' },
    { id: 'ddg',        name: 'DuckDuckGo',  domain: 'duckduckgo.com',  q: 'https://duckduckgo.com/?q=',         home: 'https://duckduckgo.com' },
    { id: 'bing',       name: 'Bing',        domain: 'bing.com',        q: 'https://www.bing.com/search?q=',     home: 'https://www.bing.com' },
    { id: 'youtube',    name: 'YouTube',     domain: 'youtube.com',     q: 'https://www.youtube.com/results?search_query=', home: 'https://www.youtube.com' }
  ];

  const THEMES = [
    { id: 'aurora',   name: 'Aurora',   g1: '#0f172a', g2: '#312e81', g3: '#0e7490', accent: '#8b5cf6' },
    { id: 'sunset',   name: 'Sunset',   g1: '#2b1055', g2: '#7a2a6b', g3: '#d9534f', accent: '#f97316' },
    { id: 'ocean',    name: 'Ocean',    g1: '#021b2e', g2: '#0b4f6c', g3: '#12a4a0', accent: '#06b6d4' },
    { id: 'forest',   name: 'Forest',   g1: '#06251a', g2: '#14532d', g3: '#3f8f5b', accent: '#22c55e' },
    { id: 'rose',     name: 'Rose',     g1: '#2a0a1f', g2: '#7a1d4f', g3: '#d6567f', accent: '#ec4899' },
    { id: 'midnight', name: 'Midnight', g1: '#05060d', g2: '#111827', g3: '#1f2a44', accent: '#6366f1' }
  ];

  const DEFAULT_SITES = [
    { id: 'd1', name: 'Gmail',   url: 'https://mail.google.com' },
    { id: 'd2', name: 'YouTube', url: 'https://www.youtube.com' },
    { id: 'd3', name: 'GitHub',  url: 'https://github.com' },
    { id: 'd4', name: 'Claude',  url: 'https://claude.ai' },
    { id: 'd5', name: 'ChatGPT', url: 'https://chatgpt.com' }
  ];

  /* ---------- Storage (chrome.storage.sync, falls back to localStorage) ---------- */
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;
  const store = {
    get(keys) {
      return new Promise(resolve => {
        if (hasChrome) return chrome.storage.sync.get(keys, r => resolve(r || {}));
        const out = {};
        keys.forEach(k => { try { const v = localStorage.getItem(k); if (v !== null) out[k] = JSON.parse(v); } catch (e) {} });
        resolve(out);
      });
    },
    set(obj) {
      return new Promise(resolve => {
        if (hasChrome) return chrome.storage.sync.set(obj, () => resolve());
        Object.entries(obj).forEach(([k, v]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} });
        resolve();
      });
    }
  };

  /* ---------- Helpers ---------- */
  const $ = id => document.getElementById(id);
  const favicon = (domain, size = 64) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
  const hostOf = url => { try { return new URL(url).hostname; } catch (e) { return ''; } };
  const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function normalizeUrl(raw) {
    let v = raw.trim();
    if (!v) return null;
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try {
      const u = new URL(v);
      if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
      return u.href;
    } catch (e) { return null; }
  }

  /* ---------- Clock (Bangladesh time) ---------- */
  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false });

  function greetingFor(h) {
    if (h >= 5 && h < 12) return 'Good morning ☀️';
    if (h >= 12 && h < 17) return 'Good afternoon 🌤️';
    if (h >= 17 && h < 21) return 'Good evening 🌆';
    return 'Good night 🌙';
  }

  let lastDate = '';
  function tick() {
    const now = new Date();
    const p = {};
    timeFmt.formatToParts(now).forEach(x => { p[x.type] = x.value; });
    $('time').textContent = `${p.hour}:${p.minute}`;
    $('seconds').textContent = p.second;
    $('ampm').textContent = (p.dayPeriod || '').toUpperCase();
    const d = dateFmt.format(now);
    if (d !== lastDate) {
      lastDate = d;
      $('date').textContent = d;
      let h = parseInt(hourFmt.format(now), 10);
      if (h === 24) h = 0;
      $('greeting').textContent = greetingFor(h);
    }
  }

  /* ---------- Search ---------- */
  let engineId = 'google';
  const getEngine = () => ENGINES.find(e => e.id === engineId) || ENGINES[0];

  function renderEngines() {
    const nav = $('engines');
    nav.textContent = '';
    ENGINES.forEach(e => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'engine' + (e.id === engineId ? ' active' : '');
      const img = document.createElement('img');
      img.src = favicon(e.domain);
      img.alt = '';
      const span = document.createElement('span');
      span.textContent = e.name;
      b.append(img, span);
      b.addEventListener('click', () => { setEngine(e.id); $('q').focus(); });
      nav.appendChild(b);
    });
  }

  function setEngine(id, persist = true) {
    engineId = id;
    const e = getEngine();
    $('engineIcon').src = favicon(e.domain);
    $('q').placeholder = `Search with ${e.name}…`;
    $('hint').textContent = e.copy ? `${e.name} has no search link — your text will be copied so you can paste it (Ctrl+V).` : '';
    document.querySelectorAll('.engine').forEach((el, i) => el.classList.toggle('active', ENGINES[i].id === id));
    if (persist) store.set({ engine: id });
  }

  const looksLikeUrl = v => !/\s/.test(v) && /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(v);

  async function doSearch(ev) {
    ev.preventDefault();
    const text = $('q').value.trim();
    const e = getEngine();
    if (!text) { location.href = e.home; return; }
    if (looksLikeUrl(text)) { location.href = /^https?:\/\//i.test(text) ? text : 'https://' + text; return; }
    if (e.q) { location.href = e.q + encodeURIComponent(text); return; }
    try { await navigator.clipboard.writeText(text); } catch (err) { /* clipboard may be blocked */ }
    location.href = e.home;
  }

  /* ---------- Shortcuts ---------- */
  let sites = [];
  let editingId = null;

  function saveSites() { return store.set({ sites }); }

  function renderSites() {
    const grid = $('grid');
    grid.textContent = '';

    sites.forEach(s => {
      const tile = document.createElement('div');
      tile.className = 'tile';

      const a = document.createElement('a');
      a.href = s.url;
      a.title = s.url;

      const fav = document.createElement('span');
      fav.className = 'fav';
      const letter = () => { fav.textContent = (s.name[0] || '?').toUpperCase(); };
      const img = document.createElement('img');
      img.alt = '';
      img.src = favicon(hostOf(s.url), 128);
      img.addEventListener('error', letter);
      img.addEventListener('load', () => { if (img.naturalWidth <= 16) letter(); });
      fav.appendChild(img);

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = s.name;
      a.append(fav, label);

      const tools = document.createElement('div');
      tools.className = 'tile-tools';
      const edit = document.createElement('button');
      edit.className = 'tool'; edit.type = 'button'; edit.title = 'Edit'; edit.textContent = '✎';
      edit.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); openDialog(s.id); });
      const del = document.createElement('button');
      del.className = 'tool'; del.type = 'button'; del.title = 'Remove'; del.textContent = '✕';
      del.addEventListener('click', ev => {
        ev.preventDefault(); ev.stopPropagation();
        sites = sites.filter(x => x.id !== s.id);
        saveSites(); renderSites();
      });
      tools.append(edit, del);

      tile.append(a, tools);
      grid.appendChild(tile);
    });

    const addTile = document.createElement('div');
    addTile.className = 'tile';
    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'add';
    addBtn.innerHTML = '<span class="fav">+</span><span class="label">Add site</span>';
    addBtn.addEventListener('click', () => openDialog(null));
    addTile.appendChild(addBtn);
    grid.appendChild(addTile);
  }

  const dialog = $('dialog');
  function openDialog(id) {
    editingId = id;
    const s = sites.find(x => x.id === id);
    $('dialogTitle').textContent = s ? 'Edit shortcut' : 'Add shortcut';
    $('siteName').value = s ? s.name : '';
    $('siteUrl').value = s ? s.url : '';
    $('formError').hidden = true;
    dialog.showModal();
    $('siteName').focus();
  }

  $('cancelBtn').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', ev => { if (ev.target === dialog) dialog.close(); });

  $('siteForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const name = $('siteName').value.trim();
    const url = normalizeUrl($('siteUrl').value);
    if (!name || !url) {
      $('formError').textContent = 'Please enter a name and a valid link (e.g. github.com).';
      $('formError').hidden = false;
      return;
    }
    if (editingId) {
      sites = sites.map(x => x.id === editingId ? { ...x, name, url } : x);
    } else {
      sites.push({ id: uid(), name, url });
    }
    saveSites(); renderSites(); dialog.close();
  });

  /* ---------- Themes ---------- */
  function applyTheme(id, persist = true) {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    const r = document.documentElement.style;
    r.setProperty('--g1', t.g1); r.setProperty('--g2', t.g2); r.setProperty('--g3', t.g3); r.setProperty('--accent', t.accent);
    document.querySelectorAll('.swatch').forEach(el => el.classList.toggle('active', el.dataset.id === t.id));
    if (persist) store.set({ theme: t.id });
  }

  function renderSwatches() {
    const box = $('swatches');
    THEMES.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.dataset.id = t.id; b.title = t.name;
      b.style.background = `linear-gradient(135deg, ${t.g2}, ${t.accent})`;
      b.addEventListener('click', () => applyTheme(t.id));
      box.appendChild(b);
    });
  }

  /* ---------- Keyboard: "/" focuses search ---------- */
  document.addEventListener('keydown', ev => {
    if (ev.key === '/' && document.activeElement !== $('q') && !dialog.open) {
      ev.preventDefault(); $('q').focus();
    }
  });

  /* ---------- Init ---------- */
  async function init() {
    tick(); setInterval(tick, 1000);
    renderEngines(); renderSwatches();
    $('searchForm').addEventListener('submit', doSearch);

    const saved = await store.get(['sites', 'engine', 'theme']);
    sites = Array.isArray(saved.sites) ? saved.sites : DEFAULT_SITES.slice();
    if (!Array.isArray(saved.sites)) saveSites();
    renderSites();
    setEngine(ENGINES.some(e => e.id === saved.engine) ? saved.engine : 'google', false);
    applyTheme(saved.theme || 'aurora', false);
    $('q').focus();
  }
  init();
})();
