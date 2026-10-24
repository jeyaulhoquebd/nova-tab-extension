(() => {
  'use strict';
  const { el } = NT;
  NT.register(async () => {
    const r = await NT.load(['notes']);
    const ta = el('textarea', { placeholder: 'Write anything here — it saves automatically.' });
    ta.value = r.notes || '';
    const status = el('span', { class: 'muted small', text: '' });
    let timer;
    ta.addEventListener('input', () => {
      status.textContent = 'Saving…';
      clearTimeout(timer);
      timer = setTimeout(() => { NT.save({ notes: ta.value }).then(() => { status.textContent = 'Saved ✓'; }); }, 400);
    });
    const c = NT.card('Quick Notes', { icon: '🗒️', actions: [status] });
    c.body.append(ta);
  });
})();
