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
