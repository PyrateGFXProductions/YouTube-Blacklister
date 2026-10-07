/*
 * Always New To You - Smart Feed Blacklist (v1.11.1)
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

// The card's thumbnail element — needed both to position the hover/quick-block
// control and by hunt mode. It had been copy-pasted into six call sites, so it
// lives here once; getCardThumbnail() below is the accessor.
const VIDEO_THUMB_SELECTOR =
  'ytd-thumbnail, #thumbnail, a#thumbnail, .yt-lockup-view-model-wiz__thumbnail, yt-thumbnail-view-model';

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
function dbg(...args) { if (DEBUG) try { console.log('[NewToYouExt]', ...args); } catch (_) { } }
function dbgWarn(...args) { if (DEBUG) try { console.warn('[NewToYouExt]', ...args); } catch (_) { } }

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

function safeSendRuntimeMessage(msg, callback) {
  if (!isExtensionValid()) {
    if (typeof callback === 'function') callback(null);
    return;
  }
  try {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime?.lastError) {
        if (typeof callback === 'function') callback(null);
        return;
      }
      if (typeof callback === 'function') callback(response);
    });
  } catch (_) {
    if (typeof callback === 'function') callback(null);
  }
}

// ------------------------------------------------------------------
// SETTINGS & STATE
// ------------------------------------------------------------------
let settings = {
  channels: [],
  keywords: [],
  whitelistChannels: [],
  blockShorts: false,
  shortsSubOnly: false,
  subsSnapshot: [],
  blockCommunity: false,
  autoDubMode: 'off',
  enableQuickBlock: true,
  triggerServerFeedback: false,
  aiAutonomous: false,
  aiSensitivity: 'balanced',
  aiModel: '',
  aiTastePrompt: '',
  aiSubscriptionProfile: '',
  aiDebaitTitles: false,
  aiDebaitModel: '',
  tldwEnabled: true,
  huntMode: false,
  chipRescue: false,
  newToYouAuto: false,

  // MASTER SWITCH. false = the extension is PAUSED: no rule hides a card, no hover
  // control is injected, no 3-dot menu row, no AI/debait work, and everything a rule
  // already hid is restored. Absent key means enabled, so existing installs keep
  // working unchanged.
  extensionEnabled: true
};

let activeMenuVideoCard = null;
let lastSeedTime = 0;
let lastBadgeCount = -1;
let processTimer = null;
let menuObserver = null;

// ------------------------------------------------------------------
// PERSISTED AI GUARDIAN DECISIONS
// ------------------------------------------------------------------
// The AI Guardian's verdict must OUTLIVE the DOM node that carried it.
//
// The old implementation recorded an interception only as an inline style plus
// `data-hidden-by-ai` on the card. Two consequences, both reported as bugs:
//   * on the very next processFeed() pass, evaluateCard() knew nothing about the
//     AI block, took the `else` branch and called unhideCardElement() — so every
//     AI interception was undone the moment the feed was re-scanned, and
//   * because the card was also stamped `data-ai-evaluated = <video id>`, the
//     video was never re-evaluated, so it stayed visible for good; and a page
//     refresh dropped the decision entirely.
//
// Decisions now live in `chrome.storage.local.nyt_aiDecisions`, keyed by video id
// (falling back to a normalized-title key when the card exposes no id), so they
// survive YouTube's card recycling, SPA navigation and a full reload.
//
// An entry's `state` is 'blocked' or 'allowed'. A blocked entry hides the card on
// every pass and on every surface; an 'allowed' entry means the user explicitly
// undid an AI block and the model must not re-block that video this session.
const AI_DECISION_STORAGE_KEY = 'nyt_aiDecisions';
const AI_DECISION_CAP = 500;

let aiDecisionEntries = [];
let aiBlockedKeys = new Set();
let aiHandledKeys = new Set();

// Stable identity for an AI decision. Video id first (YouTube recycles DOM nodes
// and rewrites titles, so neither the element nor the title text is a safe key on
// its own), then a title-derived fallback for cards that expose no id.
function aiDecisionKey(vid, title) {
  const v = String(vid || '').trim().toLowerCase();
  if (v) return v;
  const t = String(title || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return t ? 't:' + t : '';
}

function applyAiDecisions(list) {
  const arr = Array.isArray(list) ? list.filter(e => e && typeof e === 'object') : [];
  aiDecisionEntries = arr;
  const blocked = new Set();
  const handled = new Set();
  for (const e of arr) {
    const key = String(e.key || aiDecisionKey(e.id, e.title) || '');
    if (!key) continue;
    handled.add(key);
    if (e.state !== 'allowed') blocked.add(key);
  }
  aiBlockedKeys = blocked;
  aiHandledKeys = handled;
}

// Read-modify-write, so two tabs (or a tab and the popup) recording decisions at
// the same moment can never lose each other's entry — the failure mode of a blind
// whole-object write.
//
// The in-memory view is updated FIRST. A hide decision must be visible to the very
// next processFeed() pass, and that pass can run before the async storage
// round-trip finishes; without the optimistic update the matcher would not know
// about the block yet and would unhide the card it was just told to hide.
function persistAiDecisions(add, removeKeys) {
  const drop = new Set((removeKeys || []).map(k => String(k || '')));
  let optimistic = aiDecisionEntries.filter(e => e && !drop.has(String(e.key || '')));
  for (const entry of (add || [])) {
    if (!entry || !entry.key) continue;
    optimistic = optimistic.filter(e => String(e.key || '') !== String(entry.key));
    optimistic.unshift(entry);
  }
  applyAiDecisions(optimistic.slice(0, AI_DECISION_CAP));

  if (!isExtensionValid()) return;
  try {
    chrome.storage.local.get([AI_DECISION_STORAGE_KEY], (res) => {
      if (chrome.runtime?.lastError) return;
      const current = Array.isArray(res && res[AI_DECISION_STORAGE_KEY]) ? res[AI_DECISION_STORAGE_KEY] : [];
      let next = current.filter(e => e && !drop.has(String(e.key || '')));
      for (const entry of (add || [])) {
        if (!entry || !entry.key) continue;
        next = next.filter(e => String(e.key || '') !== String(entry.key));
        next.unshift(entry);
      }
      next = next.slice(0, AI_DECISION_CAP);
      chrome.storage.local.set({ [AI_DECISION_STORAGE_KEY]: next }, () => {
        if (chrome.runtime?.lastError) return;
        applyAiDecisions(next);
      });
    });
  } catch (_) { }
}

// Is there a live AI block for this video right now?
function isAiBlocked(vid, title) {
  const key = aiDecisionKey(vid, title);
  return Boolean(key) && aiBlockedKeys.has(key);
}

// Has the AI already ruled on this video (blocked or user-allowed)?
function isAiHandled(vid, title) {
  const key = aiDecisionKey(vid, title);
  return Boolean(key) && aiHandledKeys.has(key);
}

// ------------------------------------------------------------------
// TEMPORAL RULE EXPIRY (auto-expiring rules)
// ------------------------------------------------------------------
// A temporal rule is { keyword, expires: 'YYYY-MM-DD', reason, permanentBefore? }. The popup
// prunes them when its Settings tab renders — too late for a YouTube tab that is simply open:
// the content script loaded settings.temporalRules but never read it, so the keyword stayed
// ACTIVE and went on hiding videos after its own expiry date (the "it is still blocking
// something I only meant to block until Christmas" report). Expiry now runs on every settings
// load, in the context that actually does the hiding.
//
// Semantics mirror the popup's: a rule is live through the END of its stated day (local time),
// a keyword still covered by another live temporal rule survives, and a keyword that was
// already permanent before the timer was set (permanentBefore) is never removed.
function temporalExpiresMs(rule) {
  if (!rule || typeof rule !== 'object') return NaN;
  return Date.parse(String(rule.expires || '') + 'T23:59:59');
}

function isTemporalRuleExpired(rule, now) {
  const t = temporalExpiresMs(rule);
  return !isNaN(t) && t <= now;
}

function expireTemporalRules() {
  const rules = Array.isArray(settings.temporalRules) ? settings.temporalRules : [];
  if (!rules.length) return;
  const now = Date.now();
  if (!rules.some((r) => isTemporalRuleExpired(r, now))) return;

  const live = rules.filter((r) => !isTemporalRuleExpired(r, now));

  // Which keywords may leave the active list: expired, no longer covered by a live rule, and
  // not one the user already had before the timer was set.
  const drop = new Set();
  for (const r of rules) {
    if (!isTemporalRuleExpired(r, now)) continue;
    const kw = String((r && r.keyword) || '');
    if (!kw || r.permanentBefore) continue;
    if (live.some((x) => String((x && x.keyword) || '') === kw)) continue;
    drop.add(kw);
  }

  // In memory FIRST: the re-scan that follows this load must not hide with a lapsed rule.
  settings.temporalRules = live;
  if (drop.size) {
    settings.keywords = (Array.isArray(settings.keywords) ? settings.keywords : [])
      .filter((k) => !drop.has(String(k)));
  }

  // Then persist, so the popup and every other open tab agree without waiting for a render.
  // Read-modify-write, never a blind whole-object write — this tab does not own `keywords`.
  if (!isExtensionValid()) return;
  try {
    chrome.storage.local.get(['keywords', 'temporalRules'], (cur) => {
      if (chrome.runtime?.lastError) return;
      const out = {};
      if (Array.isArray(cur && cur.temporalRules)) {
        out.temporalRules = cur.temporalRules.filter((r) => !isTemporalRuleExpired(r, now));
      }
      if (drop.size && Array.isArray(cur && cur.keywords)) {
        out.keywords = cur.keywords.filter((k) => !drop.has(String(k)));
      }
      if (!Object.keys(out).length) return;
      try {
        chrome.storage.local.set(out, () => {
          if (chrome.runtime?.lastError) return;
          if (Array.isArray(out.keywords)) settings.keywords = out.keywords;
        });
      } catch (_) { }
    });
  } catch (_) { }
}

function loadSettings() {
  return new Promise((resolve) => {
    if (!isExtensionValid()) { resolve(); return; }
    try {
      chrome.storage.local.get([
        'channels',
        'keywords',
        'whitelistChannels',
        'blockShorts',
        'shortsSubOnly',
        'subsSnapshot',
        'blockCommunity',
        'autoDubMode',
        'enableQuickBlock',
        'triggerServerFeedback',
        'aiAutonomous',
        'aiSensitivity',
        'aiModel',
        'aiTastePrompt',
        'aiSubscriptionProfile',
        'aiDebaitTitles',
        'aiDebaitModel',
        'tldwEnabled',
        'huntMode',
        'chipRescue',
        'newToYouAuto',
        'extensionEnabled',
        'keywordExceptions',
        'temporalRules',
        AI_DECISION_STORAGE_KEY
      ], (res) => {
        if (chrome.runtime?.lastError) { resolve(); return; }
        settings.channels = (Array.isArray(res.channels) ? res.channels : settings.channels)
          .filter(c => {
            const raw = String(c || '').trim();
            if (!raw) return false;
            // Reject time-ago strings, view counts, and fragments leaked by old buggy code.
            // A channel NAME is not a metadata row, so isChannelNameText() re-admits the two
            // name-shaped cases the row classifier rejects ("1900", "Live") — otherwise a rule
            // the user saved for such a channel was DELETED here on every load.
            if (!isChannelNameText(raw)) return false;
            // Reject entries that are just digits + letters (like "3w ago" that slipped through as "3w")
            if (/^\d+[smhdwy]$/i.test(raw)) return false;
            // Channel names can legitimately be short ("DJ", "AI") or numeric ("1900"), so
            // do NOT reject by length or bare digits — those rules dropped real channels.
            return true;
          });
        // Persist the cleaned channels list back to storage if we removed anything
        if (settings.channels.length !== (Array.isArray(res.channels) ? res.channels.length : 0)) {
          try { chrome.storage.local.set({ channels: settings.channels }); } catch (_) { }
        }
        settings.keywords = Array.isArray(res.keywords) ? res.keywords : settings.keywords;
        settings.whitelistChannels = Array.isArray(res.whitelistChannels)
          ? res.whitelistChannels : settings.whitelistChannels;
        settings.blockShorts = Boolean(res.blockShorts);
        settings.shortsSubOnly = Boolean(res.shortsSubOnly);
        settings.subsSnapshot = Array.isArray(res.subsSnapshot) ? res.subsSnapshot : settings.subsSnapshot;
        settings.blockCommunity = Boolean(res.blockCommunity);
        settings.autoDubMode = ['off', 'smart', 'total'].includes(res.autoDubMode) ? res.autoDubMode : 'off';
        settings.enableQuickBlock = res.enableQuickBlock !== false;
        settings.triggerServerFeedback = Boolean(res.triggerServerFeedback);
        settings.aiAutonomous = Boolean(res.aiAutonomous);
        settings.aiSensitivity = res.aiSensitivity || 'balanced';
        settings.aiModel = res.aiModel || '';
        settings.aiTastePrompt = res.aiTastePrompt || '';
        settings.aiSubscriptionProfile = res.aiSubscriptionProfile || '';
        settings.aiDebaitTitles = Boolean(res.aiDebaitTitles);
        settings.aiDebaitModel = res.aiDebaitModel || settings.aiModel || '';
        settings.tldwEnabled = res.tldwEnabled !== false;
        settings.huntMode = Boolean(res.huntMode);
        settings.chipRescue = Boolean(res.chipRescue);
        settings.newToYouAuto = Boolean(res.newToYouAuto);
        settings.extensionEnabled = res.extensionEnabled !== false;
        settings.keywordExceptions = res.keywordExceptions && typeof res.keywordExceptions === 'object' ? res.keywordExceptions : {};
        settings.temporalRules = Array.isArray(res.temporalRules) ? res.temporalRules : [];
        // Expire lapsed temporal rules HERE, in the context that does the hiding — the popup
        // only prunes them when its Settings tab renders (see expireTemporalRules).
        expireTemporalRules();
        applyAiDecisions(res[AI_DECISION_STORAGE_KEY]);

        // The master switch is applied FIRST, because the stylesheet itself is a
        // hiding mechanism (shorts shelves and community posts are hidden by pure
        // CSS). While paused we tear it down and restore every card instead of
        // re-arming rules the user just asked us to stop enforcing.
        if (settings.extensionEnabled) injectBlacklistStyles();
        else restoreHiddenByRules();
        refreshSubscriptionKeySet();
        try { syncHuntMode(); } catch (_) { }
        resolve();
      });
    } catch (_) {
      resolve();
    }
  });
}

// NOTE: the content script has no whole-settings writer on purpose. It used to
// have saveSettings(), a blind chrome.storage.local.set() of the ENTIRE settings
// object from this tab's memory; a quick-block in a background tab (which
// deliberately skips settings reloads) therefore reverted every rule the popup had
// just written. The content script only ever owns the `channels` and
// `nyt_aiDecisions` keys, and both now go through read-modify-write helpers
// (persistChannels / persistAiDecisions) that merge instead of replace.

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

    extraRules += `
      #nyt-chip-rescue {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        border: none;
        border-radius: 18px;
        padding: 10px 16px;
        background: var(--yt-spec-call-to-action, #065fd4);
        color: #fff;
        font: 500 13px/1 Roboto, Arial, sans-serif;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,.35);
      }
      #nyt-chip-rescue:hover { filter: brightness(1.1); }
    `;

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
        top: 44px;
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
      ytd-thumbnail:has(.nyt-tldw-btn) .nyt-quick-block-btn,
      #thumbnail:has(.nyt-tldw-btn) .nyt-quick-block-btn,
      a#thumbnail:has(.nyt-tldw-btn) .nyt-quick-block-btn,
      .yt-lockup-view-model-wiz__thumbnail:has(.nyt-tldw-btn) .nyt-quick-block-btn,
      yt-thumbnail-view-model:has(.nyt-tldw-btn) .nyt-quick-block-btn,
      ytd-thumbnail:has(.nyt-tldw-btn) .nyt-extract-kw-btn,
      #thumbnail:has(.nyt-tldw-btn) .nyt-extract-kw-btn,
      a#thumbnail:has(.nyt-tldw-btn) .nyt-extract-kw-btn,
      .yt-lockup-view-model-wiz__thumbnail:has(.nyt-tldw-btn) .nyt-extract-kw-btn,
      yt-thumbnail-view-model:has(.nyt-tldw-btn) .nyt-extract-kw-btn {
        top: 44px;
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
      ytd-grid-video-renderer:hover .nyt-quick-block-btn,
      ytd-rich-item-renderer:hover .nyt-extract-kw-btn,
      yt-lockup-view-model:hover .nyt-extract-kw-btn,
      ytd-video-renderer:hover .nyt-extract-kw-btn,
      ytd-compact-video-renderer:hover .nyt-extract-kw-btn,
      ytd-grid-video-renderer:hover .nyt-extract-kw-btn,
      ytd-rich-item-renderer:hover .nyt-tldw-btn,
      yt-lockup-view-model:hover .nyt-tldw-btn,
      ytd-video-renderer:hover .nyt-tldw-btn,
      ytd-compact-video-renderer:hover .nyt-tldw-btn,
      ytd-grid-video-renderer:hover .nyt-tldw-btn {
        opacity: 0.92;
      }
      .nyt-extract-kw-btn {
        position: absolute;
        top: 44px;
        left: 50px;
        z-index: 999;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(18, 18, 18, 0.85);
        color: #7be2ff;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(4px);
        box-shadow: 0 2px 6px rgba(0,0,0,0.5);
        transform: scale(1);
      }
      .nyt-extract-kw-btn:hover {
        background: #2b9fff !important;
        color: #ffffff !important;
        transform: scale(1.1);
        border-color: #ffffff;
      }
      ytd-rich-item-renderer:hover .nyt-extract-kw-btn,
      yt-lockup-view-model:hover .nyt-extract-kw-btn,
      ytd-video-renderer:hover .nyt-extract-kw-btn,
      ytd-compact-video-renderer:hover .nyt-extract-kw-btn,
      ytd-grid-video-renderer:hover .nyt-extract-kw-btn {
        opacity: 0.92;
      }
      ${getAiFeatureCss()}
      ${extraRules}
    `;
  } catch (_) { }
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
      .nyt-debait-title {
        /* De-baiting strips YouTube's inner title <a>, which is the element
           that actually carries color: var(--yt-spec-text-primary). A bare
           text node then inherits the browser default (black) and vanishes
           on dark themes. Pin the text back to the theme variable with an
           inherit fallback for any layout that lacks it. */
        color: var(--yt-spec-text-primary, inherit);
      }
      .nyt-tldw-btn {
        position: absolute;
        top: 8px;
        left: 8px;
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
      /* Keyword lab — a field for the user's own description of the video plus the
         rules it produced. Sits next to the Blacklist Channel button because it is
         the same job: "I know what this is, help me block it." */
      .nyt-tldw-kwlab {
        margin-top: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-top: 12px;
      }
      .nyt-tldw-kwlab-label {
        font-size: 11px;
        color: #9aa3b2;
        font-weight: 700;
        letter-spacing: 0.3px;
        text-transform: uppercase;
        margin-bottom: 7px;
      }
      .nyt-tldw-kwrow {
        display: flex;
        gap: 8px;
        align-items: stretch;
      }
      .nyt-tldw-kwinput {
        flex: 1 1 auto;
        min-width: 0;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        padding: 8px 10px;
        color: #f1f1f1;
        font-size: 12px;
        font-family: Roboto, Arial, sans-serif;
        outline: none;
      }
      .nyt-tldw-kwinput::placeholder { color: #7d8695; }
      .nyt-tldw-kwinput:focus { border-color: rgba(123, 226, 255, 0.6); }
      .nyt-tldw-kwsuggest {
        background: #2ba0ff;
        color: #fff;
        white-space: nowrap;
        flex: 0 0 auto;
      }
      .nyt-tldw-kwchips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 9px;
      }
      .nyt-tldw-kwchip {
        background: rgba(94, 168, 255, 0.16);
        border: 1px dashed rgba(94, 168, 255, 0.6);
        color: #bcd8ff;
        border-radius: 14px;
        padding: 4px 11px;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        font-family: Roboto, Arial, sans-serif;
        transition: background 0.15s, color 0.15s;
      }
      .nyt-tldw-kwchip:hover { background: rgba(94, 168, 255, 0.34); color: #fff; }
      .nyt-tldw-kwchip.added {
        background: rgba(43, 166, 64, 0.22);
        border-style: solid;
        border-color: rgba(43, 166, 64, 0.7);
        color: #7ee29a;
        cursor: default;
      }
      .nyt-tldw-kwnote {
        font-size: 11px;
        color: #9aa3b2;
        margin-top: 7px;
        line-height: 1.4;
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
  // View counts: "1.2K views", "500", "1.2M watching", etc.
  if (/^\d+(\.\d+)?[kmb]?\s*(views?|watching)?$/i.test(s)) return true;
  // Time ago with full unit names: "2 hours ago", "1 day ago", "3 weeks ago"
  if (/^(streamed\s+)?\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i.test(s)) return true;
  // Time ago with abbreviated unit names: "2h ago", "3d ago", "5m ago", "10s ago", "1w ago"
  if (/^\d+\s*[smhdwy]\s+ago$/i.test(s)) return true;
  // Combined view-count + timestamp text in a single row: "1.5M views 8d ago", "8d ago 1.5M views"
  // Reject if the string contains ANY abbreviated or full-unit time-ago pattern
  if (/(?:streamed\s+)?\d+\s*[smhdwy]\s+ago/i.test(s)) return true;
  if (/\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago/i.test(s)) return true;
  if (/^live$/i.test(s)) return true;
  return false;
}

// Is this text usable as a CHANNEL IDENTITY (a display name, a handle, a slug)?
//
// isViewCountOrTimeText() answers "is this metadata ROW a view count or a timestamp?" — a
// question where a bare number and the bare word "live" are genuinely ambiguous (a compact
// row can render "1900" for the views and "LIVE" for a badge). A channel NAME is not a row:
// "1900" and "Live" are real channels, and asking the row question here did two bad things —
// it made those channels unblockable, and worse, it DELETED a saved rule for them on every
// load ("I blocked it and it came back", with the entry silently gone from the list).
//
// So the row classifier stays strict, and identity decisions go through this wrapper, which
// only re-admits the two genuinely name-shaped cases.
function isChannelNameText(text) {
  if (!text) return false;
  const s = String(text).trim();
  if (!s) return false;
  if (!isViewCountOrTimeText(s)) return true;
  if (/^\d+(\.\d+)?$/.test(s)) return true;   // "1900", "24" — a numeric channel name
  return /^live$/i.test(s);                   // a channel called "Live"
}

// Catastrophic-backtracking signatures: a group containing a nested quantifier OR an
// alternation, itself quantified from outside — e.g. (a+)+, (a|aa)+$, (ab|a)*. Checked
// before any user/imported regex runs.
function isReDoSSuspect(pattern) {
  return /\([^()]*(?:[*+{]|\|)[^()]*\)\s*[*+{]/.test(pattern);
}

function hasWordBoundaryKeyword(text, keyword) {
  if (!text || !keyword) return false;
  if (keyword.startsWith('/') && keyword.lastIndexOf('/') > 0) {
    // Bounded: an oversized or hostile pattern must never stall every tab's title scan.
    const lastSlash = keyword.lastIndexOf('/');
    const pattern = keyword.slice(1, lastSlash);
    const flags = keyword.slice(lastSlash + 1) || 'i';
    if (pattern.length <= 200 && !isReDoSSuspect(pattern)) {
      try {
        return new RegExp(pattern, flags).test(text);
      } catch (_) { }
    }
  }
  try {
    const cleanKw = cleanChannelText(keyword);
    const cleanT = cleanChannelText(text);
    // A keyword that normalizes away must NEVER match. cleanChannelText() strips YouTube's
    // "verified" word and its badge glyphs (✔ / ✓ / •), so a rule like `verified`, a
    // whitespace-only rule, or a pasted badge character reduces the pattern below to `\b\b`
    // — an expression that matches EVERY title. One such rule blanked the entire feed.
    if (!cleanKw) return false;
    if (cleanKw.length > 200) return cleanT.includes(cleanKw.toLowerCase());
    // \b is ASCII-word only: it can NEVER match keywords that start or end
    // with a non-word character, and it is a no-op after those characters.
    // Guard the boundary chars first so "#music" / "C++" stay matchable.
    const first = cleanKw[0], last = cleanKw[cleanKw.length - 1];
    const fB = /[a-zA-Z0-9_]/.test(first);
    const lB = /[a-zA-Z0-9_]/.test(last);
    const start = fB ? '\\b' : '';
    const end = lB ? '\\b' : '';
    return new RegExp(`${start}${escapeRegExp(cleanKw)}${end}`, 'i').test(cleanT);
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

  // Detect YouTube's multi-collaborator overlay: "YouTube and 2 more"
  const andMoreMatch = clean.match(/^(.+?)(?:,\s*|\s+)\s*(?:and|&)\s+\d+\s+more$/i);
  if (andMoreMatch) {
    // Split on separators ONLY (commas and "and"/"&") — never on raw whitespace,
    // or "Mark Rober" would split into "Mark" + "Rober". The FIRST part is the
    // primary display name (X in "X, Y and N more"); extras are collaborators —
    // do NOT add the raw regex group (it can be the whole joined string).
    const beforeMore = clean.replace(/(?:,\s*|\s+)\s*(?:and|&)\s+\d+\s+more$/i, '');
    const parts = beforeMore.split(/\s*,\s*|\s+(?:and|&)\s+/i)
      .map(p => cleanChannelText(p))
      .filter(p => p.length > 2 && isChannelNameText(p));
    if (parts[0]) names.add(parts[0]);
    for (const p of parts) { if (p && !names.has(p)) names.add(p); }
  } else {
    // Not an "X and N more" overlay — the clean text is the channel name itself.
    // But still skip it if it looks like view-count/time text.
    if (isChannelNameText(clean)) names.add(clean);
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
    // YouTube's modern yt-lockup-view-model (camelCase, no -wiz suffix)
    '.ytLockupMetadataViewModelHeadingReset a, ' +
    '.ytLockupMetadataViewModelTitle, ' +
    'h3.ytLockupMetadataViewModelHeadingReset, ' +
    // Legacy yt-lockup-metadata-view-model-wiz selectors (kept for backward compat)
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
    'yt-content-metadata-view-model .ytContentMetadataViewModelMetadataRow:first-child, ' +
    'yt-content-metadata-view-model .ytContentMetadataViewModelMetadataText, ' +
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
    if (t && isChannelNameText(t)) {
      const decomp = extractChannelNamesFromByline(t);
      // decomp[0] is the MAIN channel ("X" in "X and N more"); it is the
      // primary display name. Never return decomp[1] — that's a collaborator.
      return decomp[0] || t;
    }
    const title = el.getAttribute('title') || el.getAttribute('aria-label') || '';
    const cleaned = cleanChannelText(title.replace(/^go to channel\s+/i, ''));
    if (cleaned && isChannelNameText(cleaned)) return cleaned;
  }

  const anyChannelAnchor = card.querySelector?.('a[href*="/@"], a[href*="/channel/"], a[href*="/c/"], a[href*="/user/"]');
  if (anyChannelAnchor) {
    const t = cleanChannelText(anyChannelAnchor.textContent);
    if (t && isChannelNameText(t)) return t;
    const title = anyChannelAnchor.getAttribute('title') || anyChannelAnchor.getAttribute('aria-label') || '';
    const cleaned = cleanChannelText(title.replace(/^go to channel\s+/i, ''));
    if (cleaned && isChannelNameText(cleaned)) return cleaned;
  }

  return '';
}

function getCardChannelKeys(card) {
  const keys = new Set();
  if (!card) return [];

  const rawCandidates = card.querySelectorAll ? card.querySelectorAll(
    '#owner ytd-channel-name, #owner #channel-name, ' +
    'ytd-video-owner-renderer #channel-name, ytd-channel-name, ' +
    'yt-content-metadata-view-model .ytContentMetadataViewModelMetadataRow:first-child, ' +
    'yt-content-metadata-view-model .ytContentMetadataViewModelMetadataText, ' +
    'yt-content-metadata-view-model .yt-content-metadata-view-model-wiz__metadata-row:first-child, ' +
    'yt-content-metadata-view-model .yt-content-metadata-view-model-wiz__metadata-text, ' +
    '#channel-name, #byline, .ytd-channel-name, #text.ytd-channel-name'
  ) : [];

  for (const c of rawCandidates) {
    const t = cleanChannelText(c.textContent);
    if (t && isChannelNameText(t)) {
      // Skip YouTube's multi-collaborator overlay text ("X and N more") —
      // extractChannelNamesFromByline handles decomposition; the full overlay
      // string is NOT a valid channel key.
      if (/^(?:.+?)\s+(?:and|&)\s+\d+\s+more$/i.test(t)) {
        const decomp = extractChannelNamesFromByline(t);
        for (const d of decomp) {
          const norm = normalizeChannel(d);
          if (norm && norm.length > 2 && isChannelNameText(norm)) keys.add(norm);
        }
      } else {
        keys.add(normalizeChannel(t));
        const decomp = extractChannelNamesFromByline(t);
        for (const d of decomp) {
          const norm = normalizeChannel(d);
          if (norm && norm.length > 2 && isChannelNameText(norm)) keys.add(norm);
        }
      }
    }
  }

  const name = getChannelName(card);
  if (name && isChannelNameText(name)) {
    // Don't add the full "X and N more" overlay as a key — only its decomposed parts
    if (!/^(?:.+?)\s+(?:and|&)\s+\d+\s+more$/i.test(name)) {
      keys.add(normalizeChannel(name));
    }
    const decomp = extractChannelNamesFromByline(name);
    for (const d of decomp) {
      const norm = normalizeChannel(d);
      if (norm && norm.length > 2 && isChannelNameText(norm)) keys.add(norm);
    }
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
        if (cleaned && isChannelNameText(cleaned)) {
          if (!/^(?:.+?)\s+(?:and|&)\s+\d+\s+more$/i.test(cleaned)) {
            keys.add(normalizeChannel(cleaned));
          }
          const decomp = extractChannelNamesFromByline(cleaned);
          for (const d of decomp) {
            const norm = normalizeChannel(d);
            if (norm && norm.length > 2 && isChannelNameText(norm)) keys.add(norm);
          }
        }
      }
      const anchorText = cleanChannelText(a.textContent);
      if (anchorText && isChannelNameText(anchorText)) {
        keys.add(normalizeChannel(anchorText));
      }
    }
  }

  return Array.from(keys);
}

// Durable channel identities as they appear in a channel link's href.
const CHANNEL_ENTITY_RE = /^\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/;

// High-CONFIDENCE channel identities — the subset of a card's keys that is safe to
// persist as a permanent channel block.
//
// getCardChannelKeys() is deliberately generous, because it has to match whatever a
// given layout happened to render (and is also compared against the user's typed
// rules). It therefore carries noise: video ids, view counts, time-ago strings and
// name fragments produced by splitting a multi-collaborator byline. Persisting all
// of it once poisoned the blocklist with entries like "3w ago" and "sam".
//
// Storing ONLY the display name is the opposite failure: a channel blocked from a
// home-feed card does not fire on a surface that renders the handle or the channel
// id instead — which is exactly the "I blocked it and it came back" report. So a
// block persists the display name AND the channel's own handle/ID/slug, scoped to
// the card's own channel affordances so a collaboration guest is never blocked by
// accident.
function getChannelEntityKeys(card) {
  const keys = new Set();
  if (!card) return [];

  const name = getChannelName(card);
  const nameNorm = name && isChannelNameText(name) ? normalizeChannel(name) : '';
  if (nameNorm) keys.add(nameNorm);

  if (!card.querySelectorAll) return Array.from(keys);

  const scoped = card.querySelectorAll(
    '#owner a[href*="/@"], #owner a[href*="/channel/"], ' +
    'ytd-video-owner-renderer a[href*="/@"], ytd-video-owner-renderer a[href*="/channel/"], ' +
    '#channel-name a[href*="/@"], ytd-channel-name a[href*="/@"], ' +
    'yt-content-metadata-view-model a[href*="/@"], yt-content-metadata-view-model a[href*="/channel/"], ' +
    'yt-content-metadata-view-model a[href*="/c/"], yt-content-metadata-view-model a[href*="/user/"]'
  );

  for (const a of scoped) {
    const href = a.getAttribute ? (a.getAttribute('href') || '') : '';
    const m = href.match(CHANNEL_ENTITY_RE);
    if (!m) continue;
    // If the link carries visible text it must agree with the displayed channel
    // name; a mismatch means this is not the primary channel identity.
    const text = cleanChannelText(a.textContent);
    if (text && nameNorm && isChannelNameText(text) && normalizeChannel(text) !== nameNorm) continue;
    const raw = m[1];
    const norm = raw.startsWith('@')
      ? normalizeChannel(raw.slice(1))
      : normalizeChannel(raw.split('/')[1] || '');
    if (norm) keys.add(norm);
  }

  return Array.from(keys);
}

// Merge/remove channel entries with a read-modify-write, instead of the blind
// whole-object write this used to do.
//
// blacklistActiveChannel() called saveSettings(), which pushed the content
// script's ENTIRE in-memory settings object (keywords, whitelist, toggles, …) back
// to storage. Any tab holding slightly stale settings — and the storage listener
// deliberately no-ops while a tab is hidden — therefore reverted rules the popup
// had just written. Only the `channels` key belongs to the content script.
function persistChannels(addKeys, removeKeys) {
  const add = (Array.isArray(addKeys) ? addKeys : []).filter(Boolean);
  const drop = new Set((Array.isArray(removeKeys) ? removeKeys : []).map(k => String(k || '')));
  if (!add.length && !drop.size) return;

  // Optimistic in-memory update: the re-scan that follows the block must see it.
  const optimistic = (Array.isArray(settings.channels) ? settings.channels.slice() : [])
    .filter(k => !drop.has(String(k)));
  for (const k of add) if (!optimistic.includes(k)) optimistic.push(k);
  settings.channels = optimistic;

  if (!isExtensionValid()) return;
  try {
    chrome.storage.local.get(['channels'], (res) => {
      if (chrome.runtime?.lastError) return;
      let current = Array.isArray(res && res.channels) ? res.channels.slice() : [];
      current = current.filter(k => !drop.has(String(k)));
      for (const k of add) if (!current.includes(k)) current.push(k);
      chrome.storage.local.set({ channels: current }, () => {
        if (chrome.runtime?.lastError) return;
        settings.channels = current;
      });
    });
  } catch (_) { }
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

    // Same creator, different spelling: "Graham Hancock" (byline) vs "grahamhancock"
    // (the squashed form a captured subscription snapshot stores). Equality of the
    // alphanumeric core only, and only for cores long enough to be unambiguous.
    const sq = squashChannelKey(rawNorm || entityKey);
    if (sq) {
      for (const k of cardKeys) {
        if (squashChannelKey(k) === sq) return true;
      }
    }
    return false;
  });
}

// ------------------------------------------------------------------
// SUBSCRIPTION MIRROR: IDENTITY MATCHING
// (feed diversity meter + "Shorts: subscribed only" both key off this set)
// ------------------------------------------------------------------

// Normalized Set<string> of every identity in settings.subsSnapshot.
// Fed by loadSettings(); rebuilt on every RULES_UPDATED / storage change.
let subscriptionKeySet = null;

function buildSubscriptionKeySet() {
  const set = new Set();
  const channels = Array.isArray(settings.subsSnapshot) ? settings.subsSnapshot : [];
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    if (!ch || typeof ch !== 'object') continue;
    // Each identity is stored normalized AND squashed: the snapshot may hold a display
    // name ("Graham Hancock") while a card renders the handle ("@grahamhancock") or the
    // squashed form YouTube uses in some surfaces — see squashChannelKey().
    const add = (v) => {
      if (!v) return;
      const n = normalizeChannel(v);
      if (n) set.add(n);
      const sq = squashChannelKey(v);
      if (sq) set.add(sq);
    };
    if (ch.name) add(ch.name);
    if (ch.handle) add(ch.handle);
    if (ch.url) {
      const ek = extractEntityKey(ch.url);
      if (ek) add(ek);
    }
  }
  return set;
}

