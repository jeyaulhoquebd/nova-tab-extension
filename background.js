'use strict';

async function clearRules() {
  if (!chrome.declarativeNetRequest) return;
  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    if (rules.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: rules.map(r => r.id) });
  } catch (e) { /* permission not granted yet */ }
}

async function endFocusIfExpired() {
  const { focus } = await chrome.storage.local.get('focus');
  if (focus && focus.until <= Date.now() + 1500) {
    await clearRules();
    await chrome.storage.local.remove('focus');
    return true;
  }
  return false;
}

function notify(title, message) {
  chrome.notifications.create('', { type: 'basic', iconUrl: 'icons/icon128.png', title, message });
}

const TELEGRAM_ALARM = 'telegram:daily-summary';
const DAY_MS = 24 * 60 * 60 * 1000;
const TELEGRAM_CATEGORIES = ['focus', 'today', 'assignments', 'flashcards', 'syllabus', 'notes', 'exams'];
const TELEGRAM_LABELS = {
  focus: 'Focus Timer',
  today: 'Today',
  assignments: 'Assignments',
  flashcards: 'Flashcards',
  syllabus: 'Syllabus',
  notes: 'Quick Notes',
  exams: 'Exam Countdown'
};

function getLocalData(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, result => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result || {});
    });
  });
}

function setLocalData(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function localDateParts(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdays.indexOf(parts.weekday)
  };
}

function compact(value, max = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function makeDailySummary(data, requestedCategories) {
  const settings = data.settings || {};
  const timezone = settings.timezone && settings.timezone !== 'auto'
    ? settings.timezone
    : (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const { date, weekday } = localDateParts(timezone);
  const categories = TELEGRAM_CATEGORIES.filter(category => requestedCategories.includes(category));
  const sections = [`Nova Tab · ${date}`, ''];

  categories.forEach(category => {
    if (category === 'focus') {
      const minutes = Number((data.stats || {})[date]) || 0;
      const entries = (data.studyLog || []).filter(entry => entry.date === date);
      sections.push(`⏱️ Focus Timer — ${(minutes / 60).toFixed(2)}h total`);
      if (entries.length) entries.slice(-8).forEach(entry => {
        const description = [entry.subject, entry.note].filter(Boolean).join(': ');
        if (description) sections.push(`• ${compact(description)}`);
      });
    } else if (category === 'today') {
      const classes = (data.routine || []).filter(item => (item.days || []).includes(weekday))
        .sort((a, b) => String(a.start).localeCompare(String(b.start)));
      sections.push('📚 Today');
      sections.push(classes.length
        ? classes.map(item => `• ${compact(item.start)} ${compact(item.subject, 80)}${item.room ? ` · ${compact(item.room, 50)}` : ''}`).join('\n')
        : '• No classes scheduled');
    } else if (category === 'assignments') {
      const open = (data.assignments || []).filter(item => !item.done)
        .sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
      sections.push(`📝 Assignments — ${open.length} open`);
      sections.push(open.length
        ? open.slice(0, 8).map(item => `• ${compact(item.title, 100)}${item.due ? ` · due ${item.due}` : ''}`).join('\n')
        : '• None outstanding');
    } else if (category === 'flashcards') {
      const cards = data.cards || [];
      const due = cards.filter(card => Number(card.due) <= Date.now()).length;
      const reviewed = Number((data.cardStats || {})[date]) || 0;
      sections.push(`🧠 Flashcards — ${cards.length} cards · ${due} due · ${reviewed} reviewed today`);
    } else if (category === 'syllabus') {
      const courses = data.syllabus || [];
      sections.push('📖 Syllabus');
      sections.push(courses.length ? courses.slice(0, 8).map(course => {
        const topics = course.topics || [];
        const done = topics.filter(topic => topic.done).length;
        return `• ${compact(course.name, 80)} — ${done}/${topics.length} topics`;
      }).join('\n') : '• No courses added');
    } else if (category === 'notes') {
      const note = compact(data.notes, 1200);
      sections.push('🗒️ Quick Notes');
      sections.push(note || '• No notes saved');
    } else if (category === 'exams') {
      const exams = (data.exams || []).filter(exam => exam.date >= date)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      sections.push('🎯 Exam Countdown');
      sections.push(exams.length
        ? exams.slice(0, 8).map(exam => `• ${compact(exam.name, 80)} — ${exam.date}`).join('\n')
        : '• No upcoming exams');
    }
    sections.push('');
  });

  const message = sections.join('\n').trim();
  return message.length > 3900 ? message.slice(0, 3897) + '…' : message;
}

async function sendTelegramSummary(categories) {
  const data = await getLocalData([
    'telegramConfig', 'settings', 'stats', 'studyLog', 'routine',
    'assignments', 'cards', 'cardStats', 'syllabus', 'notes', 'exams'
  ]);
  const config = data.telegramConfig || {};
  const token = String(config.botToken || '').trim();
  const chatId = String(config.chatId || '').trim();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Enter a valid Telegram bot token in the Telegram panel.');
  if (!/^(?:-?\d+|@[A-Za-z0-9_]{5,})$/.test(chatId)) throw new Error('Enter a valid Telegram chat ID or channel username in the Telegram panel.');
  const selected = TELEGRAM_CATEGORIES.filter(category => categories.includes(category));
  if (!selected.length) throw new Error('Select at least one summary category.');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: makeDailySummary(data, selected) })
  });
  let result;
  try { result = await response.json(); } catch (error) {
    throw new Error(`Telegram returned an unreadable response (HTTP ${response.status}).`);
  }
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram could not send the summary (HTTP ${response.status}).`);
  }
}

async function findTelegramChatId() {
  const { telegramConfig = {} } = await getLocalData(['telegramConfig']);
  const token = String(telegramConfig.botToken || '').trim();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Save a valid Telegram bot token first.');
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  let result;
  try { result = await response.json(); } catch (error) {
    throw new Error(`Telegram returned an unreadable response (HTTP ${response.status}).`);
  }
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram could not look up the chat (HTTP ${response.status}).`);
  const updates = Array.isArray(result.result) ? result.result.slice().reverse() : [];
  const update = updates.find(item => {
    const message = item.message || item.channel_post || (item.callback_query && item.callback_query.message);
    return message && message.chat && message.chat.id != null;
  });
  if (!update) throw new Error('No chat found. Send /start to your bot, then try again.');
  const message = update.message || update.channel_post || update.callback_query.message;
  return String(message.chat.id);
}

