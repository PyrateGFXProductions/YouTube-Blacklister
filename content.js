/*
 * Always New To You - Smart Feed Blacklist (v1.8.0)
 * ---------------------------------------------------------------
 * Core mechanisms:
 *
 *  1) ROCK-SOLID LOCAL BLACKLIST ENGINE
 *     Hides matching video cards locally in the DOM with zero latency.
 *     Never touches YouTube's network layer.
 *     Never collapses or interferes with YouTube's watch page containers.
 *
 *  2) DOM RECYCLING & VIRTUAL SCROLLER AWARE
 *     Tracks signature per video rather than flat boolean flags, ensuring
 *     recycled elements are seamlessly evaluated when new content is swapped in.
 *
 *  3) SMOOTH NON-INTRUSIVE FEED REPLENISHMENT
 *     Gently prompts YouTube's scroll listeners without jumping or yanking the viewport.
 *
 *  4) STABLE POPUP & CONTEXT MENU INJECTION
 *     Monitors popup container mutations directly so the custom menu option
 *     never plays "hide-and-seek" and displays 100% reliably.
 *
 *  5) 1-CLICK QUICK-BLOCK WITH EVENT DELEGATION
 *     Guarded against link navigation and infinite DOM mutation loops.
 * ---------------------------------------------------------------
 */

// ------------------------------------------------------------------
// CONSTANTS & SELECTORS
// ------------------------------------------------------------------
const CUSTOM_MENU_LABEL = 'Blacklist Channel (Local)';
const CUSTOM_MENU_MARKER = 'nyt-ext-menu-item';

// Video cards only - NEVER include ytd-watch-flexy or ytd-watch-metadata!
const VIDEO_CARD_SELECTORS = [
  'ytd-rich-item-renderer',
  'ytd-rich-grid-media',
  'yt-lockup-view-model',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-reel-item-renderer',
  'yt-shorts-lockup-view-model',
  'ytd-playlist-video-renderer',
  'ytd-playlist-panel-video-renderer'
].join(', ');

const MENU_BUTTON_SELECTORS = [
  'ytd-menu-renderer button#button',
  'ytd-menu-renderer yt-icon-button',
  'button-view-model button',
  'yt-button-shape button',
  'button[aria-label*="Action menu" i]',
  'button[aria-label*="More actions" i]',
  'button[aria-label*="Actions" i]',
  'button[aria-haspopup="menu"]',
  'button[aria-haspopup="true"]',
  '.dropdown-trigger'
].join(', ');

const DEBUG = false;
function dbg(...args) { if (DEBUG) try { console.log('[NewToYouExt]', ...args); } catch (_) {} }
function dbgWarn(...args) { if (DEBUG) try { console.warn('[NewToYouExt]', ...args); } catch (_) {} }

// ------------------------------------------------------------------
// SAFE RUNTIME & EXTENSION CONTEXT HELPERS
// ------------------------------------------------------------------
function isExtensionValid() {
  try {
    return Boolean(typeof chrome !== 'undefined' && chrome?.runtime?.id);
  } catch (_) {
    return false;
  }
}

function safeSendRuntimeMessage(msg) {
  if (!isExtensionValid()) return;
  try {
    chrome.runtime.sendMessage(msg, () => {
      if (chrome.runtime?.lastError) { /* consume to prevent unhandled rejection */ }
    });
  } catch (_) {}
}

// ------------------------------------------------------------------
// SETTINGS & STATE
// ------------------------------------------------------------------
let settings = {
  channels: [],
  keywords: [],
  whitelistChannels: [],
  blockShorts: false,
  blockCommunity: false,
  enableQuickBlock: true,
  triggerServerFeedback: false,
  aiAutonomous: false,
  aiSensitivity: 'balanced',
  aiModel: '',
  aiTastePrompt: '',
  aiDebaitTitles: false,
  aiDebaitModel: '',
  tldwEnabled: true,
  huntMode: false
};

let activeMenuVideoCard = null;
let lastSeedTime = 0;
let lastBadgeCount = -1;
let processTimer = null;
let menuObserver = null;

function loadSettings() {
  return new Promise((resolve) => {
    if (!isExtensionValid()) { resolve(); return; }
    try {
      chrome.storage.local.get([
        'channels',
        'keywords',
        'whitelistChannels',
        'blockShorts',
        'blockCommunity',
        'enableQuickBlock',
        'triggerServerFeedback',
        'aiAutonomous',
        'aiSensitivity',
        'aiModel',
        'aiTastePrompt',
        'aiDebaitTitles',
        'aiDebaitModel',
        'tldwEnabled',
        'huntMode'
      ], (res) => {
        if (chrome.runtime?.lastError) { resolve(); return; }
        settings.channels = Array.isArray(res.channels) ? res.channels : settings.channels;
        settings.keywords = Array.isArray(res.keywords) ? res.keywords : settings.keywords;
        settings.whitelistChannels = Array.isArray(res.whitelistChannels)
          ? res.whitelistChannels : settings.whitelistChannels;
        settings.blockShorts = Boolean(res.blockShorts);
        settings.blockCommunity = Boolean(res.blockCommunity);
        settings.enableQuickBlock = res.enableQuickBlock !== false;
        settings.triggerServerFeedback = Boolean(res.triggerServerFeedback);
        settings.aiAutonomous = Boolean(res.aiAutonomous);
        settings.aiSensitivity = res.aiSensitivity || 'balanced';
        settings.aiModel = res.aiModel || '';
        settings.aiTastePrompt = res.aiTastePrompt || '';
        settings.aiDebaitTitles = Boolean(res.aiDebaitTitles);
        settings.aiDebaitModel = res.aiDebaitModel || settings.aiModel || '';
        settings.tldwEnabled = res.tldwEnabled !== false;
        settings.huntMode = Boolean(res.huntMode);

        injectBlacklistStyles();
        try { syncHuntMode(); } catch (_) {}
        resolve();
      });
    } catch (_) {
      resolve();
    }
  });
}

function saveSettings() {
  if (!isExtensionValid()) return;
  try {
    chrome.storage.local.set({
      channels: settings.channels,
      keywords: settings.keywords,
      whitelistChannels: settings.whitelistChannels,
      blockShorts: settings.blockShorts,
      blockCommunity: settings.blockCommunity,
      enableQuickBlock: settings.enableQuickBlock,
      triggerServerFeedback: settings.triggerServerFeedback
    });
  } catch (_) {}
}

function isHomePath() {
  const p = window.location.pathname;
  return p === '/' || p === '';
}

// ------------------------------------------------------------------
// DYNAMIC CSS INJECTION
// ------------------------------------------------------------------
function injectBlacklistStyles() {
  try {
    let style = document.getElementById('nyt-blacklist-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'nyt-blacklist-styles';
      (document.head || document.documentElement).appendChild(style);
    }

    let extraRules = '';
    if (settings.blockShorts) {
      extraRules += `
        ytd-rich-shelf-renderer[is-shorts],
        ytd-reel-shelf-renderer,
        ytd-reel-item-renderer,
        yt-shorts-lockup-view-model,
        ytd-rich-item-renderer:has(ytd-reel-item-renderer),
        ytd-rich-item-renderer:has(yt-shorts-lockup-view-model) {
          display: none !important;
        }
      `;
    }
    if (settings.blockCommunity) {
      extraRules += `
        ytd-backstage-post-renderer,
        yt-post-item-view-model,
        ytd-post-renderer,
        ytd-rich-item-renderer:has(ytd-backstage-post-renderer),
        ytd-rich-item-renderer:has(yt-post-item-view-model) {
          display: none !important;
        }
      `;
    }

    style.textContent = `
      [data-hidden-by-local-blacklist="true"],
      ytd-rich-item-renderer[data-hidden-by-local-blacklist="true"],
      yt-lockup-view-model[data-hidden-by-local-blacklist="true"],
      ytd-video-renderer[data-hidden-by-local-blacklist="true"],
      ytd-compact-video-renderer[data-hidden-by-local-blacklist="true"],
      ytd-grid-video-renderer[data-hidden-by-local-blacklist="true"],
      ytd-reel-item-renderer[data-hidden-by-local-blacklist="true"],
      yt-shorts-lockup-view-model[data-hidden-by-local-blacklist="true"],
      ytd-playlist-video-renderer[data-hidden-by-local-blacklist="true"] {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        overflow: hidden !important;
      }
      .nyt-quick-block-btn {
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 999;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(18, 18, 18, 0.85);
        color: #ff4e4e;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(4px);
        box-shadow: 0 2px 6px rgba(0,0,0,0.5);
      }
      .nyt-quick-block-btn:hover {
        background: #d92323 !important;
        color: #ffffff !important;
        transform: scale(1.1);
        border-color: #ffffff;
      }
      ytd-rich-item-renderer:hover .nyt-quick-block-btn,
      yt-lockup-view-model:hover .nyt-quick-block-btn,
      ytd-video-renderer:hover .nyt-quick-block-btn,
      ytd-compact-video-renderer:hover .nyt-quick-block-btn,
      ytd-grid-video-renderer:hover .nyt-quick-block-btn {
        opacity: 0.92;
      }
      ${getAiFeatureCss()}
      ${extraRules}
    `;
  } catch (_) {}
}

