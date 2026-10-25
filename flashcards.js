(() => {
  'use strict';
  const { el } = NT;
  let cards = [], stats = {}, body;
  const saveCards = () => NT.save({ cards });
  const dayStart = n => NT.zonedToMs(NT.addDays(NT.todayStr(), n), '00:00');
  const isDue = c => c.due <= Date.now();
  const deckOf = c => c.deck || 'General';
  const decks = () => [...new Set(cards.map(deckOf))];
  const dueList = deck => cards.filter(c => isDue(c) && (!deck || deckOf(c) === deck)).sort((a, b) => a.due - b.due);

  // Simplified SM-2. grade: 0 Again, 1 Hard, 2 Good, 3 Easy
  function plan(c, g) {
    let { ease, interval, reps } = c;
    if (g === 0) return { ease: Math.max(1.3, ease - 0.2), interval: 0, reps: 0, due: Date.now() + 10 * 60000 };
    if (g === 1) { interval = Math.max(1, Math.round((interval || 1) * 1.2)); ease = Math.max(1.3, ease - 0.15); }
    else if (g === 2) interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(1, Math.round(interval * ease));
    else { interval = reps === 0 ? 4 : Math.max(2, Math.round(Math.max(interval, 1) * ease * 1.3)); ease += 0.15; }
    return { ease, interval, reps: reps + 1, due: dayStart(interval) };
  }
  const hint = (c, g) => { if (g === 0) return '10m'; const d = plan(c, g).interval; return d >= 30 ? Math.round(d / 30) + 'mo' : d + 'd'; };

  function newCard(front, back, deck) {
    return { id: NT.uid(), front, back, deck: deck || 'General', ease: 2.5, interval: 0, reps: 0, due: 0 };
  }

  /* ---------- dashboard card ---------- */
  function render() {
    const due = dueList().length, today = NT.todayStr();
    body.textContent = '';
    if (!cards.length) {
      body.append(el('p', { class: 'empty', text: 'Make flashcards for tough topics. Nova brings each card back just before you would forget it (spaced repetition).' }),
        el('div', { class: 'btn-row' },
          el('button', { type: 'button', class: 'mini-btn', text: '＋ Add card', onclick: () => cardForm(null) }),
          el('button', { type: 'button', class: 'mini-btn', text: '✨ Generate with AI', onclick: aiForm })));
      return;
    }
    body.append(
      el('div', { class: 'fc-hero' }, el('strong', { class: 'fc-count', text: String(due) }), el('span', { class: 'muted', text: due === 1 ? 'card due now' : 'cards due now' })),
      el('p', { class: 'item-sub', style: 'margin-bottom:12px', text: `${cards.length} cards · ${decks().length} deck${decks().length === 1 ? '' : 's'} · reviewed today: ${stats[today] || 0}` }),
      el('div', { class: 'btn-row' },
        el('button', { type: 'button', class: 'btn primary', text: due ? `Review ${due}` : 'All caught up 🎉', disabled: !due, onclick: () => review() }),
        el('button', { type: 'button', class: 'btn ghost', text: 'Manage', onclick: manage })));
  }

  /* ---------- review ---------- */
  function review(deck) {
    const queue = dueList(deck);
    if (!queue.length) { NT.toast('Nothing due right now 🎉'); return; }
    const total = queue.length;
    let done = 0, shown = false;
    const root = el('div', { class: 'fc' });
    const onKey = ev => {
      if (!document.getElementById('bigDialog').open || document.getElementById('formDialog').open) return;
      const tag = (ev.target && ev.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (!queue.length) return;
      if (!shown && (ev.key === ' ' || ev.key === 'Enter')) { ev.preventDefault(); shown = true; draw(); }
      else if (shown && '1234'.includes(ev.key) && ev.key) grade(parseInt(ev.key, 10) - 1);
      else if (shown && (ev.key === ' ' || ev.key === 'Enter')) { ev.preventDefault(); grade(2); }
    };
    document.addEventListener('keydown', onKey);

    function grade(g) {
      const c = queue.shift();
      Object.assign(c, plan(c, g));
      stats[NT.todayStr()] = (stats[NT.todayStr()] || 0) + 1;
      if (g === 0) queue.push(c); else done++;
      saveCards(); NT.save({ cardStats: stats });
      shown = false; draw();
    }
    function draw() {
      root.textContent = '';
      if (!queue.length) {
        root.append(el('div', { class: 'fc-done' }, el('div', { class: 'fc-emoji', text: '🎉' }), el('h3', { text: 'Session complete' }), el('p', { class: 'empty', text: `You reviewed ${done} card${done === 1 ? '' : 's'}. Nice work!` }),
          el('button', { type: 'button', class: 'btn primary', text: 'Close', onclick: () => document.getElementById('bigDialog').close() })));
        return;
      }
      const c = queue[0];
      root.append(
        el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) }, el('span', { style: `width:${(done / total) * 100}%` })),
        el('div', { class: 'item-sub', style: 'margin:6px 0 12px', text: `${done} / ${total} · ${deckOf(c)}` }),
        el('div', { class: 'fc-card' }, el('div', { class: 'fc-label', text: 'Question' }), el('div', { class: 'fc-text', text: c.front }),
          shown ? [el('hr'), el('div', { class: 'fc-label', text: 'Answer' }), el('div', { class: 'fc-text', text: c.back })] : null),
        shown
          ? el('div', { class: 'fc-grades' }, ['Again', 'Hard', 'Good', 'Easy'].map((l, i) => el('button', { type: 'button', class: 'fc-grade g' + i, onclick: () => grade(i) }, el('b', { text: l }), el('span', { text: hint(c, i) }), el('i', { text: String(i + 1) }))))
          : el('div', { class: 'btn-row', style: 'justify-content:center' }, el('button', { type: 'button', class: 'btn primary', text: 'Show answer (Space)', onclick: () => { shown = true; draw(); } })));
    }
    draw();
    NT.bigDialog('Review' + (deck ? ` · ${deck}` : ''), root, () => { document.removeEventListener('keydown', onKey); render(); });
  }

  /* ---------- add / edit / AI ---------- */
  function cardForm(c, after) {
    NT.formDialog({
      title: c ? 'Edit card' : 'New flashcard',
      fields: [
        { name: 'front', label: 'Question / front', type: 'textarea', rows: 3, value: c ? c.front : '' },
        { name: 'back', label: 'Answer / back', type: 'textarea', rows: 3, value: c ? c.back : '' },
        { name: 'deck', label: 'Deck (subject)', value: c ? deckOf(c) : '', placeholder: 'e.g. Physics', list: decks() }
      ],
      onSubmit: v => {
        if (!v.front || !v.back) return 'Please fill in both the question and the answer.';
        if (c) { c.front = v.front; c.back = v.back; c.deck = v.deck || 'General'; } else cards.push(newCard(v.front, v.back, v.deck));
        saveCards(); render(); if (after) after();
      }
    });
  }

  function aiForm(after) {
    if (!NT.ai.ensure()) return;
    NT.formDialog({
      title: '✨ Generate flashcards',
      submitText: 'Generate',
      fields: [
        { name: 'deck', label: 'Deck (subject)', placeholder: 'e.g. Physics', list: decks() },
        { name: 'count', label: 'How many cards?', type: 'select', value: '10', options: [5, 10, 15, 20].map(n => ({ value: String(n), label: String(n) })) },
        { name: 'src', label: 'Topic, or paste your notes', type: 'textarea', rows: 6, placeholder: "e.g. Newton's laws of motion — or paste a paragraph from your book" }
      ],
      onSubmit: async v => {
        if (!v.src) return 'Enter a topic or paste some notes.';
        const reply = await NT.ai.ask(`Create ${v.count} flashcards for studying the content below. Keep each question short and each answer clear (max 2 sentences). Return ONLY a JSON array like [{"front":"question","back":"answer"}] with no extra text.\n\nContent:\n${v.src.slice(0, 6000)}`, { temperature: 0.3 });
        const data = NT.ai.parseJson(reply);
        const list = Array.isArray(data) ? data : (data.cards || data.flashcards || []);
        const made = list.map(x => newCard(String(x.front || x.question || x.q || '').trim(), String(x.back || x.answer || x.a || '').trim(), v.deck)).filter(c => c.front && c.back);
        if (!made.length) return 'No cards were produced. Try adding more detail.';
        cards.push(...made); saveCards(); render(); NT.toast(`Added ${made.length} cards ✨`);
        if (typeof after === 'function') after();
      }
    });
  }

  /* ---------- manage ---------- */
  function manage() {
    const root = el('div'), listBox = el('div');
    let deckFilter = '';
    function draw() {
      listBox.textContent = '';
      const list = cards.filter(c => !deckFilter || deckOf(c) === deckFilter);
      if (!list.length) { listBox.append(el('p', { class: 'empty', text: 'No cards here yet.' })); return; }
      listBox.append(el('ul', { class: 'list' }, list.map(c => el('li', { class: 'item' },
        el('div', { class: 'item-main' }, el('div', { class: 'item-title', text: c.front }), el('div', { class: 'item-sub', text: `${deckOf(c)} · ${c.back.slice(0, 50)}${c.back.length > 50 ? '…' : ''}` })),
        el('span', { class: 'badge' + (isDue(c) ? ' warn' : ''), text: isDue(c) ? 'Due' : NT.prettyDate(NT.todayStr(new Date(c.due))) }),
        el('button', { type: 'button', class: 'del', title: 'Edit', text: '✎', onclick: () => cardForm(c, draw) }),
        el('button', { type: 'button', class: 'del', title: 'Delete', text: '✕', onclick: () => { cards = cards.filter(x => x.id !== c.id); saveCards(); render(); draw(); } })))));
    }
    const sel = el('select', { 'aria-label': 'Deck filter', onchange: ev => { deckFilter = ev.target.value; draw(); } },
      [el('option', { value: '' }, 'All decks'), ...decks().map(d => el('option', { value: d }, d))]);
    root.append(el('div', { class: 'btn-row', style: 'margin-bottom:14px' },
      el('button', { type: 'button', class: 'btn primary', text: '＋ Add card', onclick: () => cardForm(null, draw) }),
      el('button', { type: 'button', class: 'btn ghost', text: '✨ Generate with AI', onclick: () => aiForm(draw) }),
      el('button', { type: 'button', class: 'btn ghost', text: 'Review deck', onclick: () => { document.getElementById('bigDialog').close(); review(deckFilter); } })),
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Deck' }), sel), listBox);
    draw();
    NT.bigDialog('Flashcards', root, render);
  }

  NT.register(async () => {
    const r = await NT.load(['cards', 'cardStats']);
    cards = r.cards || []; stats = r.cardStats || {};
    const c = NT.card('Flashcards', { icon: '🧠', actions: [el('button', { type: 'button', class: 'mini-btn', text: '＋ Card', onclick: () => cardForm(null) })] });
    body = c.body;
    render();
    NT.on('tick', () => { if (document.hidden) return; const n = dueList().length; if (n !== render._n) { render._n = n; render(); } });
  });
})();
