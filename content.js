/*
 * Always New To You - Smart Feed Blacklist (v1.5.2)
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
  triggerServerFeedback: false // Strictly local by default to prevent feed exhaustion lockout
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
        'triggerServerFeedback'
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

        injectBlacklistStyles();
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
      ${extraRules}
    `;
  } catch (_) {}
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

  return hiddenCount;
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
// 1-CLICK QUICK-BLOCK (EVENT DELEGATED HOVER BUTTON)
// ------------------------------------------------------------------
document.addEventListener('mouseover', (e) => {
  if (settings.enableQuickBlock === false) return;
  const target = e.target;
  if (!target || !target.closest) return;

  const card = target.closest(VIDEO_CARD_SELECTORS);
  if (!card || card.dataset.hiddenByLocalBlacklist === 'true') return;
  if (card.querySelector('.nyt-quick-block-btn')) return;

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

  const btn = document.createElement('div');
  btn.className = 'nyt-quick-block-btn';
  btn.setAttribute('title', 'Blacklist Channel (1-Click)');
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
}, { passive: true });

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
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:rgba(18,18,18,0.95);color:#fff;padding:10px 18px;border-radius:8px;' +
      'z-index:99999;font-family:Roboto,Arial,sans-serif;font-size:14px;' +
      'border:1px solid rgba(255,255,255,0.25);box-shadow:0 4px 16px rgba(0,0,0,0.6);' +
      'display:flex;align-items:center;gap:14px;transition:opacity .2s;pointer-events:auto;';
    document.body.appendChild(toast);
  }

  toast.innerHTML = '';

  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);

  if (typeof onUndo === 'function') {
    const undoBtn = document.createElement('button');
    undoBtn.textContent = 'Undo';
    undoBtn.style.cssText =
      'background:#3ea6ff;color:#0f0f0f;border:none;border-radius:4px;' +
      'padding:4px 10px;font-weight:600;font-size:13px;cursor:pointer;' +
      'outline:none;transition:background 0.15s ease;';
    undoBtn.addEventListener('mouseenter', () => { undoBtn.style.background = '#65b8ff'; });
    undoBtn.addEventListener('mouseleave', () => { undoBtn.style.background = '#3ea6ff'; });
    undoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onUndo();
    });
    toast.appendChild(undoBtn);
  }

  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, onUndo ? 4500 : 2400);
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
              if (node.id === 'nyt-ext-toast' || (node.classList?.contains && (
                node.classList.contains('custom-blacklist-option') ||
                node.classList.contains('nyt-quick-block-btn')
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
