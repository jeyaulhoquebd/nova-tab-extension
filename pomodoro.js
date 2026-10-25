(() => {
  'use strict';
  const { el, state } = NT;
  const LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  let pomo, stats = {};
  const ui = {};

  const dur = m => (m === 'focus' ? state.settings.focusMin : m === 'short' ? state.settings.shortMin : state.settings.longMin) * 60000;
  const hasAlarms = () => typeof chrome !== 'undefined' && chrome.alarms;
  const savePomo = () => NT.save({ pomo });
  const remainingMs = () => (pomo.running ? Math.max(0, pomo.endsAt - Date.now()) : pomo.remaining);

  function clearAlarms() {
    if (!hasAlarms()) return;
    chrome.alarms.getAll(list => (list || []).filter(a => a.name.startsWith('pomo:')).forEach(a => chrome.alarms.clear(a.name)));
  }
  function setAlarm() {
    if (!hasAlarms()) return;
    clearAlarms();
    chrome.alarms.create('pomo:' + pomo.mode, { when: pomo.endsAt });
  }
  const stopLinkedFocus = () => { if (NT.focus) NT.focus.stop('pomodoro'); };

  function start() {
    if (pomo.running) return;
    pomo.running = true;
    pomo.endsAt = Date.now() + pomo.remaining;
    savePomo(); setAlarm();
    // Start the site blocker first so the permission prompt stays tied to this click.
    if (pomo.mode === 'focus' && state.settings.blockDuringPomodoro && NT.focus) NT.focus.start({ until: pomo.endsAt, source: 'pomodoro' });
    renderTimer();
  }
  function pause() {
    if (!pomo.running) return;
    pomo.remaining = Math.max(0, pomo.endsAt - Date.now());
    pomo.running = false; pomo.endsAt = null;
    savePomo(); clearAlarms(); stopLinkedFocus(); renderTimer();
  }
  function reset() {
    pomo.running = false; pomo.endsAt = null; pomo.remaining = dur(pomo.mode);
    savePomo(); clearAlarms(); stopLinkedFocus(); renderTimer();
  }
  function setMode(m) {
    pomo.mode = m; pomo.running = false; pomo.endsAt = null; pomo.remaining = dur(m);
    savePomo(); clearAlarms(); stopLinkedFocus(); renderTimer();
  }
  function advance() {
    pomo.mode = pomo.mode === 'focus' ? (pomo.cycle % state.settings.longEvery === 0 ? 'long' : 'short') : 'focus';
    pomo.remaining = dur(pomo.mode);
  }
  function skip() {
    pomo.running = false; pomo.endsAt = null;
    if (pomo.mode === 'focus') pomo.cycle++;
    advance(); savePomo(); clearAlarms(); stopLinkedFocus(); renderTimer();
  }

  function complete() {
    const was = pomo.mode;
    const endedAt = pomo.endsAt || Date.now();
    pomo.running = false; pomo.endsAt = null;
    if (was === 'focus') {
      const d = NT.todayStr(new Date(endedAt));
      stats[d] = (stats[d] || 0) + state.settings.focusMin;
      pomo.cycle++;
      NT.save({ stats });
      NT.emit('focus-complete', { minutes: state.settings.focusMin, endedAt, fresh: Date.now() - endedAt < 15000 });
    }
    advance(); savePomo(); clearAlarms(); stopLinkedFocus();
    if (Date.now() - endedAt < 15000) {
      beep();
      NT.toast(was === 'focus' ? 'Focus session complete! Take a break 🎉' : 'Break is over — time to focus ⏰');
    }
    renderTimer(); renderStats();
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach(t => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; g.gain.value = 0.15;
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15);
      });
    } catch (e) { /* audio blocked */ }
  }

  function streak() {
    const goal = Math.max(1, state.settings.dailyGoal);
    const today = NT.todayStr();
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const d = NT.addDays(today, -i);
      if ((stats[d] || 0) >= goal) n++;
      else if (i === 0) continue;
      else break;
    }
    return n;
  }

  function renderTimer() {
    const ms = remainingMs();
    const s = Math.ceil(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
    ui.time.textContent = `${mm}:${ss}`;
    ui.modeLbl.textContent = LABEL[pomo.mode];
    const total = dur(pomo.mode);
    const frac = total ? Math.min(1, ms / total) : 0;
    ui.arc.style.strokeDashoffset = String(553 * (1 - frac));
    ui.ring.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    ui.toggle.textContent = pomo.running ? 'Pause' : (ms < dur(pomo.mode) ? 'Resume' : 'Start');
    ui.tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === pomo.mode));
    document.title = pomo.running ? `${mm}:${ss} · ${LABEL[pomo.mode]}` : 'New Tab';
  }

  function renderStats() {
    const goal = Math.max(1, state.settings.dailyGoal);
    const today = NT.todayStr();
    const mins = stats[today] || 0;
    ui.today.textContent = `Today: ${mins} / ${goal} min`;
    ui.bar.style.width = Math.min(100, (mins / goal) * 100) + '%';
    const n = streak();
    ui.streak.textContent = n > 0 ? `🔥 ${n}-day streak` : 'No streak yet — hit your goal today!';
    const days = Array.from({ length: 7 }, (_, i) => NT.addDays(today, i - 6));
    const max = Math.max(goal, ...days.map(d => stats[d] || 0));
    ui.bars.textContent = '';
    days.forEach(d => {
      const v = stats[d] || 0;
      const label = NT.DAYS[new Date(d + 'T00:00:00Z').getUTCDay()][0];
      ui.bars.append(el('div', { class: 'bar-col' + (v >= goal ? ' met' : ''), title: `${d}: ${v} min` },
        el('i', { style: `height:${Math.max(6, (v / max) * 100)}%` }), el('span', { text: label })));
    });
  }

  NT.register(async () => {
    const r = await NT.load(['pomo', 'stats']);
    stats = r.stats || {};
    pomo = r.pomo || { mode: 'focus', running: false, endsAt: null, remaining: dur('focus'), cycle: 0 };

    ui.tabs = Object.keys(LABEL).map(m => el('button', { type: 'button', class: 'pomo-tab', 'data-mode': m, text: LABEL[m], onclick: () => setMode(m) }));
    ui.ring = el('div', { class: 'ring', role: 'progressbar', 'aria-label': 'Timer', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '100' });
    ui.ring.innerHTML = '<svg viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--accent2)"/></linearGradient></defs><circle class="ring-track" cx="100" cy="100" r="88"/><circle class="ring-bar" cx="100" cy="100" r="88" stroke="url(#rg)"/></svg>';
    ui.time = el('div', { class: 'ring-time', text: '25:00' });
    ui.modeLbl = el('div', { class: 'ring-mode', text: 'Focus' });
    ui.ring.append(el('div', { class: 'ring-center' }, ui.time, ui.modeLbl));
    ui.arc = ui.ring.querySelector('.ring-bar');
    ui.toggle = el('button', { type: 'button', class: 'btn primary', text: 'Start', onclick: () => (pomo.running ? pause() : start()) });
    ui.today = el('span'); ui.streak = el('span', { class: 'muted' });
    ui.bar = el('span'); ui.bars = el('div', { class: 'bars' });
    const c = NT.card('Focus Timer', { icon: '⏱️', actions: [el('button', { type: 'button', class: 'mini-btn', text: 'Log', title: 'Study log', onclick: () => NT.studyLog && NT.studyLog.open() })] });
    c.body.append(
      el('div', { class: 'pomo-tabs' }, ui.tabs), ui.ring,
      el('div', { class: 'pomo-btns' }, ui.toggle,
        el('button', { type: 'button', class: 'btn ghost', text: 'Reset', onclick: reset }),
        el('button', { type: 'button', class: 'btn ghost', text: 'Skip', onclick: skip })),
      el('div', { class: 'stat-row' }, ui.today, ui.streak),
      el('div', { class: 'progress' }, ui.bar), ui.bars);

    if (pomo.running && Date.now() >= pomo.endsAt) complete();
    renderTimer(); renderStats();

    NT.on('tick', () => {
      if (pomo.running && Date.now() >= pomo.endsAt) complete(); else if (!document.hidden) renderTimer();
    });
    NT.on('settings', () => {
      if (!pomo.running) pomo.remaining = dur(pomo.mode);
      renderTimer(); renderStats();
    });
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.pomo && changes.pomo.newValue) { pomo = changes.pomo.newValue; renderTimer(); }
        if (changes.stats) { stats = changes.stats.newValue || {}; renderStats(); }
      });
    }
  });
})();