function refreshSubscriptionKeySet() {
  subscriptionKeySet = buildSubscriptionKeySet();
}

function getSubscriptionKeySet() {
  if (!subscriptionKeySet) refreshSubscriptionKeySet();
  return subscriptionKeySet;
}

// Does this feed card's channel identity appear in the subscription snapshot?
// Mirrors channelMatches() semantics: normalized name / handle / channel URL (video IDs never match).
function cardIsSubscribed(card) {
  if (!card) return false;
  const set = getSubscriptionKeySet();
  if (!set.size) return false;
  const keys = getCardChannelKeys(card);
  if (!keys.length) return false;
  for (let i = 0; i < keys.length; i++) {
    if (set.has(normalizeChannel(keys[i]))) return true;
    // Spelling-insensitive form ("Graham Hancock" vs "grahamhancock") — without it the
    // exemption silently missed channels whose snapshot entry is stored squashed, which is
    // how keyword rules and 'smart' auto-dub ended up hiding videos from channels the user
    // is subscribed to.
    const sq = squashChannelKey(keys[i]);
    if (sq && set.has(sq)) return true;
  }
  return false;
}

// The subscription snapshot as readable names/handles. Used for the AI Guardian's
// never-block list (the prompt wants names, the matcher wants identities) and for the
// popup's protected-channel reporting.
function subscriptionDisplayNames() {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(settings.subsSnapshot) ? settings.subsSnapshot : [];
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (!ch || typeof ch !== 'object') continue;
    const n = String(ch.name || ch.handle || '').trim();
    if (!n) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

// ------------------------------------------------------------------
// SHORTS: SUBSCRIBED-ONLY MODE (hybrid of the all-or-nothing blockShorts)
// ------------------------------------------------------------------
function filterShortsToSubscriptions() {
  if (!settings.shortsSubOnly || settings.blockShorts) return;
  const set = getSubscriptionKeySet();
  if (!set.size) return;

  const reels = document.querySelectorAll(
    'ytd-reel-item-renderer, yt-shorts-lockup-view-model, ' +
    'ytd-rich-shelf-renderer[is-shorts] ytd-rich-item-renderer, ' +
    'ytd-reel-shelf-renderer ytd-reel-item-renderer'
  );
  for (let i = 0; i < reels.length; i++) {
    const reel = reels[i];
    if (!reel || reel.dataset.hiddenByLocalBlacklist === 'true') continue;
    if (cardIsSubscribed(reel)) continue;
    // Tag what THIS filter hid. data-hidden-by-local-blacklist is shared with
    // ordinary channel/keyword/video blacklisting, so unhideShorts() cannot use
    // it to tell the two apart — see unhideShorts().
    reel.dataset.nytHiddenByShorts = '1';
    hideCardElement(reel);
  }

  // A shelf whose every reel got hidden should vanish entirely.
  const shelves = document.querySelectorAll('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]');
  for (let i = 0; i < shelves.length; i++) {
    const shelf = shelves[i];
    if (!shelf || shelf.dataset.hiddenByLocalBlacklist === 'true') continue;
    const survivors = shelf.querySelectorAll(
      'ytd-reel-item-renderer:not([data-hidden-by-local-blacklist="true"]), ' +
      'yt-shorts-lockup-view-model:not([data-hidden-by-local-blacklist="true"]), ' +
      'ytd-rich-item-renderer:not([data-hidden-by-local-blacklist="true"])'
    );
    if (!survivors.length) {
      shelf.dataset.nytHiddenByShorts = '1';
      hideCardElement(shelf);
    }
  }
}

// When shortsSubOnly is turned OFF (or subscriptions change), restore every
// shorts reel and shelf that filterShortsToSubscriptions hid.
function unhideShorts() {
  const reels = document.querySelectorAll(
    'ytd-reel-item-renderer, yt-shorts-lockup-view-model, ' +
    'ytd-rich-shelf-renderer[is-shorts] ytd-rich-item-renderer, ' +
    'ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]'
  );
  for (let i = 0; i < reels.length; i++) {
    const el = reels[i];
    if (!el) continue;
    // Only unhide what the shorts filter hid — never a channel/video/keyword
    // blacklist. The shared data-hidden-by-local-blacklist flag is NOT proof:
    // hideCardElement() sets it for ordinary blacklisted cards too, and because
    // `ytd-rich-item-renderer` is both a feed card (VIDEO_CARD_SELECTORS) and a
    // grid slot, testing that flag here un-hid every channel-blacklisted card on
    // the home feed on each pass. nytHiddenByShorts is set ONLY by
    // filterShortsToSubscriptions().
    if (el.dataset.nytHiddenByShorts === '1') {
      delete el.dataset.nytHiddenByShorts;
      unhideCardElement(el);
    }
  }
}

// ------------------------------------------------------------------
// FEED DIVERSITY METER
// ------------------------------------------------------------------
function measureFeedDiversity() {
  const cards = [];
  document.querySelectorAll(VIDEO_CARD_SELECTORS).forEach(card => {
    const title = getVideoTitle(card);
    if (!title || title.length < 2) return;
    cards.push(card);
  });

  let visible = 0, hidden = 0, subscribed = 0;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const isHidden = card.dataset.hiddenByLocalBlacklist === 'true' ||
      Boolean(card.closest('[data-hidden-by-local-blacklist="true"]'));
    if (isHidden) { hidden++; continue; }
    visible++;
    if (cardIsSubscribed(card)) subscribed++;
  }

  return { measured: true, total: cards.length, visible, hidden, subscribed, newToYou: visible - subscribed };
}

