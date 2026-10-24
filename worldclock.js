(() => {
  'use strict';
  const { el, state } = NT;
  const MAX = 6;
  let zones = [], listEl, rows = [];
  const persist = () => NT.save({ worldClocks: zones });
  const cityOf = tz => NT.cityName(tz);

  function resolve(input) {
    const v = (input || '').trim().toLowerCase();
    if (!v) return null;
    if (v === 'utc' || v === 'gmt') return 'UTC';
    const all = NT.allZones();
    let m = all.find(z => z.toLowerCase() === v);
    if (m) return m;
    const key = v.replace(/\s+/g, '_');
    m = all.find(z => z.split('/').pop().toLowerCase() === key);
    return m || all.find(z => z.toLowerCase().includes(key)) || null;
  }

  function diffText(mins) {
    if (mins === 0) return 'same time as you';
    const a = Math.abs(mins), h = Math.floor(a / 60), m = a % 60;
    return `${h ? h + 'h' : ''}${m ? (h ? ' ' : '') + m + 'm' : ''} ${mins > 0 ? 'ahead' : 'behind'}`;
  }

  function update() {
    if (!rows.length) return;
    const mine = NT.nowTz();
    const myOff = NT.tzOffsetMs(Date.now());
    rows.forEach(r => {
      const n = NT.nowIn(r.tz);
      r.time.textContent = NT.fmtMin(n.minutes);
      const day = n.ymd === mine.ymd ? 'Today' : n.ymd > mine.ymd ? 'Tomorrow' : 'Yesterday';
      r.sub.textContent = `${day} · ${diffText(Math.round((NT.tzOffsetMs(Date.now(), r.tz) - myOff) / 60000))}`;
    });
  }

  function render() {
    listEl.textContent = '';
    rows = [];
    if (!zones.length) { listEl.append(el('p', { class: 'empty', text: 'Add cities to see their time next to yours — handy for friends and family abroad.' })); return; }
    const ul = el('ul', { class: 'list' });
    zones.forEach(z => {
      const time = el('div', { class: 'wc-time' }), sub = el('div', { class: 'item-sub' });
      rows.push({ tz: z.tz, time, sub });
      ul.append(el('li', { class: 'item' }, el('div', { class: 'item-main' }, el('div', { class: 'item-title', text: cityOf(z.tz) }), sub), time,
        el('button', { type: 'button', class: 'del', title: 'Remove', text: '✕', onclick: () => { zones = zones.filter(x => x.id !== z.id); persist(); render(); } })));
    });
    listEl.append(ul);
    update();
  }

  function add() {
    if (zones.length >= MAX) { NT.toast(`You can add up to ${MAX} cities.`); return; }
    NT.formDialog({
      title: 'Add a city',
      fields: [{ name: 'zone', label: 'City or time zone', required: true, placeholder: 'e.g. London, New York, Asia/Tokyo', list: NT.allZones() }],
      onSubmit: v => {
        const tz = resolve(v.zone);
        if (!tz) return "Couldn't find that city. Try a name like London or an ID like Asia/Tokyo.";
        if (zones.some(z => z.tz === tz)) return 'That city is already added.';
        zones.push({ id: NT.uid(), tz }); persist(); render();
      }
    });
  }

  NT.register(async () => {
    zones = (await NT.load(['worldClocks'])).worldClocks || [];
    listEl = el('div');
    const c = NT.card('World Clock', { icon: '🌍', actions: [el('button', { type: 'button', class: 'mini-btn', text: '＋ Add', onclick: add })] });
    c.body.append(listEl);
    render();
    NT.on('tick', update);
    NT.on('settings', () => { render(); });
  });
})();
