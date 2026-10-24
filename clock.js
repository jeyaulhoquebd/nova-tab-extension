(() => {
  'use strict';
  const { $, state } = NT;
  let fmt, dateFmt, lastKey = '';

  function build() {
    const s = state.settings, tz = NT.tz();
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: s.hour12 ? 'h12' : 'h23' });
    dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('ampm').hidden = !s.hour12;
    $('seconds').hidden = !s.showSeconds;
    lastKey = '';
  }

  function greetingFor(h) {
    if (h >= 5 && h < 12) return 'Good morning ☀️';
    if (h >= 12 && h < 17) return 'Good afternoon 🌤️';
    if (h >= 17 && h < 21) return 'Good evening 🌆';
    return 'Good night 🌙';
  }

  function render() {
    const now = new Date();
    const p = {};
    fmt.formatToParts(now).forEach(x => { p[x.type] = x.value; });
    $('time').textContent = `${p.hour}:${p.minute}`;
    $('seconds').textContent = p.second;
    $('ampm').textContent = (p.dayPeriod || '').toUpperCase();
    const h = Math.floor(NT.nowTz().minutes / 60);
    const key = dateFmt.format(now) + '|' + h;
    if (key !== lastKey) {
      lastKey = key;
      $('date').textContent = dateFmt.format(now);
      const name = (state.settings.name || '').trim();
      $('greeting').textContent = greetingFor(h) + (name ? ', ' + name : '');
      const i = NT.tzInfo();
      $('tzLabel').textContent = [i.region, i.long ? i.long + (i.offset ? ` (${i.offset})` : '') : i.offset].filter(Boolean).join(' · ');
    }
  }

  NT.register(() => {
    build(); render();
    setInterval(() => { render(); NT.emit('tick'); }, 1000);
    NT.on('settings', () => { build(); render(); });
  });
})();
