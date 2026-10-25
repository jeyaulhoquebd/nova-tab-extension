(() => {
  'use strict';
  const { $, el, state } = NT;
  const MAX_RECENT = 8;
  let items = [], active = -1, typed = '', prefix = '', ctl = null, timer = null, recents = [], mode = 'none';

  const panel = () => $('suggestPanel');
  const looksLikeUrl = v => !/\s/.test(v) && /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(v);

  // Typing "yt lofi" -> suggestions are fetched for "lofi" only.
  function split(v) {
    const m = /^(\S+)\s+([\s\S]*)$/.exec(v);
    if (m && NT.bangs && NT.bangs[m[1].toLowerCase()]) return { prefix: m[1] + ' ', query: m[2] };
    return { prefix: '', query: v };
  }

  async function fetchList(q, signal) {
    const lang = (navigator.language || 'en').split('-')[0];
    const sources = [
      { url: `https://suggestqueries.google.com/complete/search?client=firefox&hl=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}` },
      { url: `https://duckduckgo.com/ac/?type=list&q=${encodeURIComponent(q)}` }
    ];
    for (const s of sources) {
      try {
        const r = await fetch(s.url, { signal });
        if (!r.ok) continue;
        const j = await r.json();
        const list = Array.isArray(j) ? j[1] : [];
        if (Array.isArray(list)) return list.filter(x => typeof x === 'string').slice(0, 8);
      } catch (e) { if (e && e.name === 'AbortError') throw e; }
    }
    return [];
  }

  function hide() {
    $('q').setAttribute('aria-expanded', 'false'); $('q').removeAttribute('aria-activedescendant');
    panel().hidden = true; items = []; active = -1; mode = 'none';
    if (ctl) { ctl.abort(); ctl = null; }
  }

  function show() {
    const p = panel();
    $('promptPanel').hidden = true;
    p.textContent = '';
    if (!items.length) { p.hidden = true; return; }
    if (mode === 'recent') {
      p.append(el('div', { class: 'suggest-head' }, el('span', { text: 'Recent searches' }),
        el('button', { type: 'button', class: 'link-btn', text: 'Clear', onmousedown: ev => ev.preventDefault(), onclick: () => { recents = []; NT.save({ recentSearches: recents }); hide(); } })));
    }
    items.forEach((t, i) => {
      const lower = t.toLowerCase(), q = typed.toLowerCase();
      const text = mode === 'suggest' && lower.startsWith(q) && q
        ? [el('span', { text: t.slice(0, typed.length) }), el('b', { text: t.slice(typed.length) })]
        : [el('span', { text: t })];
      p.append(el('div', { id: 'sg' + i, role: 'option', 'aria-selected': i === active ? 'true' : 'false', class: 'suggest-item' + (i === active ? ' active' : ''), onmousedown: ev => ev.preventDefault(), onclick: () => pick(i) },
        el('span', { class: 'suggest-icon', text: mode === 'recent' ? '🕘' : '🔍' }),
        el('span', { class: 'suggest-text' }, text),
        mode === 'recent' ? el('button', { type: 'button', class: 'tool', title: 'Remove', text: '✕', onmousedown: ev => ev.preventDefault(), onclick: ev => {
          ev.stopPropagation(); recents = recents.filter(x => x !== t); NT.save({ recentSearches: recents }); items = recents.slice(); items.length ? show() : hide();
        } }) : null));
    });
    p.hidden = false;
    $('q').setAttribute('aria-expanded', 'true');
  }

  function pick(i) {
    const f = $('searchForm');
    $('q').value = (mode === 'suggest' ? prefix : '') + items[i];
    hide();
    if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  function showRecents() {
    if (state.settings.recent === false || !recents.length) { hide(); return; }
    mode = 'recent'; items = recents.slice(); active = -1; typed = ''; prefix = '';
    show();
  }

  function onInput() {
    const v = $('q').value;
    clearTimeout(timer);
    if (ctl) { ctl.abort(); ctl = null; }
    if (!v.trim()) { showRecents(); return; }
    if (state.settings.suggest === false || looksLikeUrl(v.trim())) { hide(); return; }
    const sp = split(v);
    if (!sp.query.trim()) { hide(); return; }
    timer = setTimeout(async () => {
      const myCtl = ctl = new AbortController();
      try {
        const list = await fetchList(sp.query.trim(), myCtl.signal);
        if ($('q').value !== v) return;
        mode = 'suggest'; prefix = sp.prefix; typed = sp.query; items = list; active = -1;
        show();
      } catch (e) { /* aborted or offline */ }
    }, 130);
  }

  function onKey(ev) {
    const open = !panel().hidden && items.length;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (!open) { if (ev.key === 'ArrowDown' && !$('q').value.trim()) showRecents(); return; }
      ev.preventDefault();
      active = ev.key === 'ArrowDown' ? Math.min(items.length - 1, active + 1) : Math.max(-1, active - 1);
      $('q').value = active >= 0 ? (mode === 'suggest' ? prefix : '') + items[active] : (mode === 'suggest' ? prefix + typed : '');
      panel().querySelectorAll('.suggest-item').forEach((n, i) => { n.classList.toggle('active', i === active); n.setAttribute('aria-selected', i === active ? 'true' : 'false'); });
      if (active >= 0) $('q').setAttribute('aria-activedescendant', 'sg' + active); else $('q').removeAttribute('aria-activedescendant');
    } else if (ev.key === 'Escape' && open) {
      $('q').value = mode === 'suggest' ? prefix + typed : $('q').value;
      hide();
    }
  }

  async function remember(text) {
    hide();
    if (state.settings.recent === false || !text) return;
    recents = [text, ...recents.filter(x => x !== text)].slice(0, MAX_RECENT);
    await NT.save({ recentSearches: recents });
  }

  NT.suggest = { hide, remember, clear: () => { recents = []; return NT.save({ recentSearches: recents }); } };

  NT.register(async () => {
    recents = (await NT.load(['recentSearches'])).recentSearches || [];
    const q = $('q');
    q.addEventListener('input', onInput);
    q.addEventListener('keydown', onKey);
    q.addEventListener('focus', () => { if (!q.value.trim()) showRecents(); });
    q.addEventListener('click', () => { if (!q.value.trim() && panel().hidden) showRecents(); });
    document.addEventListener('click', ev => { if (!ev.target.closest('.search-wrap')) hide(); });
  });
})();