// ------------------------------------------------------------------
// CARD EVALUATION & REVERSIBLE HIDING
// ------------------------------------------------------------------
// Grid slots that merely CONTAIN a card (as opposed to being one). Collapsing one
// is an association, not a decision, so it needs its own marker: the shared
// data-hidden-by-local-blacklist flag is set by every hider (channel, keyword, AI,
// shorts) and can never distinguish "this slot holds something hidden" from "this
// slot is itself supposed to be hidden".
const GRID_SLOT_SELECTOR =
  'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytd-playlist-video-renderer';
const COLLAPSED_SLOT_FLAG = 'nytCollapsedSlot';

function clearHiddenStyles(el) {
  el.style.removeProperty('display');
  el.style.removeProperty('visibility');
  el.style.removeProperty('height');
  el.style.removeProperty('min-height');
  el.style.removeProperty('margin');
  el.style.removeProperty('padding');
  el.style.removeProperty('overflow');
}

function collapseSlot(el) {
  el.dataset.hiddenByLocalBlacklist = 'true';
  el.dataset[COLLAPSED_SLOT_FLAG] = '1';
  el.style.setProperty('display', 'none', 'important');
  el.style.setProperty('height', '0px', 'important');
  el.style.setProperty('min-height', '0px', 'important');
  el.style.setProperty('margin', '0px', 'important');
  el.style.setProperty('padding', '0px', 'important');
}

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
  const outer = card.parentElement ? card.parentElement.closest(GRID_SLOT_SELECTOR) : null;

  if (outer && outer !== card) {
    collapseSlot(outer);
  }
}

function unhideCardElement(card) {
  if (!card) return;

  // The slot must be restored even when the CARD node no longer carries the
  // marker. YouTube recycles and re-renders the inner card while the slot element
  // survives, so the old early-return (which bailed out unless THIS node was
  // flagged) left the slot collapsed at display:none !important for the life of
  // the page — a permanent blank hole in the grid.
  const outer = card.parentElement ? card.parentElement.closest(GRID_SLOT_SELECTOR) : null;

  if (card.dataset.hiddenByLocalBlacklist === 'true' && card.dataset[COLLAPSED_SLOT_FLAG] !== '1') {
    delete card.dataset.hiddenByLocalBlacklist;
    clearHiddenStyles(card);
  }

  if (outer && outer !== card && outer.dataset[COLLAPSED_SLOT_FLAG] === '1') {
    // Only restore the slot when nothing left inside it is still hidden — a slot
    // can host more than one card.
    const stillHidden = outer.querySelectorAll
      ? outer.querySelectorAll('[data-hidden-by-local-blacklist="true"]').length
      : 0;
    if (!stillHidden) {
      delete outer.dataset[COLLAPSED_SLOT_FLAG];
      delete outer.dataset.hiddenByLocalBlacklist;
      clearHiddenStyles(outer);
    }
  }
}

// Repair collapsed slots whose inner card is gone or no longer hidden — e.g. the
// card was recycled away, or the rule that hid it was deleted in the popup. Only
// elements we collapsed BY ASSOCIATION are candidates, so a card hidden by its own
// channel / keyword / AI / shorts rule is never resurrected.
function reconcileCollapsedSlots() {
  const slots = document.querySelectorAll('[data-nyt-collapsed-slot="1"]');
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot || !slot.querySelectorAll) continue;
    const stillHidden = slot.querySelectorAll('[data-hidden-by-local-blacklist="true"]').length;
    if (stillHidden) continue;
    delete slot.dataset[COLLAPSED_SLOT_FLAG];
    delete slot.dataset.hiddenByLocalBlacklist;
    clearHiddenStyles(slot);
  }
}

// ------------------------------------------------------------------
// MASTER SWITCH (PAUSE) — restore everything a rule hid
// ------------------------------------------------------------------
// Runs when `extensionEnabled` is false (from loadSettings and from processFeed).
// Five independent hiding mechanisms have to be undone, each with its OWN marker:
//   1. the rules stylesheet — hides shorts shelves / community posts via CSS only,
//   2. `data-hidden-by-local-blacklist` — channel / keyword / AI / auto-dub cards,
//   3. `data-nyt-collapsed-slot` — grid slots collapsed by association,
//   4. `data-nyt-hidden-by-shorts` — reels the subscribed-only shorts filter hid,
//   5. `data-debait-for` — titles the AI De-Baiter rewrote in place.
// The injected hover controls are removed too: with the stylesheet gone they would
// stay in the DOM as unstyled, permanently visible blobs on every thumbnail.
function restoreHiddenByRules() {
  // 1. Drop the stylesheet entirely — none of it should apply while paused.
  try {
    const style = document.getElementById('nyt-blacklist-styles');
    if (style && style.parentNode) style.parentNode.removeChild(style);
  } catch (_) { }

  // 2 + 3. Un-hide every card and every slot this extension collapsed. collapseSlot()
  // stamps BOTH markers on the slot, so the slot is in this node set as well.
  try {
    document.querySelectorAll('[data-hidden-by-local-blacklist="true"]').forEach(el => {
      delete el.dataset.hiddenByLocalBlacklist;
      delete el.dataset[COLLAPSED_SLOT_FLAG];
      delete el.dataset.hiddenReason;
      clearHiddenStyles(el);
    });
    // Belt and braces: repair any slot left collapsed with only the association marker.
    reconcileCollapsedSlots();
  } catch (_) { }

  // 4. Reels the subscribed-only shorts filter hid (own marker, own pass).
  try { unhideShorts(); } catch (_) { }

  // 5. Put the real titles back. The De-Baiter rewrites the title ELEMENT in place,
  //    so pausing has to restore the text or the titles stay AI-rewritten with no
  //    badge left to toggle them back.
  try {
    document.querySelectorAll('[data-debait-for]').forEach(card => {
      const el = getVideoTitleElement(card);
      const orig = card.dataset.originalTitle;
      if (el && orig && el.querySelector('.nyt-debait-title, .nyt-debait-badge')) {
        el.textContent = orig;
      }
      delete card.dataset.debaitState;
      delete card.dataset.debaitFor;
      delete card.dataset.neutralTitle;
      delete card.dataset.originalTitle;
    });
  } catch (_) { }

  // Injected UI and floating helpers have no stylesheet to live off while paused.
  try {
    document.querySelectorAll('.nyt-quick-block-btn, .nyt-extract-kw-btn, .nyt-tldw-btn')
      .forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
    document.querySelectorAll('.nyt-tldw-overlay, .nyt-tldw-modal')
      .forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
    removeChipRescueButton();
    huntStop();
  } catch (_) { }

  // The per-tab badge counts hidden cards; with nothing hidden it must read empty.
  try {
    if (lastBadgeCount !== 0) {
      lastBadgeCount = 0;
      safeSendRuntimeMessage({ type: 'UPDATE_BADGE', count: 0 });
    }
  } catch (_) { }
}

// ------------------------------------------------------------------
// AUTO-DUBBED DETECTION
// ------------------------------------------------------------------
// "Auto-dubbed" is the ONLY tag that may trigger the auto-dub filter. YouTube renders it
// as a badge/tag reading "Auto-dubbed" beside the title, and the user's rule for this
// feature is explicit: hide a video when that tag is present, and never on any other
// basis (the reported bug was ordinary, non-dubbed videos being hidden — ancient /
// history uploads among them — by a detector that counted any label merely CONTAINING
// "dubbed" as evidence). A tag is a whole string, so it is matched as one, anchored at
// the start; the bare word "Dub" ("Go to channel Dub FX") still never matches.
const AUTO_DUB_TAG_RE = /^\s*(?:audio\s*track\s*:\s*)?auto[-\s]?dub(?:bed)?\b/i;

function isAutoDubBadgeText(text) {
  return AUTO_DUB_TAG_RE.test(String(text || '').trim());
}

const AUTO_DUB_BADGE_SELECTORS = [
  'ytd-thumbnail-overlay-badge-view-model',
  'ytd-badge-supported-renderer',
  'yt-badge',
  'badge-shape',
  '.yt-badge-shape__text',
  '.badge-shape-wiz__text',
  '.ytBadgeShapeText',
  '.yt-content-metadata-view-model__badge'
];

// Returns any auto-dub badge text found on the card ('' if none).
function cardAutoDubBadgeText(card) {
  if (!card) return '';
  const found = new Set();
  try {
    // 1) aria-label carriers (badges expose their text via aria-label too)
    card.querySelectorAll('[aria-label]').forEach((el) => {
      const label = (el.getAttribute('aria-label') || '').trim();
      if (label && isAutoDubBadgeText(label)) found.add(label);
    });
    // 2) badge-shaped elements (thumbnail overlay, metadata-row badges, sidebar)
    card.querySelectorAll(AUTO_DUB_BADGE_SELECTORS.join(','))
      .forEach((el) => {
        const t = (el.textContent || '').trim();
        if (t && isAutoDubBadgeText(t)) found.add(t);
      });
  } catch (_) { }
  return Array.from(found).join(' \u23e9 ');
}

// Pure, testable. autoDubMode:
//   'off'   - no auto-dub filtering (keyword/regex rules still match badges)
//   'smart' - hide auto-dubbed recommendations, KEEP videos from channels the
//             user is subscribed to (their own content)
//   'total' - hide auto-dubbed everywhere — EVEN from channels the user has
//             watched or subscribed to. Only the whitelist overrides (caller
//             checks whitelist before this). This is the "not even from
//             watched channels" posture.
function autoDubHideDecision(mode, subscribed, badgeText) {
  if (!mode || mode === 'off') return { hidden: false, reason: null };
  if (!badgeText) return { hidden: false, reason: null };
  if (mode === 'total' || (mode === 'smart' && !subscribed)) {
    return { hidden: true, reason: `auto-dubbed:${badgeText}` };
  }
  return { hidden: false, reason: null };
}

// Pure, testable: should KEYWORD rules hide a card? Subscribed or whitelisted
// channels are exempt — the user chose those channels and subscribed feeds are
// exactly where breaking out of the algorithm's echo chamber lives. Explicit
// channel/video blacklists are handled separately by the caller.
// `extraText` carries badge text (e.g. "Auto-dubbed") so plain keyword/regex
// rules like `/auto.?dubbed/i` match the badge the same way they match titles.
// `keywordExceptions` is { keyword: [channel1, channel2] } - channels exempt from that keyword.
// `channelKeys` (optional) is the card's other identities (handle / channel id / slug) so an
// exception saved as a handle is honoured on surfaces that render the display name only.
//
// The exception list for a keyword, resolved CASE-INSENSITIVELY. The popup writes keys
// lowercased, but an imported or hand-edited backup can carry any casing, and the previous
// exact-key lookup (`exc[kw.toLowerCase()]`) silently ignored those exceptions — the user's
// "I exempted that channel and it still got hidden".
function keywordExceptionList(exc, keyword) {
  const want = canonicalKeywordLower(keyword);
  if (!want) return [];
  if (Array.isArray(exc[keyword])) return exc[keyword];
  if (Array.isArray(exc[want])) return exc[want];
  for (const k of Object.keys(exc)) {
    if (String(k).trim().toLowerCase() === want && Array.isArray(exc[k])) return exc[k];
  }
  return [];
}

