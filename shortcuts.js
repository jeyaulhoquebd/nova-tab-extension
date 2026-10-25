(() => {
  'use strict';
  const { $, el, favicon, hostOf } = NT;
  const DEFAULT_SITES = [
    { id: 'd1', name: 'Gmail', url: 'https://mail.google.com', category: 'General' },
    { id: 'd2', name: 'YouTube', url: 'https://www.youtube.com', category: 'General' },
    { id: 'd3', name: 'GitHub', url: 'https://github.com', category: 'Dev' },
    { id: 'd4', name: 'Claude', url: 'https://claude.ai', category: 'AI' },
    { id: 'd5', name: 'ChatGPT', url: 'https://chatgpt.com', category: 'AI' }
  ];
  let sites = [];
  let dragId = null;
  const persist = () => NT.saveSync({ sites });

  function tile(s) {
    const fav = el('span', { class: 'fav' });
    const letter = () => { fav.textContent = (s.name[0] || '?').toUpperCase(); };
    const img = el('img', { alt: '', src: favicon(hostOf(s.url), 128) });
    img.addEventListener('error', letter);
    img.addEventListener('load', () => { if (img.naturalWidth <= 16) letter(); });
    fav.append(img);

    const a = el('a', { href: s.url, title: s.url, draggable: 'false' }, fav, el('span', { class: 'label', text: s.name }));
    const t = el('div', { class: 'tile', draggable: 'true' }, a, el('div', { class: 'tile-tools' },
      el('button', { type: 'button', class: 'tool', title: 'Edit', text: '✎', onclick: ev => { ev.preventDefault(); ev.stopPropagation(); form(s.id); } }),
      el('button', { type: 'button', class: 'tool', title: 'Remove', text: '✕', onclick: ev => { ev.preventDefault(); ev.stopPropagation(); sites = sites.filter(x => x.id !== s.id); persist(); render(); } })));

    t.addEventListener('mouseenter', () => NT.linkPreview && NT.linkPreview.show(s, t));
    t.addEventListener('mouseleave', () => NT.linkPreview && NT.linkPreview.hide());
    t.addEventListener('focusin', () => NT.linkPreview && NT.linkPreview.show(s, t));
    t.addEventListener('focusout', () => NT.linkPreview && NT.linkPreview.hide());
    t.addEventListener('dragstart', ev => { if (NT.linkPreview) NT.linkPreview.hide(); dragId = s.id; ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', s.id); } catch (e) {} t.classList.add('dragging'); });
    t.addEventListener('dragend', () => { dragId = null; t.classList.remove('dragging'); });
    t.addEventListener('dragover', ev => { if (dragId && dragId !== s.id) { ev.preventDefault(); t.classList.add('drop-target'); } });
    t.addEventListener('dragleave', () => t.classList.remove('drop-target'));
    t.addEventListener('drop', ev => { ev.preventDefault(); t.classList.remove('drop-target'); move(dragId, s.id); });
    return t;
  }

  function move(fromId, toId) {
    if (!fromId || fromId === toId) return;
    const from = sites.find(x => x.id === fromId), to = sites.find(x => x.id === toId);
    if (!from || !to) return;
    sites = sites.filter(x => x.id !== fromId);
    from.category = to.category || 'General';
    sites.splice(sites.findIndex(x => x.id === toId), 0, from);
    persist(); render();
  }

  function render() {
    const root = $('shortcuts');
    root.textContent = '';
    const groups = new Map();
    sites.forEach(s => { const c = s.category || 'General'; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(s); });
    if (!groups.size) groups.set('General', []);
    const multi = groups.size > 1;
    let lastGrid;
    groups.forEach((list, cat) => {
      const grid = el('div', { class: 'grid' }, list.map(tile));
      root.append(el('div', { class: 'group' }, multi ? el('h3', { class: 'group-title', text: cat }) : null, grid));
      lastGrid = grid;
    });
    lastGrid.append(el('div', { class: 'tile' }, el('button', { type: 'button', class: 'add', onclick: () => form(null) },
      el('span', { class: 'fav', text: '+' }), el('span', { class: 'label', text: 'Add site' }))));
  }

  function form(id) {
    const s = sites.find(x => x.id === id);
    const cats = [...new Set(sites.map(x => x.category || 'General'))];
    NT.formDialog({
      title: s ? 'Edit shortcut' : 'Add shortcut',
      fields: [
        { name: 'name', label: 'Name', value: s ? s.name : '', required: true, maxlength: 24, placeholder: 'e.g. GitHub' },
        { name: 'url', label: 'Link', value: s ? s.url : '', required: true, placeholder: 'e.g. github.com' },
        { name: 'category', label: 'Category (optional)', value: s ? (s.category || '') : '', placeholder: 'e.g. Study, AI, Dev', list: cats },
        { name: 'note', label: 'Note shown on hover (optional)', value: s ? (s.note || '') : '', maxlength: 140, placeholder: 'e.g. Physics class notes' }
      ],
      onSubmit: v => {
        const url = NT.normalizeUrl(v.url);
        if (!v.name || !url) return 'Please enter a name and a valid link (e.g. github.com).';
        const category = v.category || 'General';
        if (s) { s.name = v.name; s.url = url; s.category = category; s.note = v.note; } else sites.push({ id: NT.uid(), name: v.name, url, category, note: v.note });
        persist(); render();
      }
    });
  }

  NT.register(async () => {
    const r = await NT.loadSync(['sites']);
    if (Array.isArray(r.sites)) sites = r.sites; else { sites = DEFAULT_SITES.map(s => ({ ...s })); persist(); }
    render();
  });
})();
