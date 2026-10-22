(() => {
  'use strict';
  const { $, el } = NT;
  // Common Bangladesh 4.00 scale (BTEB / most universities). Check against your institute's scale.
  const GRADES = [
    ['A+', 4.0, '80–100'], ['A', 3.75, '75–79'], ['A−', 3.5, '70–74'], ['B+', 3.25, '65–69'], ['B', 3.0, '60–64'],
    ['B−', 2.75, '55–59'], ['C+', 2.5, '50–54'], ['C', 2.25, '45–49'], ['D', 2.0, '40–44'], ['F', 0, 'below 40']
  ];
  let semesters = [];
  const persist = () => NT.save({ semesters });
  const round2 = n => (Math.round(n * 100) / 100).toFixed(2);

  function cgpaOf(list) {
    let pts = 0, w = 0;
    list.forEach(s => { const c = s.credits > 0 ? s.credits : 1; pts += s.gpa * c; w += c; });
    return w ? pts / w : 0;
  }

  function open() {
    let rows = Array.from({ length: 6 }, () => ({ name: '', credit: '', grade: '4' }));
    const root = el('div');
    const calcBox = el('div'), savedBox = el('div');
    const gpaOut = el('strong', { text: '0.00' }), credOut = el('span', { class: 'muted small', text: '' });
    const semNo = el('input', { type: 'number', min: '1', max: '12', value: String(semesters.length + 1), style: 'width:80px;padding:9px;border-radius:12px;border:1px solid var(--border);background:var(--field);color:var(--text)' });

    function calc() {
      let pts = 0, cr = 0;
      rows.forEach(r => { const c = parseFloat(r.credit); if (c > 0) { pts += c * parseFloat(r.grade); cr += c; } });
      gpaOut.textContent = cr ? round2(pts / cr) : '0.00';
      credOut.textContent = cr ? `${cr} credits` : 'Enter credits to calculate';
      return { gpa: cr ? pts / cr : 0, credits: cr };
    }

    function drawCalc() {
      calcBox.textContent = '';
      const tbody = el('tbody', {}, rows.map((r, i) => el('tr', {},
        el('td', {}, el('input', { type: 'text', placeholder: `Subject ${i + 1}`, value: r.name, oninput: ev => { r.name = ev.target.value; } })),
        el('td', { style: 'width:80px' }, el('input', { type: 'number', min: '0', step: '0.5', placeholder: 'Credit', value: r.credit, oninput: ev => { r.credit = ev.target.value; calc(); } })),
        el('td', { style: 'width:110px' }, el('select', { onchange: ev => { r.grade = ev.target.value; calc(); } },
          GRADES.map(g => el('option', { value: String(g[1]), selected: String(g[1]) === r.grade }, `${g[0]} (${g[1].toFixed(2)})`)))),
        el('td', { style: 'width:28px' }, el('button', { type: 'button', class: 'del', text: '✕', onclick: () => { rows.splice(i, 1); drawCalc(); } })))));
      calcBox.append(
        el('table', { class: 'gpa-table' }, el('thead', {}, el('tr', {}, el('th', { text: 'Subject' }), el('th', { text: 'Credit' }), el('th', { text: 'Grade' }), el('th'))), tbody),
        el('div', { class: 'btn-row', style: 'margin-top:10px' }, el('button', { type: 'button', class: 'mini-btn', text: '＋ Add subject', onclick: () => { rows.push({ name: '', credit: '', grade: '4' }); drawCalc(); } })),
        el('div', { class: 'result-box' }, el('div', {}, el('div', { class: 'muted small', text: 'Semester GPA' }), credOut), gpaOut),
        el('div', { class: 'btn-row', style: 'align-items:center' }, el('span', { class: 'muted small', text: 'Save as semester' }), semNo,
          el('button', { type: 'button', class: 'btn primary', text: 'Save semester', onclick: () => {
            const r = calc();
            if (!r.credits) { NT.toast('Enter at least one subject with credits.'); return; }
            const n = parseInt(semNo.value, 10) || semesters.length + 1;
            semesters = semesters.filter(s => s.sem !== n);
            semesters.push({ sem: n, gpa: Math.round(r.gpa * 100) / 100, credits: r.credits });
            semesters.sort((a, b) => a.sem - b.sem);
            persist(); drawSaved(); semNo.value = String(n + 1);
            NT.toast(`Semester ${n} saved — GPA ${round2(r.gpa)}`);
          } })));
      calc();
    }

    function addPast() {
      NT.formDialog({
        title: 'Add a past semester',
        fields: [
          { name: 'sem', label: 'Semester number', type: 'number', min: 1, max: 12, required: true, value: String(semesters.length + 1) },
          { name: 'gpa', label: 'GPA (0 – 4.00)', type: 'number', step: '0.01', min: 0, max: 4, required: true },
          { name: 'credits', label: 'Total credits (optional)', type: 'number', step: '0.5', min: 0 }
        ],
        onSubmit: v => {
          const gpa = parseFloat(v.gpa), sem = parseInt(v.sem, 10), credits = parseFloat(v.credits) || 0;
          if (isNaN(gpa) || gpa < 0 || gpa > 4 || !sem) return 'Enter a valid semester number and a GPA between 0 and 4.';
          semesters = semesters.filter(s => s.sem !== sem);
          semesters.push({ sem, gpa, credits });
          semesters.sort((a, b) => a.sem - b.sem);
          persist(); drawSaved();
        }
      });
    }

    function drawSaved() {
      savedBox.textContent = '';
      savedBox.append(el('div', { class: 'result-box' }, el('div', {}, el('div', { class: 'muted small', text: 'Overall CGPA' }), el('span', { class: 'muted small', text: `${semesters.length} semester${semesters.length === 1 ? '' : 's'} saved` })), el('strong', { text: round2(cgpaOf(semesters)) })));
      if (semesters.length) savedBox.append(el('ul', { class: 'list' }, semesters.map(s => el('li', { class: 'item' },
        el('div', { class: 'item-main' }, el('div', { class: 'item-title', text: `Semester ${s.sem}` }), el('div', { class: 'item-sub', text: s.credits ? `${s.credits} credits` : 'no credits entered' })),
        el('span', { class: 'badge solid', text: s.gpa.toFixed(2) }),
        el('button', { type: 'button', class: 'del', text: '✕', title: 'Delete', onclick: () => { semesters = semesters.filter(x => x.sem !== s.sem); persist(); drawSaved(); } })))));
      savedBox.append(el('div', { class: 'btn-row', style: 'margin-top:10px' }, el('button', { type: 'button', class: 'mini-btn', text: '＋ Add past semester', onclick: addPast })));
    }

    root.append(el('h4', { class: 'muted small', style: 'margin-bottom:8px', text: 'CALCULATE A SEMESTER' }), calcBox,
      el('h4', { class: 'muted small', style: 'margin:22px 0 4px', text: 'YOUR CGPA' }), savedBox,
      el('p', { class: 'empty small', text: 'Grade scale: ' + GRADES.map(g => `${g[0]} ${g[1].toFixed(2)} (${g[2]})`).join(', ') + '. This is the common Bangladesh 4.00 scale — confirm it matches your institute.' }));
    drawCalc(); drawSaved();
    NT.bigDialog('CGPA Calculator', root);
  }

  NT.register(async () => {
    semesters = (await NT.load(['semesters'])).semesters || [];
    $('btnCgpa').addEventListener('click', open);
  });
})();
