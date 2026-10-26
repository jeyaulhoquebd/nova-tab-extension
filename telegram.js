(() => {
  'use strict';
  const { $, el } = NT;
  const CATEGORIES = [
    ['focus', 'Focus Timer'],
    ['today', 'Today'],
    ['assignments', 'Assignments'],
    ['flashcards', 'Flashcards'],
    ['syllabus', 'Syllabus'],
    ['notes', 'Quick Notes'],
    ['exams', 'Exam Countdown']
  ];
  let config = { botToken: '', chatId: '', categories: [], enabled: false, nextSendAt: null };

  function request(type, extra = {}) {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        reject(new Error('Telegram messaging is available in the installed Nova Tab extension.'));
        return;
      }
      chrome.runtime.sendMessage({ type, ...extra }, response => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else if (!response || !response.ok) reject(new Error(response && response.error ? response.error : 'Telegram could not complete the request.'));
        else resolve(response);
      });
    });
  }

  function open() {
    const token = el('input', { type: 'password', autocomplete: 'off', placeholder: '123456789:ABC…' });
    token.value = config.botToken || '';
    const chatId = el('input', { type: 'text', autocomplete: 'off', placeholder: 'Chat ID or @channelname' });
    chatId.value = config.chatId || '';
    const status = el('p', { class: 'muted small', 'aria-live': 'polite' });
    const checks = new Map();
    const categoryList = el('div', { class: 'telegram-categories' }, CATEGORIES.map(([id, label]) => {
      const input = el('input', { type: 'checkbox' });
      input.checked = (config.categories || []).includes(id);
      const row = el('label', { class: 'telegram-category' }, input, el('span', { text: label }));
      checks.set(id, input);
      input.addEventListener('change', () => {
        if (config.enabled && !getCategories().length) {
          input.checked = true;
          status.textContent = 'Keep at least one category selected while daily summaries are enabled.';
          return;
        }
        saveConfig().catch(error => { status.textContent = error.message; });
      });
      return row;
    }));

    function getCategories() {
      return CATEGORIES.map(([id]) => id).filter(id => checks.get(id).checked);
    }
    async function saveConfig(enabled = config.enabled) {
      config = {
        ...config,
        botToken: token.value.trim(),
        chatId: chatId.value.trim(),
        categories: getCategories(),
        enabled
      };
      await NT.save({ telegramConfig: config });
    }
    function updateStatus() {
      status.textContent = config.enabled && config.nextSendAt
        ? `Daily summaries are on. Next send: ${new Date(config.nextSendAt).toLocaleString()}.`
        : 'Daily summaries are off.';
    }

    const saveButton = el('button', {
      type: 'button', class: 'btn ghost', text: 'Save settings', onclick: async () => {
        try {
          await saveConfig();
          updateStatus();
          NT.toast('Telegram settings saved on this device.');
        } catch (error) { status.textContent = error.message; }
      }
    });
    const findChatButton = el('button', {
      type: 'button', class: 'btn ghost', text: 'Find chat ID', onclick: async () => {
        findChatButton.disabled = true;
        findChatButton.textContent = 'Looking…';
        try {
          await saveConfig();
          const result = await request('nova:telegram-find-chat');
          chatId.value = result.chatId;
          await saveConfig();
          status.textContent = 'Chat ID found and saved.';
        } catch (error) {
          status.textContent = error.message;
        } finally {
          findChatButton.disabled = false;
          findChatButton.textContent = 'Find chat ID';
        }
      }
    });
    const automation = el('input', { type: 'checkbox', 'aria-label': 'Enable automatic daily Telegram summary' });
    automation.checked = config.enabled === true;
    automation.addEventListener('change', async () => {
      const enabled = automation.checked;
      if (enabled && !getCategories().length) {
        automation.checked = false;
        status.textContent = 'Select at least one category first.';
        return;
      }
      if (enabled && (!/^\d+:[A-Za-z0-9_-]+$/.test(token.value.trim()) || !/^(?:-?\d+|@[A-Za-z0-9_]{5,})$/.test(chatId.value.trim()))) {
        automation.checked = false;
        status.textContent = 'Enter and save a valid bot token and chat ID before enabling daily summaries.';
        return;
      }
      try {
        await saveConfig(enabled);
        await request('nova:telegram-schedule', { enabled, categories: getCategories() });
        const saved = (await NT.load(['telegramConfig'])).telegramConfig;
        config = { ...config, ...saved };
        updateStatus();
        NT.toast(enabled ? 'Automatic daily summaries start in 24 hours.' : 'Automatic summaries turned off.');
      } catch (error) {
        automation.checked = !enabled;
        config.enabled = !enabled;
        await NT.save({ telegramConfig: config });
        status.textContent = error.message;
      }
    });
    const sendButton = el('button', {
      type: 'button', class: 'btn primary', text: '✈️ Push today’s summary', onclick: async () => {
        sendButton.disabled = true;
        sendButton.textContent = 'Sending…';
        try {
          await saveConfig();
          await request('nova:telegram-send');
          NT.toast('Today’s summary sent to Telegram.');
          status.textContent = 'Today’s summary was sent.';
        } catch (error) {
          status.textContent = error.message;
          NT.toast(error.message);
        } finally {
          sendButton.disabled = false;
          sendButton.textContent = '✈️ Push today’s summary';
        }
      }
    });

    const root = el('div', {},
      el('p', { class: 'empty', text: 'Create a bot with @BotFather, send it a message, then enter its token and your chat ID. The bot must be allowed to message you.' }),
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Bot token' }), token),
      el('div', { class: 'btn-row' }, el('label', { class: 'field', style: 'flex:1' }, el('span', { class: 'field-label', text: 'Chat ID or channel username' }), chatId), findChatButton),
      el('p', { class: 'muted small' }, el('a', { href: 'https://t.me/BotFather', target: '_blank', rel: 'noopener noreferrer', text: 'Open BotFather' }), ' · To find a private chat ID, save your token, send /start to your bot, then select Find chat ID. Tokens stay on this device and are not included in Nova Tab backups.'),
      el('h3', { class: 'telegram-heading', text: 'Categories to send automatically' }),
      el('p', { class: 'muted small', text: 'The push button sends all seven categories. Daily automation sends only checked categories; Quick Notes includes your saved note text.' }),
      categoryList,
      el('label', { class: 'telegram-auto' }, automation, el('span', { text: 'Automatically send every 24 hours' })),
      status,
      el('div', { class: 'btn-row' }, saveButton, sendButton));
    updateStatus();
    NT.bigDialog('Telegram study summary', root);
  }

  NT.telegram = { open };
  NT.register(async () => {
    const result = await NT.load(['telegramConfig']);
    config = { ...config, ...(result.telegramConfig || {}) };
    $('btnTelegram').addEventListener('click', open);
  });
})();