// ------------------------------------------------------------------
// AI FEATURE STYLES (De-Baiter badge + TL;DW inspector & modal)
// ------------------------------------------------------------------
function getAiFeatureCss() {
  return `
      .nyt-debait-badge {
        display: inline-block;
        margin-right: 3px;
        cursor: pointer;
        font-size: 0.85em;
        opacity: 0.72;
        transition: opacity 0.15s ease, transform 0.15s ease;
        user-select: none;
        color: #ffd76e;
      }
      .nyt-debait-badge:hover {
        opacity: 1;
        transform: scale(1.18);
      }
      .nyt-tldw-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 999;
        background: rgba(18, 18, 18, 0.85);
        color: #7be2ff;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 18px;
        padding: 5px 10px;
        font-size: 11px;
        font-weight: 700;
        font-family: Roboto, Arial, sans-serif;
        display: flex;
        align-items: center;
        gap: 4px;
        opacity: 0;
        backdrop-filter: blur(4px);
        box-shadow: 0 2px 6px rgba(0,0,0,0.5);
        transition: opacity 0.15s ease, transform 0.15s ease, background-color 0.15s ease;
        cursor: pointer;
        pointer-events: auto;
      }
      .nyt-tldw-btn:hover {
        background: rgba(43, 160, 255, 0.92);
        color: #fff;
        border-color: #ffffff;
        transform: scale(1.06);
      }
      ytd-rich-item-renderer:hover .nyt-tldw-btn,
      yt-lockup-view-model:hover .nyt-tldw-btn,
      ytd-video-renderer:hover .nyt-tldw-btn,
      ytd-compact-video-renderer:hover .nyt-tldw-btn,
      ytd-grid-video-renderer:hover .nyt-tldw-btn {
        opacity: 0.95;
      }
      .nyt-tldw-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        background: rgba(0, 0, 0, 0.55);
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(6px);
        padding: 20px;
        box-sizing: border-box;
      }
      .nyt-tldw-modal {
        width: min(520px, 100%);
        max-height: 82vh;
        overflow-y: auto;
        box-sizing: border-box;
        background: rgba(18, 18, 22, 0.85);
        border: 1px solid rgba(123, 226, 255, 0.28);
        border-radius: 16px;
        padding: 18px;
        font-family: Roboto, Arial, sans-serif;
        color: #f1f1f1;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7);
        position: relative;
      }
      .nyt-tldw-scan {
        position: relative;
        height: 3px;
        background: rgba(123, 226, 255, 0.12);
        border-radius: 2px;
        overflow: hidden;
        margin: 14px 0;
      }
      .nyt-tldw-scan::after {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        width: 40%;
        background: linear-gradient(90deg, transparent, #7be2ff, transparent);
        animation: nyt-tldw-scan 1.15s linear infinite;
      }
      @keyframes nyt-tldw-scan {
        0% { left: -40%; }
        100% { left: 100%; }
      }
      .nyt-tldw-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      .nyt-tldw-title {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.35;
        margin: 0;
        color: #fff;
      }
      .nyt-tldw-meta {
        font-size: 11.5px;
        color: #9aa3b2;
        margin-top: 4px;
      }
      .nyt-tldw-verdict {
        margin: 12px 0;
        padding: 10px 12px;
        border-radius: 10px;
        font-size: 12.5px;
        line-height: 1.45;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }
      .nyt-tldw-verdict.clickbait {
        background: rgba(255, 61, 61, 0.14);
        border-color: rgba(255, 61, 61, 0.4);
        color: #ff9a9a;
      }
      .nyt-tldw-verdict.partial {
        background: rgba(255, 193, 7, 0.12);
        border-color: rgba(255, 193, 7, 0.4);
        color: #ffd76e;
      }
      .nyt-tldw-verdict.clean {
        background: rgba(43, 166, 64, 0.14);
        border-color: rgba(43, 166, 64, 0.4);
        color: #7ee29a;
      }
      .nyt-tldw-verdict.dim {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.14);
        color: #c8cdd6;
      }
      .nyt-tldw-takeaways {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .nyt-tldw-takeaways li {
        font-size: 12.5px;
        line-height: 1.45;
        padding-left: 18px;
        position: relative;
        color: #e4e8ee;
      }
      .nyt-tldw-takeaways li::before {
        content: '▸';
        position: absolute;
        left: 0;
        color: #7be2ff;
      }
      .nyt-tldw-stats {
        display: flex;
        gap: 10px;
        margin: 12px 0;
        flex-wrap: wrap;
      }
      .nyt-tldw-stat {
        flex: 1;
        min-width: 90px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 8px 10px;
        text-align: center;
        font-size: 11px;
        color: #9aa3b2;
      }
      .nyt-tldw-stat strong {
        display: block;
        font-size: 15px;
        color: #fff;
        margin-top: 2px;
      }
      .nyt-tldw-actions {
        display: flex;
        gap: 8px;
        margin-top: 14px;
        flex-wrap: wrap;
      }
      .nyt-tldw-action {
        border: none;
        border-radius: 8px;
        padding: 8px 14px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        font-family: Roboto, Arial, sans-serif;
        transition: opacity 0.15s, transform 0.15s;
      }
      .nyt-tldw-action:hover { opacity: 0.9; transform: translateY(-1px); }
      .nyt-tldw-block {
        background: #d92323;
        color: #fff;
      }
      .nyt-tldw-close {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
      }
      .nyt-tldw-pill {
        display: inline-block;
        background: rgba(123, 226, 255, 0.15);
        border: 1px solid rgba(123, 226, 255, 0.35);
        color: #7be2ff;
        border-radius: 10px;
        padding: 2px 8px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.3px;
        margin-right: 6px;
        vertical-align: 2px;
      }
  `;
}

// ------------------------------------------------------------------
// NORMALIZATION & EXTRACTION UTILITIES
// ------------------------------------------------------------------
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanChannelText(str) {
  if (!str) return '';
  try {
    return String(str)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\bverified\b/gi, '')
      .replace(/[•✔✓]/g, '')
      .trim();
  } catch (_) {
    return String(str).replace(/\s+/g, ' ').trim();
  }
}

function normalizeChannel(name) {
  return cleanChannelText(name).toLowerCase().replace(/^@+/, '');
}

function isViewCountOrTimeText(text) {
  if (!text) return true;
  const s = text.trim().toLowerCase();
  return /^\d+(\.\d+)?[kmb]?\s*(views?|watching)?$/i.test(s) ||
         /^(streamed\s+)?\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i.test(s) ||
         /^live$/i.test(s);
}

function hasWordBoundaryKeyword(text, keyword) {
  if (!text || !keyword) return false;
  if (keyword.startsWith('/') && keyword.lastIndexOf('/') > 0) {
    try {
      const lastSlash = keyword.lastIndexOf('/');
      const pattern = keyword.slice(1, lastSlash);
      const flags = keyword.slice(lastSlash + 1) || 'i';
      return new RegExp(pattern, flags).test(text);
    } catch (_) {}
  }
  try {
    const cleanKw = cleanChannelText(keyword);
    const cleanT = cleanChannelText(text);
    return new RegExp(`\\b${escapeRegExp(cleanKw)}\\b`, 'i').test(cleanT);
  } catch (_) {
    return text.toLowerCase().includes(keyword.toLowerCase());
  }
}

function extractEntityKey(str) {
  if (!str) return '';
  const s = String(str).trim();
  if (s.includes('youtu.be/')) {
    const vid = s.split('youtu.be/')[1].split('?')[0].split('/')[0].split('&')[0];
    if (vid) return vid.toLowerCase();
  }
  if (s.includes('watch?v=') || s.includes('watch?')) {
    const match = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (match) return match[1].toLowerCase();
  }
  if (s.includes('/shorts/')) {
    const match = s.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1].toLowerCase();
  }
  if (s.includes('/channel/')) {
    const cid = s.split('/channel/')[1].split('?')[0].split('/')[0];
    if (cid) return cid.toLowerCase();
  }
  if (s.includes('/@')) {
    const handle = s.split('/@')[1].split('?')[0].split('/')[0];
    if (handle) return handle.toLowerCase();
  }
  return normalizeChannel(s);
}

function extractChannelNamesFromByline(text) {
  if (!text) return [];
  const clean = cleanChannelText(text);
  const names = new Set();
  names.add(clean);

  const andMoreMatch = clean.match(/^(.+?)(?:,|\s+)\s*(?:and|&)\s+\d+\s+more$/i);
  if (andMoreMatch) {
    const main = andMoreMatch[1].trim();
    if (main) names.add(main);
  }

  const parts = clean
    .replace(/(?:,|\s+)\s*(?:and|&)\s+\d+\s+more$/i, '')
    .split(/,\s*(?:and|&)\s*|\s+(?:and|&)\s*|,\s*/i);

  for (const part of parts) {
    const trimmed = cleanChannelText(part);
    if (trimmed && !/^\d+\s+more$/i.test(trimmed) && trimmed.length > 1) {
      names.add(trimmed);
    }
  }

  return Array.from(names);
}

