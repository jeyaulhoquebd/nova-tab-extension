(() => {
  'use strict';
  const { el } = NT;

  /* ---------- pack / unpack (gzip + base64) ---------- */
  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
  async function pack(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream !== 'undefined') {
      const out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
      return 'NOVA1:' + b64(out);
    }
    return 'NOVA0:' + b64(bytes);
  }
  async function unpack(text) {
    const s = (text || '').trim().replace(/\s+/g, ''), tag = s.slice(0, 6);
    if (tag !== 'NOVA1:' && tag !== 'NOVA0:') throw new Error('This is not a Nova Tab share code.');
    let bytes = unb64(s.slice(6));
    if (tag === 'NOVA1:') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  NT.pack = pack; NT.unpack = unpack;

  /* ---------- share with friends ---------- */
  const ITEMS = [
    { key: 'routine', label: 'Class routine', sig: x => [x.subject, x.start, x.end, (x.days || []).join()].join('|') },
    { key: 'exams', label: 'Exams', sig: x => [x.name, x.date].join('|') },
    { key: 'assignments', label: 'Assignments', sig: x => [x.title, x.due].join('|') },
    { key: 'syllabus', label: 'Syllabus', sig: x => x.name },
    { key: 'cards', label: 'Flashcards', sig: x => x.front },
    { key: 'prompts', label: 'Prompts', sig: x => x.title },
    { key: 'widgets', label: 'Widgets', sig: x => x.name }
  ];

  function reidentify(key, item) {
    const x = JSON.parse(JSON.stringify(item));
    x.id = NT.uid();
    if (key === 'assignments') x.done = false;
    if (key === 'syllabus') x.topics = (x.topics || []).map(t => ({ ...t, id: NT.uid(), done: false }));
    if (key === 'cards') Object.assign(x, { ease: 2.5, interval: 0, reps: 0, due: 0 });
    return x;
  }

  function openShare() {
    const root = el('div');
    const checks = {};
    const out = el('textarea', { class: 'code-box', rows: 5, readonly: true, placeholder: 'Your share code will appear here…', 'aria-label': 'Share code' });
    const info = el('p', { class: 'empty small', text: '' });
    const imp = el('textarea', { class: 'code-box', rows: 4, placeholder: 'Paste a share code from a friend here…', 'aria-label': 'Paste share code' });
    const impInfo = el('p', { class: 'empty small', text: '' });
    let parsed = null;

    root.append(
      el('p', { class: 'empty', text: 'Send a share code to classmates over chat or email. They paste it here and your items are added to theirs. Nothing goes through any server.' }),
      el('h4', { class: 'muted small', style: 'margin:8px 0', text: 'SHARE' }),
      el('div', { class: 'checks' }, ITEMS.map(it => el('label', { class: 'chk' }, checks[it.key] = el('input', { type: 'checkbox', checked: it.key === 'routine' || it.key === 'exams' }), el('span', { text: it.label })))),
      el('div', { class: 'btn-row', style: 'margin:12px 0' },
        el('button', { type: 'button', class: 'btn primary', text: 'Create share code', onclick: async () => {
          const keys = ITEMS.filter(it => checks[it.key].checked).map(it => it.key);
          if (!keys.length) { NT.toast('Choose at least one thing to share.'); return; }
          const got = await NT.load(keys), data = {};
          keys.forEach(k => { if (Array.isArray(got[k]) && got[k].length) data[k] = got[k]; });
          if (!Object.keys(data).length) { NT.toast('Nothing to share yet — those lists are empty.'); return; }
          out.value = await pack({ app: 'nova-share', v: 1, data });
          info.textContent = `${Object.keys(data).map(k => `${data[k].length} ${ITEMS.find(i => i.key === k).label.toLowerCase()}`).join(', ')} · ${(out.value.length / 1024).toFixed(1)} KB`;
        } }),
        el('button', { type: 'button', class: 'btn ghost', text: 'Copy', onclick: async () => { if (!out.value) return; try { await navigator.clipboard.writeText(out.value); NT.toast('Share code copied'); } catch (e) { out.select(); } } })),
      out, info,
      el('h4', { class: 'muted small', style: 'margin:18px 0 8px', text: 'IMPORT' }), imp, impInfo,
      el('div', { class: 'btn-row', style: 'margin-top:8px' },
        el('button', { type: 'button', class: 'btn ghost', text: 'Preview', onclick: async () => {
          try {
            const d = await unpack(imp.value);
            if (d.app !== 'nova-share' || !d.data) throw new Error('This is not a Nova Tab share code.');
            parsed = d.data;
            impInfo.textContent = 'Contains: ' + Object.keys(parsed).filter(k => ITEMS.some(i => i.key === k)).map(k => `${parsed[k].length} ${ITEMS.find(i => i.key === k).label.toLowerCase()}`).join(', ');
          } catch (e) { parsed = null; impInfo.textContent = e.message; }
        } }),
        el('button', { type: 'button', class: 'btn primary', text: 'Add to my Nova Tab', onclick: async () => {
          if (!parsed) { NT.toast('Press Preview first.'); return; }
          const keys = Object.keys(parsed).filter(k => ITEMS.some(i => i.key === k) && Array.isArray(parsed[k]));
          const mine = await NT.load(keys), save = {};
          let added = 0;
          keys.forEach(k => {
            const it = ITEMS.find(i => i.key === k), cur = Array.isArray(mine[k]) ? mine[k] : [];
            const seen = new Set(cur.map(it.sig));
            const fresh = parsed[k].filter(x => x && !seen.has(it.sig(x))).map(x => reidentify(k, x));
            if (fresh.length) { save[k] = [...cur, ...fresh]; added += fresh.length; }
          });
          if (!added) { NT.toast('You already have all of these.'); return; }
          await NT.save(save);
          NT.toast(`Added ${added} item${added === 1 ? '' : 's'} ✓ Reloading…`);
          setTimeout(() => location.reload(), 900);
        } })));
    NT.bigDialog('Share with friends', root);
  }

  /* ---------- Chrome Sync backup (other devices signed in to Chrome) ---------- */
  const SYNC_KEYS = ['assignments', 'exams', 'routine', 'syllabus', 'prompts', 'worldClocks', 'semesters', 'cards', 'cardStats', 'studyLog', 'widgets', 'notes', 'settings', 'stats'];
  const CHUNK = 7000;
  const syncGet = keys => new Promise(r => chrome.storage.sync.get(keys, v => r(v || {})));
  const syncSet = obj => new Promise((res, rej) => chrome.storage.sync.set(obj, () => (chrome.runtime.lastError ? rej(new Error(chrome.runtime.lastError.message)) : res())));
  const syncRemove = keys => new Promise(r => chrome.storage.sync.remove(keys, () => r()));

  async function backupToSync() {
    const all = await NT.load(SYNC_KEYS);
    const attempts = [[], ['studyLog'], ['studyLog', 'cards', 'cardStats']];
    for (const drop of attempts) {
      const data = {};
      SYNC_KEYS.forEach(k => { if (all[k] !== undefined && !drop.includes(k)) data[k] = all[k]; });
      const text = await pack({ app: 'nova-sync', v: 1, data });
      if (text.length > 88000) continue;
      const parts = []; for (let i = 0; i < text.length; i += CHUNK) parts.push(text.slice(i, i + CHUNK));
      const old = await syncGet('nbk_meta');
      const stale = []; for (let i = parts.length; i < ((old.nbk_meta && old.nbk_meta.n) || 0); i++) stale.push('nbk_' + i);
      const obj = { nbk_meta: { n: parts.length, t: Date.now(), bytes: text.length, dropped: drop } };
      parts.forEach((p, i) => { obj['nbk_' + i] = p; });
      await syncSet(obj);
      if (stale.length) await syncRemove(stale);
      return { bytes: text.length, dropped: drop };
    }
    throw new Error('Your data is too large for Chrome Sync. Use Export backup in Settings instead.');
  }

  async function restoreFromSync() {
    const { nbk_meta: meta } = await syncGet('nbk_meta');
    if (!meta) throw new Error('No backup found in Chrome Sync for this Google account.');
    const keys = Array.from({ length: meta.n }, (_, i) => 'nbk_' + i);
    const got = await syncGet(keys);
    const text = keys.map(k => got[k] || '').join('');
    const d = await unpack(text);
    if (d.app !== 'nova-sync' || !d.data) throw new Error('The backup is damaged.');
    await NT.save(d.data);
  }

  function openSync() {
    const root = el('div'), status = el('p', { class: 'empty', text: 'Checking…' });
    const refresh = async () => {
      try {
        const { nbk_meta: m } = await syncGet('nbk_meta');
        status.textContent = m ? `Last backup: ${new Date(m.t).toLocaleString()} · ${(m.bytes / 1024).toFixed(1)} KB${m.dropped && m.dropped.length ? ' (without ' + m.dropped.join(', ') + ')' : ''}` : 'No backup yet.';
      } catch (e) { status.textContent = 'Chrome Sync is not available in this browser.'; }
    };
    root.append(
      el('p', { class: 'empty', text: 'Your saved sites, theme and search engine already sync through Chrome. Use this to also copy your study data (assignments, exams, routine, syllabus, flashcards, notes) to your other computers signed in to the same Google account.' }),
      status,
      el('div', { class: 'btn-row' },
        el('button', { type: 'button', class: 'btn primary', text: '⬆ Back up now', onclick: async () => {
          try { const r = await backupToSync(); NT.toast(`Backed up ✓ (${(r.bytes / 1024).toFixed(1)} KB)`); refresh(); } catch (e) { NT.toast(e.message); }
        } }),
        el('button', { type: 'button', class: 'btn ghost', text: '⬇ Restore on this device', onclick: async () => {
          if (!confirm('Replace the study data on this device with the Chrome Sync backup?')) return;
          try { await restoreFromSync(); NT.toast('Restored ✓ Reloading…'); setTimeout(() => location.reload(), 900); } catch (e) { NT.toast(e.message); }
        } })),
      el('p', { class: 'empty small', text: 'Your Groq API key is never included.' }));
    refresh();
    NT.bigDialog('Chrome Sync', root);
  }

  NT.share = { openShare, openSync };
})();
