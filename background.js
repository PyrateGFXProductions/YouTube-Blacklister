// Background service worker for Always New To You - YouTube Blacklister
// Manages action badges and all-time blocking statistics

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'UPDATE_BADGE' && sender && sender.tab && sender.tab.id) {
    const count = Number(msg.count) || 0;
    const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    try {
      chrome.action.setBadgeText({ text, tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#d92323', tabId: sender.tab.id });
    } catch (e) {}
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'INCREMENT_BLOCKED') {
    const inc = Number(msg.inc) || 1;
    chrome.storage.local.get(['nyt_totalBlocked'], (res) => {
      const current = Number(res.nyt_totalBlocked) || 0;
      chrome.storage.local.set({ nyt_totalBlocked: current + inc });
    });
    sendResponse({ ok: true });
    return true;
  }
});
