(() => {
  'use strict';
  const { el, state } = NT;
  const TTL = 7 * 864e5;
  let meta = {}, tip = null, timer = null, allowed = null, token = 0;

  const permitted = () => new Promise(resolve => {
    if (allowed !== null) { resolve(allowed); return; }
    if (typeof chrome === 'undefined' || !chrome.permissions) { allowed = false; resolve(false); return; }
    chrome.permissions.contains({ origins: ['<all_urls>'] }, ok => { allowed = !!ok; resolve(allowed); });
  });

  async function fetchMeta(url) {
    const c = meta[url];
    if (c && Date.now() - c.t < TTL) return c;
    if (state.settings.linkFetch !== true || !(await permitted())) return null;
    const ctl = new AbortController(), timeout = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetch(url, { signal: ctl.signal, credentials: 'omit' });
      const html = (await r.text()).slice(0, 300000);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const pick = (...sels) => { for (const s of sels) { const n = doc.querySelector(s); const v = n && (n.getAttribute('content') || n.textContent); if (v && v.trim()) return v.trim().replace(/\s+/g, ' '); } return ''; };
      const out = { t: Date.now(), title: pick('meta[property="og:title"]', 'title').slice(0, 90), desc: pick('meta[property="og:description"]', 'meta[name="description"]').slice(0, 180) };
      meta[url] = out;
      const keys = Object.keys(meta);
      if (keys.length > 120) keys.sort((a, b) => meta[a].t - meta[b].t).slice(0, keys.length - 120).forEach(k => delete meta[k]);
      NT.save({ linkMeta: meta });
      return out;
    } catch (e) {
      meta[url] = { t: Date.now() - TTL + 864e5, title: '', desc: '' }; // retry tomorrow
      return null;
    } finally { clearTimeout(timeout); }
  }

  function hide() {
    clearTimeout(timer); token++;
    if (tip) { tip.remove(); tip = null; }
  }

  function show(site, tile) {
    hide();
    if (state.settings.linkPreview === false) return;
    const my = token;
    timer = setTimeout(async () => {
      const host = NT.hostOf(site.url).replace(/^www\./, '');
      const title = el('div', { class: 'lt-title', text: site.name });
      const desc = el('div', { class: 'lt-desc', text: site.note || '' });
      tip = el('div', { class: 'link-tip', role: 'tooltip' },
        el('img', { src: NT.favicon(NT.hostOf(site.url), 64), alt: '', class: 'lt-icon' }),
        el('div', { class: 'lt-main' }, title, el('div', { class: 'lt-host', text: host }), desc));
      document.body.append(tip);
      const r = tile.getBoundingClientRect(), w = 300;
      const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
      const above = r.bottom + tip.offsetHeight + 20 > window.innerHeight;
      tip.style.left = left + 'px';
      tip.style.top = above ? Math.max(8, r.top - tip.offsetHeight - 10) + 'px' : r.bottom + 10 + 'px';
      const m = await fetchMeta(site.url);
      if (my !== token || !tip) return;
      if (m && m.title) title.textContent = m.title;
      if (m && m.desc && !site.note) desc.textContent = m.desc;
      if (!desc.textContent) desc.hidden = true;
    }, 450);
  }

  NT.linkPreview = { show, hide, resetPermission: () => { allowed = null; } };

  NT.register(async () => {
    meta = (await NT.load(['linkMeta'])).linkMeta || {};
    window.addEventListener('scroll', hide, { passive: true });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') hide(); });
  });
})();
