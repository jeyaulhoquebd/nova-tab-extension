(() => {
  'use strict';
  const { el } = NT;
  let courses = [], body;
  const save = () => NT.save({ syllabus: courses });
  const stat = c => { const d = c.topics.filter(t => t.done).length; return { done: d, total: c.topics.length, pct: c.topics.length ? Math.round((d / c.topics.length) * 100) : 0 }; };

  function render() {
    body.textContent = '';
    if (!courses.length) { body.append(el('p', { class: 'empty', text: 'Add a course, list its chapters, and tick them off as you finish. See your progress at a glance.' })); return; }
    body.append(el('ul', { class: 'list' }, courses.map(c => {
      const s = stat(c);
      return el('li', { class: 'item syl-row', tabindex: '0', role: 'button', 'aria-label': `${c.name}, ${s.pct} percent complete`, onclick: () => manage(c.id), onkeydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); manage(c.id); } } },
        el('div', { class: 'item-main' }, el('div', { class: 'item-title', text: c.name }),
          el('div', { class: 'progress', style: 'margin:6px 0 2px' }, el('span', { style: `width:${s.pct}%` })),
          el('div', { class: 'item-sub', text: `${s.done}/${s.total} topics` })),
        el('span', { class: 'badge' + (s.pct === 100 ? ' ok' : ''), text: s.pct + '%' }));
    })));
  }

  function courseForm() {
    NT.formDialog({
      title: 'New course', fields: [{ name: 'name', label: 'Course / subject', required: true, maxlength: 40, placeholder: 'e.g. Engineering Mathematics' }],
      onSubmit: v => {
        if (!v.name) return 'Please enter a name.';
        const c = { id: NT.uid(), name: v.name, topics: [] };
        courses.push(c); save(); render(); setTimeout(() => manage(c.id), 50);
      }
    });
  }

  function manage(id) {
    const c = courses.find(x => x.id === id); if (!c) return;
    const root = el('div');
    function draw() {
      const s = stat(c);
      root.textContent = '';
      root.append(
        el('div', { class: 'result-box' }, el('div', {}, el('div', { class: 'muted small', text: c.name }), el('span', { class: 'muted small', text: `${s.done} of ${s.total} topics done` })), el('strong', { text: s.pct + '%' })),
        el('div', { class: 'btn-row', style: 'margin-bottom:14px' },
          el('button', { type: 'button', class: 'btn primary', text: '＋ Add topics', onclick: () => addTopics() }),
          el('button', { type: 'button', class: 'btn ghost', text: '✨ Suggest with AI', onclick: suggest }),
          el('button', { type: 'button', class: 'btn ghost', text: 'Rename', onclick: rename }),
          el('button', { type: 'button', class: 'btn danger', text: 'Delete course', onclick: () => { if (confirm(`Delete "${c.name}"?`)) { courses = courses.filter(x => x.id !== c.id); save(); render(); document.getElementById('bigDialog').close(); } } })),
        c.topics.length ? el('ul', { class: 'list' }, c.topics.map(t => el('li', { class: 'item' + (t.done ? ' done' : '') },
          el('input', { type: 'checkbox', checked: t.done, 'aria-label': t.title, onchange: ev => { t.done = ev.target.checked; save(); render(); draw(); } }),
          el('div', { class: 'item-main' }, el('div', { class: 'item-title', text: t.title })),
          el('button', { type: 'button', class: 'del', title: 'Delete', text: '✕', onclick: () => { c.topics = c.topics.filter(x => x.id !== t.id); save(); render(); draw(); } }))))
          : el('p', { class: 'empty', text: 'No topics yet. Add them one per line, or let AI suggest the main chapters.' }));
    }
    function addTopics(prefill) {
      NT.formDialog({
        title: 'Add topics', fields: [{ name: 'lines', label: 'One topic per line', type: 'textarea', rows: 8, value: prefill || '', placeholder: 'Chapter 1: Vectors\nChapter 2: Matrices' }],
        onSubmit: v => {
          const lines = v.lines.split('\n').map(x => x.trim()).filter(Boolean);
          if (!lines.length) return 'Enter at least one topic.';
          lines.forEach(t => c.topics.push({ id: NT.uid(), title: t.slice(0, 120), done: false }));
          save(); render(); draw();
        }
      });
    }
    function rename() {
      NT.formDialog({ title: 'Rename course', fields: [{ name: 'name', label: 'Name', value: c.name, required: true, maxlength: 40 }],
        onSubmit: v => { if (!v.name) return 'Please enter a name.'; c.name = v.name; save(); render(); draw(); } });
    }
    async function suggest() {
      if (!NT.ai.ensure()) return;
      NT.toast('Asking AI for chapters…');
      try {
        const reply = await NT.ai.ask(`List the main chapters/topics a student would study in the course "${c.name}". Return ONLY a JSON array of 8 to 15 short strings, no extra text.`, { temperature: 0.3 });
        const data = NT.ai.parseJson(reply);
        const list = (Array.isArray(data) ? data : data.topics || []).map(x => String(typeof x === 'string' ? x : x.title || '').trim()).filter(Boolean);
        if (!list.length) throw new Error('No topics were returned.');
        addTopics(list.join('\n'));
      } catch (e) { NT.toast(e.message); }
    }
    draw();
    NT.bigDialog('Syllabus', root);
  }

  NT.register(async () => {
    courses = (await NT.load(['syllabus'])).syllabus || [];
    const c = NT.card('Syllabus', { icon: '📖', actions: [el('button', { type: 'button', class: 'mini-btn', text: '＋ Course', onclick: courseForm })] });
    body = c.body;
    render();
  });
})();