function keywordRulesHidden({ title, channel, keywords, subscribed, whitelisted, extraText, keywordExceptions, channelKeys }) {
  if (subscribed || whitelisted) return { hidden: false, reason: null, matchedKeyword: null };
  const kw = Array.isArray(keywords) ? keywords : [];
  const exc = keywordExceptions && typeof keywordExceptions === 'object' ? keywordExceptions : {};
  const haystacks = [title, extraText, channel].filter(v => typeof v === 'string' && v);

  // Every identity THIS card is known by (display name, @handle, channel id, slug), so an
  // exception the user saved as "@news" still exempts a card that only renders the display
  // name — and vice versa. Matching the display name alone made handle-keyed exceptions
  // silently ineffective.
  const identities = new Set();
  const addIdentity = (v) => { const n = normalizeChannel(v); if (n) identities.add(n); };
  addIdentity(channel);
  for (const k of (Array.isArray(channelKeys) ? channelKeys : [])) addIdentity(k);

  for (let i = 0; i < haystacks.length; i++) {
    for (let j = 0; j < kw.length; j++) {
      if (hasWordBoundaryKeyword(haystacks[i], kw[j])) {
        // Check if this channel is exempt from this keyword
        const exemptChannels = keywordExceptionList(exc, kw[j]);
        const isExempt = exemptChannels.some(c => {
          const n = normalizeChannel(c);
          return Boolean(n) && identities.has(n);
        });
        if (isExempt) continue; // Skip this keyword for this channel
        return { hidden: true, reason: `keyword in ${haystacks[i]}`, matchedKeyword: kw[j] };
      }
    }
  }
  return { hidden: false, reason: null, matchedKeyword: null };
}

function evaluateCard(card) {
  const title = getVideoTitle(card);
  const cardKeys = getCardChannelKeys(card);
  const channel = getChannelName(card);
  const vid = getVideoId(card);

  const resolved = Boolean(title || cardKeys.length || channel || vid);
  if (!resolved) {
    if (window.__blkDebug) {
      console.log('[blkDebug] UNRESOLVED card:', { title, channel, vid, cardKeys, cardTag: card.tagName });
    }
    return { hidden: false, reason: null, resolved: false };
  }

  if (window.__blkDebug) {
    console.log('[blkDebug] evaluating:', { title, channel, vid, cardKeys, keywords: settings.keywords });
  }

  // Whitelist always overrides blacklists
  if (channelMatches(card, settings.whitelistChannels)) {
    if (window.__blkDebug) console.log('[blkDebug] WHITELISTED:', channel || cardKeys[0]);
    return { hidden: false, reason: null, resolved: true };
  }

  // Channel blacklist
  if (channelMatches(card, settings.channels)) {
    if (window.__blkDebug) console.log('[blkDebug] CHANNEL HIT:', channel || cardKeys[0]);
    return { hidden: true, reason: `channel:${channel || cardKeys[0]}`, resolved: true };
  }

  // Direct Video ID or Video URL blacklist
  if (vid && settings.channels.some(c => {
    const ek = extractEntityKey(c);
    return ek && ek === vid.toLowerCase();
  })) {
    if (window.__blkDebug) console.log('[blkDebug] VIDEO ID HIT:', vid);
    return { hidden: true, reason: `video:${vid}`, resolved: true };
  }

  // Persisted AI Guardian decision. Consulted here (and not only in the batch
  // handler) because processFeed() re-evaluates every card on every pass: without
  // a matcher-level rule, the pass took the `else` branch and un-hid the card.
  if (isAiBlocked(vid, title)) {
    if (window.__blkDebug) console.log('[blkDebug] AI DECISION HIT:', vid || title);
    return { hidden: true, reason: 'ai', resolved: true };
  }

  // Auto-dubbed videos: the badge is the signal (title keyword rules can't see it).
  // Mode decides: 'total' hides even subscribed/watched channels ("not even from
  // channels I've watched"); 'smart' keeps subscribed channels; whitelist always
  // won earlier, so it overrides both.
  const subscribedForAutoDub = cardIsSubscribed(card);
  const badgeText = cardAutoDubBadgeText(card);
  const autoDubCall = autoDubHideDecision(settings.autoDubMode, subscribedForAutoDub, badgeText);
  if (autoDubCall.hidden) {
    if (window.__blkDebug) console.log('[blkDebug] AUTO-DUBBED HIT:', autoDubCall.reason);
    return { hidden: true, reason: autoDubCall.reason, resolved: true };
  }

  // Word-boundary title keywords or regex (channel-name rules included below).
  // Subscribed channels are never keyword-censored on any feed. Badge text is
  // included so keyword rules like /auto.?dubbed/i match the badge too.
  const kwDecision = keywordRulesHidden({
    title,
    channel,
    keywords: settings.keywords,
    extraText: badgeText,
    subscribed: subscribedForAutoDub,
    whitelisted: false, // whitelist already returned above
    keywordExceptions: settings.keywordExceptions,
    // The card's channel identities, minus its video id (which is not a channel).
    channelKeys: cardKeys.filter(k => !vid || k !== vid.toLowerCase())
  });
  if (kwDecision.hidden) {
    if (window.__blkDebug) console.log('[blkDebug] KEYWORD HIT:', kwDecision.reason);
    // Increment hit counter for the matched keyword
    if (kwDecision.matchedKeyword && typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'INCREMENT_KEYWORD_HIT', keyword: kwDecision.matchedKeyword }).catch(() => { });
    }
    return { hidden: true, reason: kwDecision.reason, resolved: true };
  }

  if (window.__blkDebug) console.log('[blkDebug] NO MATCH:', title);
  return { hidden: false, reason: null, resolved: true };
}

// Debug helper: toggle with `window.__blkDebug = true` in the console on a YouTube tab.
// Dumps stored settings and every visible feed card's extraction results.
if (typeof window !== 'undefined') {
  window.__blkInspect = function () {
    const cards = document.querySelectorAll(VIDEO_CARD_SELECTORS);
    const info = [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      info.push({
        tag: card.tagName,
        title: getVideoTitle(card),
        channel: getChannelName(card),
        vid: getVideoId(card),
        cardKeys: getCardChannelKeys(card),
        hidden: card.dataset.hiddenByLocalBlacklist === 'true',
        matched: evaluateCard(card)
      });
    }
    return {
      settings: {
        keywords: settings.keywords,
        channels: settings.channels,
        whitelistChannels: settings.whitelistChannels
      },
      cards: info
    };
  };
}

// ------------------------------------------------------------------
// WATCH PAGE INTEGRITY GUARD
// ------------------------------------------------------------------

// Pure decision logic for the watch page guard — no DOM, node-testable.
//
// User-visible invariant: opening a watch page is a DELIBERATE act.
// Keyword/regex rules are FEED-filtering tools; they must never navigate
// a user away from a page they opened. Only explicit blacklists (a blocked
// video ID or a blocked channel) may interrupt playback. Whitelisted or
// genuinely subscribed (subsSnapshot) channels are NEVER interrupted —
// subscriptions are the user's own content. A subscribed channel that also
// sits in the blacklist still gets hidden from feeds (see evaluateCard),
// but the watch page is not kidnapped.
function watchPageBlockDecision({ vid, channel, title, channels, whitelistChannels, keywords, subscribed }) {
  const wl = Array.isArray(whitelistChannels) ? whitelistChannels : [];
  const ch = Array.isArray(channels) ? channels : [];
  const kw = Array.isArray(keywords) ? keywords : [];
  const subs = subscribed instanceof Set ? subscribed : new Set();

  // Whitelist always wins.
  if (channel && wl.some(w => normalizeChannel(w) === channel)) {
    return { block: false, reason: 'whitelisted' };
  }

  // Genuinely subscribed channels are the user's own content — never interrupt,
  // even if the channel also appears explicitly in the blacklist.
  if (channel && subs.has(channel)) {
    return { block: false, reason: 'subscribed' };
  }

  if (vid && ch.some(c => extractEntityKey(c) === vid)) {
    return { block: true, reason: 'video-id' };
  }

  if (channel && ch.some(c => normalizeChannel(c) === channel || extractEntityKey(c) === channel)) {
    return { block: true, reason: 'channel' };
  }

  // Keywords (title or channel-name) NEVER hard-block the watch page.
  // They remain active as feed hiders (see keywordRulesHidden), where hiding
  // is cheap, reversible, and does not hijack navigation.
  return { block: false, reason: null };
}

// Latch: only ONE watch-page escape may be scheduled. The watch-page guard
// runs on every SPA navigation/finish AND the blacklist action can fire the
// same escape — without the latch, stacked history.back() calls would eject
// the user two pages deep instead of one.
let watchRedirectPending = false;

function redirectAwayFromWatchPage(ms) {
  if (watchRedirectPending) return;
  watchRedirectPending = true;
  setTimeout(() => {
    watchRedirectPending = false;
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'https://www.youtube.com/';
    }
  }, ms);
}

function checkCurrentWatchPageVideo() {
  // Master switch: paused means we must not pause the player or navigate the user
  // away from a video, however blacklisted it is. (yt-navigate-finish calls this
  // directly, not only through processFeed.)
  if (!settings.extensionEnabled) return;
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

    // Pure, testable decision: explicit blacklists may interrupt; keywords,
    // whitelisted channels and subscribed channels may not.
    const decision = watchPageBlockDecision({
      vid: vidLower,
      channel: normChannel,
      title,
      channels: settings.channels,
      whitelistChannels: settings.whitelistChannels,
      keywords: settings.keywords,
      subscribed: getSubscriptionKeySet()
    });

    if (decision.block) {
      try {
        const video = document.querySelector('video');
        if (video) video.pause();
      } catch (_) { }

      showToast(`Blacklisted video detected: ${channel || title || currentVid}`);
      redirectAwayFromWatchPage(700);
    }
  } catch (_) { }
}

// ------------------------------------------------------------------
// FEED PROCESSING ENGINE
// ------------------------------------------------------------------
function processFeed(force = false) {
  // MASTER SWITCH: the user paused the extension. Restore anything a rule hid
  // (idempotent) and touch nothing else — no per-card evaluation, no AI batch, no
  // debait pass, no badge update, no watch-page redirect.
  if (!settings.extensionEnabled) {
    restoreHiddenByRules();
    return 0;
  }

  // Hidden tabs (incl. leftovers from the old scan bug) cost ~nothing now.
  if (document.visibilityState === 'hidden') return 0;
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

  // Shorts: subscribed-only hybrid — hide reels from channels we don't subscribe to.
  // (Global blockShorts mode is handled entirely by CSS and takes precedence.)
  if (settings.shortsSubOnly && !settings.blockShorts) {
    try { filterShortsToSubscriptions(); } catch (_) { }
  } else if (!settings.blockShorts) {
    // shortsSubOnly just turned OFF (or subscriptions changed): stop leaving
    // earlier-hid shorts shelves permanently hidden.
    try { unhideShorts(); } catch (_) { }
  }

  // Repair any grid slot left collapsed after its card was recycled away or the
  // rule that hid it was removed — otherwise the hole stays for the life of the
  // page. Only slots collapsed BY ASSOCIATION are candidates (own marker), so a
  // card hidden by its own channel/keyword/AI/shorts rule is never resurrected.
  try { reconcileCollapsedSlots(); } catch (_) { }

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
  } catch (_) { }

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
  if (!settings.extensionEnabled || !settings.aiAutonomous) return;
  if (aiEvalTimer) clearTimeout(aiEvalTimer);
  aiEvalTimer = setTimeout(() => {
    runAiEvaluationBatch();
  }, 1200);
}

// A Guardian verdict whose stated reason is one of the user's own RULES. Rule enforcement
// is deterministic and exact (keywordRulesHidden / hasWordBoundaryKeyword, mirrored by the
// offline evaluator): a card that genuinely matched a rule is hidden BEFORE this batch is
// even built (runAiEvaluationBatch skips cards flagged hiddenByLocalBlacklist), so a
// rationale that cites a rule is the model reasoning from the rule list instead of from
// the video. That is the reported "'10 Prehistoric Blades Made From Metal' matches the
// 'top 10' rule" block — a title no rule in the list matches. Such verdicts are refused;
// the Guardian is for the judgement calls a regex cannot make.
//
// This is a TEXT heuristic by nature (the model's rationale is free text), so it is kept
// narrow: it only rejects verdicts that name a rule/blacklist as their basis.
const AI_RULE_CITATION_RE = /\b(?:keyword|blacklist|block\s?list|rule|regex|pattern|blocked\s+channel|channel\s+block)s?\b/i;

function aiRationaleCitesUserRule(rationale) {
  return AI_RULE_CITATION_RE.test(String(rationale == null ? '' : rationale));
}

