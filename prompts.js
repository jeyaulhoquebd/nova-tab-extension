(() => {
  'use strict';
  const { $, el } = NT;
  const DEFAULT_PROMPTS = [
    { id: 'p1', title: 'Explain simply', text: 'Explain this in simple words with an everyday example: ' },
    { id: 'p2', title: 'Summarize', text: 'Summarize the following in 5 short bullet points: ' },
    { id: 'p3', title: 'Fix my code', text: 'Find the bug in this code, fix it, and explain what was wrong: ' },
    { id: 'p4', title: 'Study plan', text: 'Make a 7-day study plan for this topic with about 2 hours of tasks per day: ' },
    { id: 'p5', title: 'Quiz me', text: 'Ask me 5 multiple-choice questions on this topic, one at a time, and tell me my score at the end: ' },
    { id: 'p6', title: 'Translate to Bengali', text: 'Translate this into natural Bengali: ' }
  ];
  let prompts = [];
  const panel = () => $('promptPanel');
  const persist = () => NT.save({ prompts });

  function render() {
    const p = panel();
    p.textContent = '';
    prompts.forEach(pr => {
      p.append(el('div', { class: 'prompt-item', onclick: () => use(pr) },
        el('div', { class: 'prompt-main' }, el('div', { class: 'prompt-title', text: pr.title }), el('div', { class: 'prompt-text', text: pr.text })),
        el('div', { class: 'prompt-tools' },
          el('button', { type: 'button', class: 'tool', title: 'Edit', text: '✎', onclick: ev => { ev.stopPropagation(); form(pr); } }),
          el('button', { type: 'button', class: 'tool', title: 'Delete', text: '✕', onclick: ev => { ev.stopPropagation(); prompts = prompts.filter(x => x.id !== pr.id); persist(); render(); } }))));
    });
    p.append(el('button', { type: 'button', class: 'panel-add', text: '＋ New prompt', onclick: () => form(null) }));
  }

  function use(pr) {
    const q = $('q');
    q.value = pr.text;
    panel().hidden = true;
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
  }

  function form(pr) {
    NT.formDialog({
      title: pr ? 'Edit prompt' : 'New prompt',
      fields: [
        { name: 'title', label: 'Title', value: pr ? pr.title : '', required: true, maxlength: 30, placeholder: 'e.g. Explain simply' },
        { name: 'text', label: 'Prompt text (you add your question after it)', type: 'textarea', value: pr ? pr.text : '', placeholder: 'e.g. Explain this like I am 12: ' }
      ],
      onSubmit: v => {
        if (!v.title || !v.text) return 'Please fill in both fields.';
        if (pr) { pr.title = v.title; pr.text = v.text + ' '; } else prompts.push({ id: NT.uid(), title: v.title, text: v.text + ' ' });
        persist(); render();
      }
    });
  }

  NT.register(async () => {
    const r = await NT.load(['prompts']);
    if (Array.isArray(r.prompts)) prompts = r.prompts; else { prompts = DEFAULT_PROMPTS.map(p => ({ ...p })); persist(); }
    render();
    $('promptBtn').addEventListener('click', () => { if (NT.suggest) NT.suggest.hide(); panel().hidden = !panel().hidden; });
    document.addEventListener('click', ev => { if (!panel().hidden && !ev.target.closest('.search-wrap') && !ev.target.closest('dialog')) panel().hidden = true; });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') panel().hidden = true; });
  });
})();