// Extract Video ID directly from card without ever falling back to current watch page
function getVideoId(card) {
  if (!card) return '';
  if (card.dataset?.videoId) return card.dataset.videoId;
  if (card.getAttribute?.('data-video-id')) return card.getAttribute('data-video-id');

  const a = card.querySelector?.(
    'a[href*="watch?v="], a[href*="/shorts/"], a[href*="youtu.be/"], a#thumbnail, a#video-title-link, a#video-title'
  );
  if (a) {
    const href = a.getAttribute('href') || '';
    const match = href.match(/(?:watch\?v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
  }

  if (card.data?.contentId) return card.data.contentId;
  if (card.__data?.contentId) return card.__data.contentId;

  return '';
}

function getVideoTitle(card) {
  if (!card) return '';
  const el = card.querySelector?.(
    '#video-title, yt-formatted-string#title, a#video-title-link, ' +
    '.yt-lockup-metadata-view-model-wiz__heading-reset a, ' +
    '.yt-lockup-metadata-view-model-wiz__title, ' +
    'h3.yt-lockup-metadata-view-model-wiz__heading-reset'
  );
  return el ? el.textContent.trim() : '';
}

function getChannelName(card) {
  if (!card) return '';
  const candidates = card.querySelectorAll?.(
    '#owner ytd-channel-name a, #owner #channel-name a, #owner #channel-name, ' +
    'ytd-video-owner-renderer #channel-name, #owner ytd-channel-name #text, ' +
    'yt-content-metadata-view-model .yt-content-metadata-view-model-wiz__metadata-row:first-child a, ' +
    'yt-content-metadata-view-model a[href*="/@"], yt-content-metadata-view-model a[href*="/channel/"], ' +
    'yt-content-metadata-view-model a[href*="/c/"], yt-content-metadata-view-model a[href*="/user/"], ' +
    'yt-content-metadata-view-model .yt-content-metadata-view-model-wiz__metadata-row:first-child, ' +
    '#channel-name #text, #channel-name a, #channel-name, ' +
    '#byline a, #byline, .ytd-channel-name a, .ytd-channel-name, ' +
    '#text.ytd-channel-name, yt-content-metadata-view-model #channel-name a, ' +
    'a[href*="/@"]'
  ) || [];

  for (const el of candidates) {
    const t = cleanChannelText(el.textContent);
    if (t && !isViewCountOrTimeText(t)) {
      const decomp = extractChannelNamesFromByline(t);
      if (decomp.length > 1) return decomp[1];
      return t;
    }
    const title = el.getAttribute('title') || el.getAttribute('aria-label') || '';
    const cleaned = cleanChannelText(title.replace(/^go to channel\s+/i, ''));
    if (cleaned && !isViewCountOrTimeText(cleaned)) return cleaned;
  }

  const anyChannelAnchor = card.querySelector?.('a[href*="/@"], a[href*="/channel/"], a[href*="/c/"], a[href*="/user/"]');
  if (anyChannelAnchor) {
    const t = cleanChannelText(anyChannelAnchor.textContent);
    if (t && !isViewCountOrTimeText(t)) return t;
    const title = anyChannelAnchor.getAttribute('title') || anyChannelAnchor.getAttribute('aria-label') || '';
    const cleaned = cleanChannelText(title.replace(/^go to channel\s+/i, ''));
    if (cleaned && !isViewCountOrTimeText(cleaned)) return cleaned;
  }

  return '';
}

function getCardChannelKeys(card) {
  const keys = new Set();
  if (!card) return [];

  const rawCandidates = card.querySelectorAll ? card.querySelectorAll(
    '#owner ytd-channel-name, #owner #channel-name, ' +
    'ytd-video-owner-renderer #channel-name, ytd-channel-name, ' +
    'yt-content-metadata-view-model .yt-content-metadata-view-model-wiz__metadata-row:first-child, ' +
    'yt-content-metadata-view-model .yt-content-metadata-view-model-wiz__metadata-text, ' +
    '#channel-name, #byline, .ytd-channel-name, #text.ytd-channel-name'
  ) : [];

  for (const c of rawCandidates) {
    const t = cleanChannelText(c.textContent);
    if (t && !isViewCountOrTimeText(t)) {
      keys.add(normalizeChannel(t));
      const decomp = extractChannelNamesFromByline(t);
      for (const d of decomp) keys.add(normalizeChannel(d));
    }
  }

  const name = getChannelName(card);
  if (name && !isViewCountOrTimeText(name)) {
    keys.add(normalizeChannel(name));
    const decomp = extractChannelNamesFromByline(name);
    for (const d of decomp) keys.add(normalizeChannel(d));
  }

  const vid = getVideoId(card);
  if (vid) {
    const vidLower = vid.toLowerCase();
    keys.add(vidLower);
  }

  if (card.querySelectorAll) {
    const anchors = card.querySelectorAll('a[href*="/@"], a[href*="/channel/"], a[href*="/c/"], a[href*="/user/"]');
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (href.includes('/@')) {
        const handle = href.split('/@')[1].split('/')[0].split('?')[0];
        if (handle) {
          keys.add(normalizeChannel(handle));
          keys.add(normalizeChannel('@' + handle));
        }
      }
      if (href.includes('/channel/')) {
        const cid = href.split('/channel/')[1].split('/')[0].split('?')[0];
        if (cid) keys.add(normalizeChannel(cid));
      }
      if (href.includes('/c/')) {
        const cname = href.split('/c/')[1].split('/')[0].split('?')[0];
        if (cname) keys.add(normalizeChannel(cname));
      }
      if (href.includes('/user/')) {
        const uname = href.split('/user/')[1].split('/')[0].split('?')[0];
        if (uname) keys.add(normalizeChannel(uname));
      }
      const title = a.getAttribute('title') || a.getAttribute('aria-label') || '';
      if (title) {
        const cleaned = cleanChannelText(title.replace(/^go to channel\s+/i, ''));
        if (cleaned && !isViewCountOrTimeText(cleaned)) {
          keys.add(normalizeChannel(cleaned));
          const decomp = extractChannelNamesFromByline(cleaned);
          for (const d of decomp) keys.add(normalizeChannel(d));
        }
      }
      const anchorText = cleanChannelText(a.textContent);
      if (anchorText && !isViewCountOrTimeText(anchorText)) {
        keys.add(normalizeChannel(anchorText));
      }
    }
  }

  return Array.from(keys);
}

function channelMatches(card, list) {
  if (!card || !Array.isArray(list) || !list.length) return false;
  const cardKeys = getCardChannelKeys(card);
  if (!cardKeys.length) return false;

  return list.some((c) => {
    const rawNorm = normalizeChannel(c);
    const entityKey = extractEntityKey(c);
    if (!rawNorm && !entityKey) return false;

    if (rawNorm && cardKeys.includes(rawNorm)) return true;
    if (entityKey && cardKeys.includes(entityKey)) return true;

    const noAt = rawNorm.replace(/^@/, '');
    for (const k of cardKeys) {
      if (k.replace(/^@/, '') === noAt) return true;
    }
    return false;
  });
}

// ------------------------------------------------------------------
// CARD EVALUATION & REVERSIBLE HIDING
// ------------------------------------------------------------------
function hideCardElement(card) {
  if (!card) return;

  card.dataset.hiddenByLocalBlacklist = 'true';
  card.style.setProperty('display', 'none', 'important');
  card.style.setProperty('visibility', 'hidden', 'important');
  card.style.setProperty('height', '0px', 'important');
  card.style.setProperty('min-height', '0px', 'important');
  card.style.setProperty('margin', '0px', 'important');
  card.style.setProperty('padding', '0px', 'important');
  card.style.setProperty('overflow', 'hidden', 'important');

  // If card is inside a grid slot (e.g. ytd-rich-item-renderer), collapse that grid slot
  const outer = card.parentElement ? card.parentElement.closest(
    'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytd-playlist-video-renderer'
  ) : null;

  if (outer && outer !== card) {
    outer.dataset.hiddenByLocalBlacklist = 'true';
    outer.style.setProperty('display', 'none', 'important');
    outer.style.setProperty('height', '0px', 'important');
    outer.style.setProperty('min-height', '0px', 'important');
    outer.style.setProperty('margin', '0px', 'important');
    outer.style.setProperty('padding', '0px', 'important');
  }
}

function unhideCardElement(card) {
  if (!card) return;
  if (card.dataset.hiddenByLocalBlacklist !== 'true') return;

  delete card.dataset.hiddenByLocalBlacklist;
  card.style.removeProperty('display');
  card.style.removeProperty('visibility');
  card.style.removeProperty('height');
  card.style.removeProperty('min-height');
  card.style.removeProperty('margin');
  card.style.removeProperty('padding');
  card.style.removeProperty('overflow');

  const outer = card.parentElement ? card.parentElement.closest(
    'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytd-playlist-video-renderer'
  ) : null;

  if (outer && outer !== card) {
    delete outer.dataset.hiddenByLocalBlacklist;
    outer.style.removeProperty('display');
    outer.style.removeProperty('height');
    outer.style.removeProperty('min-height');
    outer.style.removeProperty('margin');
    outer.style.removeProperty('padding');
  }
}

function evaluateCard(card) {
  const title = getVideoTitle(card);
  const cardKeys = getCardChannelKeys(card);
  const channel = getChannelName(card);
  const vid = getVideoId(card);

  const resolved = Boolean(title || cardKeys.length || channel || vid);
  if (!resolved) {
    return { hidden: false, reason: null, resolved: false };
  }

  // Whitelist always overrides blacklists
  if (channelMatches(card, settings.whitelistChannels)) {
    return { hidden: false, reason: null, resolved: true };
  }

  // Channel blacklist
  if (channelMatches(card, settings.channels)) {
    return { hidden: true, reason: `channel:${channel || cardKeys[0]}`, resolved: true };
  }

  // Direct Video ID or Video URL blacklist
  if (vid && settings.channels.some(c => {
    const ek = extractEntityKey(c);
    return ek && ek === vid.toLowerCase();
  })) {
    return { hidden: true, reason: `video:${vid}`, resolved: true };
  }

  // Word-boundary title keywords or regex
  if (title && settings.keywords.some(kw => hasWordBoundaryKeyword(title, kw))) {
    return { hidden: true, reason: `keyword in "${title}"`, resolved: true };
  }

  return { hidden: false, reason: null, resolved: true };
}

// ------------------------------------------------------------------
// WATCH PAGE INTEGRITY GUARD
// ------------------------------------------------------------------
function checkCurrentWatchPageVideo() {
  if (!window.location.pathname.startsWith('/watch')) return;

  try {
    const params = new URLSearchParams(window.location.search);
    const currentVid = params.get('v');
    if (!currentVid) return;

    const vidLower = currentVid.toLowerCase();
    const isVidBlacklisted = settings.channels.some(c => extractEntityKey(c) === vidLower);

    const titleEl = document.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata, #title h1');
    const title = titleEl ? titleEl.textContent.trim() : '';

    const channelEl = document.querySelector('ytd-watch-metadata #owner ytd-channel-name a, ytd-watch-metadata #channel-name a, #owner #channel-name a');
    const channel = channelEl ? cleanChannelText(channelEl.textContent) : '';
    const normChannel = normalizeChannel(channel);

    // Whitelist check
    if (settings.whitelistChannels.some(w => normalizeChannel(w) === normChannel)) {
      return;
    }

    const isChannelBlacklisted = normChannel && settings.channels.some(c => normalizeChannel(c) === normChannel || extractEntityKey(c) === normChannel);
    const isKeywordMatched = title && settings.keywords.some(kw => hasWordBoundaryKeyword(title, kw));

    if (isVidBlacklisted || isChannelBlacklisted || isKeywordMatched) {
      try {
        const video = document.querySelector('video');
        if (video) video.pause();
      } catch (_) {}

      showToast(`Blacklisted video detected: ${channel || title || currentVid}`);
      setTimeout(() => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = 'https://www.youtube.com/';
        }
      }, 700);
    }
  } catch (_) {}
}

// ------------------------------------------------------------------
// FEED PROCESSING ENGINE
// ------------------------------------------------------------------
function processFeed(force = false) {
  const cards = document.querySelectorAll(VIDEO_CARD_SELECTORS);
  let hiddenCount = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card) continue;

    const vid = getVideoId(card);
    const channel = getChannelName(card);
    const title = getVideoTitle(card);
    const sig = `${vid}|${channel}|${title}`;

    if (!force && card.dataset.lastSignature === sig) {
      if (card.dataset.hiddenByLocalBlacklist === 'true') {
        card.style.setProperty('display', 'none', 'important');
      }
      continue;
    }

    const { hidden, reason, resolved } = evaluateCard(card);
    if (hidden) {
      hideCardElement(card);
      hiddenCount++;
      dbg('Locally hidden:', reason);
    } else {
      unhideCardElement(card);
    }

    if (resolved) {
      card.dataset.lastSignature = sig;
    }
  }

  // End-screen cards on watch page
  if (window.location.pathname.startsWith('/watch')) {
    document.querySelectorAll('.ytp-ce-element').forEach(el => {
      const link = el.querySelector('a');
      if (link) {
        const href = link.getAttribute('href') || '';
        const vid = extractEntityKey(href);
        if (vid && settings.channels.some(c => extractEntityKey(c) === vid)) {
          el.style.setProperty('display', 'none', 'important');
        }
      }
    });

    checkCurrentWatchPageVideo();
  } else if (settings.aiAutonomous) {
    scheduleAiEvaluation();
  }

  // Update badge count safely only when count changes
  try {
    const totalHidden = document.querySelectorAll('[data-hidden-by-local-blacklist="true"]').length;
    if (totalHidden !== lastBadgeCount) {
      lastBadgeCount = totalHidden;
      safeSendRuntimeMessage({ type: 'UPDATE_BADGE', count: totalHidden });
    }
  } catch (_) {}

  // Gentle feed replenishment if visible cards drop below 4 on home feed
  if (isHomePath() && hiddenCount > 0) {
    checkFeedReplenishment(cards);
  }

  // AI Title De-Baiter pass (throttled)
  if (settings.aiDebaitTitles) {
    scheduleDebaitPass();
  }

  return hiddenCount;
}

