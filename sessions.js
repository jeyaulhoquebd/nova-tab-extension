(() => {
  'use strict';
  const { $, el } = NT;
  let sessions = [];
  const persist = () => NT.save({ sessions });

  async function saveCurrent(name, closeAfter) {
    let granted = false;
    try { granted = await chrome.permissions.request({ permissions: ['tabs'] }); } catch (e) {}
    if (!granted) { NT.toast('Permission needed to read your open tabs.'); return false; }
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const usable = tabs.filter(t => /^https?:/i.test(t.url || ''));
    if (!usable.length) { NT.toast('No regular web pages open in this window.'); return false; }
    sessions.unshift({ id: NT.uid(), name: name || `Session ${sessions.length + 1}`, date: NT.todayStr(), tabs: usable.map(t => ({ title: t.title || t.url, url: t.url })) });
    persist();
    if (closeAfter) chrome.tabs.remove(usable.map(t => t.id));
    return true;
  }

  function open() {
    const root = el('div'), listBox = el('div');
    const name = el('input', { type: 'text', placeholder: 'Session name, e.g. Physics study', maxlength: 40 });
    const close = el('input', { type: 'checkbox' });

    function draw() {
      listBox.textContent = '';
      if (!sessions.length) { listBox.append(el('p', { class: 'empty', text: 'No saved sessions yet.' })); return; }
      sessions.forEach(s => listBox.append(el('div', { class: 'session' },
        el('div', { class: 'item-main' }, el('div', { class: 'item-title', text: s.name }),
          el('div', { class: 'item-sub', text: `${s.tabs.length} tabs · ${NT.prettyDate(s.date)} · ${s.tabs.slice(0, 2).map(t => t.title).join(', ')}${s.tabs.length > 2 ? '…' : ''}` })),
        el('button', { type: 'button', class: 'mini-btn', text: 'Open all', onclick: () => {
          s.tabs.forEach((t, i) => { if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url: t.url, active: i === 0 }); else window.open(t.url, '_blank'); });
        } }),
        el('button', { type: 'button', class: 'del', text: '✕', title: 'Delete', onclick: () => { sessions = sessions.filter(x => x.id !== s.id); persist(); draw(); } }))));
    }

    root.append(
      el('p', { class: 'empty', text: 'Save all tabs in this window as a named group and reopen them in one click.' }),
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Name' }), name),
      el('label', { class: 'set-row' }, el('span', { text: 'Close the tabs after saving' }), close),
      el('div', { class: 'btn-row', style: 'margin-bottom:18px' }, el('button', { type: 'button', class: 'btn primary', text: '💾 Save current tabs', onclick: async () => {
        const ok = await saveCurrent(name.value.trim(), close.checked);
        if (ok) { name.value = ''; draw(); NT.toast('Session saved'); }
      } })),
      listBox);
    draw();
    NT.bigDialog('Tab Sessions', root);
  }

  NT.register(async () => {
    sessions = (await NT.load(['sessions'])).sessions || [];
    $('btnSessions').addEventListener('click', open);
  });
})();
