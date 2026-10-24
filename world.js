(() => {
  'use strict';
  const { el, state } = NT;
  const PRAYERS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const HANAFI_ZONES = ['Asia/Dhaka', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Colombo'];
  const WMO = { 0: ['Clear sky', '☀️'], 1: ['Mostly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'], 45: ['Fog', '🌫️'], 48: ['Fog', '🌫️'], 51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'], 56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'], 61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'], 71: ['Light snow', '🌨️'], 73: ['Snow', '❄️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '❄️'], 80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'], 82: ['Violent showers', '⛈️'], 85: ['Snow showers', '🌨️'], 86: ['Snow showers', '🌨️'], 95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'], 99: ['Thunderstorm', '⛈️'] };
  let wBody, pBody, pTitle, nextEl, loc = null, prayer = null, prayerDay = '', loading = false, usedKey = null, usedHour12 = null;

  async function fetchJson(url, ms = 9000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  const autoCity = tz => NT.cityName(tz);
  const locKey = () => NT.tz() + '|' + (state.settings.city || '').trim();

  // City comes from Settings, or is guessed from the time zone (e.g. Asia/Dhaka -> Dhaka).
  async function getLoc() {
    const tz = NT.tz();
    const city = (state.settings.city || '').trim() || autoCity(tz);
    const saved = (await NT.load(['loc'])).loc;
    if (saved && saved.query === city && saved.deviceTz === tz) return saved;
    let out = null;
    if (city.toLowerCase() === 'dhaka' && tz === 'Asia/Dhaka') out = { name: 'Dhaka', lat: 23.8103, lon: 90.4125, tz: 'Asia/Dhaka', country: 'Bangladesh' };
    else {
      try {
        const g = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`);
        const list = g.results || [];
        const best = list.find(r => r.timezone === tz) || list[0];
        if (best) out = { name: best.name, lat: best.latitude, lon: best.longitude, tz: best.timezone || tz, country: best.country || '' };
      } catch (e) { /* offline */ }
    }
    if (!out) return saved || null;
    out = { ...out, query: city, deviceTz: tz };
    NT.save({ loc: out });
    return out;
  }

  /* ---------- weather ---------- */
  function renderWeather(d, l, stale) {
    const c = d.current || {};
    const [desc, icon] = WMO[c.weather_code] || ['Weather', '🌡️'];
    const hi = d.daily && d.daily.temperature_2m_max ? Math.round(d.daily.temperature_2m_max[0]) : '–';
    const lo = d.daily && d.daily.temperature_2m_min ? Math.round(d.daily.temperature_2m_min[0]) : '–';
    wBody.textContent = '';
    wBody.append(
      el('div', { class: 'weather-main' }, el('div', { class: 'weather-icon', text: icon }),
        el('div', {}, el('div', { class: 'weather-temp', text: `${Math.round(c.temperature_2m)}°C` }),
          el('div', { class: 'weather-desc', text: `${desc} · ${l.name}${l.country ? ', ' + l.country : ''}` }))),
      el('div', { class: 'weather-meta' },
        el('div', {}, 'Feels like', el('b', { text: `${Math.round(c.apparent_temperature)}°C` })),
        el('div', {}, 'Today', el('b', { text: `${lo}° / ${hi}°` })),
        el('div', {}, 'Humidity', el('b', { text: `${c.relative_humidity_2m}%` })),
        el('div', {}, 'Wind', el('b', { text: `${Math.round(c.wind_speed_10m)} km/h` }))),
      stale ? el('p', { class: 'empty small', text: 'Offline — showing last saved weather.' }) : null);
  }
  async function loadWeather(l) {
    const key = `${l.lat},${l.lon}`;
    const cached = (await NT.load(['weatherCache'])).weatherCache;
    if (cached && cached.key === key && Date.now() - cached.t < 30 * 60000) { renderWeather(cached.data, l, false); return; }
    try {
      const d = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${l.lat}&longitude=${l.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`);
      NT.save({ weatherCache: { key, t: Date.now(), data: d } });
      renderWeather(d, l, false);
    } catch (e) {
      if (cached && cached.key === key) renderWeather(cached.data, l, true);
      else { wBody.textContent = ''; wBody.append(el('p', { class: 'empty', text: "Couldn't load weather. Check your internet connection." }), el('button', { type: 'button', class: 'mini-btn', text: 'Retry', onclick: () => loadAll() })); }
    }
  }

  /* ---------- prayer times ---------- */
  const toMinutes = s => { const m = /(\d{1,2}):(\d{2})/.exec(s || ''); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null; };
  const isHanafi = l => HANAFI_ZONES.includes(l.tz);

  async function loadPrayer(l) {
    const today = NT.nowIn(l.tz).ymd;
    const key = `${today}|${l.lat.toFixed(2)},${l.lon.toFixed(2)}`;
    const cached = (await NT.load(['prayerCache'])).prayerCache;
    let timings = cached && cached.key === key ? cached.timings : null;
    if (!timings) {
      try {
        const [y, m, d] = today.split('-');
        const extra = isHanafi(l) ? '&method=1&school=1' : '';
        const res = await fetchJson(`https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${l.lat}&longitude=${l.lon}${extra}`);
        timings = {};
        PRAYERS.forEach(p => { timings[p] = toMinutes(res.data.timings[p]); });
        NT.save({ prayerCache: { key, timings } });
      } catch (e) { timings = null; }
    }
    prayer = timings; prayerDay = today;
    renderPrayer(!timings);
  }

  function nextPrayer() {
    const now = NT.nowIn(loc.tz).minutes;
    for (const p of PRAYERS.filter(x => x !== 'Sunrise')) if (prayer[p] > now) return { name: p, in: prayer[p] - now };
    return { name: 'Fajr', in: prayer.Fajr + 1440 - now };
  }

  function renderPrayer(failed) {
    usedHour12 = state.settings.hour12;
    pBody.textContent = '';
    if (failed || !prayer) {
      pBody.append(el('p', { class: 'empty', text: "Couldn't load prayer times. Check your internet connection." }), el('button', { type: 'button', class: 'mini-btn', text: 'Retry', onclick: () => loadAll() }));
      return;
    }
    nextEl = el('div', { class: 'next-prayer' });
    pBody.append(nextEl, ...PRAYERS.map(p => el('div', { class: 'prayer-row' + (p === 'Sunrise' ? ' sun' : ''), 'data-p': p }, el('span', { text: p }), el('span', { text: NT.fmtMin(prayer[p]) }))),
      el('p', { class: 'empty small', text: isHanafi(loc)
        ? 'Source: AlAdhan (Karachi method, Hanafi Asr). May differ by 1–2 minutes from your local mosque timetable.'
        : 'Source: AlAdhan (method picked for your location). May differ by a few minutes from your local mosque timetable.' }));
    updateNext();
  }

  function updateNext() {
    if (!prayer || !nextEl || !loc) return;
    const n = nextPrayer(), now = NT.nowIn(loc.tz).minutes;
    const h = Math.floor(n.in / 60), m = n.in % 60;
    nextEl.textContent = '';
    nextEl.append('Next: ', el('strong', { text: n.name }), ` in ${h ? h + 'h ' : ''}${m}m`);
    pBody.querySelectorAll('.prayer-row').forEach(r => {
      const p = r.dataset.p;
      r.classList.toggle('next', p === n.name);
      r.classList.toggle('passed', p !== n.name && prayer[p] <= now);
    });
  }

  async function loadAll() {
    if (loading) return;
    loading = true;
    try {
      usedKey = locKey();
      loc = await getLoc();
      if (!loc) {
        const msg = el('p', { class: 'empty', text: "Couldn't find your city. Open Settings ▸ Time & location and enter a city." });
        wBody.textContent = ''; wBody.append(msg.cloneNode(true));
        pBody.textContent = ''; pBody.append(msg);
        return;
      }
      pTitle.textContent = `Prayer Times · ${loc.name}`;
      await Promise.all([loadWeather(loc), loadPrayer(loc)]);
    } finally { loading = false; }
  }

  NT.register(() => {
    const wc = NT.card('Weather', { icon: '🌤️' });
    wBody = wc.body;
    const pc = NT.card('Prayer Times', { icon: '🕌' });
    pBody = pc.body; pTitle = pc.head.querySelector('h3');
    wBody.append(el('p', { class: 'empty', text: 'Loading…' }));
    pBody.append(el('p', { class: 'empty', text: 'Loading…' }));
    loadAll();
    NT.on('tick', () => {
      if (prayer && loc && NT.nowIn(loc.tz).ymd !== prayerDay && !loading) loadAll();
      updateNext();
    });
    NT.on('settings', () => {
      if (locKey() !== usedKey) { loadAll(); return; }
      if (prayer && usedHour12 !== state.settings.hour12) renderPrayer(false);
    });
  });
})();