function runAiEvaluationBatch() {
  // The master switch is re-checked here: a batch timer armed before the user paused
  // would otherwise still fire and hide cards seconds after they turned us off.
  if (!settings.extensionEnabled || !settings.aiAutonomous || aiBatchPending) return;
  const cards = document.querySelectorAll(VIDEO_CARD_SELECTORS);
  const candidates = [];

  for (let i = 0; i < cards.length && candidates.length < 6; i++) {
    const card = cards[i];
    if (!card) continue;
    if (card.dataset.hiddenByLocalBlacklist === 'true') continue;

    const vid = getVideoId(card);
    const title = getVideoTitle(card);
    const channel = getChannelName(card);
    if (!title || title.length < 5) continue;

    // Already ruled on by the Guardian — blocked (hidden above, so already
    // skipped) or explicitly allowed by the user's Undo. Never ask again: an
    // Undo that gets re-blocked a second later is not an Undo.
    if (isAiHandled(vid, title)) continue;

    // Keyed to the card's VIDEO, not a flat boolean. YouTube recycles card
    // elements; with a sticky 'true' a recycled element was never evaluated for
    // the video that replaced it, which is exactly what this file's header
    // promises against. `vid` is stable, so de-baiting the title text (which
    // rewrites the title element) does not invalidate the key.
    const identity = vid || title;
    if (card.dataset.aiEvaluated === identity) continue;

    card.dataset.aiEvaluated = identity;
    // The badge rides along: it is real evidence (e.g. "Auto-dubbed") that the
    // model cannot see from the title, and the content-script matcher already
    // treats it as a first-class signal.
    candidates.push({ card, id: identity, vid, title, channel, badge: cardAutoDubBadgeText(card) });
  }

  if (!candidates.length) return;

  aiBatchPending = true;
  safeSendRuntimeMessage({
    type: 'AI_EVALUATE_BATCH',
    videos: candidates.map(c => ({ id: c.id, title: c.title, channel: c.channel, badge: c.badge || '' })),
    persona: [settings.aiTastePrompt, settings.aiSubscriptionProfile].filter(Boolean).join(' — '),
    sensitivity: settings.aiSensitivity,
    modelChoice: settings.aiModel,
    keywords: settings.keywords,
    channels: settings.channels,
    // The user's protected channels: the model must never be allowed to block
    // what the user explicitly whitelisted.
    whitelist: settings.whitelistChannels,
    // ...and the channels the user is subscribed to. The Guardian filters the
    // DISCOVERY feed; it has no business second-guessing a channel the user chose.
    // (Reported: it hid content from an ancient-history channel they are subscribed to.)
    subscribed: subscriptionDisplayNames()
  }, (res) => {
    aiBatchPending = false;
    if (!res || !Array.isArray(res.evaluations)) {
      candidates.forEach(c => {
        if (c.card && c.card.dataset) delete c.card.dataset.aiEvaluated;
      });
      return;
    }

    res.evaluations.forEach(ev => {
      if (!ev || ev.block !== true) return;
      const match = candidates.find(c => c.id === ev.id);
      if (!match || !match.card || !match.card.isConnected) return;
      if (match.card.dataset.hiddenByLocalBlacklist === 'true') return;

      // USER-INTENT GATES, enforced HERE rather than in the prompt: an instruction a
      // model can ignore is not a constraint, and the reported blocks were exactly the
      // model ignoring its instructions.
      //   * a whitelisted channel is never hidden by the Guardian (the same
      //     whitelist-first precedence evaluateCard() applies to every other rule);
      //   * nor is a channel in the user's subscription snapshot;
      //   * nor is a verdict whose rationale claims one of the user's own rules matched
      //     (see aiRationaleCitesUserRule — those blocks are deterministic elsewhere).
      if (channelMatches(match.card, settings.whitelistChannels)) return;
      if (cardIsSubscribed(match.card)) return;
      if (aiRationaleCitesUserRule(ev.rationale)) return;

      const key = aiDecisionKey(match.vid, match.title);
      if (!key) return;

      const rationale = ev.rationale || 'Flagged by AI Guardian';

      // Persist FIRST. The hide must not depend on this DOM node surviving:
      // storing it only as an inline style is what made AI blocks vanish on the
      // next feed pass and on every refresh.
      persistAiDecisions([{
        key,
        id: match.vid || '',
        title: match.title,
        channel: match.channel,
        badge: match.badge || '',
        rationale,
        date: new Date().toISOString(),
        state: 'blocked'
      }], []);

      hideCardElement(match.card);
      match.card.dataset.hiddenByAi = key;
      safeSendRuntimeMessage({ type: 'INCREMENT_BLOCKED', inc: 1 });

      // Mirror into aiLog so the popup's Autonomous Guardian list keeps working.
      try {
        chrome.storage.local.get(['aiLog'], (store) => {
          if (chrome.runtime?.lastError) return;
          const logs = Array.isArray(store && store.aiLog) ? store.aiLog : [];
          logs.unshift({
            title: match.title,
            channel: match.channel,
            rationale,
            date: new Date().toISOString()
          });
          chrome.storage.local.set({ aiLog: logs.slice(0, 30) }, () => { if (chrome.runtime?.lastError) return; });
        });
      } catch (_) { }

      showToast(`🤖 AI Intercepted: "${match.title.slice(0, 35)}..." (${rationale})`, () => {
        // Undo writes a real allowlist decision, not just a style removal.
        // Stripping the style alone left the model free to re-block the same
        // video on its next pass — an Undo button that visibly did nothing.
        persistAiDecisions([{
          key,
          id: match.vid || '',
          title: match.title,
          channel: match.channel,
          rationale: 'Allowed by user (undo)',
          date: new Date().toISOString(),
          state: 'allowed'
        }], []);
        unhideCardElement(match.card);
        delete match.card.dataset.hiddenByAi;
        delete match.card.dataset.lastSignature;
        safeSendRuntimeMessage({ type: 'INCREMENT_BLOCKED', inc: -1 });
      });
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

function collectVisibleFeedItems(limit = 15) {
  const items = [];
  const seen = new Set();
  const max = Math.max(1, Number(limit) || 15);

  const addItem = (title, channel, vid) => {
    const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim();
    if (cleanTitle.length < 3 || items.length >= max) return;
    const cleanChannel = String(channel || '').replace(/\s+/g, ' ').trim();
    const cleanVid = String(vid || '').trim();
    const key = cleanVid || `${cleanChannel.toLowerCase()}|${cleanTitle.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ title: cleanTitle, channel: cleanChannel, vid: cleanVid });
  };

  const cards = document.querySelectorAll(VIDEO_CARD_SELECTORS);
  for (let i = 0; i < cards.length && items.length < max; i++) {
    const card = cards[i];
    if (!card || card.dataset.hiddenByLocalBlacklist === 'true') continue;
    addItem(getVideoTitle(card), getChannelName(card), getVideoId(card));
  }

  // YouTube periodically changes its card hosts. Fall back to title links so
  // the diagnostic still works while the main card selectors are catching up.
  if (items.length < max) {
    const titleLinks = document.querySelectorAll(
      'a#video-title, a#video-title-link, ' +
      'a.yt-lockup-metadata-view-model-wiz__title, ' +
      '.yt-lockup-metadata-view-model-wiz__heading-reset a, ' +
      '.ytLockupMetadataViewModelTitle, ' +
      'h3.ytLockupMetadataViewModelHeadingReset a, ' +
      'a[href*="/watch?v="], a[href*="/shorts/"]'
    );
    for (let i = 0; i < titleLinks.length && items.length < max; i++) {
      const link = titleLinks[i];
      const card = link.closest?.(VIDEO_CARD_SELECTORS);
      if (card?.dataset.hiddenByLocalBlacklist === 'true') continue;
      const title = card ? getVideoTitle(card) : link.textContent;
      const channel = card ? getChannelName(card) : '';
      const href = link.getAttribute?.('href') || '';
      const vid = card ? getVideoId(card) : extractEntityKey(href);
      addItem(title || link.textContent, channel, vid);
    }
  }

  return items;
}

// Scrape subscribed channels from the YouTube subscriptions page (youtube.com/feed/channels)
async function scrapeSubscriptions() {
  const channels = [];
  const seen = new Set();
  const MAX_CHANNELS = 500;

  const addChannel = (name, handle, href) => {
    const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
    if (!cleanName || cleanName.length < 2 || channels.length >= MAX_CHANNELS) return;
    const cleanHandle = String(handle || '').replace(/\s+/g, ' ').trim();
    const cleanHref = String(href || '').trim();
    const key = cleanHandle || cleanName.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    channels.push({ name: cleanName, handle: cleanHandle, url: cleanHref });
  };

  const SIGN_IN_MARKERS = [
    'Sign in to confirm you\u2019re not a bot',
    'Sign in to confirm you are not a bot',
    'ytd-consent-bump-renderer',
    'Sign in to subscribe'
  ];

  const signedIn = () => {
    const body = document.body ? document.body.innerText : '';
    // aria-label markers are matched with a REAL selector (the old string was
    // truncated at the quote and `document.querySelector` threw on it).
    if (document.querySelector(
      '[aria-label^="Sign in to confirm"], [aria-label*="Sign in to confirm"], #button[aria-label*="Sign in"]'
    )) return false;
    return !SIGN_IN_MARKERS.some(m => m === 'ytd-consent-bump-renderer'
      ? !!document.querySelector('ytd-consent-bump-renderer')
      : body.includes(m));
  };

  // YouTube periodically reshapes this page; tiered selectors keep the scrape working
  const collectFromDom = () => {
    // Tier 1: standard ytd-channel-renderer anchors
    document.querySelectorAll('ytd-channel-renderer a#main-link').forEach(a => {
      const renderer = a.closest('ytd-channel-renderer');
      const nameEl = a.querySelector('yt-formatted-string#text, #channel-title, yt-formatted-string');
      const handleEl = (renderer || a).querySelector(
        'yt-formatted-string#handle, #handle, .yt-content-metadata-view-model-wiz__metadata-text, .ytContentMetadataViewModelMetadataText'
      );
      addChannel(nameEl?.textContent || a.getAttribute('aria-label'), handleEl?.textContent, a.getAttribute('href'));
    });

    // Tier 2: anchors missing entirely — pull straight from the renderer nodes
    if (channels.length < 3) {
      document.querySelectorAll('ytd-channel-renderer').forEach(r => {
        const nameEl = r.querySelector('#channel-title, yt-formatted-string#text');
        if (!nameEl) return;
        const link = r.querySelector('a#main-link, a[href^="/@"]');
        const handleEl = r.querySelector('yt-formatted-string#handle, #handle');
        addChannel(nameEl.textContent, handleEl?.textContent, link?.getAttribute('href'));
      });
    }
  };

  // The list is lazy-loaded — scroll a few passes so YouTube hydrates the full set.
  // Bounded loop with an early break once the DOM stops growing.
  let prevCount = -1;
  for (let attempt = 0; attempt < 4; attempt++) {
    collectFromDom();
    if (channels.length === prevCount) break;
    prevCount = channels.length;
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 700));
  }
  window.scrollTo(0, 0); // restore the user's scroll position

  // Background (inactive) tabs get throttled, so a freshly-created subscriptions
  // tab may not have hydrated its SPA yet. Give it a couple of extra passes and
  // distinguish "signed out" from "really no channels" instead of guessing.
  if (channels.length < 3) {
    for (let attempt = 0; attempt < 2 && channels.length < 3; attempt++) {
      await new Promise(r => setTimeout(r, 800));
      collectFromDom();
    }
  }

  return { ok: true, channels, count: channels.length, url: location.href, signedIn: signedIn() };
}

// ------------------------------------------------------------------
// CHANNEL TASTE SAMPLING
// ------------------------------------------------------------------
// "Synthesize Rules from My Subscriptions" used to see a channel list and nothing else, so
// it could only ever reason about TOPIC ("you like drag racing"). The user's actual request
// is finer than that: they follow Cleetus McFarland and not Beater Bomb, Matt's Off Road
// Recovery and not Murphy's — same subject, different personality, presentation and edit.
// Topic is the one thing that does NOT distinguish those pairs, so a topic-only profile
// cannot express the preference at all.
//
// What distinguishes them IS readable from the outside: how the creator writes titles, what
// the descriptions say, how long the videos are, whether they use ALL CAPS and hype, how
// they name their series and their own on-camera persona. So for a bounded sample of
// channels we read that public text and hand it to the local model, which can then name the
// STYLE the user actually keeps choosing (and the neighbouring style they don't).
//
// All of this is the same-origin public page the extension is already allowed to read.
// Nothing leaves the machine except to the user's own local model.
const CHANNEL_SAMPLE_MAX_VIDEOS = 6;
const CHANNEL_SAMPLE_DESC_CHARS = 300;
const CHANNEL_SAMPLE_TITLE_CHARS = 110;

// Pull the channel's own public blurb + a handful of recent uploads out of a
// /videos page's ytInitialData. Pure and testable: no DOM, no network.
function parseChannelPageSample(html, fallbackName) {
  const out = { name: '', description: '', subscriberText: '', videos: [] };
  // YouTube text is either a plain string, `{simpleText}`, or `{runs:[{text}]}`. Stringifying
  // the object form yields "[object Object]" — which is how a video's length and description
  // used to reach the model.
  const textOf = (node) => {
    if (node == null) return '';
    if (typeof node === 'string') return node;
    if (typeof node === 'object') {
      if (typeof node.simpleText === 'string') return node.simpleText;
      if (Array.isArray(node.runs)) return node.runs.map(r => (r && r.text) || '').join('');
      if (typeof node.content === 'string') return node.content;
    }
    return '';
  };
  try {
    const marker = 'ytInitialData';
    const idx = html.indexOf(marker);
    if (idx === -1) return out;
    const open = html.indexOf('{', idx);
    if (open === -1) return out;
    // Balance braces so the trailing `;</script>` and any later JSON cannot truncate it.
    let depth = 0, end = -1, inStr = false, esc = false;
    for (let i = open; i < html.length; i++) {
      const ch = html[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) return out;
    const data = JSON.parse(html.slice(open, end + 1));
    const header = data && data.header && (data.header.pageHeaderRenderer || data.header.c4TabbedHeaderRenderer);
    if (header) {
      const md = header.metadata && header.metadata.channelMetadataRenderer;
      if (md) {
        // The parsed title must WIN over the caller's fallback, not be blocked by it —
        // the fallback is the scraped display name, which is the less reliable of the two.
        if (md.title) out.name = textOf(md.title).trim();
        out.description = textOf(md.description).replace(/\s+/g, ' ').trim().slice(0, 500);
        out.subscriberText = textOf(md.subscriberCountText).trim();
      }
      if (!out.description && header.description) {
        out.description = textOf(header.description).replace(/\s+/g, ' ').trim().slice(0, 500);
      }
    }
    // Videos arrive either as richItemRenderer.content.videoRenderer or as
    // richItemRenderer.content.lockupViewModel (the newer shape) — handle both.
    const tabs = (data && data.contents && data.contents.twoColumnBrowseResultsRenderer
      && data.contents.twoColumnBrowseResultsRenderer.tabs) || [];
    const items = [];
    const pushVideo = (v) => {
      if (!v || !v.title) return;
      const t = textOf(v.title);
      const desc = textOf(v.descriptionSnippet).replace(/\s+/g, ' ').trim();
      const len = textOf(v.lengthText).trim();
      if (t) items.push({ title: t.trim(), description: desc, length: len });
    };
    const walk = (node, depth) => {
      if (!node || depth > 14) return;
      if (Array.isArray(node)) { node.forEach(n => walk(n, depth + 1)); return; }
      if (typeof node !== 'object') return;
      if (node.videoRenderer) pushVideo(node.videoRenderer);
      if (node.gridVideoRenderer) pushVideo(node.gridVideoRenderer);
      if (node.lockupViewModel) {
        const lm = node.lockupViewModel;
        let title = '';
        try {
          title = textOf(lm.metadata.lockupMetadataViewModel.title);
        } catch (_) { }
        if (title) items.push({ title: title.trim(), description: '', length: '' });
      }
      Object.keys(node).forEach(k => walk(node[k], depth + 1));
    };
    tabs.forEach(tab => walk(tab, 0));
    out.videos = items.slice(0, CHANNEL_SAMPLE_MAX_VIDEOS).map(v => ({
      title: v.title.slice(0, CHANNEL_SAMPLE_TITLE_CHARS),
      description: v.description.slice(0, CHANNEL_SAMPLE_DESC_CHARS),
      length: v.length
    }));
  } catch (_) { }
  return out;
}

// Fetch ONE channel's public page and return its style sample. Bounded, best-effort:
// a channel that cannot be resolved simply contributes nothing rather than failing the run.
async function sampleChannelTaste(channel) {
  const name = String((channel && channel.name) || '').trim();
  const url = String((channel && channel.url) || '').trim();
  let target = '';
  if (url && /^https?:\/\/(www\.)?youtube\.com\//i.test(url)) {
    target = url.split('?')[0].replace(/\/+$/, '');
    if (!/\/videos$/.test(target)) target += '/videos';
  } else if (url && /\/@|\/channel\/|\/c\/|\/user\//.test(url)) {
    target = 'https://www.youtube.com' + url.split('?')[0].replace(/\/+$/, '') + '/videos';
  } else {
    return { ok: false, name, reason: 'no_url' };
  }
  try {
    const res = await fetch(target, { credentials: 'include', headers: { accept: 'text/html' } });
    if (!res.ok) return { ok: false, name, reason: 'http_' + res.status };
    const html = await res.text();
    const sample = parseChannelPageSample(html, name);
    if (!sample.name) sample.name = name;
    if (!sample.videos.length && !sample.description) return { ok: false, name, reason: 'no_data' };
    return {
      ok: true,
      name: sample.name || name,
      handle: String((channel && channel.handle) || '').trim(),
      description: sample.description,
      subscriberText: sample.subscriberText,
      videos: sample.videos
    };
  } catch (e) {
    return { ok: false, name, reason: 'fetch_failed' };
  }
}

// A small round-robin so the sample spans the whole subscription list instead of the
// first N entries (the list arrives in YouTube's own order, which clusters by recency).
function interleaveChannels(list, limit) {
  const out = [];
  const arr = Array.isArray(list) ? list : [];
  const cap = Math.max(0, Number(limit) || 0);
  if (!cap || !arr.length) return out;
  // Even distribution across the FULL length: index i maps to floor(i * len / cap), so the
  // sample reaches the tail of the list instead of clustering at the top. A stride of
  // floor(len/cap) truncates and can stop short (30 channels, cap 12 -> stride 2, never
  // reaching the last entries); ceil overshoots the cap and then backfills from the top,
  // re-clustering exactly the head this exists to avoid.
  const seen = new Set();
  for (let i = 0; i < cap; i++) {
    const idx = Math.floor((i * arr.length) / cap);
    if (!seen.has(idx)) { seen.add(idx); out.push(arr[idx]); }
  }
  return out;
}

async function scrapeSubscriptionSamples(channels, maxChannels) {
  const cap = Math.max(1, Math.min(Number(maxChannels) || 12, 24));
  const picks = interleaveChannels(channels, cap);
  const out = [];
  for (const ch of picks) {
    const sample = await sampleChannelTaste(ch);
    if (sample && sample.ok) out.push(sample);
  }
  return { ok: true, samples: out, requested: picks.length };
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

  const thumb = getCardThumbnail(card);
  if (!thumb) return;

  // Master switch off: inject no hover controls at all. With the stylesheet removed
  // they would render as unstyled, permanently visible blobs on every thumbnail.
  if (!settings.extensionEnabled) return;

  // Mouseover fires on every element transition — do the expensive layout
  // probe ONCE per thumbnail node, not on every move across its children.
  if (thumb.dataset.nytPosFixed !== '1') {
    try {
      const pos = window.getComputedStyle(thumb).position;
      if (pos === 'static') {
        thumb.style.position = 'relative';
      }
      thumb.dataset.nytPosFixed = '1';
    } catch (_) { }
  }

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

  // Keyword extractor button (below quick-block)
  if (settings.enableQuickBlock !== false && !card.querySelector('.nyt-extract-kw-btn')) {
    const kwBtn = document.createElement('div');
    kwBtn.className = 'nyt-extract-kw-btn';
    kwBtn.setAttribute('title', 'Extract Keywords from Title (1-Click)');
    kwBtn.setAttribute('role', 'button');
    kwBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" style="fill:currentColor;pointer-events:none;">
        <path d="M223.5-423.5Q200-447 200-480t23.5-56.5Q247-560 280-560t56.5 23.5Q360-513 360-480t-23.5 56.5Q313-400 280-400t-56.5-23.5ZM280-240q-100 0-170-70T40-480q0-100 70-170t170-70q67 0 121.5 33t86.5 87h352l120 120-180 180-80-60-80 60-85-60h-47q-32 54-86.5 87T280-240Zm0-80q56 0 98.5-34t56.5-86h125l58 41 82-61 71 55 75-75-40-40H435q-14-52-56.5-86T280-640q-66 0-113 47t-47 113q0 66 47 113t113 47Z"/>
      </svg>
    `;

    kwBtn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    }, true);
    kwBtn.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    }, true);
    kwBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      // Extraction is async now (it may read the video's own description before
      // answering). Swallow any rejection here — an unhandled one surfaces in the
      // page console and reads as a broken extension.
      extractKeywordsFromCard(card).catch(() => {});
    }, true);

    thumb.appendChild(kwBtn);
  }

  if (settings.huntMode && (!card._nytHuntPrey || !card._nytHuntPrey.isConnected)) {
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

// Clear hoveredVideoCard when the pointer leaves the card subtree entirely —
// otherwise the keyboard 'B' shortcut can blacklist a card the user is no
// longer hovering (and hunt prey stays attached to a stale hover target).
document.addEventListener('mouseout', (e) => {
  if (!hoveredVideoCard) return;
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest(VIDEO_CARD_SELECTORS)) return; // still inside some card
  const rel = e.relatedTarget;
  if (!rel || !rel.closest || !hoveredVideoCard.contains(rel)) {
    hoveredVideoCard = null;
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
  } catch (_) { }
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
  // Paused: YouTube's 3-dot menu must look completely stock, so our row is not added.
  if (!settings.extensionEnabled) return null;
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
    if (document.visibilityState === 'hidden') return;
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
  } catch (_) { }
}