// ------------------------------------------------------------------
// AUTONOMOUS AI SLOP INTERCEPTOR
// ------------------------------------------------------------------
let aiBatchPending = false;
let aiEvalTimer = null;

function scheduleAiEvaluation() {
  if (!settings.aiAutonomous) return;
  if (aiEvalTimer) clearTimeout(aiEvalTimer);
  aiEvalTimer = setTimeout(() => {
    runAiEvaluationBatch();
  }, 1200);
}

function runAiEvaluationBatch() {
  if (!settings.aiAutonomous || aiBatchPending) return;
  const cards = document.querySelectorAll(VIDEO_CARD_SELECTORS);
  const candidates = [];

  for (let i = 0; i < cards.length && candidates.length < 6; i++) {
    const card = cards[i];
    if (card.dataset.hiddenByLocalBlacklist === 'true') continue;
    if (card.dataset.aiEvaluated === 'true') continue;

    const vid = getVideoId(card);
    const title = getVideoTitle(card);
    const channel = getChannelName(card);
    if (!title || title.length < 5) continue;

    card.dataset.aiEvaluated = 'true';
    candidates.push({ card, id: vid || title, title, channel });
  }

  if (!candidates.length) return;

  aiBatchPending = true;
  safeSendRuntimeMessage({
    type: 'AI_EVALUATE_BATCH',
    videos: candidates.map(c => ({ id: c.id, title: c.title, channel: c.channel })),
    persona: settings.aiTastePrompt,
    sensitivity: settings.aiSensitivity,
    modelChoice: settings.aiModel
  }, (res) => {
    aiBatchPending = false;
    if (!res || !Array.isArray(res.evaluations)) return;

    res.evaluations.forEach(ev => {
      if (ev && ev.block) {
        const match = candidates.find(c => c.id === ev.id);
        if (match && match.card && match.card.isConnected && match.card.dataset.hiddenByLocalBlacklist !== 'true') {
          hideCardElement(match.card);
          match.card.dataset.hiddenByAi = 'true';
          safeSendRuntimeMessage({ type: 'INCREMENT_BLOCKED', inc: 1 });

          // Record in aiLog in storage
          try {
            chrome.storage.local.get(['aiLog'], (store) => {
              const logs = Array.isArray(store.aiLog) ? store.aiLog : [];
              logs.unshift({
                title: match.title,
                channel: match.channel,
                rationale: ev.rationale || 'Flagged by AI Guardian',
                date: new Date().toISOString()
              });
              chrome.storage.local.set({ aiLog: logs.slice(0, 30) });
            });
          } catch (_) {}

          showToast(`🤖 AI Intercepted: "${match.title.slice(0, 35)}..." (${ev.rationale || 'Filtered'})`, () => {
            unhideCardElement(match.card);
            match.card.dataset.hiddenByAi = 'false';
            delete match.card.dataset.lastSignature;
            safeSendRuntimeMessage({ type: 'INCREMENT_BLOCKED', inc: -1 });
          });
        }
      }
    });
  });
}

function getVisibleCardCount(cards) {
  let count = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (c.dataset.hiddenByLocalBlacklist !== 'true' && c.style.display !== 'none' && c.offsetHeight > 0) {
      count++;
    }
  }
  return count;
}

function checkFeedReplenishment(cards) {
  const now = Date.now();
  if (now - lastSeedTime < 4000) return;

  const visible = getVisibleCardCount(cards);
  if (visible < 4 && document.body.offsetHeight < window.innerHeight * 2.5) {
    lastSeedTime = now;
    // Dispatch a subtle scroll event without jumping or moving the user's viewport
    window.dispatchEvent(new Event('scroll'));
    window.scrollBy({ top: 1, behavior: 'instant' });
    window.scrollBy({ top: -1, behavior: 'instant' });
  }
}

// ------------------------------------------------------------------
// 1-CLICK QUICK-BLOCK (EVENT DELEGATED HOVER BUTTON & KEYBOARD 'B')
// ------------------------------------------------------------------
let hoveredVideoCard = null;

document.addEventListener('mouseover', (e) => {
  const target = e.target;
  if (!target || !target.closest) return;

  const card = target.closest(VIDEO_CARD_SELECTORS);
  if (card && card.dataset.hiddenByLocalBlacklist !== 'true') {
    hoveredVideoCard = card;
  }

  if (!card || card.dataset.hiddenByLocalBlacklist === 'true') return;

  const thumb = card.querySelector(
    'ytd-thumbnail, #thumbnail, a#thumbnail, .yt-lockup-view-model-wiz__thumbnail, yt-thumbnail-view-model'
  );
  if (!thumb) return;

  try {
    const pos = window.getComputedStyle(thumb).position;
    if (pos === 'static') {
      thumb.style.position = 'relative';
    }
  } catch (_) {}

  if (settings.enableQuickBlock !== false && !card.querySelector('.nyt-quick-block-btn')) {
    const btn = document.createElement('div');
    btn.className = 'nyt-quick-block-btn';
    btn.setAttribute('title', 'Blacklist Channel (1-Click or press B)');
    btn.setAttribute('role', 'button');
    btn.innerHTML = `
      <svg height="16" viewBox="0 0 24 24" width="16" focusable="false" style="fill:currentColor;pointer-events:none;">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/>
      </svg>
    `;

    const stopNav = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    };

    btn.addEventListener('pointerdown', stopNav, true);
    btn.addEventListener('mousedown', stopNav, true);
    btn.addEventListener('click', (ev) => {
      stopNav(ev);
      blacklistActiveChannel(card);
    }, true);

    thumb.appendChild(btn);
  }

  if (settings.huntMode && !card.querySelector('.nyt-hunt-prey')) {
    huntAddPrey(card, thumb);
  }

  if (settings.tldwEnabled !== false && !card.querySelector('.nyt-tldw-btn')) {
    const tldwBtn = document.createElement('div');
    tldwBtn.className = 'nyt-tldw-btn';
    tldwBtn.setAttribute('role', 'button');
    tldwBtn.setAttribute('title', 'TL;DW — AI transcript summary & clickbait verdict');
    tldwBtn.textContent = '⏱️ TL;DW';
    tldwBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      openTldw(card);
    }, true);
    tldwBtn.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
    }, true);
    thumb.appendChild(tldwBtn);
  }
}, { passive: true });

// Keyboard shortcut 'B' for instant channel block on hovered card
document.addEventListener('keydown', (e) => {
  if (e.key !== 'b' && e.key !== 'B') return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  const active = document.activeElement;
  if (active) {
    const tag = (active.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || active.isContentEditable) return;
    if (active.getAttribute && active.getAttribute('role') === 'textbox') return;
  }

  if (hoveredVideoCard && hoveredVideoCard.isConnected && hoveredVideoCard.dataset.hiddenByLocalBlacklist !== 'true') {
    blacklistActiveChannel(hoveredVideoCard);
  }
});

// ------------------------------------------------------------------
// 3-DOT MENU INJECTION WITH REACTION OBSERVER (ZERO FLASHING)
// ------------------------------------------------------------------
function isMenuPopupVisible(popup) {
  const dd = popup.closest('iron-dropdown') || popup;
  try {
    const style = window.getComputedStyle(dd);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  } catch (_) {}
  return true;
}

function findOpenMenuContainer() {
  const popups = document.querySelectorAll('ytd-menu-popup-renderer');
  for (const popup of popups) {
    if (!isMenuPopupVisible(popup)) continue;
    const container = popup.querySelector('#items') || popup.querySelector('tp-yt-paper-listbox');
    if (container) return container;
  }
  return null;
}

function findOpenSheetContainer() {
  const scope = document.querySelector('ytd-popup-container') || document.body;
  const lists = scope.querySelectorAll('yt-list-view-model, ytd-menu-renderer yt-list-item-view-model');
  for (const listEl of [...lists]) {
    if (listEl.closest && listEl.closest('ytd-multi-page-menu-renderer')) continue;
    let dd = listEl.closest('tp-yt-iron-dropdown') || listEl.closest('iron-dropdown');
    const visible = !dd || (window.getComputedStyle(dd).display !== 'none');
    if (!visible) continue;
    const container = listEl.closest('yt-list-view-model') ||
      (listEl.parentElement && listEl.parentElement.closest('yt-list-view-model')) || listEl.parentElement;
    if (container) return container;
  }
  return null;
}

function injectCustomMenuItem() {
  const classicContainer = findOpenMenuContainer();
  const sheetContainer = findOpenSheetContainer();
  const container = classicContainer || sheetContainer;
  if (!container) return null;

  // Already injected? Return immediately
  if (container.querySelector('.' + CUSTOM_MENU_MARKER + ', .custom-blacklist-option')) {
    return container;
  }

  // Classic paper-listbox container
  if (classicContainer) {
    const menuItem = document.createElement('ytd-menu-service-item-renderer');
    menuItem.className = 'custom-blacklist-option ' + CUSTOM_MENU_MARKER + ' style-scope ytd-menu-popup-renderer';
    menuItem.setAttribute('role', 'menuitem');
    menuItem.style.cursor = 'pointer';

    menuItem.innerHTML = `
      <div class="tp-yt-paper-item style-scope ytd-menu-service-item-renderer"
           style="display:flex;align-items:center;padding:0 16px;height:48px;
                  color:var(--yt-spec-text-primary);cursor:pointer;">
        <div style="margin-right:16px;display:flex;align-items:center;">
          <svg height="24" viewBox="0 0 24 24" width="24" focusable="false" style="fill:currentColor;">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/>
          </svg>
        </div>
        <span style="font-size:1.4rem;font-family:Roboto,Arial,sans-serif;">
          ${CUSTOM_MENU_LABEL}
        </span>
      </div>
    `;

    menuItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      blacklistActiveChannel();
    }, true);

    classicContainer.insertBefore(menuItem, classicContainer.firstChild);
    return classicContainer;
  }

  // Modern sheet container
  if (sheetContainer) {
    const row = buildNativeSheetRow();
    if (row) {
      sheetContainer.insertBefore(row, sheetContainer.firstChild);
    }
    return sheetContainer;
  }

  return null;
}

