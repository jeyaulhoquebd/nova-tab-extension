(() => {
  'use strict';
  const { $, el, state, DAYS, DAY_NAMES } = NT;
  let assignments = [], exams = [], routine = [], routineUi = {}, lastMinute = -1;

  /* ---------------- Class routine ---------------- */
  const saveRoutine = () => NT.save({ routine });

  function renderRoutine() {
    const now = NT.nowDhaka();
    lastMinute = now.minutes;
    routineUi.title.textContent = `📚 Today · ${DAY_NAMES[now.day]}`;
    const list = routine.filter(c => c.days.includes(now.day)).sort((a, b) => NT.toMin(a.start) - NT.toMin(b.start));
    routineUi.body.textContent = '';
    if (!list.length) {
      routineUi.body.append(el('p', { class: 'empty', text: routine.length ? 'No classes today 🎉' : 'No timetable yet. Press ＋ to add your first class.' }));
      return;
    }
    let nextDone = false;
    routineUi.body.append(el('ul', { class: 'list' }, list.map(c => {
      const s = NT.toMin(c.start), e = NT.toMin(c.end);
      let cls = 'item', badge = null;
      if (now.minutes >= e) cls += ' dim';
      else if (now.minutes >= s) { cls += ' now'; badge = el('span', { class: 'badge solid', text: 'NOW' }); }
      else if (!nextDone) { nextDone = true; badge = el('span', { class: 'badge warn', text: 'NEXT' }); }
      return el('li', { class: cls },
        el('div', { class: 'item-main' }, el('div', { class: 'item-title', text: c.subject }),
          el('div', { class: 'item-sub', text: `${NT.fmtMin(s)} – ${NT.fmtMin(e)}${c.room ? ' · ' + c.room : ''}` })), badge);
    })));
  }

  function classForm(done) {
    NT.formDialog({
      title: 'Add class',
      fields: [
        { name: 'subject', label: 'Subject', required: true, maxlength: 40, placeholder: 'e.g. Physics' },
        { name: 'room', label: 'Room / teacher (optional)', maxlength: 30, placeholder: 'e.g. Room 204' },
        { name: 'start', label: 'Starts', type: 'time', required: true, value: '09:00' },
        { name: 'end', label: 'Ends', type: 'time', required: true, value: '09:50' },
        { name: 'days', label: 'Days', type: 'days', value: [0, 1, 2, 3, 4] }
      ],
      onSubmit: v => {
        if (!v.subject) return 'Please enter the subject.';
        if (NT.toMin(v.start) == null || NT.toMin(v.end) == null || NT.toMin(v.end) <= NT.toMin(v.start)) return 'End time must be after the start time.';
        if (!v.days.length) return 'Pick at least one day.';
        routine.push({ id: NT.uid(), subject: v.subject, room: v.room, start: v.start, end: v.end, days: v.days });
        saveRoutine(); renderRoutine(); if (done) done();
      }
    });
  }

  function editRoutine() {
    const box = el('div');
    const draw = () => {
      box.textContent = '';
      box.append(el('div', { class: 'btn-row', style: 'margin-bottom:14px' }, el('button', { type: 'button', class: 'btn primary', text: '＋ Add class', onclick: () => classForm(draw) })));
      if (!routine.length) { box.append(el('p', { class: 'empty', text: 'Your weekly timetable is empty.' })); return; }
      const sorted = [...routine].sort((a, b) => NT.toMin(a.start) - NT.toMin(b.start));
      box.append(el('ul', { class: 'list' }, sorted.map(c => el('li', { class: 'item' },
        el('div', { class: 'item-main' }, el('div', { class: 'item-title', text: c.subject }),
          el('div', { class: 'item-sub', text: `${c.days.slice().sort().map(d => DAYS[d]).join(' ')} · ${NT.fmtMin(NT.toMin(c.start))} – ${NT.fmtMin(NT.toMin(c.end))}${c.room ? ' · ' + c.room : ''}` })),
        el('button', { type: 'button', class: 'del', title: 'Delete', text: '✕', onclick: () => { routine = routine.filter(x => x.id !== c.id); saveRoutine(); renderRoutine(); draw(); } })))));
    };
    draw();
    NT.bigDialog('Weekly class routine', box);
  }

  /* ---------------- Assignments ---------------- */
  const saveAssignments = () => NT.save({ assignments });
  function dueBadge(due, done) {
    if (!due) return null;
    const n = NT.daysUntil(due);
    let text, cls = '';
    if (done) { text = NT.prettyDate(due); }
    else if (n < 0) { text = `${-n}d overdue`; cls = 'bad'; }
    else if (n === 0) { text = 'Today'; cls = 'warn'; }
    else if (n === 1) { text = 'Tomorrow'; cls = 'warn'; }
    else { text = `${n} days`; cls = n <= 3 ? 'warn' : ''; }
    return el('span', { class: 'badge ' + cls, title: NT.prettyDate(due), text });
  }

  function assignmentRow(a) {
    return el('li', { class: 'item' + (a.done ? ' done' : '') },
      el('input', { type: 'checkbox', checked: a.done, onchange: ev => { a.done = ev.target.checked; saveAssignments(); renderAssignments(); } }),
      el('div', { class: 'item-main' }, el('div', { class: 'item-title', text: a.title })),
      dueBadge(a.due, a.done),
      el('button', { type: 'button', class: 'del', title: 'Delete', text: '✕', onclick: () => { assignments = assignments.filter(x => x.id !== a.id); saveAssignments(); renderAssignments(); } }));
  }

  let asUi = {};
  function renderAssignments() {
    const open = assignments.filter(a => !a.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const done = assignments.filter(a => a.done);
    asUi.list.textContent = '';
    if (!open.length) asUi.list.append(el('p', { class: 'empty', text: assignments.length ? 'All done — nice work! ✅' : 'No assignments yet. Add one above.' }));
    else asUi.list.append(el('ul', { class: 'list' }, open.map(assignmentRow)));
    if (done.length) asUi.list.append(el('details', { class: 'done-list' }, el('summary', { text: `Completed (${done.length})` }), el('ul', { class: 'list' }, done.map(assignmentRow))));
  }

  /* ---------------- Exams ---------------- */
  const saveExams = () => NT.save({ exams });
  const examTarget = x => Date.parse(`${x.date}T${x.time || '00:00'}:00+06:00`);
  let exUi = {};
  function renderExams() {
    exUi.list.textContent = '';
    const sorted = [...exams].sort((a, b) => examTarget(a) - examTarget(b));
    const upcoming = sorted.filter(x => examTarget(x) > Date.now() || x.date === NT.todayStr());
    const past = sorted.filter(x => !upcoming.includes(x));
    if (!sorted.length) { exUi.list.append(el('p', { class: 'empty', text: 'No exams added. Add one to start the countdown.' })); return; }
    const row = (x, isPast) => el('li', { class: 'item' + (isPast ? ' dim' : '') },
      el('div', { class: 'item-main' }, el('div', { class: 'item-title', text: x.name }),
        el('div', { class: 'item-sub', text: NT.prettyDate(x.date) + (x.time ? ' · ' + NT.fmtMin(NT.toMin(x.time)) : '') })),
      el('span', { class: 'badge count', 'data-id': x.id, text: '' }),
      el('button', { type: 'button', class: 'del', title: 'Delete', text: '✕', onclick: () => { exams = exams.filter(e => e.id !== x.id); saveExams(); renderExams(); } }));
    exUi.list.append(el('ul', { class: 'list' }, upcoming.map(x => row(x, false)), past.map(x => row(x, true))));
    tickExams();
  }
  function tickExams() {
    document.querySelectorAll('.badge.count').forEach(b => {
      const x = exams.find(e => e.id === b.dataset.id);
      if (!x) return;
      const ms = examTarget(x) - Date.now();
      if (ms > 0) { b.textContent = NT.fmtCountdown(ms); b.className = 'badge count' + (ms < 3 * 864e5 ? ' warn' : ''); }
      else if (x.date === NT.todayStr()) { b.textContent = 'Today!'; b.className = 'badge count bad'; }
      else { b.textContent = 'Passed'; b.className = 'badge count'; }
    });
  }

  /* ---------------- Init ---------------- */
  NT.register(async () => {
    const r = await NT.load(['assignments', 'exams', 'routine', 'notes']);
    assignments = r.assignments || []; exams = r.exams || []; routine = r.routine || [];

    // Class routine card
    routineUi.title = null;
    const rc = NT.card('Today', { actions: [
      el('button', { type: 'button', class: 'mini-btn', text: '＋', title: 'Add class', onclick: () => classForm() }),
      el('button', { type: 'button', class: 'mini-btn', text: 'Edit', onclick: editRoutine })] });
    routineUi.title = rc.head.querySelector('h3'); routineUi.body = rc.body;
    renderRoutine();

    // Assignments card
    const aTitle = el('input', { type: 'text', placeholder: 'New assignment…', maxlength: 80 });
    const aDue = el('input', { type: 'date', title: 'Due date' });
    asUi.list = el('div');
    const ac = NT.card('Assignments', { icon: '📝' });
    ac.body.append(el('form', { class: 'inline-form', onsubmit: ev => {
      ev.preventDefault();
      const t = aTitle.value.trim(); if (!t) return;
      assignments.push({ id: NT.uid(), title: t, due: aDue.value || '', done: false });
      aTitle.value = ''; aDue.value = ''; saveAssignments(); renderAssignments();
    } }, aTitle, aDue, el('button', { type: 'submit', class: 'mini-btn', text: 'Add' })), asUi.list);
    renderAssignments();

    // Exams card
    exUi.list = el('div');
    const ec = NT.card('Exam Countdown', { icon: '🎯', actions: [
      el('button', { type: 'button', class: 'mini-btn', text: '＋ Add', onclick: () => NT.formDialog({
        title: 'Add exam',
        fields: [
          { name: 'name', label: 'Exam', required: true, maxlength: 40, placeholder: 'e.g. Mathematics' },
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'time', label: 'Time (optional)', type: 'time' }
        ],
        onSubmit: v => {
          if (!v.name || !v.date) return 'Please enter the exam name and date.';
          exams.push({ id: NT.uid(), name: v.name, date: v.date, time: v.time || '' });
          saveExams(); renderExams();
        } }) })] });
    ec.body.append(exUi.list);
    renderExams();

    // Notes card
    const ta = el('textarea', { placeholder: 'Write anything here — it saves automatically.' });
    ta.value = r.notes || '';
    const status = el('span', { class: 'muted small', text: '' });
    let timer;
    ta.addEventListener('input', () => {
      status.textContent = 'Saving…';
      clearTimeout(timer);
      timer = setTimeout(() => { NT.save({ notes: ta.value }).then(() => { status.textContent = 'Saved ✓'; }); }, 400);
    });
    const nc = NT.card('Quick Notes', { icon: '🗒️', actions: [status] });
    nc.body.append(ta);

    NT.on('tick', () => {
      tickExams();
      if (NT.nowDhaka().minutes !== lastMinute) renderRoutine();
    });
    NT.on('settings', () => { renderRoutine(); renderExams(); });
  });
})();