async function scheduleTelegramSummary() {
  const data = await getLocalData(['telegramConfig']);
  const config = data.telegramConfig || {};
  if (!config.enabled) return;
  const nextSendAt = Number(config.nextSendAt) || Date.now() + DAY_MS;
  if (!config.nextSendAt) await setLocalData({ telegramConfig: { ...config, nextSendAt } });
  chrome.alarms.create(TELEGRAM_ALARM, { when: Math.max(Date.now() + 1000, nextSendAt) });
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== TELEGRAM_ALARM) return;
  try {
    const { telegramConfig = {} } = await getLocalData(['telegramConfig']);
    if (!telegramConfig.enabled) return;
    const categories = TELEGRAM_CATEGORIES.filter(category => (telegramConfig.categories || []).includes(category));
    await sendTelegramSummary(categories);
    notify('Daily Telegram summary sent ✅', 'Your selected Nova Tab study summary was sent.');
  } catch (error) {
    console.error('Could not send the scheduled Telegram summary:', error);
    notify('Telegram summary was not sent', compact(error.message, 180));
  } finally {
    const { telegramConfig = {} } = await getLocalData(['telegramConfig']);
    if (telegramConfig.enabled) {
      const nextSendAt = Date.now() + DAY_MS;
      await setLocalData({ telegramConfig: { ...telegramConfig, nextSendAt } });
      chrome.alarms.create(TELEGRAM_ALARM, { when: nextSendAt });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'nova:telegram-send') return;
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: 'Telegram requests must come from Nova Tab.' });
    return;
  }
  getLocalData(['telegramConfig']).then(({ telegramConfig = {} }) => {
    const categories = TELEGRAM_CATEGORIES.filter(category => (telegramConfig.categories || []).includes(category));
    return sendTelegramSummary(categories);
  }).then(
    () => sendResponse({ ok: true }),
    error => sendResponse({ ok: false, error: error.message || 'Telegram could not send the summary.' })
  );
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'nova:telegram-find-chat') return;
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: 'Telegram requests must come from Nova Tab.' });
    return;
  }
  findTelegramChatId().then(
    chatId => sendResponse({ ok: true, chatId }),
    error => sendResponse({ ok: false, error: error.message || 'Could not find the Telegram chat.' })
  );
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'nova:telegram-schedule') return;
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: 'Telegram requests must come from Nova Tab.' });
    return;
  }
  (async () => {
    const { enabled, categories } = message;
    if (enabled && (!Array.isArray(categories) || !categories.some(category => TELEGRAM_CATEGORIES.includes(category)))) {
      throw new Error('Select at least one category before enabling daily summaries.');
    }
    if (enabled) {
      const nextSendAt = Date.now() + DAY_MS;
      const { telegramConfig = {} } = await getLocalData(['telegramConfig']);
      await setLocalData({ telegramConfig: { ...telegramConfig, enabled: true, categories: TELEGRAM_CATEGORIES.filter(category => categories.includes(category)), nextSendAt } });
      chrome.alarms.create(TELEGRAM_ALARM, { when: nextSendAt });
    } else {
      const { telegramConfig = {} } = await getLocalData(['telegramConfig']);
      await setLocalData({ telegramConfig: { ...telegramConfig, enabled: false, nextSendAt: null } });
      await new Promise((resolve, reject) => chrome.alarms.clear(TELEGRAM_ALARM, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      }));
    }
    return { ok: true };
  })().then(sendResponse, error => sendResponse({ ok: false, error: error.message || 'Could not update the Telegram schedule.' }));
  return true;
});

async function restoreTelegramSummaryAlarm() {
  const { telegramConfig = {} } = await getLocalData(['telegramConfig']);
  if (!telegramConfig.enabled) return;
  chrome.alarms.get(TELEGRAM_ALARM, alarm => {
    if (chrome.runtime.lastError || alarm) return;
    scheduleTelegramSummary().catch(error => console.error('Could not restore the Telegram alarm:', error));
  });
}

chrome.runtime.onStartup.addListener(restoreTelegramSummaryAlarm);
chrome.runtime.onInstalled.addListener(restoreTelegramSummaryAlarm);

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'pomo:focus') {
    notify('Focus session complete 🎉', 'Great work! Time for a break. Open a new tab to continue.');
  } else if (alarm.name === 'pomo:short' || alarm.name === 'pomo:long') {
    notify('Break is over ⏰', 'Ready for the next focus session? Open a new tab to start.');
  } else if (alarm.name === 'focusEnd') {
    if (await endFocusIfExpired()) notify('Focus Mode finished ✅', 'Blocked sites are available again.');
  }
});

chrome.runtime.onStartup.addListener(endFocusIfExpired);
chrome.runtime.onInstalled.addListener(endFocusIfExpired);