function buildNativeSheetRow() {
  const row = document.createElement('yt-list-item-view-model');
  row.className =
    'custom-blacklist-option ' + CUSTOM_MENU_MARKER +
    ' ytListItemViewModelHost style-scope yt-list-view-model';
  row.setAttribute('aria-hidden', 'false');

  const wrapper = document.createElement('div');
  wrapper.className =
    'ytListItemViewModelLayoutWrapper ytListItemViewModelContainer ' +
    'ytListItemViewModelCompact ytListItemViewModelTappable ' +
    'ytListItemViewModelInPopup ytListItemViewModelNoTrailingText ' +
    'style-scope yt-list-item-view-model';
  wrapper.style.cssText =
    'display:flex;align-items:center;min-height:48px;padding:0 16px;' +
    'cursor:pointer;outline:none;transition:background-color 0.15s ease;';

  const iconWrap = document.createElement('div');
  iconWrap.style.cssText = 'margin-right:16px;display:flex;align-items:center;color:var(--yt-spec-text-primary);';
  iconWrap.innerHTML = `
    <svg height="24" viewBox="0 0 24 24" width="24" focusable="false" style="fill:currentColor;">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/>
    </svg>
  `;

  const content = document.createElement('div');
  content.className =
    'ytListItemViewModelContainerDividerAndContentWrapper ' +
    'style-scope yt-list-item-view-model';
  content.style.cssText = 'display:flex;align-items:center;flex:1;';

  const label = document.createElement('span');
  label.style.cssText =
    'font-size:1.4rem;font-family:Roboto,Arial,sans-serif;' +
    'color:var(--yt-spec-text-primary);';
  label.textContent = CUSTOM_MENU_LABEL;

  wrapper.addEventListener('mouseenter', () => {
    wrapper.style.backgroundColor = 'var(--yt-spec-badge-chip-background, rgba(255,255,255,0.1))';
  });
  wrapper.addEventListener('mouseleave', () => {
    wrapper.style.backgroundColor = '';
  });

  content.appendChild(label);
  wrapper.appendChild(iconWrap);
  wrapper.appendChild(content);
  row.appendChild(wrapper);

  row.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    blacklistActiveChannel();
  }, true);

  return row;
}

function startMenuObserver() {
  if (menuObserver) return;
  const popupContainer = document.querySelector('ytd-popup-container') || document.body;
  menuObserver = new MutationObserver(() => {
    injectCustomMenuItem();
  });
  menuObserver.observe(popupContainer, { childList: true, subtree: true });
}

function stopMenuObserver() {
  if (menuObserver) {
    menuObserver.disconnect();
    menuObserver = null;
  }
}

function closeOpenMenu() {
  stopMenuObserver();
  try {
    const scope = document.querySelector('ytd-popup-container') || document.body;
    const dropdowns = scope.querySelectorAll('tp-yt-iron-dropdown, iron-dropdown');
    dropdowns.forEach(dd => {
      if (typeof dd.close === 'function') dd.close();
      if ('opened' in dd) dd.opened = false;
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  } catch (_) {}
}

function blacklistActiveChannel(targetCard) {
  if (targetCard) {
    activeMenuVideoCard = targetCard;
  }
  if (!activeMenuVideoCard) {
    const fromMenu = resolveMenuVideoCardFallback();
    if (fromMenu) activeMenuVideoCard = fromMenu;
    if (!activeMenuVideoCard) {
      dbgWarn('No active menu video card tracked; nothing to blacklist.');
      return;
    }
  }

  const card = activeMenuVideoCard;
  const channel = getChannelName(card);
  const cardKeys = getCardChannelKeys(card);
  const vid = getVideoId(card);

  if (!channel && !cardKeys.length && !vid) {
    dbgWarn('Could not resolve a channel identity for the active video card');
    return;
  }

  const primaryName = channel || (cardKeys.find(k => !k.startsWith('youtu') && k.length > 2)) || vid || 'Unknown Channel';
  let addedAny = false;
  const newlyAddedKeys = [];

  for (const k of cardKeys) {
    if (k && !settings.channels.includes(k)) {
      settings.channels.push(k);
      newlyAddedKeys.push(k);
      addedAny = true;
    }
  }
  if (channel && !settings.channels.includes(normalizeChannel(channel))) {
    const norm = normalizeChannel(channel);
    settings.channels.push(norm);
    newlyAddedKeys.push(norm);
    addedAny = true;
  }
  if (vid && !settings.channels.includes(vid.toLowerCase())) {
    const vLower = vid.toLowerCase();
    settings.channels.push(vLower);
    newlyAddedKeys.push(vLower);
    addedAny = true;
  }

  if (addedAny) {
    saveSettings();
  }

  // Hide the clicked card immediately
  hideCardElement(card);

  // Re-scan and hide all matching cards across the document
  let hidCount = 1;
  const allCards = document.querySelectorAll(VIDEO_CARD_SELECTORS);
  allCards.forEach(c => {
    delete c.dataset.lastSignature;
    if (channelMatches(c, settings.channels)) {
      hideCardElement(c);
      hidCount++;
    }
  });

  // Increment all-time blocked stats safely
  safeSendRuntimeMessage({ type: 'INCREMENT_BLOCKED', inc: hidCount });

  // If on watch page, ONLY navigate away if the CURRENT video playing was blacklisted!
  // NEVER navigate away when blacklisting a sidebar recommendation!
  if (window.location.pathname.startsWith('/watch')) {
    try {
      const pageParams = new URLSearchParams(window.location.search);
      const currentVid = (pageParams.get('v') || '').toLowerCase();
      const targetVid = (vid || '').toLowerCase();

      const isCurrentVideoOwnerBlacklisted = channel && settings.channels.some(c => normalizeChannel(c) === normalizeChannel(channel));

      // Only redirect if target video IS the current playing video
      if (currentVid && (targetVid === currentVid || (card.closest('ytd-watch-metadata') && isCurrentVideoOwnerBlacklisted))) {
        try {
          const video = document.querySelector('video');
          if (video) video.pause();
        } catch (_) {}
        setTimeout(() => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            window.location.href = 'https://www.youtube.com/';
          }
        }, 500);
      }
    } catch (_) {}
  }

  closeOpenMenu();

  const handleUndo = () => {
    if (newlyAddedKeys.length) {
      settings.channels = settings.channels.filter(k => !newlyAddedKeys.includes(k));
      saveSettings();
    }
    unhideCardElement(card);
    delete card.dataset.lastSignature;
    processFeed(true);
    safeSendRuntimeMessage({ type: 'INCREMENT_BLOCKED', inc: -hidCount });
    showToast(`Unblocked: ${primaryName}`);
  };

  showToast(`Blacklisted: ${primaryName}`, handleUndo);
}

function showToast(message, onUndo) {
  let toast = document.getElementById('nyt-ext-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nyt-ext-toast';
    toast.style.cssText =
      'position:fixed;bottom:28px;left:28px;' +
      'background:rgba(20,20,20,0.96);color:#fff;padding:10px 16px;border-radius:10px;' +
      'z-index:999999;font-family:Roboto,Arial,sans-serif;font-size:13.5px;' +
      'border:1px solid rgba(255,255,255,0.18);box-shadow:0 6px 22px rgba(0,0,0,0.7);' +
      'display:flex;align-items:center;gap:12px;transition:opacity .25s ease, transform .25s ease;' +
      'transform:translateY(0);pointer-events:auto;backdrop-filter:blur(8px);';
    document.body.appendChild(toast);
  }

  toast.innerHTML = '';

  const iconSpan = document.createElement('span');
  iconSpan.style.cssText = 'font-size:16px;line-height:1;display:flex;align-items:center;';
  iconSpan.textContent = onUndo ? '🚫' : '✅';
  toast.appendChild(iconSpan);

  const msgSpan = document.createElement('span');
  msgSpan.style.cssText = 'max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;';
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);

  if (typeof onUndo === 'function') {
    const undoBtn = document.createElement('button');
    undoBtn.textContent = 'Undo';
    undoBtn.style.cssText =
      'background:#ff4444;color:#fff;border:none;border-radius:6px;' +
      'padding:4px 11px;font-weight:700;font-size:12px;cursor:pointer;' +
      'outline:none;transition:background 0.15s ease, transform 0.15s ease;margin-left:6px;';
    undoBtn.addEventListener('mouseenter', () => { undoBtn.style.background = '#ff6666'; undoBtn.style.transform = 'scale(1.05)'; });
    undoBtn.addEventListener('mouseleave', () => { undoBtn.style.background = '#ff4444'; undoBtn.style.transform = 'scale(1)'; });
    undoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onUndo();
    });
    toast.appendChild(undoBtn);
  }

  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
  }, onUndo ? 5000 : 2500);
}

// ------------------------------------------------------------------
// AI TITLE DE-BAITER (Real-Time Title Neutralizer)
// ------------------------------------------------------------------
function looksSensationalist(title) {
  if (!title) return false;
  const t = String(title).trim();
  if (!t) return false;
  const capsCount = (t.match(/[A-Z]/g) || []).length;
  const isAllCaps = t.length > 10 && (capsCount / t.length) > 0.45;
  const baitPats = [
    /you won'?t believe/i, /in 24 hours/i, /shocking/i, /exposed/i,
    /skibidi/i, /100x/i, /!!+/i, /\b(?:OMG|LOL|WOW|INSANE|CRAZY|EPIC|HUGE|MASSIVE)\b/i,
    /\bprank\b/i, /\breaction\b/i, /\bchallenge\b/i, /\bvs\b/i,
    /\b(?:drama|cancelled|canceled|apology)\b/i, /\b(?:crypto|moon|pump|dump|rich|hustle)\b/i,
    /\b(?:hot|sexy|leaked|banned|gone|died|destroyed|owned|roasted)\b/i,
    /\b(?:nobody|everyone|anyone|somebody) (?:knows?|talks? |says? )\b/i,
    /(?:\d+\s+)?(?:things?|ways?|reasons?|secrets?|hacks?|tricks?) (?:you|to|that)/i
  ];
  return isAllCaps || baitPats.some(p => p.test(t));
}