// Sticky quick-block: cards that kept re-appearing after being un-hidden must
// snap to hidden as soon as they get the chance.
function snapUnhiddenBlockedCards() {
  if (!settings || !Array.isArray(settings.channels)) return;
  const cards = document.querySelectorAll(VIDEO_CARD_SELECTORS);
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card || card.dataset.hiddenByLocalBlacklist === 'true') continue;
    delete card.dataset.lastSignature;
    if (channelMatches(card, settings.channels)) {
      hideCardElement(card);
    }
  }
}

function requestNativeServerFeedback() {
  if (!settings.triggerServerFeedback) return false;
  try {
    // Scope to the OPEN menu only — a visibility-blind scan of the whole
    // popup container can click hidden menu items from a previously closed menu.
    const container = findOpenMenuContainer() || findOpenSheetContainer();
    if (!container) return false;
    const items = container.querySelectorAll(
      '[role="menuitem"], ytd-menu-service-item-renderer, yt-list-item-view-model'
    );
    for (const item of items) {
      if (item.classList?.contains(CUSTOM_MENU_MARKER)) continue;
      const label = cleanChannelText(item.textContent);
      if (/^(?:don'?t|do not) recommend (?:this )?channel$/i.test(label)) {
        item.click();
        return true;
      }
    }
  } catch (_) { }
  return false;
}

function blacklistActiveChannel(targetCard) {
  // Single choke point for every "block this channel" gesture (quick-block, 3-dot
  // menu row, right-click, the 'B' shortcut). Paused = the extension is off, so no
  // user gesture may add a rule, hide a card, or trigger YouTube's own feedback.
  if (!settings.extensionEnabled) return;
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

  const primaryName = channel || (cardKeys.find(k => !k.startsWith('youtu') && k.length > 2 && isChannelNameText(k))) || vid || 'Unknown Channel';

  // Only high-confidence identities become blocklist entries — never every
  // cardKey. Card keys include view-counts, timestamps, split tokens and other
  // noise that must never become "channel" entries; getChannelEntityKeys() is the
  // scoped subset (display name + the channel's own handle / channel id / slug).
  //
  // Persisting the handle and channel id alongside the display name is what makes
  // the block stick on EVERY surface — search results, watch-page sidebar, shorts
  // shelves and channel pages do not all render the display name.
  const toAdd = [];
  const primaryNorm = normalizeChannel(primaryName);
  for (const k of [primaryNorm, ...getChannelEntityKeys(card)]) {
    const norm = normalizeChannel(k);
    if (norm && !toAdd.includes(norm)) toAdd.push(norm);
  }
  // Nothing but an unresolved video identity: block that one video, never a
  // fabricated channel name.
  if (!primaryNorm && vid) {
    const vidKey = vid.toLowerCase();
    if (!toAdd.includes(vidKey)) toAdd.push(vidKey);
  }

  const newlyAddedKeys = toAdd.filter(norm => !settings.channels.includes(norm));
  const addedAny = newlyAddedKeys.length > 0;
  if (addedAny) {
    persistChannels(newlyAddedKeys, []);
  }
  // (The previous "block only this video when the channel is unknown" fallback
  // was dead code: primaryName already falls back to vid, so the first branch
  // above handles it. Removed.)

  // Re-scan and hide all matching cards across the document
  let hidCount = 0;
  const allCards = document.querySelectorAll(VIDEO_CARD_SELECTORS);
  allCards.forEach(c => {
    delete c.dataset.lastSignature;
    if (channelMatches(c, settings.channels)) {
      const wasHidden = c.dataset.hiddenByLocalBlacklist === 'true';
      hideCardElement(c);
      if (!wasHidden) hidCount++;
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
        } catch (_) { }
        redirectAwayFromWatchPage(500);
      }
    } catch (_) { }
  }

  const serverFeedbackSent = requestNativeServerFeedback();
  closeOpenMenu();
  // Snap any previously un-hidden blocked cards back to hidden after the
  // sticker (SPA re-render) wiped their inline styles.
  snapUnhiddenBlockedCards();

  // Undo is only honest when THIS action added a new channel and hid cards.
  // If the channel was already on the list, undoing "unblocks" nothing — and
  // decrementing the counter would corrupt the all-time stats.
  const handleUndo = () => {
    if (newlyAddedKeys.length) {
      persistChannels([], newlyAddedKeys);
      safeSendRuntimeMessage({ type: 'INCREMENT_BLOCKED', inc: -hidCount });
    }
    unhideCardElement(card);
    delete card.dataset.lastSignature;
    processFeed(true);
    showToast(`Unblocked: ${primaryName}`);
  };

  showToast(
    `Blacklisted: ${primaryName}${serverFeedbackSent ? ' (YouTube feedback sent)' : ''}`,
    addedAny ? handleUndo : null
  );
}

function showToast(message, onUndo, detail) {
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

  // A single line cannot explain why a rule was refused. `detail` (optional) is the
  // second, dimmer line: which generic rules were skipped, so the extraction is
  // inspectable instead of looking arbitrary.
  const msgCol = document.createElement('span');
  msgCol.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;';

  const msgSpan = document.createElement('span');
  msgSpan.style.cssText = 'max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;';
  msgSpan.textContent = message;
  msgCol.appendChild(msgSpan);

  if (typeof detail === 'string' && detail) {
    const detailSpan = document.createElement('span');
    detailSpan.style.cssText =
      'max-width:300px;font-size:11.5px;opacity:.62;line-height:1.35;white-space:normal;';
    detailSpan.textContent = detail;
    msgCol.appendChild(detailSpan);
  }
  toast.appendChild(msgCol);

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
  // CLICKBAIT_PATTERNS is the SHARED table (shared-tables.js), loaded into this
  // context by the manifest — never a local copy, which is what used to drift.
  return isAllCaps || CLICKBAIT_PATTERNS.some(p => p.test(t));
}

