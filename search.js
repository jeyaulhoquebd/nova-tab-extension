(() => {
  'use strict';
  const { $, el, state, favicon } = NT;

  // q: URL that accepts a query.  copy: no query URL, so the text is copied and the site opens.
  const ENGINES = [
    { id: 'google', name: 'Google', domain: 'google.com', bang: 'g', q: 'https://www.google.com/search?q=', home: 'https://www.google.com' },
    { id: 'perplexity', name: 'Perplexity', domain: 'perplexity.ai', bang: 'px', q: 'https://www.perplexity.ai/search?q=', home: 'https://www.perplexity.ai' },
    { id: 'chatgpt', name: 'ChatGPT', domain: 'chatgpt.com', bang: 'gpt', q: 'https://chatgpt.com/?q=', home: 'https://chatgpt.com' },
    { id: 'claude', name: 'Claude', domain: 'claude.ai', bang: 'cl', q: 'https://claude.ai/new?q=', home: 'https://claude.ai/new' },
    { id: 'deepseek', name: 'DeepSeek', domain: 'deepseek.com', bang: 'ds', q: null, copy: true, home: 'https://chat.deepseek.com' },
    { id: 'gemini', name: 'Gemini', domain: 'gemini.google.com', bang: 'gm', q: null, copy: true, home: 'https://gemini.google.com/app' },
    { id: 'ddg', name: 'DuckDuckGo', domain: 'duckduckgo.com', bang: 'ddg', q: 'https://duckduckgo.com/?q=', home: 'https://duckduckgo.com' },
    { id: 'bing', name: 'Bing', domain: 'bing.com', bang: 'bing', q: 'https://www.bing.com/search?q=', home: 'https://www.bing.com' },
    { id: 'youtube', name: 'YouTube', domain: 'youtube.com', bang: 'yt', q: 'https://www.youtube.com/results?search_query=', home: 'https://www.youtube.com' }
  ];

  // Quick commands: type "yt lofi music" or "gh react" and press Enter.
  const BANGS = {};
  ENGINES.forEach(e => { BANGS[e.bang] = e; });
  Object.assign(BANGS, {
    gh: { name: 'GitHub', q: 'https://github.com/search?q=' },
    so: { name: 'Stack Overflow', q: 'https://stackoverflow.com/search?q=' },
    wiki: { name: 'Wikipedia', q: 'https://en.wikipedia.org/w/index.php?search=' },
    maps: { name: 'Google Maps', q: 'https://www.google.com/maps/search/?api=1&query=' },
    img: { name: 'Google Images', q: 'https://www.google.com/search?tbm=isch&q=' },
    tr: { name: 'Google Translate (→ Bengali)', q: 'https://translate.google.com/?sl=auto&tl=bn&op=translate&text=' },
    npm: { name: 'npm', q: 'https://www.npmjs.com/search?q=' },
    mdn: { name: 'MDN Docs', q: 'https://developer.mozilla.org/en-US/search?q=' }
  });

  NT.bangs = BANGS;

  let engineId = 'google';
  let compare = false;
  let selected = new Set(['chatgpt', 'claude', 'perplexity', 'google']);
  const current = () => ENGINES.find(e => e.id === engineId) || ENGINES[0];
  const nameOf = e => e.name || e.id;

  function baseHint() {
    if (compare) {
      const n = selected.size;
      const copyNames = ENGINES.filter(e => selected.has(e.id) && e.copy).map(e => e.name);
      return `Compare mode: Enter opens ${n} tab${n === 1 ? '' : 's'}.` + (copyNames.length ? ` ${copyNames.join(' & ')}: your text is copied — paste with Ctrl+V.` : '');
    }
    const e = current();
    return e.copy ? `${e.name} has no search link — your text will be copied so you can paste it (Ctrl+V).` : '';
  }
  const setHint = t => { $('hint').textContent = t == null ? baseHint() : t; };

  function renderEngines() {
    const nav = $('engines');
    nav.textContent = '';
    ENGINES.forEach(e => {
      const active = compare ? selected.has(e.id) : e.id === engineId;
      nav.append(el('button', {
        type: 'button', class: 'engine' + (active ? ' active' : ''), title: `Shortcut: ${e.bang} <text>`,
        onclick: () => {
          if (compare) {
            if (selected.has(e.id)) selected.delete(e.id); else selected.add(e.id);
            persistCompare(); renderEngines(); setHint();
          } else { setEngine(e.id); $('q').focus(); }
        }
      }, el('img', { src: favicon(e.domain), alt: '' }), el('span', { text: e.name })));
    });
    nav.append(el('button', {
      type: 'button', class: 'engine compare' + (compare ? ' active' : ''), title: 'Send one question to several AIs at once',
      onclick: () => { compare = !compare; persistCompare(); renderEngines(); setHint(); $('q').focus(); }
    }, el('span', { text: '⚡ Compare' })));
  }

  const persistCompare = () => NT.save({ compare: { on: compare, selected: [...selected] } });

  function setEngine(id, persist = true) {
    engineId = id;
    const e = current();
    $('engineIcon').src = favicon(e.domain);
    $('q').placeholder = `Search with ${e.name}…   (type / to focus)`;
    renderEngines(); setHint();
    if (persist) NT.saveSync({ engine: id });
  }

  const looksLikeUrl = v => !/\s/.test(v) && /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(v);
  function parseBang(text) {
    const m = /^(\S+)\s+([\s\S]+)$/.exec(text);
    if (!m) return null;
    const t = BANGS[m[1].toLowerCase()];
    return t ? { target: t, query: m[2].trim() } : null;
  }

  async function copyText(text) { try { await navigator.clipboard.writeText(text); } catch (e) { /* ignore */ } }
  const urlFor = (t, text) => (t.q ? t.q + encodeURIComponent(text) : t.home);

  async function onSubmit(ev) {
    ev.preventDefault();
    const text = $('q').value.trim();
    if (!text) { if (!compare) location.href = current().home; return; }
    if (looksLikeUrl(text)) { location.href = /^https?:\/\//i.test(text) ? text : 'https://' + text; return; }
    if (NT.suggest) await NT.suggest.remember(text);
    const bang = parseBang(text);
    if (bang) {
      if (!bang.target.q) await copyText(bang.query);
      location.href = urlFor(bang.target, bang.query);
      return;
    }
    if (compare && selected.size) {
      const list = ENGINES.filter(e => selected.has(e.id));
      if (list.some(e => e.copy)) await copyText(text);
      list.forEach((e, i) => {
        const url = urlFor(e, text);
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url, active: i === 0 });
        else window.open(url, '_blank');
      });
      return;
    }
    const e = current();
    if (!e.q) await copyText(text);
    location.href = urlFor(e, text);
  }

  NT.register(async () => {
    const [local, sync] = await Promise.all([NT.load(['compare']), NT.loadSync(['engine'])]);
    if (local.compare) { compare = !!local.compare.on; if (Array.isArray(local.compare.selected)) selected = new Set(local.compare.selected); }
    $('searchForm').addEventListener('submit', onSubmit);
    $('q').addEventListener('input', () => {
      const b = parseBang($('q').value.trim());
      setHint(b ? `↳ ${nameOf(b.target)}: "${b.query}"` : null);
    });
    setEngine(ENGINES.some(e => e.id === sync.engine) ? sync.engine : 'google', false);
    document.addEventListener('keydown', ev => {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (ev.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag) && !document.querySelector('dialog[open]')) { ev.preventDefault(); $('q').focus(); }
    });
    $('q').focus();
  });
})();