function heuristicDebaitTitle(title) {
  let t = String(title || '').trim();
  if (!t) return t;
  t = t.replace(/\b(?:OMG|LOL|LMAO|ROFL|WTF)\b/gi, '');
  t = t.replace(/\s*!{2,}/g, '.');
  t = t.replace(/\s*[?!]+(\s|$)/g, '. ');
  t = t.replace(/\s*\?\s*\?+/g, '.');
  t = t.replace(/\b(?:that is|is going to|gonna)\b/gi, 'is about to');
  t = t.replace(/\b(in 24 hours)\b/gi, '');
  t = t.replace(/\b(?:shocking|exposed|insane|epic|crazy|massive|huge|wild)\b/gi, '');
  const m = t.match(/^(you won'?t believe\s+)(.+)/i);
  if (m && m[2]) t = m[2];
  t = t.replace(/\s*\.{2,}/g, '.').replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/[.,]+$/, '');
  return t || String(title).trim();
}

function getVideoTitleElement(card) {
  if (!card || !card.querySelector) return null;
  return card.querySelector(
    '#video-title, yt-formatted-string#title, a#video-title-link, ' +
    '.yt-lockup-metadata-view-model-wiz__heading-reset a, ' +
    '.yt-lockup-metadata-view-model-wiz__title, ' +
    'h3.yt-lockup-metadata-view-model-wiz__heading-reset'
  );
}

const debaitCache = new Map();
const debaitLoading = new Set();
let debaitTimer = null;
let lastDebaitRun = 0;

function scheduleDebaitPass() {
  if (!settings.aiDebaitTitles) return;
  const now = Date.now();
  if (now - lastDebaitRun < 1500) return;
  if (debaitTimer) return;
  debaitTimer = setTimeout(() => {
    debaitTimer = null;
    runDebaitPass();
  }, 350);
}

function runDebaitPass() {
  lastDebaitRun = Date.now();
  const cards = document.querySelectorAll(VIDEO_CARD_SELECTORS);
  const candidates = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card || card.dataset.hiddenByLocalBlacklist === 'true') continue;
    if (card.dataset.debaitState) continue;
    const el = getVideoTitleElement(card);
    if (!el) continue;
    const t = el.textContent.trim();
    if (!t || t.length < 8) continue;
    if (!looksSensationalist(t)) continue;

    const vid = getVideoId(card);
    if (vid && debaitCache.has(vid)) {
      const cached = debaitCache.get(vid);
      if (el.textContent.trim() === cached.original) {
        showDebaitState(card, 'ai', cached.neutral);
      }
      continue;
    }
    if (vid && debaitLoading.has(vid)) continue;

    candidates.push({ vid, card, title: t });
    if (vid) debaitLoading.add(vid);
  }

  if (candidates.length) {
    batchDebait(candidates);
  }
}

function batchDebait(candidates) {
  let sent = false;
  try {
    chrome.runtime.sendMessage({
      type: 'AI_DEBAIT_TITLES',
      titles: candidates.map(c => c.title),
      modelChoice: settings.aiDebaitModel || settings.aiModel
    }, (res) => {
      if (chrome.runtime?.lastError) res = null;
      applyDebaitResults(candidates, res);
    });
    sent = true;
  } catch (_) {}

  if (!sent) {
    applyDebaitResults(candidates, null);
  }
}

function applyDebaitResults(candidates, res) {
  const neutralList = (res && Array.isArray(res.neutralTitles))
    ? res.neutralTitles
    : candidates.map(c => heuristicDebaitTitle(c.title));

  candidates.forEach((c, i) => {
    if (c.vid) debaitLoading.delete(c.vid);
    const neutral = String(neutralList[i] || heuristicDebaitTitle(c.title)).trim() || heuristicDebaitTitle(c.title);
    if (c.vid) debaitCache.set(c.vid, { neutral, original: c.title });

    const card = c.card;
    if (!card || !card.isConnected || card.dataset.debaitState) return;
    const el = getVideoTitleElement(card);
    if (el && el.textContent.trim() === c.title) {
      showDebaitState(card, 'ai', neutral);
    }
  });
}

function showDebaitState(card, state, neutral) {
  const el = getVideoTitleElement(card);
  if (!el) return;

  if (state === 'ai' && neutral) {
    if (!card.dataset.originalTitle) {
      card.dataset.originalTitle = el.textContent.trim();
    }
    card.dataset.debaitState = 'ai';
    el.textContent = '';

    const badge = document.createElement('span');
    badge.className = 'nyt-debait-badge';
    badge.textContent = '✨';
    badge.setAttribute('role', 'button');
    badge.setAttribute('title', 'De-baited by AI — click to reveal original title');
    badge.setAttribute('aria-label', 'Toggle original title');
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showDebaitState(card, 'original');
    }, true);

    el.appendChild(badge);
    el.appendChild(document.createTextNode(' ' + neutral));
  } else {
    const orig = card.dataset.originalTitle || el.textContent.trim();
    card.dataset.originalTitle = orig;
    card.dataset.debaitState = 'original';
    el.textContent = orig;
  }
}

// ------------------------------------------------------------------
// 1-CLICK TL;DW (Too Long; Didn't Watch) VIDEO INSPECTOR
// ------------------------------------------------------------------
let tldwModalHost = null;

function closeTldwModal() {
  if (tldwModalHost && tldwModalHost.isConnected) {
    tldwModalHost.remove();
  }
  tldwModalHost = null;
}

function openTldw(card) {
  if (!card) return;
  const vid = getVideoId(card);
  const title = getVideoTitle(card);
  const channel = getChannelName(card);
  if (!vid && !title) return;

  closeTldwModal();
  const host = document.createElement('div');
  host.className = 'nyt-tldw-overlay';
  host.addEventListener('mousedown', (e) => {
    if (e.target === host) closeTldwModal();
  });
  document.body.appendChild(host);
  tldwModalHost = host;

  renderTldwLoading(host, { title, channel });
  analyzeTldw({ vid, title, channel, card, host });
}

