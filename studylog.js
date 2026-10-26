(() => {
  'use strict';
  const { el } = NT;
  let log = [];
  const save = () => NT.save({ studyLog: log.slice(-600) });
  const subjects = () => [...new Set(log.map(e => e.subject).filter(Boolean))];
  const parseTags = s => [...new Set((s || '').split(/[,#\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8);

  function detailsForm(e, fresh, after) {
    NT.formDialog({
      title: fresh ? 'Session complete 🎉' : 'Edit session',
      submitText: 'Save note',
      fields: [
        { name: 'subject', label: 'Subject', value: e.subject, placeholder: 'e.g. Physics', list: subjects() },
        { name: 'note', label: 'What did you work on?', type: 'textarea', rows: 3, value: e.note, placeholder: "e.g. Finished Newton's laws, solved 5 problems" },
        { name: 'tags', label: 'Tags (comma separated)', value: e.tags.join(', '), placeholder: 'e.g. revision, exam' }
      ],
      onSubmit: v => { e.subject = v.subject; e.note = v.note; e.tags = parseTags(v.tags); save(); if (after) after(); }
    });
  }

  function open() {
    const root = el('div'), listBox = el('div'), sumBox = el('div');
    let q = '';
    function draw() {
      const today = NT.todayStr(), from = NT.addDays(today, -6);
      const week = log.filter(e => e.date >= from);
      const by = {};
      week.forEach(e => { const k = e.subject || 'No subject'; by[k] = (by[k] || 0) + e.minutes; });
      const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6), max = rows.length ? rows[0][1] : 1;
      sumBox.textContent = '';
      sumBox.append(el('div', { class: 'result-box' }, el('div', {}, el('div', { class: 'muted small', text: 'Last 7 days' }), el('span', { class: 'muted small', text: `${week.length} sessions` })), el('strong', { text: `${(week.reduce((a, e) => a + e.minutes, 0) / 60).toFixed(1)}h` })));
      if (rows.length) sumBox.append(el('div', { class: 'sub-bars' }, rows.map(([k, v]) => el('div', { class: 'sub-bar' }, el('span', { class: 'sub-name', text: k }), el('div', { class: 'progress' }, el('span', { style: `width:${(v / max) * 100}%` })), el('span', { class: 'muted small', text: `${v}m` })))));

      const needle = q.trim().toLowerCase();
      const list = log.filter(e => !needle || [e.subject, e.note, e.tags.join(' ')].join(' ').toLowerCase().includes(needle)).slice().reverse().slice(0, 120);
      listBox.textContent = '';
      if (!list.length) { listBox.append(el('p', { class: 'empty', text: log.length ? 'No sessions match your search.' : 'Finish a focus session to start your study log.' })); return; }
      let lastDate = '';
      list.forEach(e => {
        if (e.date !== lastDate) { lastDate = e.date; listBox.append(el('h4', { class: 'log-date', text: NT.prettyDate(e.date) })); }
        listBox.append(el('div', { class: 'item' },
          el('div', { class: 'item-main' },
            el('div', { class: 'item-title', text: e.subject || 'Focus session' }),
            e.note ? el('div', { class: 'item-sub', text: e.note }) : null,
            e.tags.length ? el('div', { class: 'tags' }, e.tags.map(t => el('span', { class: 'chip sm', text: '#' + t }))) : null),
          el('span', { class: 'badge', text: `${e.minutes}m` }),
          el('button', { type: 'button', class: 'del', title: 'Edit', text: '✎', onclick: () => detailsForm(e, false, draw) }),
          el('button', { type: 'button', class: 'del', title: 'Delete', text: '✕', onclick: () => { log = log.filter(x => x.id !== e.id); save(); draw(); } })));
      });
    }
    root.append(sumBox, el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Search subject, note or tag' }), el('input', { type: 'text', placeholder: 'e.g. physics or #exam', oninput: ev => { q = ev.target.value; draw(); } })), listBox);
    draw();
    NT.bigDialog('Study log', root);
  }

  NT.studyLog = { open };

  NT.register(async () => {
    log = ((await NT.load(['studyLog'])).studyLog || []).map(e => ({ tags: [], subject: '', note: '', ...e }));
    NT.on('focus-complete', ({ minutes, endedAt, fresh }) => {
      const e = { id: NT.uid(), ts: endedAt, date: NT.todayStr(new Date(endedAt)), minutes, subject: '', note: '', tags: [] };
      log.push(e); save();
      if (fresh) detailsForm(e, true);
    });
    NT.on('focus-logged', entry => {
      log.push(entry);
      save();
    });
  });
})();
