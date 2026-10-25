(() => {
  'use strict';
  const { $, el, state } = NT;
  let widgets = [], addCard = null;
  const rendered = [];                 // {w, root, iframe}
  const frames = new Map();            // contentWindow -> {w, iframe}
  const save = () => NT.save({ widgets });

  const TEMPLATES = [
    { name: 'Hello', code: '<h3 style="margin:0 0 6px">Hello, student! 👋</h3>\n<p style="margin:0;color:var(--muted)">Edit this widget to build your own.</p>' },
    { name: 'Counter', code: `<div style="text-align:center">
  <div id="n" style="font-size:42px;font-weight:700">0</div>
  <button id="plus">+1</button>
  <button id="reset" style="background:rgba(127,127,127,.35)">Reset</button>
</div>
<script>
(async function () {
  var n = (await Nova.storage.get('n')) || 0;
  var out = document.getElementById('n'); out.textContent = n;
  document.getElementById('plus').onclick = function () { n++; out.textContent = n; Nova.storage.set('n', n); };
  document.getElementById('reset').onclick = function () { n = 0; out.textContent = 0; Nova.storage.set('n', 0); };
})();
</script>` },
    { name: 'Daily motivation', code: `<div id="q" style="font-size:16px;line-height:1.5"></div>
<script>
var quotes = [
  'Small steps every day beat big plans someday.',
  'Focus on progress, not perfection.',
  'Your future self is watching — make them proud.',
  'Hard topics become easy when you start them.',
  'Study now, relax later, smile always.',
  'One more problem solved is one more fear gone.',
  'Consistency is the real talent.'
];
var day = Math.floor(Date.now() / 86400000);
document.getElementById('q').textContent = '“' + quotes[day % quotes.length] + '”';
</script>` },
    { name: 'Mini to-do', code: `<form id="f" style="display:flex;gap:6px;margin-bottom:8px">
  <input id="t" placeholder="Add a task…" style="flex:1;min-width:0"><button>Add</button>
</form>
<ul id="l" style="list-style:none;margin:0;padding:0"></ul>
<script>
(async function () {
  var items = (await Nova.storage.get('items')) || [];
  var list = document.getElementById('l');
  function draw() {
    list.textContent = '';
    items.forEach(function (it, i) {
      var li = document.createElement('li'); li.style.cssText = 'display:flex;gap:8px;padding:4px 0;align-items:center';
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = it.done;
      cb.onchange = function () { it.done = cb.checked; Nova.storage.set('items', items); draw(); };
      var s = document.createElement('span'); s.textContent = it.text; s.style.flex = '1'; if (it.done) s.style.textDecoration = 'line-through';
      var x = document.createElement('button'); x.textContent = '✕'; x.style.padding = '2px 8px';
      x.onclick = function () { items.splice(i, 1); Nova.storage.set('items', items); draw(); };
      li.append(cb, s, x); list.append(li);
    });
  }
  document.getElementById('f').onsubmit = function (e) {
    e.preventDefault(); var t = document.getElementById('t'); if (!t.value.trim()) return;
    items.push({ text: t.value.trim(), done: false }); t.value = ''; Nova.storage.set('items', items); draw();
  };
  draw();
})();
</script>` }
  ];

  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const ctx = () => ({ timezone: NT.tz(), hour12: !!state.settings.hour12, mode: document.documentElement.dataset.mode || 'dark',
    text: css('--text'), muted: css('--muted'), accent: css('--accent'), accent2: css('--accent2'), field: css('--field'), border: css('--border') });

  async function readStore(id) { const k = 'wstore:' + id; return { k, data: (await NT.load([k]))[k] || {} }; }

  window.addEventListener('message', async ev => {
    const rec = frames.get(ev.source);
    if (!rec) return;
    const m = ev.data || {}, { w, iframe } = rec;
    if (m.type === 'ready') { ev.source.postMessage({ type: 'init', html: w.code, ctx: ctx() }, '*'); return; }
    if (m.type === 'height') { const h = Math.max(60, Math.min(640, Math.round(m.value) || 0)); if (h) iframe.style.height = h + 'px'; return; }
    if (m.type === 'storage-get' || m.type === 'storage-set' || m.type === 'storage-remove') {
      const { k, data } = await readStore(w.id);
      let value = null;
      if (m.type === 'storage-get') value = data[m.key] === undefined ? null : data[m.key];
      else {
        if (m.type === 'storage-set') data[m.key] = m.value; else delete data[m.key];
        if (JSON.stringify(data).length <= 200000) await NT.save({ [k]: data }); else value = 'too-large';
      }
      ev.source.postMessage({ rid: m.rid, value }, '*');
    }
  });

  function renderAll() {
    rendered.forEach(r => { frames.delete(r.iframe.contentWindow); r.root.remove(); });
    rendered.length = 0;
    widgets.filter(w => w.enabled !== false).forEach(w => {
      const c = NT.card(w.name, { icon: '🧩', cls: 'widget-card', actions: [el('button', { type: 'button', class: 'mini-btn', text: 'Edit', onclick: () => editor(w) })] });
      const iframe = el('iframe', { class: 'widget-frame', title: w.name, sandbox: 'allow-scripts allow-forms allow-popups', src: 'widget-sandbox.html', style: `height:${w.h || 160}px` });
      c.body.append(iframe);
      $('dashboard').insertBefore(c.root, addCard);
      frames.set(iframe.contentWindow, { w, iframe });
      rendered.push({ w, root: c.root, iframe });
    });
  }

  function editor(w) {
    const isNew = !w.id;
    NT.formDialog({
      title: isNew ? 'New widget' : 'Edit widget',
      fields: [
        { name: 'name', label: 'Name', value: w.name || '', required: true, maxlength: 30 },
        { name: 'h', label: 'Starting height (px)', type: 'number', min: 60, max: 640, value: String(w.h || 160) },
        { name: 'code', label: 'HTML / CSS / JavaScript', type: 'textarea', rows: 12, value: w.code || '' }
      ],
      onSubmit: v => {
        if (!v.name || !v.code) return 'Please enter a name and some code.';
        const h = Math.max(60, Math.min(640, parseInt(v.h, 10) || 160));
        if (isNew) widgets.push({ id: NT.uid(), name: v.name, code: v.code, h, enabled: true });
        else Object.assign(w, { name: v.name, code: v.code, h });
        save(); renderAll(); if (manager) manager();
      }
    });
  }

  let manager = null;
  function openManager() {
    const root = el('div');
    function draw() {
      root.textContent = '';
      root.append(
        el('p', { class: 'empty', text: 'Widgets are small pages (HTML, CSS and JavaScript) that live in a safe sandbox on your dashboard. They cannot touch the rest of Nova Tab. Only add code you trust.' }),
        el('h4', { class: 'muted small', style: 'margin:10px 0', text: 'START FROM A TEMPLATE' }),
        el('div', { class: 'ai-chips' }, TEMPLATES.map(t => el('button', { type: 'button', class: 'chip', text: t.name, onclick: () => editor({ name: t.name, code: t.code }) })),
          el('button', { type: 'button', class: 'chip', text: '＋ Blank', onclick: () => editor({ name: '', code: '' }) })),
        el('h4', { class: 'muted small', style: 'margin:18px 0 10px', text: 'YOUR WIDGETS' }),
        widgets.length ? el('ul', { class: 'list' }, widgets.map(w => el('li', { class: 'item' },
          el('input', { type: 'checkbox', checked: w.enabled !== false, 'aria-label': `Show ${w.name}`, onchange: ev => { w.enabled = ev.target.checked; save(); renderAll(); } }),
          el('div', { class: 'item-main' }, el('div', { class: 'item-title', text: w.name })),
          el('button', { type: 'button', class: 'del', title: 'Edit', text: '✎', onclick: () => editor(w) }),
          el('button', { type: 'button', class: 'del', title: 'Delete', text: '✕', onclick: () => { if (!confirm(`Delete "${w.name}"?`)) return; widgets = widgets.filter(x => x.id !== w.id); save(); renderAll(); draw(); } }))))
          : el('p', { class: 'empty', text: 'No widgets yet.' }),
        el('h4', { class: 'muted small', style: 'margin:18px 0 8px', text: 'DEVELOPER API' }),
        el('pre', { class: 'api-doc' }, el('code', { text:
`await Nova.storage.get(key)      // saved value or null
await Nova.storage.set(key, val) // any JSON value
await Nova.storage.remove(key)
Nova.setHeight(px)               // resize (auto by default)
Nova.context                     // {timezone, hour12, mode, accent…}
CSS vars: --text --muted --accent --accent2 --field --border
Network: fetch() to APIs that allow CORS works.` })));
    }
    manager = draw;
    draw();
    NT.bigDialog('Widgets', root, () => { manager = null; });
  }

  NT.widgets = { open: openManager };

  NT.register(async () => {
    widgets = (await NT.load(['widgets'])).widgets || [];
    addCard = el('article', { class: 'card add-card' }, el('button', { type: 'button', class: 'add-widget', onclick: openManager }, el('span', { class: 'fav', text: '+' }), el('span', { text: 'Add a widget' }), el('small', { class: 'muted', text: 'Build your own mini app' })));
    $('dashboard').append(addCard);
    renderAll();
  });
})();