function renderTldwLoading(host, ctx) {
  host.innerHTML = `
    <div class="nyt-tldw-modal">
      <div class="nyt-tldw-head">
        <div>
          <h2 class="nyt-tldw-title">⏱️ TL;DW Inspector</h2>
          <p class="nyt-tldw-meta">${escapeHtml(ctx.title || 'Untitled')}${ctx.channel ? ' <b>•</b> ' + escapeHtml(ctx.channel) : ''}</p>
        </div>
        <button class="nyt-tldw-action nyt-tldw-close" data-tldw-close="1">✕</button>
      </div>
      <div class="nyt-tldw-scan"></div>
      <div style="font-size:12.5px;color:#9aa3b2;line-height:1.5;">
        🧠 Fetching captions &amp; scanning for manipulation tactics…<br>
        <span style="font-size:11px;">Powered by your local Ollama / LM Studio. No data leaves this machine.</span>
      </div>
    </div>
  `;
  const close = host.querySelector('[data-tldw-close]');
  if (close) close.addEventListener('click', closeTldwModal);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function analyzeTldw(ctx) {
  let transcript = '';
  let durationSec = 0;
  let captionsFound = false;

  try {
    const page = await fetchVideoPage(ctx.vid);
    durationSec = page.durationSec || 0;
    const track = pickCaptionTrack(page.captionTracks);
    if (track && track.baseUrl) {
      captionsFound = true;
      transcript = await fetchTranscript(track.baseUrl);
    }
  } catch (_) {}

  let sent = false;
  try {
    chrome.runtime.sendMessage({
      type: 'AI_SUMMARIZE_TRANSCRIPT',
      transcript,
      title: ctx.title,
      modelChoice: settings.aiModel,
      opts: { durationSec }
    }, (res) => {
      if (chrome.runtime?.lastError) res = null;
      try {
        renderTldwResult(ctx, res, { transcript, captionsFound });
      } catch (_) {}
    });
    sent = true;
  } catch (_) {}

  if (!sent) {
    try {
      renderTldwResult(ctx, null, { transcript, captionsFound });
    } catch (_) {}
  }
}

async function fetchVideoPage(vid) {
  const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(vid)}`, {
    credentials: 'include',
    headers: { 'accept': 'text/html' }
  });
  if (!res.ok) throw new Error('fetch_video_failed: ' + res.status);
  const html = await res.text();

  let captionTracks = [];
  let durationSec = 0;
  const pr = extractPlayerResponse(html);
  if (pr) {
    const tracks = extractCaptionsFromPlayerResponse(pr);
    if (Array.isArray(tracks)) captionTracks = tracks;
    durationSec = Number(pr.videoDetails && pr.videoDetails.lengthSeconds) || 0;
  }
  return { captionTracks, durationSec };
}

function extractPlayerResponse(html) {
  try {
    const marker = 'ytInitialPlayerResponse';
    const idx = html.indexOf(marker);
    if (idx === -1) return null;
    const open = html.indexOf('{', idx);
    const scriptEnd = html.indexOf('</script>', open);
    const close = html.lastIndexOf('}', scriptEnd === -1 ? html.length : scriptEnd);
    if (open === -1 || close === -1 || close <= open) return null;
    return JSON.parse(html.slice(open, close + 1));
  } catch (_) {
    return null;
  }
}

function extractCaptionsFromPlayerResponse(pr) {
  try {
    return pr.captions.playerCaptionsTracklistRenderer.captionTracks || null;
  } catch (_) {
    return null;
  }
}

function pickCaptionTrack(tracks) {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  const en = tracks.find(t => /^en/i.test(t.languageCode || t.language || ''));
  return en || tracks[0];
}

async function fetchTranscript(baseUrl) {
  try {
    let url = baseUrl;
    if (!/fmt=/.test(url)) {
      url += (url.includes('?') ? '&' : '?') + 'fmt=json3';
    }
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return '';
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return parseTimedtextJson(json);
    } catch (_) {}
    return parseTimedtextXml(text);
  } catch (_) {
    return '';
  }
}

function parseTimedtextJson(obj) {
  const events = Array.isArray(obj && obj.events) ? obj.events : [];
  const chunks = [];
  for (const ev of events) {
    const segs = Array.isArray(ev && ev.segs) ? ev.segs : [];
    let line = '';
    for (const s of segs) line += (s && s.utf8) || '';
    line = line.replace(/\s+/g, ' ').trim();
    if (line) chunks.push(line);
  }
  return chunks.join(' ');
}

function parseTimedtextXml(xmlText) {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const nodes = doc.getElementsByTagName('text');
    const chunks = [];
    for (let i = 0; i < nodes.length; i++) {
      const t = (nodes[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (t) chunks.push(t);
    }
    return chunks.join(' ');
  } catch (_) {
    return '';
  }
}

function readVerdictClass(text) {
  const t = String(text || '').toLowerCase();
  if (t.includes('true clickbait') || t.includes('clickbait')) return 'clickbait';
  if (t.includes('partial')) return 'partial';
  if (t.includes('not clickbait') || t.includes('not false')) return 'clean';
  return 'dim';
}

function renderTldwResult(ctx, res, tr) {
  if (!tldwModalHost || !tldwModalHost.isConnected) return;
  const host = tldwModalHost;

  const summary = (res && res.ok) ? res : { clickbaitVerdict: 'Analysis incomplete — local model unavailable. Heuristic fallback used.', takeaways: [], timeSaved: 0, isFallback: true };
  const verdict = summary.clickbaitVerdict || 'No verdict returned.';
  const takeaways = Array.isArray(summary.takeaways) && summary.takeaways.length
    ? summary.takeaways
    : ['Captions were unavailable, so a content verdict could not be reconstructed.', 'Open the video directly for the full picture.', 'Consider enabling captions on YouTube to unlock TL;DW reports.'];
  const timeSaved = Number(summary.timeSaved) || 0;
  const vClass = readVerdictClass(verdict);

  const takeawayHtml = takeaways.map(t => `<li>${escapeHtml(t)}</li>`).join('');
  const captionNote = !tr.captionsFound
    ? '<div style="font-size:11px;color:#ffb400;margin-top:8px;">⚠️ Public captions disabled — summary uses video metadata fallback.</div>'
    : '';

  host.innerHTML = `
    <div class="nyt-tldw-modal">
      <div class="nyt-tldw-head">
        <div>
          <h2 class="nyt-tldw-title">⏱️ TL;DW Report</h2>
          <p class="nyt-tldw-meta">${escapeHtml(ctx.title || 'Untitled')}${ctx.channel ? ' <b>•</b> ' + escapeHtml(ctx.channel) : ''}</p>
        </div>
        <button class="nyt-tldw-action nyt-tldw-close" data-tldw-close="1">✕</button>
      </div>

      <div class="nyt-tldw-verdict ${vClass}">
        <span class="nyt-tldw-pill">🔍 CLICKBAIT TRUTH VERDICT</span>${escapeHtml(verdict)}
      </div>

      <div style="font-size:11px;color:#9aa3b2;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;margin:10px 0 6px;">📝 Core Takeaways</div>
      <ul class="nyt-tldw-takeaways">${takeawayHtml}</ul>

      <div class="nyt-tldw-stats">
        <div class="nyt-tldw-stat">Estimated saved<strong>⏱️ ${timeSaved > 0 ? timeSaved + ' min' : '—'}</strong></div>
        <div class="nyt-tldw-stat">Transcript source<strong>${tr.captionsFound ? 'Captions' : 'Metadata'}</strong></div>
        <div class="nyt-tldw-stat">Model<strong>${summary.isFallback ? 'Heuristic' : 'Local AI'}</strong></div>
      </div>

      ${captionNote}

      <div class="nyt-tldw-actions">
        <button class="nyt-tldw-action nyt-tldw-block" data-tldw-block="1">🚫 Blacklist Channel</button>
        <button class="nyt-tldw-action nyt-tldw-close" data-tldw-close="1">Close</button>
      </div>
    </div>
  `;

  const closeBtn = host.querySelector('[data-tldw-close]');
  if (closeBtn) closeBtn.addEventListener('click', closeTldwModal);

  const blockBtn = host.querySelector('[data-tldw-block]');
  if (blockBtn) {
    blockBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeTldwModal();
      setTimeout(() => blacklistActiveChannel(ctx.card), 200);
    }, true);
  }
}

// ------------------------------------------------------------------
// OBSERVERS & EVENT LISTENERS
// ------------------------------------------------------------------
function scheduleFeedProcessing(delay = 80) {
  if (processTimer) clearTimeout(processTimer);
  processTimer = setTimeout(() => {
    processTimer = null;
    processFeed();
  }, delay);
}

function closestMenuVideoCard(node) {
  if (!node || !node.closest) return null;
  return node.closest(VIDEO_CARD_SELECTORS);
}

function resolveMenuVideoCardFallback() {
  try {
    const scope = document.querySelector('ytd-popup-container') || document.body;
    const dropdowns = scope.querySelectorAll('tp-yt-iron-dropdown, iron-dropdown');
    for (const dd of dropdowns) {
      if (dd && window.getComputedStyle(dd).display === 'none') continue;
      const target = dd.positionTarget || dd._openTrigger || dd.__target;
      if (target) {
        const card = closestMenuVideoCard(target);
        if (card) return card;
      }
    }
  } catch (_) {}
  return null;
}

function findMenuButton(target) {
  if (!target || !target.closest) return null;
  const btn = target.closest(MENU_BUTTON_SELECTORS);
  if (btn) return btn;
  const menuHost = target.closest('ytd-menu-renderer, .yt-lockup-metadata-view-model-wiz__menu');
  if (menuHost) return menuHost.querySelector('button') || menuHost;
  return null;
}

// Track card early on pointerdown
document.addEventListener('pointerdown', (e) => {
  const btn = findMenuButton(e.target);
  if (btn) {
    const card = closestMenuVideoCard(btn);
    if (card) activeMenuVideoCard = card;
    startMenuObserver();
    injectCustomMenuItem();
  }
}, true);

// Support right-click on 3-dots
document.addEventListener('contextmenu', (e) => {
  const btn = findMenuButton(e.target);
  if (btn) {
    e.preventDefault();
    e.stopPropagation();
    const card = closestMenuVideoCard(btn);
    if (card) activeMenuVideoCard = card;
    startMenuObserver();
    btn.click();
    injectCustomMenuItem();
  }
}, true);

// Click handler
document.addEventListener('click', (e) => {
  try {
    const target = e.target;
    if (!target) return;

    // Detect click on custom row
    const row = target.closest('.' + CUSTOM_MENU_MARKER + ', .custom-blacklist-option');
    const labelEl = target.closest('yt-list-item-view-model, ytd-menu-service-item-renderer, tp-yt-paper-item');
    const hasLabel = labelEl && labelEl.textContent && labelEl.textContent.includes(CUSTOM_MENU_LABEL);

    if (hasLabel || row) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      blacklistActiveChannel();
      return;
    }

    // Detect menu button clicks
    const menuButton = findMenuButton(target);
    if (menuButton) {
      const card = closestMenuVideoCard(menuButton);
      if (card) activeMenuVideoCard = card;
      startMenuObserver();
      injectCustomMenuItem();
    }
  } catch (_) {}
}, true);

// ------------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------------
function start() {
  loadSettings().then(() => {
    injectBlacklistStyles();

    setTimeout(() => {
      processFeed(true);
    }, 400);

    // Filtered MutationObserver: ignores our own UI mutations to prevent loops
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.addedNodes && m.addedNodes.length > 0) {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const node = m.addedNodes[j];
            if (node.nodeType === 1) {
              if (node.id === 'nyt-ext-toast' || node.id === 'nyt-tldw-host' || (node.classList?.contains && (
                node.classList.contains('custom-blacklist-option') ||
                node.classList.contains('nyt-quick-block-btn') ||
                node.classList.contains('nyt-debait-badge') ||
                node.classList.contains('nyt-tldw-btn') ||
                node.classList.contains('nyt-tldw-overlay') ||
                node.classList.contains('nyt-tldw-modal') ||
                node.classList.contains('nyt-hunt-prey') ||
                node.classList.contains('nyt-hunt-hud') ||
                node.classList.contains('nyt-hunt-ring')
              ))) {
                continue;
              }
              shouldProcess = true;
              break;
            }
          }
        }
        if (shouldProcess) break;
      }
      if (shouldProcess) {
        scheduleFeedProcessing(100);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// ------------------------------------------------------------------
// HUNT MODE MINIGAME — crosshair cursor, per-card roaming prey on hover
// Toggle: Settings > Hunt Mode (stored as `huntMode`). Each hovered card
// reveals a ⛔ that roams inside its own thumbnail; the stationary
// quick-block button stays so blacklisting works in hunt mode or not.
// Prey hits score +100 without blacklisting. Misses cost 10 (floor 0).
// Score/best persist in chrome.storage.local.
// ------------------------------------------------------------------
let huntActive = false;
let huntHud = null;
let huntRing = null;
let huntTimer = null;
let huntScore = 0;
let huntBest = 0;
let huntHits = 0;
let huntShots = 0;

function ensureHuntStyles() {
  try {
    if (document.getElementById('nyt-hunt-styles')) return;
    const st = document.createElement('style');
    st.id = 'nyt-hunt-styles';
    st.textContent = `
      body.nyt-hunting, body.nyt-hunting a, body.nyt-hunting button { cursor: crosshair !important; }
      .nyt-hunt-prey {
        position: fixed; z-index: 2147483647; width: 34px; height: 34px;
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; line-height: 1; user-select: none; cursor: crosshair;
        background: rgba(15,15,15,0.85); border: 2px solid #ff0033; border-radius: 50%;
        box-shadow: 0 0 12px rgba(255,0,51,0.7);
        opacity: 1; pointer-events: auto;
        transition: opacity 0.15s ease, top 0.45s ease, left 0.45s ease, transform 0.1s;
      }
      .nyt-hunt-prey.hidden { opacity: 0; pointer-events: none; }
      .nyt-hunt-prey:hover { transform: scale(1.12); }
      .nyt-hunt-prey.nyt-hunt-hit { transform: scale(1.6); opacity: 0; transition: transform 0.15s, opacity 0.15s; }
      .nyt-hunt-hud {
        position: fixed; right: 14px; bottom: 14px; z-index: 2147483646;
        background: rgba(15,15,15,0.92); border: 1px solid #ff0033; border-radius: 10px;
        color: #f1f1f1; font: 600 12px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif;
        padding: 8px 12px; pointer-events: none; user-select: none;
        box-shadow: 0 4px 18px rgba(255,0,51,0.35);
      }
      .nyt-hunt-hud b { color: #ffd700; }
      .nyt-hunt-ring {
        position: fixed; z-index: 2147483647; width: 26px; height: 26px; margin: -13px 0 0 -13px;
        border: 2px solid rgba(255,0,51,0.9); border-radius: 50%;
        pointer-events: none;
      }
      .nyt-hunt-ring::before, .nyt-hunt-ring::after {
        content: ""; position: absolute; background: rgba(255,0,51,0.9);
      }
      .nyt-hunt-ring::before { left: 50%; top: -6px; width: 2px; height: 38px; margin-left: -1px; }
      .nyt-hunt-ring::after { top: 50%; left: -6px; height: 2px; width: 38px; margin-top: -1px; }
    `;
    (document.head || document.documentElement).appendChild(st);
  } catch (_) {}
}

function huntVisibleCards() {
  try {
    const all = document.querySelectorAll(VIDEO_CARD_SELECTORS);
    const out = [];
    for (let i = 0; i < all.length; i++) {
      const c = all[i];
      if (!c || c.dataset.hiddenByLocalBlacklist === 'true') continue;
      if (c.offsetHeight <= 0) continue;
      const thumb = c.querySelector(
        'ytd-thumbnail, #thumbnail, a#thumbnail, .yt-lockup-view-model-wiz__thumbnail, yt-thumbnail-view-model'
      );
      if (!thumb) continue;
      const r = thumb.getBoundingClientRect();
      if (r.width < 60 || r.height < 40) continue;
      out.push({ card: c, thumb });
    }
    return out;
  } catch (_) { return []; }
}

function huntUpdateHud(note) {
  try {
    if (!huntHud) return;
    const acc = huntShots ? Math.round((huntHits / huntShots) * 100) : 100;
    huntHud.innerHTML = `🎯 HUNT <b>${huntScore}</b> pts &nbsp;•&nbsp; ${huntHits}/${huntShots} (${acc}%) &nbsp;•&nbsp; best <b>${huntBest}</b>${note ? `<br><span style="color:#ff8fa3;">${note}</span>` : ''}`;
  } catch (_) {}
}

function huntPersist() {
  try {
    if (!isExtensionValid()) return;
    if (huntScore > huntBest) huntBest = huntScore;
    chrome.storage.local.set({ nyt_huntScore: huntScore, nyt_huntBest: huntBest });
  } catch (_) {}
}

function huntMovePreyEl(el) {
  try {
    const thumb = el && el.parentNode;
    if (!thumb || !thumb.clientWidth) return;
    const maxX = Math.max(0, thumb.clientWidth - 38);
    const maxY = Math.max(0, thumb.clientHeight - 38);
    let x = 2 + Math.random() * maxX;
    let y = 2 + Math.random() * maxY;
    if (maxY > 90 && y < 46 && x < 54) y = 46 + Math.random() * Math.max(1, maxY - 46);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  } catch (_) {}
}

function huntAddPrey(card, thumb) {
  try {
    if (!huntActive || !card || !thumb) return;
    if (card.querySelector('.nyt-hunt-prey')) return;
    const el = document.createElement('div');
    el.className = 'nyt-hunt-prey';
    el.textContent = '⛔';
    el.title = 'Shoot me! (+100, no blacklist)';
    const stopNav = (ev) => {
      try { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); } catch (_) {}
    };
    el.addEventListener('pointerdown', stopNav, true);
    el.addEventListener('mousedown', (ev) => { stopNav(ev); huntHit(el); }, true);
    el.addEventListener('click', stopNav, true);
    document.body.appendChild(el);
    huntMovePreyEl(el, thumb);
  } catch (_) {}
}

function huntMovePreyEl(el, anchor) {
  try {
    const thumb = anchor || (el && document.querySelector(
      'ytd-thumbnail, #thumbnail, a#thumbnail, .yt-lockup-view-model-wiz__thumbnail, yt-thumbnail-view-model'
    ));
    if (!thumb || !thumb.clientWidth) return;
    const thumbRect = thumb.getBoundingClientRect();
    const maxX = Math.max(0, thumbRect.width - 38);
    const maxY = Math.max(0, thumbRect.height - 38);
    let x = thumbRect.left + 2 + Math.random() * maxX;
    let y = thumbRect.top + 2 + Math.random() * maxY;
    if (maxY > 90 && y < (thumbRect.top + 46) && x < (thumbRect.left + 54)) {
      y = thumbRect.top + 46 + Math.random() * Math.max(1, maxY - 46);
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  } catch (_) {}
}

function huntThumbFor(card) {
  try {
    if (!card) return null;
    return card.querySelector(
      'ytd-thumbnail, #thumbnail, a#thumbnail, .yt-lockup-view-model-wiz__thumbnail, yt-thumbnail-view-model'
    );
  } catch (_) { return null; }
}

function huntRoamAll() {
  try {
    if (!huntActive) return;
    document.querySelectorAll('.nyt-hunt-prey').forEach((el) => {
      try {
        const card = el.closest ? el.closest(VIDEO_CARD_SELECTORS) : null;
        if (!el.isConnected || !card || card.dataset.hiddenByLocalBlacklist === 'true') {
          if (el.parentNode) el.parentNode.removeChild(el);
          return;
        }
        const thumb = card.querySelector(
          'ytd-thumbnail, #thumbnail, a#thumbnail, .yt-lockup-view-model-wiz__thumbnail, yt-thumbnail-view-model'
        );
        huntMovePreyEl(el, thumb);
        // Show only for hovered card
        if (card === hoveredVideoCard) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      } catch (_) {}
    });
    try {
      const hc = hoveredVideoCard;
      if (hc && hc.isConnected && hc.offsetHeight > 0 && hc.dataset.hiddenByLocalBlacklist !== 'true') {
        if (!hc.querySelector('.nyt-hunt-prey')) {
          const thumb = hc.querySelector(
            'ytd-thumbnail, #thumbnail, a#thumbnail, .yt-lockup-view-model-wiz__thumbnail, yt-thumbnail-view-model'
          );
          huntAddPrey(hc, thumb);
        }
      }
    } catch (_) {}
  } catch (_) {}
}

function huntHit(el) {
  try {
    if (!huntActive) return;
    huntShots++;
    huntHits++;
    huntScore += 100;
    if (el) el.classList.add('nyt-hunt-hit');
    huntUpdateHud('DIRECT HIT +100 🎯');
    huntPersist();
    setTimeout(() => {
      try {
        if (el && el.isConnected) {
          el.classList.remove('nyt-hunt-hit');
          huntMovePreyEl(el);
        }
      } catch (_) {}
    }, 160);
  } catch (_) {}
}

function huntMiss() {
  try {
    if (!huntActive) return;
    huntShots++;
    huntScore = Math.max(0, huntScore - 10);
    huntUpdateHud('miss −10');
    huntPersist();
  } catch (_) {}
}

function huntOnRingMove(ev) {
  try {
    if (!huntRing) return;
    huntRing.style.left = `${ev.clientX}px`;
    huntRing.style.top = `${ev.clientY}px`;
  } catch (_) {}
}

function huntOnDown(ev) {
  try {
    if (!huntActive) return;
    const t = ev.target;
    if (t && t.closest && (t.closest('.nyt-hunt-prey') || t.closest('.nyt-hunt-hud') || t.closest('.nyt-hunt-ring'))) return;
    huntMiss();
  } catch (_) {}
}

function huntStart() {
  try {
    if (huntActive) return;
    huntActive = true;
    ensureHuntStyles();
    try { document.body.classList.add('nyt-hunting'); } catch (_) {}
    try {
      if (isExtensionValid()) {
        chrome.storage.local.get(['nyt_huntScore', 'nyt_huntBest'], (res) => {
          try {
            huntScore = Number(res.nyt_huntScore) || 0;
            huntBest = Number(res.nyt_huntBest) || 0;
            huntUpdateHud('hunt is on — hover a card, shoot the ⛔');
          } catch (_) {}
        });
      }
    } catch (_) {}
    if (!huntHud) {
      huntHud = document.createElement('div');
      huntHud.className = 'nyt-hunt-hud';
      document.body.appendChild(huntHud);
    }
    if (!huntRing) {
      huntRing = document.createElement('div');
      huntRing.className = 'nyt-hunt-ring';
      huntRing.style.display = 'none';
      document.body.appendChild(huntRing);
    }
    huntUpdateHud('hunt is on — hover a card, shoot the ⛔');
    document.addEventListener('mousemove', huntOnRingMove, true);
    document.addEventListener('mousedown', huntOnDown, true);
    try {
      huntRing.style.display = 'block';
    } catch (_) {}
    huntRoamAll();
    if (huntTimer) clearInterval(huntTimer);
    huntTimer = setInterval(huntRoamAll, 550);
  } catch (_) {}
}

function huntStop() {
  try {
    huntActive = false;
    if (huntTimer) { clearInterval(huntTimer); huntTimer = null; }
    document.removeEventListener('mousemove', huntOnRingMove, true);
    document.removeEventListener('mousedown', huntOnDown, true);
    try { document.body.classList.remove('nyt-hunting'); } catch (_) {}
    try { document.querySelectorAll('.nyt-hunt-prey').forEach((el) => { if (el.parentNode) el.parentNode.removeChild(el); }); } catch (_) {}
    try { if (huntHud && huntHud.parentNode) huntHud.parentNode.removeChild(huntHud); } catch (_) {}
    try { if (huntRing && huntRing.parentNode) huntRing.parentNode.removeChild(huntRing); } catch (_) {}
    huntHud = null;
    huntRing = null;
    huntPersist();
  } catch (_) {}
}

function syncHuntMode() {
  try {
    if (settings.huntMode) huntStart();
    else huntStop();
  } catch (_) {}
}

// Storage sync across tabs & popup
if (isExtensionValid() && chrome?.storage?.onChanged) {
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      loadSettings().then(() => {
        document.querySelectorAll(VIDEO_CARD_SELECTORS).forEach(card => {
          delete card.dataset.lastSignature;
        });
        processFeed(true);
      });
    });
  } catch (_) {}
}

// Popup message listener
if (isExtensionValid() && chrome?.runtime?.onMessage) {
  try {
    const EXT_ID = chrome.runtime.id;
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!sender || sender.id !== EXT_ID) return;
      if (msg && typeof msg === 'object' && msg.type === 'RULES_UPDATED') {
        loadSettings().then(() => {
          document.querySelectorAll(VIDEO_CARD_SELECTORS).forEach(card => {
            delete card.dataset.lastSignature;
          });
          processFeed(true);
          try { sendResponse({ ok: true }); } catch (_) {}
        });
        return true;
      }
      if (msg && typeof msg === 'object' && msg.type === 'GET_VISIBLE_FEED_ITEMS') {
        try {
          const items = [];
          const cards = document.querySelectorAll(VIDEO_CARD_SELECTORS);
          for (let i = 0; i < cards.length && items.length < 15; i++) {
            const card = cards[i];
            if (!card || card.dataset.hiddenByLocalBlacklist === 'true') continue;
            const title = getVideoTitle(card);
            const channel = getChannelName(card);
            const vid = getVideoId(card);
            if (!title || title.length < 3) continue;
            items.push({ title, channel: channel || '', vid: vid || '' });
          }
          try { sendResponse({ ok: true, items }); } catch (_) {}
        } catch (_) {
          try { sendResponse({ ok: true, items: [] }); } catch (__) {}
        }
        return true;
      }
    });
  } catch (_) {}
}

// YouTube SPA navigation events
window.addEventListener('yt-navigate-finish', () => {
  activeMenuVideoCard = null;
  stopMenuObserver();
  document.querySelectorAll(VIDEO_CARD_SELECTORS).forEach(card => {
    delete card.dataset.lastSignature;
  });
  scheduleFeedProcessing(200);
  checkCurrentWatchPageVideo();
});

window.addEventListener('popstate', () => {
  stopMenuObserver();
  scheduleFeedProcessing(200);
  checkCurrentWatchPageVideo();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