function heuristicDebaitTitle(title) {
  let t = String(title || '').trim();
  if (!t) return t;
  t = t.replace(/\b(?:OMG|LOL|LMAO|ROFL|WTF)\b/gi, '');
  t = t.replace(/\s*!{2,}/g, '.');
  t = t.replace(/\s*[?!]+(\s|$)/g, '. ');
  t = t.replace(/\s*\?\s*\?+/g, '.');
  t = t.replace(/\b(?:that is|is going to|gonna)\b/gi, 'is about to');
  // DEBait_CLEANERS is the SHARED table (shared-tables.js): a title must be
  // neutralized identically whether the local model answered or this fallback ran.
  for (const re of DEBait_CLEANERS) t = t.replace(re, '');
  const m = t.match(/^(you won'?t believe\s+)(.+)/i);
  if (m && m[2]) t = m[2];
  t = t.replace(/\s*\.{2,}/g, '.').replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/[.,]+$/, '');
  return t || String(title).trim();
}

// ------------------------------------------------------------------
// KEYWORD EXTRACTION (title → video metadata → local model)
// ------------------------------------------------------------------

// The stop-word tables and the ranker live in shared-tables.js
// (NYT_KW_STOP_WORDS / NYT_KW_WEAK_ALONE / rankKeywordCandidates), not here: the
// service worker's keyword-suggestion fallback must extract the SAME candidates from the
// same text, or one engine offers a rule the other would never produce. The content
// script's own extraction path calls rankKeywordCandidates directly
// (see extractKeywordsFromCard) — there is no local wrapper to drift.

// Canonical storage form of a keyword rule (matches the popup's canonicalKeyword).
function canonicalKeywordLower(kw) {
  return String(kw == null ? '' : kw).trim().toLowerCase();
}

// Persist keyword rules with a read-modify-write. Same reasoning as
// persistChannels(): `keywords` is shared state, and a blind whole-list write from
// a tab holding stale settings silently reverted whatever the popup had just saved.
function persistKeywords(addKeys, removeKeys) {
  const add = (Array.isArray(addKeys) ? addKeys : []).filter(Boolean);
  const drop = new Set((Array.isArray(removeKeys) ? removeKeys : []).map(k => String(k || '')));
  if (!add.length && !drop.size) return;

  const optimistic = (Array.isArray(settings.keywords) ? settings.keywords.slice() : [])
    .filter(k => !drop.has(String(k)));
  for (const k of add) if (!optimistic.includes(k)) optimistic.push(k);
  settings.keywords = optimistic;

  if (!isExtensionValid()) return;
  try {
    chrome.storage.local.get(['keywords'], (res) => {
      if (chrome.runtime?.lastError) return;
      let current = Array.isArray(res && res.keywords) ? res.keywords.slice() : [];
      current = current.filter(k => !drop.has(String(k)));
      for (const k of add) if (!current.includes(k)) current.push(k);
      chrome.storage.local.set({ keywords: current }, () => {
        if (chrome.runtime?.lastError) return;
        settings.keywords = current;
        // Apply the new rules to the feed immediately.
        if (typeof processFeed === 'function') setTimeout(() => processFeed(true), 250);
      });
    });
  } catch (_) { }
}

// Adds rules to the keyword blacklist and offers an Undo.
//
// The rules PERSIST. The previous flow auto-removed them five seconds after the
// toast appeared, which is why the feature looked broken: by the time the user
// opened the Keywords tab the rules were already gone. Undo is the escape hatch
// instead, which keeps the "never blacklist by accident" guarantee without
// discarding the extraction the user explicitly asked for.
function addExtractedKeywords(list, sourceLabel, detail) {
  const toAdd = [];
  for (const k of list) {
    const norm = canonicalKeywordLower(k);
    if (!norm || settings.keywords.includes(norm) || toAdd.includes(norm)) continue;
    toAdd.push(norm);
  }
  if (!toAdd.length) {
    showToast('Those keywords are already on your list');
    return false;
  }
  persistKeywords(toAdd, []);
  showToast(
    `Added ${toAdd.length} keyword${toAdd.length > 1 ? 's' : ''}: ${toAdd.join(', ')}${sourceLabel ? ' ' + sourceLabel : ''}`,
    () => {
      persistKeywords([], toAdd);
      showToast('Removed ' + toAdd.join(', '));
    },
    detail
  );
  return true;
}

// Main entry point for the key icon on a video card.
//
// Title-first, because it must stay instant for the common case — but the title is now
// RANKED against the rest of the feed rather than sliced from the front. A THIN title
// escalates: the video's own creator tags and description say what it is actually
// about (they exist even when captions do not), and the local model weighs in too.
async function extractKeywordsFromCard(card) {
  if (!card || !card.querySelector) {
    showToast('Could not extract keywords: no card found');
    return;
  }

  const titleEl = getVideoTitleElement(card);
  let titleText = '';
  if (titleEl) {
    titleText = titleEl.textContent || titleEl.getAttribute('aria-label') || '';
  } else {
    // Fallback: try aria-label on the card's anchor
    const anchor = card.querySelector('a#video-title-link');
    titleText = anchor ? (anchor.getAttribute('title') || anchor.getAttribute('aria-label') || '') : '';
  }
  titleText = String(titleText || '').trim();

  if (!titleText) {
    showToast('No title found to extract keywords from');
    return;
  }

  const channel = getChannelName(card);
  const vid = getVideoId(card);
  const otherTitles = collectOtherTitles(card);

  // 1. Instant path: rank the title against the rest of the feed. If the title yields
  //    ANY usable rule we are done — no network, no model, no waiting. There is no
  //    minimum candidate count: a title whose single distinctive word is the subject
  //    ("The Day We Got Out Of Prison" -> prison) has a complete answer already, and
  //    demanding more candidates only forced a metadata fetch + model round trip on the
  //    exact titles that needed it least. Escalation below is for titles that produced
  //    nothing usable, not for titles that produced something good.
  //    Nothing here looks at word position — that was the bug.
  const droppedByFeed = [];
  const fromTitle = rankKeywordCandidates({ title: titleText }, 8, otherTitles, droppedByFeed);
  const titleSel = selectKeywordRules(fromTitle, settings.keywords, otherTitles, 3);
  if (titleSel.terms.length) {
    addExtractedKeywords(titleSel.terms, '(from title)', extractionDetail(titleSel, droppedByFeed));
    return;
  }

  // 2. Thin title — or everything the title offered was too generic to keep. The
  //    creator's tags and the description say what the video is actually about, and the
  //    local model gets the rest of the feed too, so it cannot propose a rule that is
  //    already everywhere on screen.
  showToast('Reading the video\'s tags and description…');
  let description = '';
  let tags = [];
  if (vid) {
    try {
      const meta = await fetchVideoMetadata(vid);
      description = meta.shortDescription || '';
      tags = meta.tags || [];
    } catch (_) { }
  }

  let suggested = [];
  let label = '';
  try {
    const res = await new Promise((resolve) => safeSendRuntimeMessage({
      type: 'AI_SUGGEST_KEYWORDS',
      title: titleText,
      channel,
      vid,
      description,
      tags,
      otherTitles,
      transcript: '',
      note: '',
      keywords: settings.keywords,
      modelChoice: settings.aiModel
    }, resolve));
    if (res && res.ok && Array.isArray(res.keywords) && res.keywords.length) {
      suggested = res.keywords;
      label = res.isFallback ? '(from tags/metadata)' : '(AI)';
    }
  } catch (_) { }

  // Model rules first (it read the user's own words when there were any), then the
  // locally ranked text candidates — all through the same gate, because a rule that
  // matches several cards on screen produces false positives whoever proposed it.
  const local = rankKeywordCandidates({ title: titleText, tags, description, channel }, 8, otherTitles, droppedByFeed);
  const sel = selectKeywordRules(suggested.concat(local), settings.keywords, otherTitles, 3);

  if (!sel.terms.length) {
    const detail = extractionDetail(sel, droppedByFeed);
    showToast('No distinctive keyword in this video\'s text', undefined, detail ||
      'Every candidate was too common to be a safe rule — open TL;DW and describe the video.');
    return;
  }
  addExtractedKeywords(sel.terms, label, extractionDetail(sel, droppedByFeed));
}

// Titles of the OTHER cards on screen right now — a free local corpus for judging
// whether a candidate describes THIS video or is just a phrase that happens to be
// everywhere in the feed. No network, no model, roughly a millisecond.
function collectOtherTitles(excludeCard, max) {
  const cap = Math.max(1, Number(max) || 40);
  const out = [];
  const ex = excludeCard || null;
  try {
    const cards = document.querySelectorAll(VIDEO_CARD_SELECTORS);
    for (let i = 0; i < cards.length && out.length < cap; i++) {
      const card = cards[i];
      if (!card || card === ex) continue;
      // Feed cards nest, so skip anything that wraps the card being extracted for or is
      // wrapped by it — otherwise the same video counts as "other" and skews the corpus.
      if (ex && typeof card.contains === 'function' && card.contains(ex)) continue;
      if (ex && typeof ex.contains === 'function' && ex.contains(card)) continue;
      const el = getVideoTitleElement(card);
      if (!el) continue;
      const t = String(el.textContent || el.getAttribute('aria-label') || '').trim();
      if (t.length > 3) out.push(t);
    }
  } catch (_) { }
  return out;
}

// The last step before anything is written to the blacklist: de-duplicate, drop rules
// the user already has, refuse rules too generic to stand alone, and refuse rules that
// already match several other cards on screen. Returns what to offer AND what was
// refused, so the toast can say so instead of quietly adding junk to the list.
function selectKeywordRules(candidates, existing, otherTitles, limit) {
  const cap = Math.max(1, Number(limit) || 3);
  const have = Array.isArray(existing) ? existing : [];
  const hitsLimit = nytKwFeedHitsLimit(otherTitles);
  const out = [];
  const generic = [];
  const common = [];
  const seen = new Set();
  for (const raw of (Array.isArray(candidates) ? candidates : [])) {
    const norm = canonicalKeywordLower(raw);
    if (!norm || seen.has(norm) || have.includes(norm)) {
      if (norm) seen.add(norm);
      continue;
    }
    seen.add(norm);
    // The two refusals are kept apart on purpose: "too generic" and "matches what is
    // already on your screen" are different facts and the toast reports them separately.
    if (nytKwIsGenericRule(norm)) { generic.push(norm); continue; }
    if (hitsLimit !== Infinity && nytKwFeedHits(norm, otherTitles) >= hitsLimit) { common.push(norm); continue; }
    if (out.length < cap) out.push(norm);
  }
  return { terms: out, generic, common, skipped: generic.concat(common) };
}

// "Added 2 keywords: prison, prison release (from title)" plus a second line naming what
// was refused — "why did it pick THOSE" is the entire question being asked here.
function extractionDetail(sel, droppedByFeed) {
  const parts = [];
  const generic = (sel && sel.generic) || [];
  // Candidates the ranker refused for matching the visible feed, plus any the gate
  // refused for the same reason: one list, one explanation.
  const seen = new Set();
  const common = [];
  for (const k of ((sel && sel.common) || []).concat(Array.isArray(droppedByFeed) ? droppedByFeed : [])) {
    if (!k || seen.has(k)) continue;
    seen.add(k);
    common.push(k);
  }
  const list = (arr) => arr.slice(0, 3).join(', ') + (arr.length > 3 ? ` (+${arr.length - 3} more)` : '');
  if (generic.length) {
    parts.push(`Skipped ${generic.length} too-generic rule${generic.length > 1 ? 's' : ''}: ${list(generic)}`);
  }
  if (common.length) {
    parts.push(`Skipped ${common.length} rule${common.length > 1 ? 's' : ''} already matching other videos on screen: ${list(common)}`);
  }
  return parts.join(' · ');
}

function getVideoTitleElement(card) {
  if (!card || !card.querySelector) return null;
  return card.querySelector(
    '#video-title, yt-formatted-string#title, a#video-title-link, ' +
    '.ytLockupMetadataViewModelHeadingReset a, ' +
    '.ytLockupMetadataViewModelTitle, ' +
    'h3.ytLockupMetadataViewModelHeadingReset, ' +
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
  if (!settings.extensionEnabled || !settings.aiDebaitTitles) return;
  const now = Date.now();
  if (now - lastDebaitRun < 1500) return;
  if (debaitTimer) return;
  debaitTimer = setTimeout(() => {
    debaitTimer = null;
    runDebaitPass();
  }, 350);
}

// De-bait state is keyed to the VIDEO, never to a flat per-element boolean.
// YouTube recycles card elements: the same node comes back holding a different
// video, so a sticky marker made the de-baiter skip the new title forever. The
// key cannot be the title text, because showDebaitState() rewrites the title
// element itself — so it is the video id, falling back to the sticky flag only
// when the card exposes no id (where recycling cannot be detected at all).
function debaitIdentity(card) {
  return (card && getVideoId(card)) || '';
}

function debaitAlreadyApplied(card) {
  if (!card) return false;
  const id = debaitIdentity(card);
  if (!id) return Boolean(card.dataset.debaitState);
  return card.dataset.debaitFor === id;
}

// Forget stale per-video de-bait state once the element has moved on to a
// different video, so the new title is never compared against — or "restored"
// to — the previous video's text. A no-op while the card still shows the same
// video, which is what keeps the ✨ original/neutral toggle working.
function resetDebaitStateIfRecycled(card) {
  if (!card || !card.dataset) return false;
  const id = debaitIdentity(card);
  if (!id || !card.dataset.debaitFor || card.dataset.debaitFor === id) return false;
  delete card.dataset.debaitState;
  delete card.dataset.debaitFor;
  delete card.dataset.neutralTitle;
  delete card.dataset.originalTitle;
  return true;
}

function runDebaitPass() {
  // A pass armed before the user paused must not rewrite titles while we are off.
  if (!settings.extensionEnabled) return;
  lastDebaitRun = Date.now();
  const cards = document.querySelectorAll(VIDEO_CARD_SELECTORS);
  const candidates = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card || card.dataset.hiddenByLocalBlacklist === 'true') continue;
    resetDebaitStateIfRecycled(card);
    if (debaitAlreadyApplied(card)) continue;
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
  } catch (_) { }

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
    if (!card || !card.isConnected) return;
    resetDebaitStateIfRecycled(card);
    if (debaitAlreadyApplied(card)) return;
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
    card.dataset.neutralTitle = neutral;
    card.dataset.debaitState = 'ai';
    card.dataset.debaitFor = debaitIdentity(card);
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
    const titleSpan = document.createElement('span');
    titleSpan.className = 'nyt-debait-title';
    titleSpan.textContent = ' ' + neutral;
    el.appendChild(titleSpan);
  } else {
    const orig = card.dataset.originalTitle || el.textContent.trim();
    card.dataset.originalTitle = orig;
    const neutral = card.dataset.neutralTitle || '';
    card.dataset.debaitState = 'original';
    const restoreSpan = document.createElement('span');
    restoreSpan.className = 'nyt-debait-title';
    restoreSpan.textContent = orig;
    el.textContent = '';
    el.appendChild(restoreSpan);
    // Two-way toggle: show a ✨ badge so "reveal original" isn't a one-way
    // trap — click it again to re-apply the neutral title.
    if (neutral) {
      const badge = document.createElement('span');
      badge.className = 'nyt-debait-badge';
      badge.textContent = '✨';
      badge.setAttribute('role', 'button');
      badge.setAttribute('title', 'Re-apply the de-baited neutral title');
      badge.setAttribute('aria-label', 'Re-apply neutral title');
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        showDebaitState(card, 'ai', card.dataset.neutralTitle || neutral);
      }, true);
      el.appendChild(badge);
    }
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
  // Concurrency guard: the modal must only render the video it was opened for.
  // A slow AI response from a previous video must never overwrite a newer modal.
  host.dataset.tldwFor = String(vid || title || '');
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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function analyzeTldw(ctx) {
  let transcript = '';
  let durationSec = 0;
  let captionsFound = false;
  let description = '';
  let tags = [];

  try {
    const page = await fetchVideoPage(ctx.vid);
    durationSec = page.durationSec || 0;
    // The description and the creator's declared tags are the ONLY text a video
    // with captions disabled and a thin title has. They were being fetched here and
    // thrown away, which is exactly why the report came back with nothing to act on.
    description = page.shortDescription || '';
    tags = page.tags || [];
    const track = pickCaptionTrack(page.captionTracks);
    if (track && track.baseUrl) {
      captionsFound = true;
      transcript = await fetchTranscript(track.baseUrl);
    }
  } catch (_) { }

  // Stash the text signals on the context: the report's keyword lab runs a SECOND
  // call once the user has typed a description, and it must not re-fetch the page.
  ctx.transcript = transcript;
  ctx.description = description;
  ctx.tags = tags;

  let sent = false;
  try {
    chrome.runtime.sendMessage({
      type: 'AI_SUMMARIZE_TRANSCRIPT',
      transcript,
      title: ctx.title,
      modelChoice: settings.aiModel,
      opts: {
        durationSec, description, tags, keywords: settings.keywords,
        // The visible feed, so the report's keyword chips go through the same
        // feed-specificity guard as every other extraction path — without it a chip
        // could be a phrase that already matches half the cards on screen.
        otherTitles: ctx.card ? collectOtherTitles(ctx.card) : []
      }
    }, (res) => {
      if (chrome.runtime?.lastError) res = null;
      try {
        // Stale response? The user already opened TL;DW for another video (or
        // the modal was closed) — never let the old transcript overwrite it.
        if (!ctx.host || !ctx.host.isConnected) return;
        if (ctx.host !== tldwModalHost) return;
        if (ctx.host.dataset.tldwFor !== String(ctx.vid || ctx.title || '')) return;
        renderTldwResult(ctx, res, { transcript, captionsFound });
      } catch (_) { }
    });
    sent = true;
  } catch (_) { }

  if (!sent) {
    try {
      if (ctx.host && ctx.host.isConnected && ctx.host === tldwModalHost &&
        ctx.host.dataset.tldwFor === String(ctx.vid || ctx.title || '')) {
        renderTldwResult(ctx, null, { transcript, captionsFound });
      }
    } catch (_) { }
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
  let shortDescription = '';
  let tags = [];
  const pr = extractPlayerResponse(html);
  if (pr) {
    const tracks = extractCaptionsFromPlayerResponse(pr);
    if (Array.isArray(tracks)) captionTracks = tracks;
    durationSec = Number(pr.videoDetails && pr.videoDetails.lengthSeconds) || 0;

    // Free signals that exist even when the title is thin and captions are absent:
    // the creator's own description and their declared tags. They are what makes a
    // no-caption video analysable at all, and they were being fetched and thrown
    // away — only captionTracks and lengthSeconds were ever read from this response.
    const vd = pr.videoDetails || {};
    shortDescription = String(vd.shortDescription || '');
    tags = Array.isArray(vd.keywords) ? vd.keywords.map(String).filter(Boolean) : [];
    if (!shortDescription) {
      try {
        shortDescription = String(pr.microformat.playerMicroformatRenderer.description.simpleText || '');
      } catch (_) { }
    }
  }
  return { captionTracks, durationSec, shortDescription, tags };
}

// Description + creator tags for a video, used when the card's title alone is too
// thin to extract a keyword from. Reuses fetchVideoPage: the player response is the
// same request, and the transcript is never fetched here.
async function fetchVideoMetadata(vid) {
  if (!vid) return { shortDescription: '', tags: [] };
  const page = await fetchVideoPage(vid);
  return { shortDescription: page.shortDescription || '', tags: page.tags || [] };
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
    } catch (_) { }
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
  if (t.includes('not clickbait')) return 'clean';
  if (t.includes('partial')) return 'partial';
  if (t.includes('true clickbait') || t.includes('clickbait')) return 'clickbait';
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

  // The report's own first-pass suggestions. With no captions and a thin title the
  // model may return none, which is exactly when the description box below earns
  // its place — hence the placeholder copy rather than an empty gap.
  const suggested = Array.isArray(summary.keywords) ? summary.keywords : [];
  const kwNote = suggested.length
    ? 'From this report — click one to add it to your keyword blacklist.'
    : 'Thin transcript? Describe the video in your own words and get blockable keywords.';

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
        <div class="nyt-tldw-stat">Text source<strong>${tr.captionsFound ? 'Captions' : (ctx.description ? 'Description' : 'Metadata')}</strong></div>
        <div class="nyt-tldw-stat">Model<strong>${summary.isFallback ? 'Heuristic' : 'Local AI'}</strong></div>
      </div>

      ${captionNote}

      <div class="nyt-tldw-actions">
        <button class="nyt-tldw-action nyt-tldw-block" data-tldw-block="1">🚫 Blacklist Channel</button>
        <button class="nyt-tldw-action nyt-tldw-close" data-tldw-close="1">Close</button>
      </div>

      <div class="nyt-tldw-kwlab">
        <div class="nyt-tldw-kwlab-label">🔑 Keyword blocker</div>
        <div class="nyt-tldw-kwrow">
          <input class="nyt-tldw-kwinput" data-tldw-note="1" type="text"
                 placeholder="Describe it — e.g. low-effort crypto get-rich-quick reaction channel"
                 aria-label="Describe this video or channel to get blockable keywords"
                 autocomplete="off" spellcheck="false">
          <button class="nyt-tldw-action nyt-tldw-kwsuggest" data-tldw-suggest="1">Suggest keywords</button>
        </div>
        <div class="nyt-tldw-kwchips" data-tldw-chips="1"></div>
        <div class="nyt-tldw-kwnote" data-tldw-kwnote="1">${escapeHtml(kwNote)}</div>
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

  // Keyword lab wiring. The chips are pre-filled from the report's own suggestions;
  // the field re-runs the suggestion with the user's description added, for the
  // thin-input case the report alone cannot resolve.
  const chipsEl = host.querySelector('[data-tldw-chips]');
  renderTldwKeywordChips(chipsEl, suggested);

  if (chipsEl) {
    chipsEl.addEventListener('click', (e) => {
      const chip = e.target && e.target.closest ? e.target.closest('[data-tldw-kw]') : null;
      if (!chip || chip.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const kw = chip.getAttribute('data-tldw-kw');
      if (kw && addExtractedKeywords([kw], '')) {
        chip.classList.add('added');
        chip.disabled = true;
        chip.textContent = '✓ ' + kw;
      }
    }, true);
  }

  const suggestBtn = host.querySelector('[data-tldw-suggest]');
  const kwInput = host.querySelector('[data-tldw-note]');
  if (suggestBtn) {
    suggestBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runTldwKeywordSuggest(ctx, kwInput ? kwInput.value : '', host);
    }, true);
  }
  if (kwInput) {
    kwInput.addEventListener('keydown', (e) => {
      // Never let a keystroke in this field reach YouTube's own shortcut handlers.
      // (The content script's global 'B' quick-block already ignores inputs, but this
      // keeps the page's handlers out too.)
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        runTldwKeywordSuggest(ctx, kwInput.value, host);
      }
    }, true);
    kwInput.addEventListener('keyup', (e) => e.stopPropagation(), true);
    kwInput.addEventListener('keypress', (e) => e.stopPropagation(), true);
  }
}

// Renders candidate keyword rules as one-click chips. Chips already on the user's
// blacklist render pre-added and inert, so the lab never looks like it dropped a
// rule the user just added.
function renderTldwKeywordChips(chipsEl, list) {
  if (!chipsEl) return;
  const existing = Array.isArray(settings.keywords) ? settings.keywords : [];
  chipsEl.innerHTML = (Array.isArray(list) ? list : []).map(kw => {
    const norm = canonicalKeywordLower(kw);
    if (!norm) return '';
    const added = existing.includes(norm);
    return `<button class="nyt-tldw-kwchip${added ? ' added' : ''}" data-tldw-kw="${escapeHtml(norm)}"${added ? ' disabled' : ''}>${added ? '✓ ' : '+ '}${escapeHtml(norm)}</button>`;
  }).join('');
}

// Second-pass keyword suggestion for the TL;DW report: title + description +
// creator tags + transcript + whatever the user typed. This is the fix for "the
// transcript and the title were both too thin to tell" — the user's own sentence is
// usually the highest-signal input in the whole payload.
function runTldwKeywordSuggest(ctx, note, host) {
  const chipsEl = host.querySelector('[data-tldw-chips]');
  const noteEl = host.querySelector('[data-tldw-kwnote]');
  const clean = String(note || '').trim();

  if (noteEl) {
    noteEl.textContent = clean
      ? 'Asking your local model…'
      : 'Reading the video\'s title, description and tags…';
  }

  safeSendRuntimeMessage({
    type: 'AI_SUGGEST_KEYWORDS',
    title: ctx.title || '',
    channel: ctx.channel || '',
    vid: ctx.vid || '',
    description: ctx.description || '',
    tags: ctx.tags || [],
    otherTitles: ctx.card ? collectOtherTitles(ctx.card) : [],
    transcript: ctx.transcript || '',
    note: clean,
    keywords: settings.keywords,
    modelChoice: settings.aiModel
  }, (res) => {
    // The modal may have been closed (or re-rendered for another video) while the
    // model was thinking — bail instead of painting into a detached tree.
    if (!host || !host.isConnected || host !== tldwModalHost) return;
    if (!chipsEl || !chipsEl.isConnected) return;

    const list = (res && res.ok && Array.isArray(res.keywords)) ? res.keywords : [];
    renderTldwKeywordChips(chipsEl, list);
    if (!noteEl) return;
    if (!list.length) {
      noteEl.textContent = 'Nothing keyword-worthy found — try describing the video more specifically.';
    } else if (res.isFallback) {
      noteEl.textContent = 'Suggestions from the video\'s own text (local model unavailable). Click one to add it to your keyword blacklist.';
    } else {
      noteEl.textContent = 'Model suggestions. Click one to add it to your keyword blacklist.';
    }
  });
}

// ------------------------------------------------------------------
// OBSERVERS & EVENT LISTENERS
// ------------------------------------------------------------------
function scheduleFeedProcessing(delay = 80) {
  // While paused the MutationObserver below keeps firing (YouTube mutates the feed
  // constantly), so bailing here is what keeps a paused extension ~free. Re-enabling
  // arrives through the storage / RULES_UPDATED path, which calls processFeed itself.
  if (!settings.extensionEnabled) return;
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
  } catch (_) { }
  return null;
}

function findMenuButton(target) {
  if (!target || !target.closest) return null;
  const btn = target.closest(MENU_BUTTON_SELECTORS);
  if (btn) return btn;
  const menuHost = target.closest('ytd-menu-renderer, .yt-lockup-metadata-view-model-wiz__menu, .ytLockupMetadataViewModelMenu');
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
  } catch (_) { }
}, true);

// ------------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------------
function start() {
  loadSettings().then(() => {
    injectBlacklistStyles();
    initChipRescue();
    initNewToYouAuto();

    setTimeout(() => {
      processFeed(true);
    }, 400);

    // Filtered MutationObserver: ignores our own UI mutations to prevent loops.
    // Only actual video-card DOM is worth a re-scan — a live-chat message or a
    // page-chrome widget must NOT trigger a full feed evaluation (that's what
    // made the whole browser grind on watch pages).
    const observer = new MutationObserver((mutations) => {
      if (document.visibilityState === 'hidden') return;
      let shouldProcess = false;
      for (let i = 0; i < mutations.length && !shouldProcess; i++) {
        const added = mutations[i].addedNodes;
        if (!added || added.length === 0) continue;
        for (let j = 0; j < added.length; j++) {
          const node = added[j];
          if (node.nodeType !== 1) continue;
          if (node.id === 'nyt-ext-toast' || node.id === 'nyt-tldw-host' || (node.classList?.contains && (
            node.classList.contains('custom-blacklist-option') ||
            node.classList.contains('nyt-quick-block-btn') ||
            node.classList.contains('nyt-debait-badge') ||
            node.classList.contains('nyt-debait-title') ||
            node.classList.contains('nyt-tldw-btn') ||
            node.classList.contains('nyt-tldw-overlay') ||
            node.classList.contains('nyt-tldw-modal') ||
            node.classList.contains('nyt-hunt-prey') ||
            node.classList.contains('nyt-hunt-hud') ||
            node.classList.contains('nyt-hunt-ring')
          ))) {
            continue;
          }
          if (node.matches?.(VIDEO_CARD_SELECTORS) ||
            node.closest?.(VIDEO_CARD_SELECTORS) ||
            node.querySelector?.(VIDEO_CARD_SELECTORS)) {
            shouldProcess = true;
            break;
          }
        }
      }
      if (shouldProcess) {
        scheduleFeedProcessing(180);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // SEV-4 stale settings: popup changes made while this tab was backgrounded
    // (blacklist via another tab, toggle changes) were never re-read. Re-load on
    // every return to visibility and re-apply the CSS/hunt state/card pass.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      loadSettings().then(() => {
        try {
          injectBlacklistStyles();
          refreshSubscriptionKeySet();
          syncHuntMode();
          processFeed(true);
        } catch (_) { }
      });
    }, { passive: true });
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
// Becomes true on the first hit or miss of a session. huntPersist is gated on
// it so a start→stop cycle with zero shots can never zero the stored score.
let huntTouched = false;

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
  } catch (_) { }
}

