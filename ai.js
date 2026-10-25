(() => {
  'use strict';
  const { $, el } = NT;
  const API = 'https://api.groq.com/openai/v1';
  const FALLBACK_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  const PREFERRED = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'];
  const NON_CHAT = /whisper|tts|guard|embed|orpheus|playai|safeguard|transcri/i;
  let cfg = { key: '', model: '', models: [], lang: 'auto', style: 'tutor', detail: 'standard', useHistory: true };
  let history = [];
  const persistCfg = () => NT.save({ ai: cfg });
  const persistChat = () => NT.save({ aiChat: history.slice(-30) });
  const hasKey = () => !!cfg.key;
  const clean = t => (t || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();

  function explain(status, body) {
    let msg = '';
    try { const j = JSON.parse(body); msg = (j.error && j.error.message) || ''; } catch (e) { /* not json */ }
    if (status === 401) return 'Invalid API key. Check it at console.groq.com/keys.';
    if (status === 429) return 'Rate limit reached for this model. Wait a moment or choose another model.';
    if (status === 400 || status === 404) return msg || 'This model is not available. Choose another model.';
    return msg || `Request failed (${status}).`;
  }

  async function listModels(key = cfg.key) {
    let r;
    try { r = await fetch(`${API}/models`, { headers: { Authorization: 'Bearer ' + key } }); }
    catch (e) { throw new Error('Could not reach Groq. Check your internet connection.'); }
    if (!r.ok) throw new Error(explain(r.status, await r.text()));
    const j = await r.json();
    return (j.data || []).filter(m => m.active !== false).map(m => m.id).filter(id => !NON_CHAT.test(id)).sort();
  }

  async function chat(messages, { onDelta, signal, temperature = 0.5 } = {}) {
    if (!hasKey()) throw new Error('Add your Groq API key first.');
    const body = { model: cfg.model || FALLBACK_MODELS[0], messages, temperature, stream: !!onDelta };
    let r;
    try { r = await fetch(`${API}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }, body: JSON.stringify(body), signal }); }
    catch (e) { if (e && e.name === 'AbortError') throw e; throw new Error('Could not reach Groq. Check your internet connection.'); }
    if (!r.ok) throw new Error(explain(r.status, await r.text()));
    if (!onDelta) { const j = await r.json(); return clean(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content); }
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = '', full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const d = t.slice(5).trim();
        if (d === '[DONE]') return full;
        try {
          const j = JSON.parse(d);
          const c = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
          if (c) { full += c; onDelta(c, full); }
        } catch (e) { /* partial line */ }
      }
    }
    return full;
  }

  function system(extra) {
    const l = cfg.lang;
    const lang = l === 'bn' ? 'Always answer in Bengali (বাংলা).' : l === 'en' ? 'Always answer in English.' : 'Reply in the same language the user writes in.';
    const styles = {
      tutor: 'Teach patiently and explain the reasoning in clear steps.',
      socratic: 'Guide learning with brief questions and hints before giving a complete solution.',
      exam: 'Act as an exam coach: emphasize key facts, common mistakes, and how to earn marks.',
      concise: 'Be direct and concise; prioritize the answer over extra explanation.'
    };
    const details = {
      brief: 'Keep the answer very short.',
      standard: 'Use a useful level of detail without unnecessary repetition.',
      detailed: 'Give a thorough explanation with examples and a short recap when helpful.'
    };
    return `You are Nova, a friendly study assistant inside a student's new-tab page. Be accurate, clear, and honest about uncertainty. Use readable formatting. ${lang} ${styles[cfg.style] || styles.tutor} ${details[cfg.detail] || details.standard} ${extra || ''}`.trim();
  }
  const ask = (prompt, opts = {}) => chat([{ role: 'system', content: system(opts.system) }, { role: 'user', content: prompt }], opts);

  // Pull a JSON array/object out of a model reply (handles ``` fences and extra prose).
  function parseJson(text) {
    let t = clean(text).replace(/```(?:json)?/gi, '');
    const a = t.indexOf('['), o = t.indexOf('{');
    const start = a !== -1 && (o === -1 || a < o) ? a : o;
    if (start === -1) throw new Error('The AI did not return valid data. Try again.');
    const end = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
    try { return JSON.parse(t.slice(start, end + 1)); } catch (e) { throw new Error('The AI reply could not be read. Try again.'); }
  }

  /* ---------- tiny markdown renderer (DOM only, no innerHTML) ---------- */
  function inline(text) {
    const frag = document.createDocumentFragment();
    const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      frag.append(m[0][0] === '`' ? el('code', { text: m[0].slice(1, -1) }) : el('strong', { text: m[0].slice(2, -2) }));
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.append(text.slice(last));
    return frag;
  }
  function renderMd(src) {
    const root = el('div', { class: 'md' });
    src.split('```').forEach((part, i) => {
      if (i % 2 === 1) {
        const nl = part.indexOf('\n');
        root.append(el('pre', {}, el('code', { text: (nl >= 0 ? part.slice(nl + 1) : part).replace(/\n$/, '') })));
        return;
      }
      let list = null, type = '';
      part.split('\n').forEach(line => {
        const ul = /^\s*[-*•]\s+(.*)/.exec(line), ol = /^\s*\d+[.)]\s+(.*)/.exec(line), h = /^#{1,4}\s+(.*)/.exec(line);
        if (ul || ol) {
          const t = ul ? 'ul' : 'ol';
          if (!list || type !== t) { list = el(t); type = t; root.append(list); }
          list.append(el('li', {}, inline((ul || ol)[1])));
          return;
        }
        list = null;
        if (h) { root.append(el('h4', {}, inline(h[1]))); return; }
        if (line.trim()) root.append(el('p', {}, inline(line)));
      });
    });
    return root;
  }

  /* ---------- dialog ---------- */
  const CHIPS = [
    ['Explain simply', 'Explain this in simple words with an everyday example: '],
    ['Summarize', 'Summarize the following in 5 short bullet points: '],
    ['Quiz me', 'Ask me 5 multiple-choice questions on this topic, one at a time: '],
    ['Study plan', 'Make a 7-day study plan for this topic: '],
    ['Translate to Bengali', 'Translate this into natural Bengali: '],
    ['Practice questions', 'Create 5 exam-style practice questions with answers and brief explanations about: '],
    ['Memory aids', 'Create memorable mnemonics and a quick recall checklist for: ']
  ];

  function open(prefill, autoSend) {
    const root = el('div', { class: 'ai' });
    let showSetup = !hasKey(), controller = null;

    function setupView() {
      const keyIn = el('input', { type: 'password', placeholder: 'gsk_…', value: cfg.key, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Groq API key' });
      const err = el('p', { class: 'form-error', hidden: true, role: 'alert' });
      const lang = el('select', { onchange: ev => { cfg.lang = ev.target.value; persistCfg(); } },
        [['auto', 'Same as my question'], ['en', 'English'], ['bn', 'বাংলা (Bengali)']].map(([v, l]) => el('option', { value: v, selected: v === cfg.lang }, l)));
      const models = cfg.models.length ? cfg.models : FALLBACK_MODELS;
      const modelSel = el('select', { onchange: ev => { cfg.model = ev.target.value; persistCfg(); } },
        models.map(m => el('option', { value: m, selected: m === cfg.model }, m)));
      const saveBtn = el('button', { type: 'button', class: 'btn primary', text: 'Save & load models', onclick: async () => {
        const key = keyIn.value.trim();
        if (!key) { err.textContent = 'Paste your Groq API key first.'; err.hidden = false; return; }
        saveBtn.disabled = true; saveBtn.textContent = 'Checking…'; err.hidden = true;
        try {
          const ids = await listModels(key);
          if (!ids.length) throw new Error('No chat models were returned for this key.');
          cfg.key = key; cfg.models = ids;
          if (!ids.includes(cfg.model)) cfg.model = PREFERRED.find(p => ids.includes(p)) || ids[0];
          persistCfg();
          NT.toast('Groq connected ✓');
          showSetup = false; draw();
          NT.emit('ai-ready');
        } catch (e) { err.textContent = e.message; err.hidden = false; saveBtn.disabled = false; saveBtn.textContent = 'Save & load models'; }
      } });
      return el('div', {},
        el('p', { class: 'empty', text: 'Nova AI uses your own Groq account. Create a free API key, paste it below, then pick a model.' }),
        el('p', {}, el('a', { class: 'ai-link', href: 'https://console.groq.com/keys', target: '_blank', rel: 'noopener noreferrer', text: '→ Get an API key at console.groq.com/keys' })),
        el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Groq API key' }), keyIn),
        el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Model' }), modelSel),
        el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Reply language' }), lang),
        err,
        el('div', { class: 'btn-row' }, saveBtn,
          hasKey() ? el('button', { type: 'button', class: 'btn ghost', text: 'Back to chat', onclick: () => { showSetup = false; draw(); } }) : null,
          hasKey() ? el('button', { type: 'button', class: 'btn danger', text: 'Remove key', onclick: () => { cfg.key = ''; cfg.models = []; persistCfg(); NT.toast('API key removed'); showSetup = true; draw(); } }) : null),
        el('p', { class: 'empty small', text: '🔒 Your key is stored only in this browser. It is never synced, shared or included in backups. Everything you ask is sent to Groq.' }));
    }

    function chatView() {
      const msgs = el('div', { class: 'ai-msgs', role: 'log', 'aria-live': 'polite' });
      const input = el('textarea', { class: 'ai-input', rows: 2, placeholder: 'Ask anything… (Enter to send, Shift+Enter for a new line)', 'aria-label': 'Message' });
      const sendBtn = el('button', { type: 'button', class: 'btn primary', text: 'Send' });
      const stopBtn = el('button', { type: 'button', class: 'btn ghost', text: 'Stop', hidden: true });
      const models = cfg.models.length ? cfg.models : FALLBACK_MODELS;
      const modelSel = el('select', { 'aria-label': 'Model', onchange: ev => { cfg.model = ev.target.value; persistCfg(); } },
        models.map(m => el('option', { value: m, selected: m === cfg.model }, m)));
      const styleSel = el('select', { 'aria-label': 'Tutoring style', title: 'Choose how Nova teaches', onchange: ev => { cfg.style = ev.target.value; persistCfg(); } },
        [['tutor', 'Step-by-step tutor'], ['socratic', 'Socratic coach'], ['exam', 'Exam coach'], ['concise', 'Concise']].map(([value, label]) => el('option', { value, selected: value === cfg.style }, label)));
      const detailSel = el('select', { 'aria-label': 'Answer detail', title: 'Choose answer length', onchange: ev => { cfg.detail = ev.target.value; persistCfg(); } },
        [['brief', 'Brief'], ['standard', 'Standard'], ['detailed', 'Detailed']].map(([value, label]) => el('option', { value, selected: value === cfg.detail }, label)));
      const historyChk = el('input', { type: 'checkbox', checked: cfg.useHistory !== false, 'aria-label': 'Include conversation history', onchange: ev => { cfg.useHistory = ev.target.checked; persistCfg(); } });

      const scroll = () => { msgs.scrollTop = msgs.scrollHeight; };
      let retryAnswer = null;
      let retryBubble = null, retrySucceeded = false;
      function paint(bubble, text) {
        bubble._text = text;
        bubble.textContent = '';
        bubble.append(renderMd(clean(text)));
      }
      function addMsg(role, text) {
        const b = el('div', { class: 'ai-msg ' + role });
        if (role === 'user') b.textContent = text; else paint(b, text);
        if (role === 'assistant') b.append(el('button', { type: 'button', class: 'copy-btn', title: 'Copy', text: '⧉', onclick: async () => { try { await navigator.clipboard.writeText(clean(b._text || '')); NT.toast('Copied'); } catch (e) { /* ignore */ } } }));
        msgs.append(b); scroll();
        return b;
      }
      history.forEach(m => addMsg(m.role, m.content));
      if (!history.length) msgs.append(el('p', { class: 'empty ai-hello', text: 'Hi! Ask a question, paste your notes, or tap a shortcut below. 👇' }));

      async function send(text, retry = false) {
        text = (text || '').trim();
        if ((!text && !retry) || controller) return;
        const hello = msgs.querySelector('.ai-hello'); if (hello) hello.remove();
        if (retry) {
          retrySucceeded = false;
          if (history[history.length - 1] && history[history.length - 1].role === 'assistant') retryAnswer = history.pop();
          text = [...history].reverse().find(m => m.role === 'user')?.content || '';
          if (!text) return;
          retryBubble = [...msgs.querySelectorAll('.ai-msg.assistant:not(.typing):not(.error)')].pop() || null;
        } else {
          retryAnswer = null; retryBubble = null; retrySucceeded = false;
          history.push({ role: 'user', content: text });
          addMsg('user', text);
          input.value = '';
        }
        const bubble = addMsg('assistant', '');
        bubble.classList.add('typing');
        controller = new AbortController();
        stopBtn.hidden = false; sendBtn.disabled = true;
        retryBtn.disabled = true;
        let last = 0;
        try {
          const userMessages = cfg.useHistory === false
            ? [{ role: 'user', content: text }]
            : history.slice(-14);
          const full = await chat([{ role: 'system', content: system() }, ...userMessages], {
            signal: controller.signal,
            onDelta: (d, f) => { const now = Date.now(); if (now - last > 50) { last = now; paint(bubble, f); scroll(); } }
          });
          history.push({ role: 'assistant', content: full }); paint(bubble, full); retrySucceeded = true;
        } catch (e) {
          if (e.name === 'AbortError') {
            if (bubble._text) { history.push({ role: 'assistant', content: bubble._text }); retrySucceeded = retry; }
            else {
              if (!retry) history.pop();
              else if (retryAnswer) history.push(retryAnswer);
              bubble.remove();
            }
          } else {
            bubble.classList.add('error'); bubble.textContent = e.message;
            if (!retry) history.pop();
            else if (retryAnswer) history.push(retryAnswer);
          }
        } finally {
          if (retrySucceeded && retryBubble) retryBubble.remove();
          controller = null; stopBtn.hidden = true; sendBtn.disabled = false; retryBtn.disabled = false; retryBtn.hidden = !history.some(m => m.role === 'assistant');
          bubble.classList.remove('typing');
          if (bubble._text) paint(bubble, bubble._text);
          persistChat(); scroll();
        }
      }
      const retryBtn = el('button', { type: 'button', class: 'mini-btn', text: '↻ Regenerate', hidden: !history.some(m => m.role === 'assistant'), onclick: () => send('', true) });
      const exportBtn = el('button', { type: 'button', class: 'mini-btn', text: '↓ Export chat', onclick: () => {
        if (!history.length) { NT.toast('There is no conversation to export yet.'); return; }
        const transcript = history.map(m => `${m.role === 'assistant' ? 'Nova' : 'You'}:\n${m.content}`).join('\n\n');
        const url = URL.createObjectURL(new Blob([transcript], { type: 'text/plain;charset=utf-8' }));
        const link = el('a', { href: url, download: `nova-ai-chat-${new Date().toISOString().slice(0, 10)}.txt` });
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } });
      sendBtn.addEventListener('click', () => send(input.value));
      stopBtn.addEventListener('click', () => { if (controller) controller.abort(); });
      input.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(input.value); } });

      const view = el('div', {},
        el('div', { class: 'ai-bar' }, modelSel, el('div', { class: 'ai-controls' },
          styleSel, detailSel, el('label', { class: 'ai-history', title: 'Include earlier messages in Nova’s context' }, historyChk, el('span', { text: 'Context' })),
          retryBtn, exportBtn,
          el('button', { type: 'button', class: 'mini-btn', text: '＋ New chat', onclick: () => { if (controller) controller.abort(); history = []; persistChat(); draw(); } }),
          el('button', { type: 'button', class: 'mini-btn', text: '⚙ Setup', onclick: () => { showSetup = true; draw(); } }))),
        msgs,
        el('div', { class: 'ai-chips' }, CHIPS.map(([l, t]) => el('button', { type: 'button', class: 'chip', text: l, onclick: () => { input.value = t; input.focus(); } }))),
        el('div', { class: 'ai-send' }, input, el('div', { class: 'ai-send-btns' }, sendBtn, stopBtn)));
      setTimeout(() => { const pre = prefill; prefill = ''; if (pre) { input.value = pre; if (autoSend) send(pre); else input.focus(); } else input.focus(); }, 30);
      return view;
    }

    function draw() { root.textContent = ''; root.append(showSetup ? setupView() : chatView()); }
    draw();
    NT.bigDialog('Nova AI · Groq', root, () => { if (controller) controller.abort(); });
  }

  // Helpers other modules can call
  function ensure() {
    if (hasKey()) return true;
    NT.toast('Add your Groq API key first.');
    open();
    return false;
  }

  NT.ai = { open, ask, chat, parseJson, hasKey, ensure, listModels };

  NT.register(async () => {
    const r = await NT.load(['ai', 'aiChat']);
    cfg = { ...cfg, ...(r.ai || {}) };
    history = Array.isArray(r.aiChat) ? r.aiChat : [];
    $('btnAI').addEventListener('click', () => open());
  });
})();