function huntUpdateHud(note) {
  try {
    if (!huntHud) return;
    const acc = huntShots ? Math.round((huntHits / huntShots) * 100) : 100;
    huntHud.innerHTML = `🎯 HUNT <b>${huntScore}</b> pts &nbsp;•&nbsp; ${huntHits}/${huntShots} (${acc}%) &nbsp;•&nbsp; best <b>${huntBest}</b>${note ? `<br><span style="color:#ff8fa3;">${note}</span>` : ''}`;
  } catch (_) { }
}

function huntPersist() {
  try {
    if (!isExtensionValid()) return;
    if (!huntTouched) return; // never write a zeroed/unchanged score over real progress
    if (huntScore > huntBest) huntBest = huntScore;
    chrome.storage.local.set({ nyt_huntScore: huntScore, nyt_huntBest: huntBest });
  } catch (_) { }
}

function huntAddPrey(card, thumb) {
  try {
    if (!huntActive || !card || !thumb) return;
    // Prey elements live on document.body (NOT inside the card), so
    // card.querySelector('.nyt-hunt-prey') can never find them. Track the
    // per-card reference directly or every 550ms roam tick spawns a new prey.
    if (card._nytHuntPrey && card._nytHuntPrey.isConnected) return;
    const el = document.createElement('div');
    el.className = 'nyt-hunt-prey';
    el.textContent = '⛔';
    el.title = 'Shoot me! (+100, no blacklist)';
    const stopNav = (ev) => {
      try { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); } catch (_) { }
    };
    el.addEventListener('pointerdown', stopNav, true);
    el.addEventListener('mousedown', (ev) => { stopNav(ev); huntHit(el); }, true);
    el.addEventListener('click', stopNav, true);
    el._nytHuntCard = card;
    el._nytHuntThumb = thumb;
    card._nytHuntPrey = el;
    document.body.appendChild(el);
    huntMovePreyEl(el, thumb);
  } catch (_) { }
}

function huntMovePreyEl(el, anchor) {
  try {
    const thumb = anchor || (el && document.querySelector(VIDEO_THUMB_SELECTOR));
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
  } catch (_) { }
}

// The single card-thumbnail lookup. huntVisibleCards() used to duplicate this and
// was never called by anything; every remaining call site shares this one now.
function getCardThumbnail(card) {
  try {
    if (!card) return null;
    return card.querySelector(VIDEO_THUMB_SELECTOR);
  } catch (_) { return null; }
}

function huntRoamAll() {
  try {
    if (!huntActive) return;
    document.querySelectorAll('.nyt-hunt-prey').forEach((el) => {
      try {
        const card = el._nytHuntCard;
        if (!el.isConnected || !card || card.dataset.hiddenByLocalBlacklist === 'true') {
          if (card) card._nytHuntPrey = null;
          if (el.parentNode) el.parentNode.removeChild(el);
          return;
        }
        const thumb = el._nytHuntThumb?.isConnected ? el._nytHuntThumb : getCardThumbnail(card);
        if (!thumb) {
          card._nytHuntPrey = null;
          if (el.parentNode) el.parentNode.removeChild(el);
          return;
        }
        el._nytHuntThumb = thumb;
        huntMovePreyEl(el, thumb);
        // Show only for hovered card
        if (card === hoveredVideoCard) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      } catch (_) { }
    });
    try {
      const hc = hoveredVideoCard;
      if (hc && hc.isConnected && hc.offsetHeight > 0 && hc.dataset.hiddenByLocalBlacklist !== 'true') {
        if (!(hc._nytHuntPrey && hc._nytHuntPrey.isConnected)) {
          huntAddPrey(hc, getCardThumbnail(hc));
        }
      }
    } catch (_) { }
  } catch (_) { }
}

function huntHit(el) {
  try {
    if (!huntActive) return;
    huntTouched = true;
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
          huntMovePreyEl(el, el._nytHuntThumb);
        }
      } catch (_) { }
    }, 160);
  } catch (_) { }
}

function huntMiss() {
  try {
    if (!huntActive) return;
    huntTouched = true;
    huntShots++;
    huntScore = Math.max(0, huntScore - 10);
    huntUpdateHud('miss −10');
    huntPersist();
  } catch (_) { }
}

function huntOnRingMove(ev) {
  try {
    if (!huntRing) return;
    huntRing.style.left = `${ev.clientX}px`;
    huntRing.style.top = `${ev.clientY}px`;
  } catch (_) { }
}

function huntOnDown(ev) {
  try {
    if (!huntActive) return;
    const t = ev.target;
    if (t && t.closest && (t.closest('.nyt-hunt-prey') || t.closest('.nyt-hunt-hud') || t.closest('.nyt-hunt-ring'))) return;
    huntMiss();
  } catch (_) { }
}

function huntStart() {
  try {
    if (huntActive) return;
    huntActive = true;
    ensureHuntStyles();
    try { document.body.classList.add('nyt-hunting'); } catch (_) { }
    try {
      if (isExtensionValid()) {
        chrome.storage.local.get(['nyt_huntScore', 'nyt_huntBest'], (res) => {
          try {
            huntScore = Number(res.nyt_huntScore) || 0;
            huntBest = Number(res.nyt_huntBest) || 0;
            huntUpdateHud('hunt is on — hover a card, shoot the ⛔');
          } catch (_) { }
        });
      }
    } catch (_) { }
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
    } catch (_) { }
    huntRoamAll();
    if (huntTimer) clearInterval(huntTimer);
    huntTimer = setInterval(huntRoamAll, 550);
  } catch (_) { }
}

function huntStop() {
  try {
    huntActive = false;
    if (huntTimer) { clearInterval(huntTimer); huntTimer = null; }
    document.removeEventListener('mousemove', huntOnRingMove, true);
    document.removeEventListener('mousedown', huntOnDown, true);
    try { document.body.classList.remove('nyt-hunting'); } catch (_) { }
    try { document.querySelectorAll('.nyt-hunt-prey').forEach((el) => { if (el._nytHuntCard) el._nytHuntCard._nytHuntPrey = null; if (el.parentNode) el.parentNode.removeChild(el); }); } catch (_) { }
    try { if (huntHud && huntHud.parentNode) huntHud.parentNode.removeChild(huntHud); } catch (_) { }
    try { if (huntRing && huntRing.parentNode) huntRing.parentNode.removeChild(huntRing); } catch (_) { }
    huntHud = null;
    huntRing = null;
    // Only persist if this session actually changed the score — a fresh
    // start/stop with no hits or misses must NOT zero a stored high score.
    huntPersist();
  } catch (_) { }
}

function syncHuntMode() {
  try {
    if (settings.extensionEnabled && settings.huntMode) huntStart();
    else huntStop();
  } catch (_) { }
}

// These are the only storage keys that change WHICH videos get hidden. Counter /
// log / UI writes (nyt_totalBlocked bumps on every block, hunt score, huntScore,
// ...) must NOT force a full feed re-evaluation on every open YouTube tab.
// nyt_aiDecisions belongs here: an AI block recorded in one tab must hide the same
// card in every other open tab, and undoing one must restore it there too.
const RULE_KEYS = ['channels', 'keywords', 'whitelistChannels', 'subsSnapshot', 'blockShorts', 'shortsSubOnly', 'blockCommunity', 'autoDubMode', 'chipRescue', 'newToYouAuto', 'extensionEnabled', 'keywordExceptions', 'temporalRules', AI_DECISION_STORAGE_KEY];

// Storage sync across tabs & popup
if (isExtensionValid() && chrome?.storage?.onChanged) {
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (!Object.keys(changes).some((k) => RULE_KEYS.includes(k))) return;
      if (document.visibilityState === 'hidden') return;
      loadSettings().then(() => {
        document.querySelectorAll(VIDEO_CARD_SELECTORS).forEach(card => {
          delete card.dataset.lastSignature;
        });
        processFeed(true);
      });
    });
  } catch (_) { }
}

// Popup message listener
if (isExtensionValid() && chrome?.runtime?.onMessage) {
  try {
    const EXT_ID = chrome.runtime.id;
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!sender || sender.id !== EXT_ID) return;
      if (msg && typeof msg === 'object' && msg.type === 'RULES_UPDATED') {
        if (document.visibilityState === 'hidden') {
          try { sendResponse({ ok: true }); } catch (_) { }
          return;
        }
        loadSettings().then(() => {
          document.querySelectorAll(VIDEO_CARD_SELECTORS).forEach(card => {
            delete card.dataset.lastSignature;
          });
          processFeed(true);
          try { sendResponse({ ok: true }); } catch (_) { }
        });
        return true;
      }
      if (msg && typeof msg === 'object' && msg.type === 'GET_VISIBLE_FEED_ITEMS') {
        try {
          const items = collectVisibleFeedItems(15);
          try { sendResponse({ ok: true, items }); } catch (_) { }
        } catch (_) {
          try { sendResponse({ ok: true, items: [] }); } catch (__) { }
        }
        return true;
      }
      if (msg && typeof msg === 'object' && msg.type === 'MEASURE_FEED_DIVERSITY') {
        try {
          const stats = measureFeedDiversity();
          try { sendResponse({ ok: true, ...stats }); } catch (_) { }
        } catch (_) {
          try { sendResponse({ ok: false }); } catch (__) { }
        }
        return true;
      }
      if (msg && typeof msg === 'object' && msg.type === 'SCRAPE_SUBSCRIPTIONS') {
        scrapeSubscriptions()
          .then(res => { try { sendResponse(res); } catch (_) { } })
          .catch(() => {
            try { sendResponse({ ok: false, channels: [], count: 0 }); } catch (_) { }
          });
        return true;
      }
      // Deep style sampling for the subscription synthesizer. Separate message so the
      // caller can degrade gracefully: if this fails or times out, synthesis still runs
      // on the channel LIST (today's behaviour) rather than failing outright.
      if (msg && typeof msg === 'object' && msg.type === 'SCRAPE_SUBSCRIPTION_SAMPLES') {
        scrapeSubscriptionSamples(msg.channels, msg.max)
          .then(res => { try { sendResponse(res); } catch (_) { } })
          .catch(() => {
            try { sendResponse({ ok: false, samples: [] }); } catch (_) { }
          });
        return true;
      }
    });
  } catch (_) { }
}

// ------------------------------------------------------------------
// CHIP RESCUE — YouTube's home topic chips (Comedy, Tourism, Gaming, …)
// live in ytd-feed-filter-chip-bar-renderer / #chips-wrapper. Vanishing
// chips are a known YouTube server-side/A-B bug (not ours — this extension
// never touches the chip bar). Opt-in via Settings > Chip Rescue. NEVER
// auto-reloads: present-but-hidden chips are just shown again (cheap),
// and a completely-missing bar gets a small floating "Restore chips"
// button the user can click — the page reload is the verified fix.
// ------------------------------------------------------------------
let chipRescueTimer = null;
let chipRescueButton = null;

// Pure, testable triage of the chip bar state.
function chipRescueState(hasChips, visible) {
  if (!hasChips) return { action: 'missing' };
  return visible ? { action: 'none' } : { action: 'unhide' };
}

function removeChipRescueButton() {
  if (chipRescueButton && chipRescueButton.parentNode) {
    chipRescueButton.parentNode.removeChild(chipRescueButton);
  }
  chipRescueButton = null;
}

// Bounded poll: never reschedule forever on a feed that never renders.
const CHIP_RESCUE_MAX_POLLS = 8;
let chipRescuePolls = 0;

function initChipRescue() {
  removeChipRescueButton();
  if (chipRescueTimer) { clearTimeout(chipRescueTimer); chipRescueTimer = null; }
  chipRescuePolls = 0;
  if (!settings.extensionEnabled || !settings.chipRescue || !isHomePath()) return;

  const check = () => {
    if (!settings.extensionEnabled || !settings.chipRescue || !isHomePath()) return;
    // Only judge once the home feed rendered — YouTube can attach chips a beat late.
    const feedCards = document.querySelectorAll(VIDEO_CARD_SELECTORS).length;
    if (!feedCards) {
      if (chipRescuePolls++ < CHIP_RESCUE_MAX_POLLS) {
        chipRescueTimer = setTimeout(check, 4000);
      }
      return;
    }

    const chipsBar = document.querySelector('ytd-feed-filter-chip-bar-renderer, #chips-wrapper');
    const hasChips = !!chipsBar;
    let visible = false;
    if (hasChips) {
      try {
        visible = chipsBar.offsetParent !== null &&
          chipsBar.getAttribute('hidden') === null &&
          getComputedStyle(chipsBar).display !== 'none' &&
          getComputedStyle(chipsBar).visibility !== 'hidden';
      } catch (_) { visible = true; }
    }

    const state = chipRescueState(hasChips, visible);

    if (state.action === 'none') {
      removeChipRescueButton();
      return;
    }

    if (state.action === 'unhide') {
      try {
        chipsBar.removeAttribute('hidden');
        chipsBar.style.setProperty('display', 'flex', 'important');
        chipsBar.style.setProperty('visibility', 'visible', 'important');
        showToast('YouTube hid the topic chips — restored.');
      } catch (_) { }
      return;
    }

    // action === 'missing': offer the verified fix (page reload), never auto-reload.
    if (!chipRescueButton) {
      const btn = document.createElement('button');
      btn.textContent = '↻ Restore chips';
      btn.id = 'nyt-chip-rescue';
      btn.title = 'YouTube failed to render the topic chips (known bug). Click to reload the page — the verified fix.';
      btn.onclick = () => {
        showToast('Restoring topic chips …');
        try { window.location.reload(); } catch (_) { }
      };
      document.body.appendChild(btn);
      chipRescueButton = btn;
      showToast('YouTube didn\'t render the topic chips — use the Restore chips button.');
    }
  };

  chipRescueTimer = setTimeout(check, 6000);
}

// ------------------------------------------------------------------
// NEW TO YOU — auto-start Home in YouTube's own discovery feed.
// "New to you" is the only surface YouTube built to show channels you
// have NOT encountered before ("beyond the recommended videos you
// usually see"). Opt-in toggle `newToYouAuto` (default off): once the
// Home chip bar renders, the extension clicks that chip — no reloads,
// no repeat clicks. When the chip is absent for the account (YouTube
// makes it personalized/unavailable), the feature is a silent no-op.
// Clicking a chip only swaps the Home grid (SPA); the active-chip
// check makes each subsequent navigation self-terminate.
// ------------------------------------------------------------------
let newToYouTimer = null;

// Pure, testable decision: should we click the "New to you" chip?
function shouldAutoEnterNewToYou(chipTexts, activeChipText, alreadyClicked) {
  if (alreadyClicked) return false;
  const hasChip = Array.isArray(chipTexts) &&
    chipTexts.some((t) => /new to you/i.test(String(t || '').trim()));
  if (!hasChip) return false;
  if (activeChipText && /new to you/i.test(String(activeChipText).trim())) return false; // already on it
  return true;
}

function initNewToYouAuto() {
  if (newToYouTimer) { clearTimeout(newToYouTimer); newToYouTimer = null; }
  if (!settings.extensionEnabled || !settings.newToYouAuto || !isHomePath()) return;

  const check = (attempt) => {
    if (!settings.extensionEnabled || !settings.newToYouAuto || !isHomePath()) return;
    const chipsBar = document.querySelector('ytd-feed-filter-chip-bar-renderer, #chips-wrapper');
    if (!chipsBar) {
      // Chips can attach a beat late; give a few rounds, then shut up.
      const feedCards = document.querySelectorAll(VIDEO_CARD_SELECTORS).length;
      if (feedCards && attempt < 3) {
        newToYouTimer = setTimeout(() => check(attempt + 1), 4000);
      }
      return;
    }

    const chips = Array.from(chipsBar.querySelectorAll('yt-chip-cloud-chip-renderer'));
    const textOf = (c) => (c.querySelector('yt-formatted-string, #text')?.textContent || '').trim();
    const chipTexts = chips.map(textOf);
    const activeChip = chips.find((c) => c.getAttribute('aria-selected') === 'true');

    if (!shouldAutoEnterNewToYou(chipTexts, activeChip ? textOf(activeChip) : '', false)) return;

    const target = chips.find((c) => /new to you/i.test(textOf(c)));
    if (!target) return;

    try {
      const clickable = target.shadowRoot?.querySelector('button, a') ||
        target.querySelector('button, a') || target;
      clickable.click();
      showToast('Home switched to \'New to you\' — YouTube\'s less-seen discovery feed.');
    } catch (_) { }
  };

  newToYouTimer = setTimeout(() => check(0), 6000);
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
  initChipRescue();
  initNewToYouAuto();
});

window.addEventListener('popstate', () => {
  stopMenuObserver();
  scheduleFeedProcessing(200);
  checkCurrentWatchPageVideo();
  initChipRescue();
  initNewToYouAuto();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

// Node test seam — ignored by the browser/extension runtime.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    watchPageBlockDecision,
    keywordRulesHidden,
    normalizeChannel,
    cleanChannelText,
    hasWordBoundaryKeyword,
    extractEntityKey,
    extractChannelNamesFromByline,
    isAutoDubBadgeText,
    autoDubHideDecision,
    cardIsSubscribed,
    subscriptionDisplayNames,
    aiRationaleCitesUserRule,
    parseChannelPageSample,
    interleaveChannels,
    chipRescueState,
    shouldAutoEnterNewToYou
  };
}
