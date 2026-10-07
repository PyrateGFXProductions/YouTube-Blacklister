// Popup manager for YouTube Smart Blacklister v1.11.0
// Manages rules, settings, AI Guardian, search filtering, import/export, and stats.

const RANKS = [
  { min: 0, max: 9, emoji: '🌱', title: 'Novice Scroller' },
  { min: 10, max: 49, emoji: '🛡️', title: 'Feed Defender' },
  { min: 50, max: 99, emoji: '⚔️', title: 'Slop Slayer' },
  { min: 100, max: 249, emoji: '🧙', title: 'Algorithm Whisperer' },
  { min: 250, max: 499, emoji: '👑', title: 'Zen Master' },
  { min: 500, max: 999, emoji: '🚀', title: 'Feed Ascendant' },
  { min: 1000, max: Infinity, emoji: '🌌', title: 'Cosmic Mind' }
];

const STARTER_PACKS = {
  brainrot: [
    { kw: 'prank' },
    { kw: 'skibidi' },
    { kw: 'in 24 hours' },
    { kw: "you won't believe" },
    { kw: 'shocking' },
    { kw: 'exposed' },
    { kw: 'reaction' }
  ],
  crypto: [
    { kw: 'crypto' },
    { kw: 'bitcoin' },
    { kw: 'memecoin' },
    { kw: '100x' },
    { kw: 'passive income' },
    { kw: 'dropshipping' }
  ],
  aislop: [
    { kw: 'ai generated' },
    { kw: 'faceless channel' },
    { kw: 'text to speech' },
    { kw: 'midjourney' }
  ],
  drama: [
    { kw: 'drama' },
    { kw: 'canceled' },
    { kw: 'apology video' },
    { kw: 'responds to' },
    { kw: 'clout' }
  ],

  // --- NEW PACKS (added alongside original 4) ---
  nonenglish: [
    { kw: 'auto-dubbed' },
    { kw: 'auto dub' },
    { kw: 'dubbed' },
    { kw: 'subtitled' },
    { kw: 'foreign' },
    { kw: 'non english' },
    { kw: 'multi language' },
    { kw: 'international' },
    { kw: 'global version' },
    { kw: 'translated' },
    { kw: 'foreign language' },
    { kw: 'non-english' },
    { kw: 'dub' },
    { kw: 'subtitle' },
    { kw: 'global edition' },
    { kw: '/auto.?dub/i' }
  ],
  sports: [
    { kw: 'football' },
    { kw: 'baseball' },
    { kw: 'basketball' },
    { kw: 'soccer' },
    { kw: 'golf' },
    { kw: 'hockey' },
    { kw: 'volleyball' },
    { kw: 'cup' },
    { kw: 'match' },
    { kw: 'tennis' },
    { kw: 'espn' },
    { kw: 'mlb' },
    { kw: 'nfl' },
    { kw: 'nba' },
    { kw: 'fifa' },
    { kw: 'uefa' },
    { kw: 'highlights' },
    { kw: 'touchdown' },
    { kw: 'home run' },
    { kw: 'super bowl' },
    { kw: 'world cup' }
  ],
  politics: [
    { kw: 'trump' },
    { kw: 'politics' },
    { kw: 'cnn' },
    { kw: 'elon musk' },
    { kw: 'governor' },
    { kw: 'president' },
    { kw: 'mayor' },
    { kw: 'breaking news' },
    { kw: "america's most" },
    { kw: "america's best" },
    { kw: "america's worst" },
    { kw: 'fox news' },
    { kw: 'msnbc' },
    { kw: 'congress' },
    { kw: 'senate' },
    { kw: 'election' },
    { kw: 'vote' },
    { kw: 'campaign' },
    { kw: 'rally' },
    { kw: 'impeachment' },
    { kw: 'indictment' }
  ],
  listicles: [
    { kw: 'top 5' },
    { kw: 'top 10' },
    { kw: 'top 100' },
    { kw: 'best of' },
    { kw: 'the best' },
    { kw: 'the worst' },
    { kw: 'best to worst' },
    { kw: 'first look' },
    { kw: 'first hands on' },
    { kw: 'ultimate guide' },
    { kw: 'walkthrough' },
    { kw: 'walkaround' },
    { kw: 'topgear' },
    { kw: 'top gear' },
    { kw: 'best kept secret' },
    { kw: 'ranked' },
    { kw: 'tier list' },
    { kw: 'power ranking' },
    { kw: 'definitive guide' },
    { kw: 'complete guide' },
    { kw: '/\\btop\\s+\\d+\\b/i' },
    { kw: '/\\bbest\\s+(of|\\d+)\\b/i' }
  ],
  automotive: [
    { kw: 'dashcam' },
    { kw: 'dash cam' },
    { kw: 'bad drivers' },
    { kw: 'car talk' },
    { kw: 'i drove' },
    { kw: 'mpg test' },
    { kw: 'walkaround' },
    { kw: 'pricing' },
    { kw: 'should you buy' },
    { kw: 'do not buy' },
    { kw: 'never finance' },
    { kw: 'dealer' },
    { kw: 'dealership' },
    { kw: 'car wizard' },
    { kw: 'customer states' },
    { kw: 'mile update' },
    { kw: 'reliability guide' },
    { kw: 'daily driver' },
    { kw: 'first look' },
    { kw: 'test drive' },
    { kw: 'review' },
    { kw: 'buyers guide' },
    { kw: 'buying guide' },
    { kw: '/\\b(car|truck|suv)\\s+(review|test|drive)\\b/i' },
    { kw: '/\\b(mpg|fuel economy)\\s+(test|numbers?)\\b/i' },
    { kw: '/\\bwalk.?around\\b/i' }
  ],
  religious: [
    { kw: 'catholic' },
    { kw: 'islamic' },
    { kw: 'jewish' },
    { kw: 'christian' },
    { kw: 'church' },
    { kw: 'sermon' },
    { kw: 'islam' },
    { kw: 'hindu' },
    { kw: 'hindi' },
    { kw: 'church of' },
    { kw: 'bible' },
    { kw: 'quran' },
    { kw: 'torah' },
    { kw: 'pastor' },
    { kw: 'preacher' },
    { kw: 'ministry' },
    { kw: 'gospel' },
    { kw: 'prayer' },
    { kw: 'worship' },
    { kw: 'faith' },
    { kw: 'belief' },
    { kw: 'religion' },
    { kw: 'spiritual' },
    { kw: 'god' },
    { kw: 'jesus' },
    { kw: 'allah' },
    { kw: 'prophet' }
  ],
  gaming: [
    { kw: 'minecraft' },
    { kw: 'world of warcraft' },
    { kw: 'warcraft' },
    { kw: 'warhammer' },
    { kw: 'ranked' },
    { kw: 'games' },
    { kw: 'gaming' },
    { kw: 'gamers' },
    { kw: "let's play" },
    { kw: 'playthrough' },
    { kw: 'walkthrough' },
    { kw: 'speedrun' },
    { kw: 'tier list' },
    { kw: 'meta' },
    { kw: 'build guide' },
    { kw: 'patch notes' },
    { kw: 'update' },
    { kw: 'dlc' },
    { kw: 'expansion' },
    { kw: 'season pass' },
    { kw: 'battle pass' },
    { kw: 'loot' },
    { kw: 'grind' },
    { kw: 'farm' },
    { kw: 'raid' },
    { kw: 'dungeon' },
    { kw: 'boss fight' },
    { kw: 'pvp' },
    { kw: 'pve' },
    { kw: 'mmorpg' },
    { kw: 'rpg' },
    { kw: 'fps' },
    { kw: 'moba' },
    { kw: 'battle royale' }
  ],
  musicspam: [
    { kw: 'music' },
    { kw: 'music video' },
    { kw: 'official music video' },
    { kw: 'official video' },
    { kw: 'official trailer' },
    { kw: 'trailer' },
    { kw: 'teaser' },
    { kw: 'playlist' },
    { kw: 'new music' },
    { kw: 'new release' },
    { kw: 'lyric video' },
    { kw: 'audio' },
    { kw: 'visualizer' },
    { kw: 'mix' },
    { kw: 'remix' },
    { kw: 'cover' },
    { kw: 'reaction' },
    { kw: 'live performance' },
    { kw: 'concert' },
    { kw: 'tour' },
    { kw: 'album' },
    { kw: 'single' },
    { kw: 'ep' },
    { kw: 'vinyl' },
    { kw: 'streaming' },
    { kw: 'spotify' },
    { kw: 'apple music' },
    { kw: '/\\bofficial\\s+(music\\s+)?video\\b/i' },
    { kw: '/\\b(lyric|audio|visualizer)\\s+video\\b/i' }
  ]
};

const ALGORITHM_WISDOM = [
  "Feed your mind, not the recommendation engine.",
  "Every blocked clickbait thumbnail gives an independent creator a chance.",
  "The algorithm wants your outrage. Choose your own curiosity instead.",
  "Your attention is the most valuable asset you own. Defend it.",
  "Pro tip: Whitelist trusted creators so broad keywords never hide their uploads.",
  "A quiet feed is a focused mind.",
  "Don't let a server-side cache decide what you learn today."
];

let currentWisdomIndex = Math.floor(Math.random() * ALGORITHM_WISDOM.length);

// One subscription scan at a time. Stacking scans stacked hidden YouTube tabs
// that never got closed — that's what wedged the browser.
let subSynthBusy = false;

let data = {
  channels: [],
  keywords: [],
  whitelistChannels: [],
  subsSnapshot: [],
  blockShorts: false,
  shortsSubOnly: false,
  blockCommunity: false,
  autoDubMode: 'off',
  enableQuickBlock: true,
  triggerServerFeedback: false,
  totalBlocked: 0,
  aiAutonomous: false,
  aiSensitivity: 'balanced',
  aiModel: '',
  aiTastePrompt: '',
  aiSubscriptionProfile: '',
  tasteLikedChannels: [],
  tasteDislikedChannels: [],
  aiLog: [],
  aiDebaitTitles: false,
  aiDebaitModel: '',
  tldwEnabled: true,
  huntMode: false,
  chipRescue: false,
  newToYouAuto: false,
  // MASTER SWITCH. false = the extension is paused everywhere (content script
  // restores everything it hid and stops acting). Absent key = enabled.
  extensionEnabled: true,

  // --- NEW FEATURES ---
  keywordExceptions: {},      // { keyword: [whitelistedChannel1, whitelistedChannel2] }
  feedHealthLog: [],          // [{ ts, hiddenByChannel, hiddenByKeyword, hiddenByAI, totalVisible, purity }]
  communityPacks: [],         // [{ url, name, enabled, lastFetched, rules: [] }]
  temporalRules: []           // [{ keyword, expires: ISO date, reason }]
};

let channelFilter = '';
let keywordFilter = '';

function load() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'channels',
      'keywords',
      'whitelistChannels',
      'subsSnapshot',
      'blockShorts',
      'shortsSubOnly',
      'blockCommunity',
      'autoDubMode',
      'enableQuickBlock',
      'triggerServerFeedback',
      'nyt_totalBlocked',
      'aiAutonomous',
      'aiSensitivity',
      'aiModel',
      'aiTastePrompt',
      'aiSubscriptionProfile',
      'tasteLikedChannels',
      'tasteDislikedChannels',
      'aiLog',
      'aiDebaitTitles',
      'aiDebaitModel',
      'tldwEnabled',
      'huntMode',
      'chipRescue',
      'newToYouAuto',
      'extensionEnabled',
      'keywordExceptions',
      'feedHealthLog',
      'communityPacks',
      'temporalRules'
    ], (res) => {
      // Mirror save()'s teardown guard: reading storage can fail, and the popup can
      // be torn down mid-read ("Extension context invalidated"), leaving res
      // undefined — every line below dereferences it.
      if (chrome.runtime?.lastError || !res || typeof res !== 'object') { resolve(); return; }
      data.channels = Array.isArray(res.channels) ? res.channels : [];
      data.keywords = Array.isArray(res.keywords) ? res.keywords : [];
      data.whitelistChannels = Array.isArray(res.whitelistChannels) ? res.whitelistChannels : [];
      data.subsSnapshot = Array.isArray(res.subsSnapshot) ? res.subsSnapshot : [];
      data.blockShorts = Boolean(res.blockShorts);
      data.shortsSubOnly = Boolean(res.shortsSubOnly);
      data.blockCommunity = Boolean(res.blockCommunity);
      data.autoDubMode = ['off', 'smart', 'total'].includes(res.autoDubMode) ? res.autoDubMode : 'off';
      data.enableQuickBlock = res.enableQuickBlock !== false;
      data.triggerServerFeedback = Boolean(res.triggerServerFeedback);
      data.totalBlocked = Number(res.nyt_totalBlocked) || 0;
      data.aiAutonomous = Boolean(res.aiAutonomous);
      data.aiSensitivity = res.aiSensitivity || 'balanced';
      data.aiModel = res.aiModel || '';
      data.aiTastePrompt = res.aiTastePrompt || '';
      data.aiSubscriptionProfile = res.aiSubscriptionProfile || '';
      data.tasteLikedChannels = Array.isArray(res.tasteLikedChannels) ? res.tasteLikedChannels : [];
      data.tasteDislikedChannels = Array.isArray(res.tasteDislikedChannels) ? res.tasteDislikedChannels : [];
      data.aiLog = Array.isArray(res.aiLog) ? res.aiLog : [];
      data.aiDebaitTitles = Boolean(res.aiDebaitTitles);
      data.aiDebaitModel = res.aiDebaitModel || res.aiModel || '';
      data.tldwEnabled = res.tldwEnabled !== false;
      data.huntMode = Boolean(res.huntMode);
      data.chipRescue = Boolean(res.chipRescue);
      data.newToYouAuto = Boolean(res.newToYouAuto);
      data.extensionEnabled = res.extensionEnabled !== false;
      data.keywordExceptions = res.keywordExceptions && typeof res.keywordExceptions === 'object' ? res.keywordExceptions : {};
      data.feedHealthLog = Array.isArray(res.feedHealthLog) ? res.feedHealthLog : [];
      data.communityPacks = Array.isArray(res.communityPacks) ? res.communityPacks : [];
      data.temporalRules = Array.isArray(res.temporalRules) ? res.temporalRules : [];
      resolve();
    });
  });
}

async function save() {
  // This promise rejects with "Extension context invalidated" when the popup is
  // torn down mid-write (tab activation, click-away). Uncaught, that becomes an
  // unhandled rejection in the console on every such close.
  await chrome.storage.local.set({
    channels: data.channels,
    keywords: data.keywords,
    whitelistChannels: data.whitelistChannels,
    subsSnapshot: data.subsSnapshot,
    blockShorts: data.blockShorts,
    shortsSubOnly: data.shortsSubOnly,
    blockCommunity: data.blockCommunity,
    autoDubMode: data.autoDubMode,
    enableQuickBlock: data.enableQuickBlock,
    triggerServerFeedback: data.triggerServerFeedback,
    aiAutonomous: data.aiAutonomous,
    aiSensitivity: data.aiSensitivity,
    aiModel: data.aiModel,
    aiTastePrompt: data.aiTastePrompt,
    aiSubscriptionProfile: data.aiSubscriptionProfile,
    tasteLikedChannels: data.tasteLikedChannels,
    tasteDislikedChannels: data.tasteDislikedChannels,
    aiLog: data.aiLog,
    aiDebaitTitles: data.aiDebaitTitles,
    aiDebaitModel: data.aiDebaitModel,
    tldwEnabled: data.tldwEnabled,
    huntMode: data.huntMode,
    chipRescue: data.chipRescue,
    newToYouAuto: data.newToYouAuto,
    extensionEnabled: data.extensionEnabled,
    keywordExceptions: data.keywordExceptions,
    feedHealthLog: data.feedHealthLog,
    communityPacks: data.communityPacks,
    temporalRules: data.temporalRules
  }).catch(() => {});

  // Notify active YouTube tabs to re-apply rules immediately.
  // At this point the storage write has completed, so content scripts that
  // receive RULES_UPDATED and re-read from storage will see the new data.
  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
    await Promise.allSettled(
      tabs
        .filter((tab) => tab.url && tab.url.startsWith('https://www.youtube.com'))
        .map((tab) =>
          chrome.tabs.sendMessage(tab.id, { type: 'RULES_UPDATED' }).catch(() => {})
        )
    );
  } catch (_) {}
}

function setStatus(msg) {
  const el = document.getElementById('statusMsg');
  if (el) {
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = 'Ready'; }, 2500);
  }
}

function extractEntityFromInput(val) {
  if (!val) return '';
  let s = val.trim();
  if (s.includes('youtu.be/')) {
    const vid = s.split('youtu.be/')[1].split('?')[0].split('/')[0].split('&')[0];
    if (vid) return vid.toLowerCase();
  }
  if (s.includes('watch?v=') || s.includes('watch?')) {
    const match = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (match) return match[1].toLowerCase();
  }
  if (s.includes('youtube.com/@')) {
    const handle = s.split('youtube.com/@')[1].split('?')[0].split('/')[0];
    if (handle) return ('@' + handle).toLowerCase();
  }
  if (s.includes('youtube.com/channel/')) {
    const cid = s.split('youtube.com/channel/')[1].split('?')[0].split('/')[0];
    if (cid) return cid.toLowerCase();
  }
  if (s.includes('youtube.com/c/')) {
    const cname = s.split('youtube.com/c/')[1].split('?')[0].split('/')[0];
    if (cname) return cname.toLowerCase();
  }
  if (s.includes('youtube.com/user/')) {
    const uname = s.split('youtube.com/user/')[1].split('?')[0].split('/')[0];
    if (uname) return uname.toLowerCase();
  }
  return s.toLowerCase();
}

function parseBulkInput(raw) {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map(s => extractEntityFromInput(s))
    .filter(s => s && s.length > 0);
}

// Render item row with an optional inline-edit (✏️) button next to the remove button.
function itemRow(text, onRemove, onEdit) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = text;
  name.title = text;
  row.appendChild(name);

  if (onEdit) {
    const editBtn = document.createElement('button');
    editBtn.className = 'item-btn item-btn-edit';
    editBtn.textContent = '✏️';
    editBtn.title = 'Edit this rule';
    editBtn.addEventListener('click', () => startInlineEdit(row, text, onEdit));
    row.appendChild(editBtn);
  }

  const btn = document.createElement('button');
  btn.className = 'item-btn';
  btn.textContent = 'Unblock';
  btn.addEventListener('click', onRemove);
  row.appendChild(btn);
  return row;
}

// Turn a row into an inline editor. onCommit(oldValue, newValue) is the caller's
// chance to swap the rule in storage; the list re-renders afterwards.
function startInlineEdit(row, current, onCommit) {
  row.innerHTML = '';
  row.className = 'item-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'item-edit-input';
  input.value = current;
  input.spellcheck = false;
  row.appendChild(input);

  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const next = input.value.trim();
    if (next && next !== current) onCommit(current, next);
    renderAll();
  };
  const cancel = () => {
    if (done) return;
    done = true;
    renderAll();
  };

  const saveBtn = document.createElement('button');
  saveBtn.className = 'item-btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', commit);
  row.appendChild(saveBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'item-btn';
  cancelBtn.textContent = '✕';
  cancelBtn.title = 'Cancel';
  cancelBtn.addEventListener('click', cancel);
  row.appendChild(cancelBtn);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') cancel();
  });
  input.addEventListener('blur', () => {
    // blur runs before the button's click, so waiting for the click destroyed
    // the row out from under the press and ✕ committed instead of cancelling.
    // Deciding on mousedown settles it first; `done` then makes both the late
    // blur and the never-delivered click no-ops.
    if (done) return;
    commit();
  });
  saveBtn.addEventListener('mousedown', commit);
  cancelBtn.addEventListener('mousedown', cancel);

  input.focus();
  input.select();
}

// Canonical storage form of a keyword rule. Every path that writes or matches a
// keyword (add, AI injection, conflict rows) must go through this, or a rule
// added as "Crypto" can't be found again by a later lookup of "crypto".
function canonicalKeyword(kw) {
  return String(kw == null ? '' : kw).trim().toLowerCase();
}

// Swap oldVal for newVal inside arr (dedup-aware); returns 1 if a change happened.
function replaceRule(arr, oldVal, newVal) {
  const idx = arr.indexOf(oldVal);
  if (idx === -1) return 0;
  // Both sides of the swap are the same stored value (a case-only edit, or an
  // edit that normalizes back to the original). The includes() check below
  // matches the entry against ITSELF and would splice the rule out of the list.
  if (arr[idx] === newVal) return 0;
  if (arr.includes(newVal)) {
    arr.splice(idx, 1);
  } else {
    arr[idx] = newVal;
  }
  return 1;
}

function renderList(listEl, items, filterText, emptyMsg, onRemove, onEdit) {
  listEl.innerHTML = '';
  const filtered = filterText
    ? items.filter(it => it.toLowerCase().includes(filterText.toLowerCase()))
    : items;

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = items.length && filterText ? 'No matches found.' : emptyMsg;
    listEl.appendChild(empty);
    return;
  }

  filtered.forEach(it => {
    listEl.appendChild(itemRow(it, () => onRemove(it), onEdit ? (o, n) => onEdit(o, n) : undefined));
  });
}

function renderAll() {
  renderList(
    document.getElementById('channelList'),
    data.channels,
    channelFilter,
    'No channels blacklisted yet. Click 3-dots or quick-block button on any video.',
    (item) => {
      data.channels = data.channels.filter(c => c !== item);
      save(); renderAll(); setStatus('Channel unblocked.');
    },
    (oldV, newV) => {
      // Same canonicalization the add path applies (lowercased, URL/handle
      // normalized) — otherwise an edited rule is stored in a different string
      // form than a typed one and never matches the matcher or the dedupe.
      replaceRule(data.channels, oldV, extractEntityFromInput(newV));
      save(); renderAll(); setStatus('Channel rule updated.');
    }
  );

  renderList(
    document.getElementById('keywordList'),
    data.keywords,
    keywordFilter,
    'No keyword rules yet.',
    (item) => {
      data.keywords = data.keywords.filter(k => k !== item);
      save(); renderAll(); setStatus('Keyword removed.');
    },
    (oldV, newV) => {
      replaceRule(data.keywords, oldV, canonicalKeyword(newV));
      save(); renderAll(); setStatus('Keyword rule updated.');
    }
  );

  renderList(
    document.getElementById('whitelistList'),
    data.whitelistChannels,
    '',
    'No whitelisted channels.',
    (item) => {
      data.whitelistChannels = data.whitelistChannels.filter(c => c !== item);
      save(); renderAll(); setStatus('Whitelist entry removed.');
    },
    (oldV, newV) => {
      replaceRule(data.whitelistChannels, oldV, extractEntityFromInput(newV));
      save(); renderAll(); setStatus('Whitelist entry updated.');
    }
  );

  document.getElementById('channelCount').textContent = data.channels.length;
  document.getElementById('keywordCount').textContent = data.keywords.length;
  document.getElementById('whitelistCount').textContent = data.whitelistChannels.length;

  const badge = document.getElementById('totalBlockedBadge');
  if (badge) {
    badge.textContent = `${data.totalBlocked} Blocked`;
  }

  renderGamification();
}

function getRank(total) {
  for (let i = 0; i < RANKS.length; i++) {
    if (total >= RANKS[i].min && total <= RANKS[i].max) {
      const nextMin = RANKS[i + 1] ? RANKS[i + 1].min : (RANKS[i].min === 0 ? 10 : RANKS[i].min * 2);
      const range = nextMin - RANKS[i].min;
      const progress = Math.min(100, Math.max(8, Math.round(((total - RANKS[i].min) / range) * 100)));
      return { ...RANKS[i], progress, nextRank: RANKS[i + 1] };
    }
  }
  return { ...RANKS[0], progress: 8, nextRank: RANKS[1] };
}

function renderGamification() {
  const rank = getRank(data.totalBlocked);
  const emojiEl = document.getElementById('rankEmoji');
  const titleEl = document.getElementById('rankTitle');
  const pillEl = document.getElementById('rankPill');
  if (emojiEl) emojiEl.textContent = rank.emoji;
  if (titleEl) titleEl.textContent = rank.title;
  if (pillEl) {
    const nextMsg = rank.nextRank ? `Next rank: ${rank.nextRank.emoji} ${rank.nextRank.title} at ${rank.nextRank.min} blocks` : 'Max rank achieved!';
    pillEl.title = `${rank.title} (${data.totalBlocked} blocked) • ${nextMsg} • Click for celebration!`;
  }

  // Calculate life saved (10 min per clickbait video avoided)
  const savedMinutes = data.totalBlocked * 10;
  const lifeSavedEl = document.getElementById('lifeSavedVal');
  if (lifeSavedEl) {
    if (savedMinutes < 60) {
      lifeSavedEl.textContent = `${savedMinutes}m`;
    } else {
      const hrs = (savedMinutes / 60).toFixed(1);
      lifeSavedEl.textContent = `${hrs}h`;
    }
  }

  // Purity score
  const purityEl = document.getElementById('purityVal');
  if (purityEl) {
    if (data.totalBlocked === 0) {
      purityEl.textContent = '100%';
    } else {
      const p = Math.min(99.9, 90 + Math.min(9.9, data.totalBlocked / 15));
      purityEl.textContent = `${p.toFixed(1)}%`;
    }
  }

  // Progress fill
  const progressFill = document.getElementById('levelProgressFill');
  if (progressFill) {
    progressFill.style.width = `${rank.progress}%`;
  }

  // Update starter packs active status
  document.querySelectorAll('.pack-btn').forEach(btn => {
    const packKey = btn.dataset.pack;
    const pack = STARTER_PACKS[packKey];
    if (pack && pack.length) {
      const words = pack.map(p => p.kw);
      const allIncluded = words.every(w => data.keywords.includes(w));
      if (allIncluded) {
        btn.classList.add('applied');
        btn.title = `Pack active (${words.length} rules). Click to remove.`;
      } else {
        btn.classList.remove('applied');
        btn.title = `Click to add ${words.length} curated rules.`;
      }
    }
  });
}

function triggerConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 420;
  canvas.height = canvas.offsetHeight || 580;

  const particles = [];
  const colors = ['#ff0033', '#ffd700', '#2ba640', '#5ea8ff', '#ffffff', '#ff8c00'];

  for (let i = 0; i < 45; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() * 80 - 40),
      y: 70,
      vx: (Math.random() - 0.5) * 7,
      vy: Math.random() * -5 - 2,
      size: Math.random() * 4 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 8
    });
  }

  let frames = 0;
  function step() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.rotation += p.rotationSpeed;
      if (frames > 25) p.alpha -= 0.025;
      if (p.alpha > 0) {
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    });
    frames++;
    if (alive && frames < 80) {
      requestAnimationFrame(step);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  requestAnimationFrame(step);
}

// Wire add handlers
function wireAdd(inputId, btnId, handler) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  const commit = () => {
    const val = input.value.trim();
    if (!val) return;
    handler(val);
    input.value = '';
    save();
    renderAll();
    setStatus('Saved.');
  };
  btn.addEventListener('click', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
  });
}

// Export/import moved to the dedicated Backup & Restore page (backup.html).
// The old popup-scoped export (detached <a download> + immediate
// URL.revokeObjectURL()) silently produced no file in Firefox/Zen, and a popup-scoped
// file picker can close the popup before the chosen file is ever read. A real page
// has no popup lifecycle, so both operations are reliable there.
function openBackupPage(mode) {
  try {
    chrome.tabs.create({ url: chrome.runtime.getURL('backup.html' + (mode === 'import' ? '#import' : '#export')) }).catch(() => {});
  } catch (_) {}
}

// The import-time sanitizers (isReDoSSuspect / sanitizeImportedKeyword) and the old
// popup-scoped importer lived here. They now live in backup.js, where the file picker
// cannot close the page and "replace" actually runs. The popup buttons open that page.

function initToggles() {
  const qb = document.getElementById('toggleQuickBlock');
  if (qb) {
    qb.checked = data.enableQuickBlock;
    qb.onchange = () => { data.enableQuickBlock = qb.checked; save(); };
  }

  const sf = document.getElementById('toggleServerFeedback');
  if (sf) {
    sf.checked = data.triggerServerFeedback;
    sf.onchange = () => { data.triggerServerFeedback = sf.checked; save(); };
  }

  const bs = document.getElementById('toggleBlockShorts');
  if (bs) {
    bs.checked = data.blockShorts;
    bs.onchange = () => { data.blockShorts = bs.checked; save(); };
  }

  const ss = document.getElementById('toggleSubOnlyShorts');
  if (ss) {
    ss.checked = data.shortsSubOnly;
    ss.onchange = () => { data.shortsSubOnly = ss.checked; save(); };
  }

  const bc = document.getElementById('toggleBlockCommunity');
  if (bc) {
    bc.checked = data.blockCommunity;
    bc.onchange = () => { data.blockCommunity = bc.checked; save(); };
  }

  const ad = document.getElementById('radioAutoDubOff');
  if (ad) {
    const setAutoDubMode = (mode) => {
      data.autoDubMode = mode;
      const offR = document.getElementById('radioAutoDubOff');
      const smartR = document.getElementById('radioAutoDubSmart');
      const totalR = document.getElementById('radioAutoDubTotal');
      if (offR) offR.checked = mode === 'off';
      if (smartR) smartR.checked = mode === 'smart';
      if (totalR) totalR.checked = mode === 'total';
      save();
    };
    const wireRadio = (id, mode) => {
      const el = document.getElementById(id);
      if (el) {
        el.checked = data.autoDubMode === mode;
        el.onchange = () => { if (el.checked) setAutoDubMode(mode); };
      }
    };
    wireRadio('radioAutoDubOff', 'off');
    wireRadio('radioAutoDubSmart', 'smart');
    wireRadio('radioAutoDubTotal', 'total');
  }

  const dbGuard = document.getElementById('toggleAiDebait');
  const dbSettings = document.getElementById('toggleAiDebaitSettings');
  const setAiDebaitTitles = (enabled) => {
    data.aiDebaitTitles = Boolean(enabled);
    if (dbGuard) dbGuard.checked = data.aiDebaitTitles;
    if (dbSettings) dbSettings.checked = data.aiDebaitTitles;
    save();
  };

  if (dbGuard) {
    dbGuard.checked = data.aiDebaitTitles;
    dbGuard.onchange = () => setAiDebaitTitles(dbGuard.checked);
  }

  if (dbSettings) {
    dbSettings.checked = data.aiDebaitTitles;
    dbSettings.onchange = () => setAiDebaitTitles(dbSettings.checked);
  }

  const tlSettings = document.getElementById('toggleTldw');
  if (tlSettings) {
    tlSettings.checked = data.tldwEnabled;
    tlSettings.onchange = () => { data.tldwEnabled = tlSettings.checked; save(); };
  }

  const huntToggle = document.getElementById('toggleHuntMode');
  if (huntToggle) {
    huntToggle.checked = Boolean(data.huntMode);
    huntToggle.onchange = () => { data.huntMode = huntToggle.checked; save(); };
  }

  const chipRescueToggle = document.getElementById('toggleChipRescue');
  if (chipRescueToggle) {
    chipRescueToggle.checked = Boolean(data.chipRescue);
    chipRescueToggle.onchange = () => { data.chipRescue = chipRescueToggle.checked; save(); };
  }

  const newToYouToggle = document.getElementById('toggleNewToYou');
  if (newToYouToggle) {
    newToYouToggle.checked = Boolean(data.newToYouAuto);
    newToYouToggle.onchange = () => { data.newToYouAuto = newToYouToggle.checked; save(); };
  }

  // MASTER SWITCHES (header + Settings). Both inputs carry data-master-toggle, so
  // one handler drives them and they cannot drift apart. Writes `extensionEnabled`
  // through the same save() bus as every other toggle, so the content scripts pick
  // it up from storage and from the RULES_UPDATED broadcast save() sends to every
  // open YouTube tab.
  const masterToggles = Array.from(document.querySelectorAll('input[data-master-toggle]'));
  const setMasterEnabled = (on) => {
    data.extensionEnabled = on;
    applyMasterUi();
    save();
    setStatus(on
      ? 'Extension enabled — your rules are being applied again.'
      : 'Extension paused — nothing is being hidden or blocked.');
  };
  masterToggles.forEach((toggle) => {
    toggle.onchange = () => setMasterEnabled(toggle.checked);
  });

  // The banner's one-click way back on. Keeps the master checkbox in sync because
  // both paths go through the same two setters (data + applyMasterUi).
  const resumeBtn = document.getElementById('pauseBannerResume');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
      data.extensionEnabled = true;
      applyMasterUi();
      save();
      setStatus('Extension enabled — your rules are being applied again.');
    });
  }
}

// Reflect the master switch in the popup chrome. The paused banner sits OUTSIDE the
// tab panes, so it is driven by a body class rather than per-pane markup — which is
// also what makes it visible on every tab at once.
function applyMasterUi() {
  const on = data.extensionEnabled !== false;
  try { document.body.classList.toggle('nyt-paused', !on); } catch (_) {}
  // Every master switch (header + Settings) reflects the state, so whichever one
  // the user is looking at tells the truth — including on first paint.
  document.querySelectorAll('input[data-master-toggle]').forEach((toggle) => {
    toggle.checked = on;
    toggle.title = on
      ? 'Extension active. Turn off to pause everything.'
      : 'Extension paused. Turn on to resume.';
  });
}

// ------------------------------------------------------------------
// AI FEED FORENSIC DIAGNOSTIC ROAST
// ------------------------------------------------------------------
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getActiveYoutubeTab() {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true, url: 'https://www.youtube.com/*' }, (tabs) => {
        const tab = tabs && tabs[0];
        if (tab && tab.url && tab.url.startsWith('https://www.youtube.com')) {
          resolve(tab);
        } else {
          resolve(null);
        }
      });
    } catch (_) {
      // Transient: user is dragging/resizing a tab. Resolve null so callers fall back
      // to their "open a YouTube tab first" message instead of throwing into the popup.
      resolve(null);
    }
  });
}

function finishRoast(btn, msg) {
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span>🩻 Run Feed Diagnostic Roast</span>';
  }
  const card = document.getElementById('aiRoastResult');
  if (card) {
    card.style.display = 'block';
    card.className = 'ai-result-box';
    card.innerHTML = `<div style="font-size:11.5px;color:#ffb400;line-height:1.4;">${escapeHtml(msg)}</div>`;
  }
}

// The <select> is filled asynchronously from CHECK_AI_STATUS, so data.aiModel can
// be stale (or empty while the dropdown shows a detected model). Read the control
// at call time — that is what the user is actually looking at.
function currentAiModelChoice() {
  const sel = document.getElementById('aiModelSelect');
  return (sel && sel.value) ? sel.value : (data.aiModel || '');
}

function runFeedRoast() {
  const roastBtn = document.getElementById('aiRoastBtn');
  const roastCard = document.getElementById('aiRoastResult');
  if (roastBtn) {
    roastBtn.disabled = true;
    roastBtn.innerHTML = '<span>🩻 Interrogating your feed...</span>';
  }
  if (roastCard) roastCard.style.display = 'none';

  getActiveYoutubeTab().then((tab) => {
    if (!tab) {
      finishRoast(roastBtn, 'Open a YouTube tab first, then run the diagnostic from there.');
      return;
    }
    try {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_VISIBLE_FEED_ITEMS' }, (res) => {
        if (chrome.runtime?.lastError) {
          finishRoast(roastBtn, 'Could not contact the YouTube page. Reload the YouTube tab, then run the diagnostic again.');
          return;
        }
        const items = (res && Array.isArray(res.items)) ? res.items : [];
        if (!items.length) {
          finishRoast(roastBtn, 'No feed titles were found yet. Wait for Home recommendations to load, then try again.');
          return;
        }
        chrome.runtime.sendMessage({
          type: 'AI_ROAST_FEED',
          items,
          modelChoice: currentAiModelChoice()
        }, (roastRes) => {
          // Consume the error explicitly (like every other sendMessage callback
          // here): leaving lastError unread logs a spurious "Unchecked
          // runtime.lastError" whenever the worker is asleep.
          if (chrome.runtime?.lastError) roastRes = null;
          renderRoastResult(roastRes);
          if (roastBtn) {
            roastBtn.disabled = false;
            roastBtn.innerHTML = '<span>🩻 Run Feed Diagnostic Roast</span>';
          }
        });
      });
    } catch (_) {
      finishRoast(roastBtn, 'Could not reach the YouTube tab. Reload it and try again.');
    }
  });
}

function renderRoastResult(roastRes) {
  const card = document.getElementById('aiRoastResult');
  if (!card) return;
  card.className = 'ai-result-box roast-result';
  card.style.display = 'block';

  const r = (roastRes && roastRes.ok)
    ? roastRes
    : { toxicity: 0, tactics: [], diagnosis: 'Roast unavailable — local AI offline.', toxicChannels: [], isFallback: true };
  const toxicity = Math.max(0, Math.min(100, Number(r.toxicity) || 0));
  const tactics = Array.isArray(r.tactics) ? r.tactics : [];
  const toxicChannels = Array.isArray(r.toxicChannels) ? r.toxicChannels : [];

  const toxColor = toxicity >= 70 ? '#ff4d6a' : (toxicity >= 40 ? '#ffb400' : '#4ade80');
  const tacticsHtml = tactics.length
    ? tactics.map(t => `<span class="roast-tactic">${escapeHtml(t)}</span>`).join('')
    : '<span class="roast-tactic">🔍 Surprisingly clean</span>';
  const channelsHtml = toxicChannels.length
    ? toxicChannels.map(c => `<div class="roast-channel">${escapeHtml(c)}</div>`).join('')
    : '<div class="roast-channel subtle">No obvious toxic channel signatures detected.</div>';
  const purgeBtn = toxicChannels.length
    ? `<button class="ai-action-btn roast-purge" id="purgeManipulatorsBtn">⚡ Purge All Identified Manipulators (${toxicChannels.length})</button>`
    : '';

  card.innerHTML = `
    <div class="roast-head">
      <div>
        <div style="font-weight:700;font-size:13px;color:#fff;">🩻 Feed Psych Evaluation</div>
        <div style="font-size:10.5px;color:#9aa3b2;">${r.isFallback ? '⚡ Heuristic audit (local model offline)' : '🧠 Audited by local neural model'}</div>
      </div>
      <div class="roast-tox">
        <span class="roast-tox-bar"><i style="width:${toxicity}%;background:${toxColor};"></i></span>
        <span class="roast-tox-num">${toxicity}%</span>
        <span class="roast-tox-lbl">Toxicity</span>
      </div>
    </div>
    <div class="roast-tactics">${tacticsHtml}</div>
    <div class="roast-diagnosis">${escapeHtml(r.diagnosis || 'No diagnosis provided.')}</div>
    <div class="roast-channels-title">☠️ Identified Manipulators:</div>
    <div class="roast-channels">${channelsHtml}</div>
    ${purgeBtn ? `<div style="margin-top:10px;">${purgeBtn}</div>` : ''}
  `;

  const purge = card.querySelector('#purgeManipulatorsBtn');
  if (purge) purge.addEventListener('click', purgeManipulators);
}

function purgeManipulators() {
  const card = document.getElementById('aiRoastResult');
  const channels = [];
  if (card) {
    card.querySelectorAll('.roast-channel:not(.subtle)').forEach(el => {
      const c = (el.textContent || '').trim();
      if (c) channels.push(c);
    });
  }
  const unique = [...new Set(channels.map(c => c.toLowerCase()))];
  let added = 0;
  unique.forEach(c => {
    if (c && !data.channels.includes(c)) {
      data.channels.push(c);
      added++;
    }
  });
  save();
  renderAll();
  const purge = card && card.querySelector('#purgeManipulatorsBtn');
  if (purge) {
    purge.disabled = true;
    purge.textContent = added > 0 ? `⚡ Purged ${added} manipulators` : '⚡ Already blacklisted';
    purge.style.opacity = '0.6';
  }
  setStatus(`Purged ${added} toxic channels!`);
  triggerConfetti();
}

// ------------------------------------------------------------------
// SUBSCRIPTION SYNTHESIZER (companion to Mind Reader)
// ------------------------------------------------------------------

// Shared rule-injection used by BOTH the Mind Reader and the Subscription Synthesizer.
// Keywords are lowercased; regex patterns are preserved verbatim. Dedupes against data.keywords.
function injectRulesIntoBlacklist(rules) {
  let added = 0;
  if (rules && Array.isArray(rules.keywords)) {
    rules.keywords.forEach(k => {
      const clean = canonicalKeyword(k);
      if (clean && !data.keywords.includes(clean)) {
        data.keywords.push(clean);
        added++;
      }
    });
  }
  if (rules && Array.isArray(rules.regex)) {
    rules.regex.forEach(r => {
      let clean = String(r).trim();
      if (!clean) return;
      if (!clean.startsWith('/')) {
        clean = `/${clean}/i`;
      } else if (clean.lastIndexOf('/') === 0) {
        clean = `${clean}/i`;
      }
      const lastSlash = clean.lastIndexOf('/');
      const pattern = clean.slice(1, lastSlash);
      const flags = clean.slice(lastSlash + 1) || 'i';
      try {
        new RegExp(pattern, flags);
      } catch (_) {
        return;
      }
      if (!data.keywords.includes(clean)) {
        data.keywords.push(clean);
        added++;
      }
    });
  }
  return added;
}

const SUBSCRIPTIONS_URL = 'https://www.youtube.com/feed/channels';

function isSubscriptionsUrl(url) {
  return typeof url === 'string' && /^https:\/\/www\.youtube\.com\/feed\/channels(\/|$)/.test(url);
}

function finishSubSynth(btn, msg) {
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span>🔭 Synthesize Rules from My Subscriptions</span>';
  }
  const card = document.getElementById('aiSubResultBox');
  if (card) {
    card.style.display = 'block';
    card.className = 'ai-result-box';
    card.innerHTML = `<div style="font-size:11.5px;color:#ffb400;line-height:1.4;">${escapeHtml(msg)}</div>`;
  }
}

// Amber warning rows: new rules that word-boundary match a subscribed channel's name.
// Mirrors the extension's actual matcher semantics, so these collisions would REALLY hide
// the user's own subscriptions — surfaced here for a one-click keyword removal.
function renderConflictRows(conflicts) {
  if (!Array.isArray(conflicts) || !conflicts.length) return '';
  const rows = conflicts.map(c => {
    const names = (Array.isArray(c.channels) ? c.channels : [])
      .map(escapeHtml)
      .join(', ') + (c.more ? ` <span style="color:#9aa3b2;">+${c.more} more</span>` : '');
    // data-kw holds the SAME canonical key injectRulesIntoBlacklist() stored, so
    // the ✕ remove below finds the rule the row was rendered for.
    const kw = canonicalKeyword(c.keyword);
    return `<div class="sub-conflict-row" data-kw="${escapeHtml(kw)}" style="font-size:10.5px;line-height:1.5;margin-top:5px;">
      <span style="color:#ffb400;">⚠️ “${escapeHtml(c.keyword)}” would hide your subscription:</span>
      <span style="color:#e5e7eb;"> ${names}</span>
      <button class="sub-conflict-remove" style="margin-left:6px;background:transparent;border:1px solid #ffb400;color:#ffb400;border-radius:10px;font-size:10px;padding:1px 8px;cursor:pointer;">✕ remove</button>
    </div>`;
  }).join('');
  return `<div style="margin-top:8px;border-top:1px solid rgba(255,180,0,0.25);padding-top:6px;">${rows}</div>`;
}

function wireConflictRows(container, conflicts) {
  if (!container || !Array.isArray(conflicts)) return;
  container.querySelectorAll('.sub-conflict-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.sub-conflict-row');
      const kw = canonicalKeyword(row && row.dataset.kw);
      if (kw) {
        const idx = data.keywords.findIndex(k => canonicalKeyword(k) === kw);
        if (idx !== -1) {
          data.keywords.splice(idx, 1);
          save();
          renderAll();
          setStatus(`Removed “${kw}” from the blacklist.`);
        } else {
          setStatus(`“${kw}” is no longer in the blacklist.`);
        }
      }
      if (row) {
        row.style.textDecoration = 'line-through';
        row.style.opacity = '0.5';
      }
      btn.disabled = true;
    });
  });
}

// Opt-in action: whitelist every scanned subscription in one click.
// Deliberately NOT automatic — the whitelist wins over the blacklist in the matcher,
// so silently adding subscriptions would resurrect channels the user explicitly blacklisted.
function renderProtectAction(channels) {
  const protectable = (channels || []).filter(ch => ch && String(ch.name || '').trim());
  if (!protectable.length) return '';
  return `<div style="margin-top:10px;border-top:1px solid rgba(43,166,64,0.25);padding-top:8px;">
    <button class="ai-action-btn" id="subProtectBtn" style="background:linear-gradient(135deg,#1f7a33,#2ba640);font-size:12px;">
      🛡️ Protect my ${protectable.length} scanned subscriptions (whitelist)
    </button>
  </div>`;
}

function wireProtectAction(container, channels) {
  const btn = container && container.querySelector('#subProtectBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const protectable = (channels || []).filter(ch => ch && String(ch.name || '').trim());
    const existing = new Set(data.whitelistChannels.map(w => String(w).trim().toLowerCase()));
    const blacklisted = new Set(data.channels.map(c => String(c).trim().toLowerCase()));

    let addedCount = 0;
    protectable.forEach(ch => {
      const name = String(ch.name || '').trim();
      const handle = String(ch.handle || '').trim();
      const url = String(ch.url || '').trim();
      const id = handle || url || name;
      const normId = id.replace(/^@/, '').trim().toLowerCase();

      // Blacklist wins: a channel the user explicitly blocked is never auto-whitelisted.
      if (existing.has(id.trim().toLowerCase()) || blacklisted.has(normId) || blacklisted.has(name.toLowerCase())) return;

      data.whitelistChannels.push(id);
      existing.add(id.trim().toLowerCase());
      addedCount++;
    });

    save();
    renderAll();
    btn.disabled = true;
    btn.textContent = addedCount > 0
      ? `✅ Protected ${addedCount} subscriptions (whitelist tab updated)`
      : '✅ All scanned subscriptions already protected';
    if (addedCount > 0) triggerConfetti();
    setStatus(addedCount > 0 ? `Whitelisted ${addedCount} subscriptions!` : 'Subscriptions already whitelisted.');
  });
}

// Render the EXACT synthesized rules (keywords + regex) as chips inside a scrollable
// box — the user SEES what the AI created instead of only a count.
function renderRuleChips(keywords, regex) {
  const kwChips = (Array.isArray(keywords) ? keywords : [])
    .filter(Boolean)
    .map(k => `<span style="display:inline-block;font-size:10px;padding:2px 6px;margin:2px 3px 0 0;background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-radius:10px;">${escapeHtml(String(k))}</span>`)
    .join('');
  const rxChips = (Array.isArray(regex) ? regex : [])
    .filter(Boolean)
    .map(r => `<span style="display:inline-block;font-size:10px;padding:2px 6px;margin:2px 3px 0 0;background:#2e1065;border:1px solid #6b21a8;color:#d8b4fe;border-radius:10px;">${escapeHtml(String(r))}</span>`)
    .join('');
  const body = `${kwChips} ${rxChips}`.trim();
  if (!body) return '';
  return `<div style="max-height:120px;overflow-y:auto;margin-top:6px;padding:6px 8px;background:rgba(255,255,255,0.03);border:1px solid rgba(148,163,184,0.18);border-radius:8px;line-height:1.6;">${body}</div>`;
}

// Jump from a synthesis success box to the Keywords tab, where every keyword rule lives.
function gotoKeywordsTab() {
  const btn = document.querySelector('.tab-btn[data-tab="keywordsTab"]');
  if (btn) btn.click();
  const search = document.getElementById('keywordSearch');
  if (search) search.value = '';
  keywordFilter = '';
  renderAll();
}

// ------------------------------------------------------------------
// FEED DIVERSITY METER
// ------------------------------------------------------------------
function measureFeedDiversity() {
  const line = document.getElementById('feedDiversityLine');
  const btn = document.getElementById('feedDiversityBtn');

  const renderHint = (msg) => {
    if (line) {
      line.style.display = 'block';
      line.className = 'ai-result-box';
      line.innerHTML = `<div style="font-size:11.5px;color:#9aa3b2;line-height:1.4;">${escapeHtml(msg)}</div>`;
    }
  };

  if (btn) { btn.disabled = true; btn.textContent = '📊 Measuring…'; }
  const done = () => { if (btn) { btn.disabled = false; btn.textContent = '📊 Measure feed'; } };

  if (!data.subsSnapshot || !data.subsSnapshot.length) {
    renderHint('No subscription snapshot yet — run "🔭 Synthesize Rules from My Subscriptions" first, then re-measure. (Or open the popup after a scan to keep the snapshot.)');
    done();
    return;
  }

  getActiveYoutubeTab().then((tab) => {
    if (!tab || !tab.id || !tab.url) {
      renderHint('Open a YouTube tab first, then measure from there (Home feed works best).');
      done();
      return;
    }
    try {
      chrome.tabs.sendMessage(tab.id, { type: 'MEASURE_FEED_DIVERSITY' }, (res) => {
        if (chrome.runtime?.lastError || !res || !res.ok) {
          renderHint('Could not reach the YouTube page — reload it and press Measure again.');
          done();
          return;
        }
        if (!res.visible || res.visible < 1) {
          renderHint('No feed cards found on this page — open your YouTube Home feed to measure.');
          done();
          return;
        }

        // Coerce at the sink: these arrive over a message from the content script.
        // They are numeric counters today, but interpolating them raw into
        // innerHTML means any future string value would be treated as markup.
        const visibleN = Number(res.visible) || 0;
        const hiddenN = Number(res.hidden) || 0;
        const total = Math.max(Number(res.total) || 0, visibleN);
        const pct = visibleN ? Math.round((Number(res.subscribed) / visibleN) * 100) : 0;
        const newPct = Math.max(0, 100 - pct);

        if (line) {
          line.style.display = 'block';
          line.className = 'ai-result-box';
          line.innerHTML =
            `<div style="font-size:11.5px;font-weight:700;color:#fff;margin-bottom:4px;">📊 Feed Diversity</div>` +
            `<div style="font-size:11px;line-height:1.6;">
              <span style="color:#4ade80;">🔵 ${pct}% subscribed</span>
              <span style="color:#9aa3b2;">·</span>
              <span style="color:#c4b5fd;">🟣 ${newPct}% New-to-You</span>
              ${hiddenN ? `<span style="color:#9aa3b2;">·</span> <span style="color:#f87171;">🚫 ${hiddenN} hidden by rules</span>` : ''}
            </div>` +
            `<div style="position:relative;height:6px;background:#262a33;border-radius:3px;margin-top:5px;overflow:hidden;">
              <div style="position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:linear-gradient(90deg,#1f7a33,#2ba640);border-radius:3px 0 0 3px;"></div>
              <div style="position:absolute;left:${pct}%;top:0;bottom:0;width:${newPct}%;background:linear-gradient(90deg,#6d28d9,#8b5cf6);"></div>
            </div>` +
            `<div style="font-size:10px;color:#9aa3b2;margin-top:4px;">${visibleN} visible cards on this page${hiddenN ? ` · ${hiddenN} hidden` : ''} · ${total} total tracked</div>`;
        }
        done();
      });
    } catch (_) {
      renderHint('Could not reach the YouTube tab — reload it and try again.');
      done();
    }
  });
}

function runSubscriptionSynthesize() {
  // Single-scan guard MUST come first: activating a new tab tears the popup down,
  // so any UI mutation before this check would leave the button disabled forever
  // with no handler left to finish the scan.
  if (subSynthBusy) return;
  subSynthBusy = true;

  // Read the like/dislike inputs and persist them so they survive across runs.
  const likedRaw = (document.getElementById('tasteLikedInput') || {}).value || '';
  const dislikedRaw = (document.getElementById('tasteDislikedInput') || {}).value || '';
  const parseList = (s) => s.split(',').map(x => x.trim()).filter(Boolean).slice(0, 40);
  data.tasteLikedChannels = parseList(likedRaw);
  data.tasteDislikedChannels = parseList(dislikedRaw);
  save();

  // Declared here (not inside handleScrape) so the retry-on-dropped-response counter
  // survives across the sampling round-trip. It is incremented inside requestSynthesis,
  // which is itself only reachable after the sampler callback.
  let synthAttempts = 0;

  const btn = document.getElementById('aiSubSynthBtn');
  const card = document.getElementById('aiSubResultBox');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>🔭 Scanning your subscriptions...</span>';
  }
  if (card) card.style.display = 'none';

  let createdTabId = null;
  let prevActiveTabId = null;

  const releaseCreatedTab = (keepOpen) => {
    // Every terminal path (success, scrape failure, synthesis failure, tab
    // create/load failure) funnels through here, so this is the one place that
    // must re-arm the button — the success path never calls finishSubSynth().
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🔭 Synthesize Rules from My Subscriptions</span>';
    }
    if (createdTabId != null) {
      if (keepOpen) {
        // Kept open for the user to act on (sign-in wall): give it focus so they
        // see it — otherwise they'd stack a fresh tab on top on the next click.
        try { chrome.tabs.update(createdTabId, { active: true }).catch(() => {}); } catch (_) {}
      } else {
        try { chrome.tabs.remove(createdTabId).catch(() => {}); } catch (_) {}
      }
      createdTabId = null;
    }
    if (!keepOpen && prevActiveTabId != null) {
      try { chrome.tabs.update(prevActiveTabId, { active: true }).catch(() => {}); } catch (_) {}
    }
    prevActiveTabId = null;
    subSynthBusy = false;
  };

  const handleScrape = (res, tabId) => {
    if (!res || !res.ok || !Array.isArray(res.channels) || res.channels.length < 3) {
      const signedOut = res && res.ok && res.signedIn === false;
      finishSubSynth(btn, signedOut
        ? 'YouTube is asking you to sign in on that page before it reveals your subscriptions. Confirm you are signed in to YouTube in this browser profile, then press Scan again.'
        : 'No subscriptions were found on that page. If you just opened it: confirm you are signed in to YouTube in this browser profile, let the page finish loading, then press Scan again.');
      // Close the temp tab unless YouTube demands sign-in there (then the user needs to act on it).
      // This is what previously stacked hidden tabs and wedged the browser.
      releaseCreatedTab(signedOut);
      return;
    }
    const count = res.channels.length;

    // Deep style sampling, best-effort. This is what turns the synthesizer from
    // topic-matching into preference-matching: it reads each sampled channel's own blurb
    // and recent titles so the model can describe the STYLE the user follows. If it fails,
    // times out, or the page is busy, synthesis still runs on the channel list alone.
    const requestSynthesis = (samples) => {
      synthAttempts++;
      chrome.runtime.sendMessage({
        type: 'AI_SYNTHESIZE_SUBSCRIPTION_RULES',
        channels: res.channels,
        modelChoice: currentAiModelChoice(),
        options: {
          samples: samples || [],
          liked: (data.tasteLikedChannels || []).slice(),
          disliked: (data.tasteDislikedChannels || []).slice(),
          existingProfile: data.aiSubscriptionProfile || '',
          tastePrompt: data.aiTastePrompt || ''
        }
      }, (aiRes) => {
        if (!aiRes || !aiRes.ok || !Array.isArray(aiRes.keywords)) {
          // MV3 service-worker message channels can drop a response once —
          // that delivers `undefined`, which used to print a fake "AI is busy".
          if (aiRes === undefined && synthAttempts < 2) {
            setTimeout(requestSynthesis, 800);
            return;
          }
          const detail = (aiRes && (aiRes.error || aiRes.reason))
            ? ` (${aiRes.error || aiRes.reason})`
            : ' — wait a second and try again. If you picked an AI model, make sure your local server allows this browser; or pick "Built-in Heuristic".';
          finishSubSynth(btn, 'Could not synthesize rules. ' + detail);
          releaseCreatedTab(false);
          return;
        }

      const added = injectRulesIntoBlacklist({ keywords: aiRes.keywords, regex: aiRes.regex });
      // Seed the Autonomous Guardian's persona with the inferred taste profile.
      data.aiSubscriptionProfile = `${aiRes.profile || 'Subscription Insights'} (${count} subs)`;
      // Persist the scanned identities — powers the Feed Diversity Meter and Shorts: Subscribed Only.
      data.subsSnapshot = res.channels;
      save();
      renderAll();
      triggerConfetti();

      const out = document.getElementById('aiSubResultBox');
      if (out) {
        out.style.display = 'block';
        out.className = 'ai-result-box';
        const styleLikes = Array.isArray(aiRes.styleLikes) ? aiRes.styleLikes : [];
        const styleDislikes = Array.isArray(aiRes.styleDislikes) ? aiRes.styleDislikes : [];
        const sampleNotes = typeof aiRes.sampleNotes === 'string' ? aiRes.sampleNotes.trim() : '';
        const sampled = Number(aiRes.sampled) || 0;
        out.innerHTML =
          `<div style="font-size:12px;font-weight:700;color:#4db6ff;margin-bottom:4px;">🔭 Taste Profile: ${escapeHtml(aiRes.profile || 'Subscription Insights')} — ${count} subscriptions analyzed</div>` +
          `<div style="font-size:11.5px;color:#e5e7eb;line-height:1.45;">${escapeHtml(aiRes.rationale || '')}</div>` +
          (styleLikes.length ? `<div style="font-size:11px;color:#4ade80;margin-top:6px;">✅ Style you keep: ${escapeHtml(styleLikes.join(', '))}</div>` : '') +
          (styleDislikes.length ? `<div style="font-size:11px;color:#f87171;margin-top:3px;">❌ Style to avoid: ${escapeHtml(styleDislikes.join(', '))}</div>` : '') +
          (sampleNotes ? `<div style="font-size:10.5px;color:#9ca3af;margin-top:4px;font-style:italic;">${escapeHtml(sampleNotes)}</div>` : '') +
          `<div style="font-size:11.5px;color:#4ade80;margin-top:6px;">${aiRes.isFallback ? '⚡ Heuristic' : '🧠 AI'} synthesis — ${added} new precision rules injected${sampled ? ` (from ${sampled} sampled channels)` : ''}:</div>` +
          renderRuleChips(aiRes.keywords, aiRes.regex) +
          `<div style="margin-top:8px;"><button class="ai-action-btn" id="gotoKeywordsBtn" style="font-size:11px;padding:5px 10px;">📋 Show rules in Keywords tab</button></div>` +
          renderConflictRows(aiRes.conflicts) +
          renderProtectAction(res.channels);
        wireConflictRows(out, aiRes.conflicts);
        wireProtectAction(out, res.channels);
        const gkBtn = out.querySelector('#gotoKeywordsBtn');
        if (gkBtn) gkBtn.addEventListener('click', gotoKeywordsTab);
      }
      setStatus(`Synthesized ${added} rules from ${count} subscriptions!`);

      // Only close a tab we spawned ourselves; never touch the user's own tab.
      releaseCreatedTab(false);

      // Give the RULES_UPDATED broadcast time to land, then auto-measure feed diversity.
      setTimeout(() => { measureFeedDiversity(); }, 600);
      });
    };
    // Sample the channels' own pages for style evidence, then synthesize. The sampler
    // runs on the same tab we already opened, so it costs no extra navigation. It is
    // deliberately bounded (a handful of channels, a few titles each) and best-effort:
    // if it returns nothing, synthesis proceeds on the channel list alone.
    chrome.tabs.sendMessage(tabId, {
      type: 'SCRAPE_SUBSCRIPTION_SAMPLES',
      channels: res.channels,
      max: 12
    }, (sampleRes) => {
      const samples = (sampleRes && sampleRes.ok && Array.isArray(sampleRes.samples))
        ? sampleRes.samples
        : [];
      requestSynthesis(samples);
    });
  };

  const tryScrape = (tabId, attemptsLeft, onFailure) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_SUBSCRIPTIONS' }, (res) => {
        if (chrome.runtime?.lastError || !res || !res.ok) {
          if (attemptsLeft > 0) {
            setTimeout(() => tryScrape(tabId, attemptsLeft - 1, onFailure), 600);
          } else {
            onFailure();
          }
          return;
        }
        // A response with <3 channels usually means the SPA is still hydrating —
        // retry a couple of times before declaring the page empty.
        if (Array.isArray(res.channels) && res.channels.length < 3 && attemptsLeft > 0) {
          setTimeout(() => tryScrape(tabId, attemptsLeft - 1, onFailure), 800);
          return;
        }
        handleScrape(res, tabId);
      });
    } catch (_) {
      if (attemptsLeft > 0) {
        setTimeout(() => tryScrape(tabId, attemptsLeft - 1, onFailure), 600);
      } else {
        onFailure();
      }
    }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const waitForTabLoad = (tabId, timeoutMs) => new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      try {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime?.lastError || !tab) return resolve(false);
          if (tab && tab.status === 'complete') return resolve(true);
          if (Date.now() - started > timeoutMs) return resolve(false);
          setTimeout(tick, 400);
        });
      } catch (_) { resolve(false); }
    };
    tick();
  });

  const createSubscriptionsTab = async () => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id != null) prevActiveTabId = tabs[0].id;
      });
    } catch (_) {}
    try {
      // active: false is required, not cosmetic — activating the tab closes the
      // MV3 popup instantly, so the user never sees the progress or the result
      // and every tab-activation would leave the scan orphaned. The scrape runs
      // in the content script of the background tab (it reads the hydrated DOM
      // and retries while the SPA fills in), so it completes unobserved.
      chrome.tabs.create({ url: SUBSCRIPTIONS_URL, active: false }, async (tab) => {
        if (chrome.runtime?.lastError || !tab || tab.id == null) {
          finishSubSynth(btn, 'Could not open a YouTube tab. Check your browser permissions and try again.');
          releaseCreatedTab(false);
          return;
        }
        createdTabId = tab.id;
        const loaded = await waitForTabLoad(createdTabId, 25000);
        if (!loaded) {
          finishSubSynth(btn, 'The subscriptions page took too long to load. Close the extra tab and press Scan again.');
          releaseCreatedTab(false);
          return;
        }
        // Let the SPA hydrate its channel grid before scraping. The content
        // script re-collects from the DOM on every pass, and both the in-page
        // scraper and tryScrape below retry while the grid is still filling, so
        // a background tab that hydrates late is picked up rather than reported
        // as "no subscriptions".
        await sleep(1500);
        tryScrape(createdTabId, 8, () => {
          finishSubSynth(btn, 'Could not read the subscriptions list after the page loaded. Close the extra tab and press Scan again.');
          releaseCreatedTab(false);
        });
      });
    } catch (_) {
      finishSubSynth(btn, 'Could not open a YouTube tab. Try again in a moment.');
      releaseCreatedTab(false);
    }
  };

  getActiveYoutubeTab().then((tab) => {
    if (tab && isSubscriptionsUrl(tab.url)) {
      // Already viewing the subscriptions page — scrape in place, never navigate their tab.
      prevActiveTabId = tab.id;
      tryScrape(tab.id, 5, () => {
        finishSubSynth(btn, 'Could not reach the YouTube page. Reload the subscriptions tab and press Scan again.');
        releaseCreatedTab(false); // no temp tab to close — just clears the single-scan guard
      });
    } else {
      createSubscriptionsTab();
    }
  });
}

// Attach a click handler plus the Enter/Space activation that a role="button"
// element needs to behave like a real button (the persona chips and the
// "open YouTube" control in popup.html are spans, not <button>s).
function onActivate(el, handler) {
  if (!el) return;
  el.addEventListener('click', handler);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      handler(e);
    }
  });
}

async function init() {
  await load();

  // Never hardcode the version in the HTML: it has gone stale on every release
  // in this repo's history. manifest.json is the single source of truth, so read
  // it at runtime and the footer can never disagree with the shipped build again.
  const versionEl = document.getElementById('versionText');
  if (versionEl) {
    try { versionEl.textContent = 'v' + chrome.runtime.getManifest().version; } catch (_) {}
  }

  // Reflect the master switch on the FIRST paint: the paused banner must be there
  // immediately, not only once initToggles() has run further down.
  applyMasterUi();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  // Search filtering
  const cSearch = document.getElementById('channelSearch');
  if (cSearch) {
    cSearch.addEventListener('input', () => {
      channelFilter = cSearch.value.trim();
      renderAll();
    });
  }

  const kSearch = document.getElementById('keywordSearch');
  if (kSearch) {
    kSearch.addEventListener('input', () => {
      keywordFilter = kSearch.value.trim();
      renderAll();
    });
  }

  // Add channels with bulk support
  wireAdd('channelInput', 'addChannelBtn', (val) => {
    const items = parseBulkInput(val);
    items.forEach(it => {
      if (!data.channels.includes(it)) data.channels.push(it);
    });
  });

  // Add keywords
  wireAdd('keywordInput', 'addKeywordBtn', (val) => {
    const clean = val.trim().toLowerCase();
    if (!data.keywords.includes(clean)) data.keywords.push(clean);
  });

  // Add whitelist
  wireAdd('whitelistInput', 'addWhitelistBtn', (val) => {
    const items = parseBulkInput(val);
    items.forEach(it => {
      if (!data.whitelistChannels.includes(it)) data.whitelistChannels.push(it);
    });
  });

  // Export / Import — open the dedicated Backup & Restore page (backup.html).
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) exportBtn.addEventListener('click', () => openBackupPage('export'));

  const importBtn = document.getElementById('importBtn');
  if (importBtn) importBtn.addEventListener('click', () => openBackupPage('import'));

  // Open YouTube link
  const openYt = document.getElementById('openYoutube');
  if (openYt) {
    openYt.addEventListener('click', () => {
      try { chrome.tabs.create({ url: 'https://www.youtube.com/' }).catch(() => {}); } catch (_) {}
    });
    openYt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        try { chrome.tabs.create({ url: 'https://www.youtube.com/' }).catch(() => {}); } catch (_) {}
      }
    });
  }

  // Ko-fi support links
  const openKofi = () => {
    try { chrome.tabs.create({ url: 'https://ko-fi.com/pyrategfxproductions' }).catch(() => {}); } catch (_) {}
  };
  const kofiFooterBtn = document.getElementById('kofiFooterBtn');
  if (kofiFooterBtn) kofiFooterBtn.addEventListener('click', openKofi);

  const kofiSettingsBtn = document.getElementById('kofiSettingsBtn');
  if (kofiSettingsBtn) kofiSettingsBtn.addEventListener('click', openKofi);

  // Wisdom ticker
  const wisdomEl = document.getElementById('wisdomText');
  const wisdomBar = document.getElementById('wisdomBar');
  if (wisdomEl && wisdomBar) {
    wisdomEl.textContent = ALGORITHM_WISDOM[currentWisdomIndex];
    wisdomBar.addEventListener('click', () => {
      currentWisdomIndex = (currentWisdomIndex + 1) % ALGORITHM_WISDOM.length;
      wisdomEl.style.opacity = '0';
      setTimeout(() => {
        wisdomEl.textContent = ALGORITHM_WISDOM[currentWisdomIndex];
        wisdomEl.style.opacity = '1';
      }, 150);
    });
  }

  // Rank celebration
  const rankPill = document.getElementById('rankPill');
  if (rankPill) {
    rankPill.addEventListener('click', () => {
      triggerConfetti();
      setStatus('🎉 Feed Defender milestone!');
    });
  }

  // Starter Packs
  document.querySelectorAll('.pack-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const packKey = btn.dataset.pack;
      const pack = STARTER_PACKS[packKey];
      if (!pack || !pack.length) return;

      const words = pack.map(p => p.kw);
      const allIncluded = words.every(w => data.keywords.includes(w));
      if (allIncluded) {
        // Remove pack
        data.keywords = data.keywords.filter(k => !words.includes(k));
        setStatus(`Removed ${words.length} rules.`);
      } else {
        // Add pack
        let addedCount = 0;
        words.forEach(w => {
          if (!data.keywords.includes(w)) {
            data.keywords.push(w);
            addedCount++;
          }
        });
        triggerConfetti();
        setStatus(`Added ${addedCount} rules from pack!`);
      }
      save();
      renderAll();
    });
  });

  initToggles();
  initAiGuardian();
  initBundledAi();

  // Feed Forensic Diagnostic Roast
  const roastBtn = document.getElementById('aiRoastBtn');
  if (roastBtn) {
    roastBtn.addEventListener('click', () => {
      runFeedRoast();
    });
  }

  renderAll();
  initKeywordFeatures();
  initAdvancedFeatures();
}

const PERSONA_PRESETS = {
  scholar: "Deep educational lectures, computer science, astrophysics, and thoughtful long-form video essays. Ruthlessly banish screeching reaction faces, manufactured outrage, celebrity gossip, and skibidi hype.",
  engineer: "Low-level systems programming, electronics engineering, retro hardware repair, microcontrollers, and architecture deep dives. Strictly eliminate dropshipping, crypto wealth advice, get-rich-quick schemes, and AI slop.",
  antislop: "High-signal documentary, peaceful nature explorations, craftsmanship, and acoustic music. Completely purge all shorts, brainrot memes, screaming thumbnails, prank videos, and clickbait countdowns.",
  creative: "Cinematography, color grading, blender 3d VFX, indie film breakdowns, and musical composition. Banish low-effort AI generated content, faceless compilation channels, and reaction re-uploads."
};

function initAiGuardian() {
  const statusPill = document.getElementById('aiStatusPill');
  const modelSelect = document.getElementById('aiModelSelect');
  const detailEl = document.getElementById('aiStatusDetail');
  const tasteInput = document.getElementById('aiTastePrompt');
  const synthBtn = document.getElementById('aiSynthesizeBtn');
  const resultBox = document.getElementById('aiResultBox');
  const autoToggle = document.getElementById('toggleAiAutonomous');
  const sensSelect = document.getElementById('aiSensitivitySelect');

  if (tasteInput && data.aiTastePrompt) {
    tasteInput.value = data.aiTastePrompt;
  }
  const likedInput = document.getElementById('tasteLikedInput');
  if (likedInput && Array.isArray(data.tasteLikedChannels) && data.tasteLikedChannels.length) {
    likedInput.value = data.tasteLikedChannels.join(', ');
  }
  const dislikedInput = document.getElementById('tasteDislikedInput');
  if (dislikedInput && Array.isArray(data.tasteDislikedChannels) && data.tasteDislikedChannels.length) {
    dislikedInput.value = data.tasteDislikedChannels.join(', ');
  }
  if (autoToggle) {
    autoToggle.checked = Boolean(data.aiAutonomous);
    autoToggle.onchange = () => { data.aiAutonomous = autoToggle.checked; save(); };
  }
  if (sensSelect) {
    sensSelect.value = data.aiSensitivity || 'balanced';
    sensSelect.onchange = () => { data.aiSensitivity = sensSelect.value; save(); };
  }

  // Check AI connection. Use promise form + explicit lastError consumer so a
  // rejected sendMessage (e.g. service worker not ready) never becomes an unhandled
  // rejection that bubbles into the popup.
  chrome.runtime.sendMessage({ type: 'CHECK_AI_STATUS' })
    .then((res) => {
    // Only the two loopback engines the extension actually speaks to.
    const providerName = res && res.provider === 'ollama' ? 'Ollama'
      : res && res.provider === 'lmstudio' ? 'LM Studio' : '';

    if (res && res.ok && Array.isArray(res.models) && res.models.length) {
      if (statusPill) {
        statusPill.className = 'ai-status-pill';
        statusPill.textContent = `🟢 ${providerName} Online`;
      }
      if (detailEl) {
        const active = (data.aiModel || '').trim();
        detailEl.textContent = `${providerName} connected — ${res.models.length} model${res.models.length === 1 ? '' : 's'} ready${active ? ` · active: ${active}` : ''}. 100% offline, zero telemetry.`;
      }
      if (modelSelect) {
        modelSelect.innerHTML = '';
        res.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          const current = canonicalKeyword(data.aiModel);
          const candidate = canonicalKeyword(m);
          if (current && (candidate === current || candidate.startsWith(current + ':') || current.startsWith(candidate + ':'))) {
            opt.selected = true;
          }
          modelSelect.appendChild(opt);
        });
        // Load populates the UI from storage; it must not write back. Saving here
        // clobbered a stored model (e.g. "heuristic") with whatever the browser
        // happened to auto-select, and re-broadcast RULES_UPDATED on every popup
        // open for a dropdown the user never touched.
        modelSelect.addEventListener('change', () => {
          data.aiModel = modelSelect.value;
          save();
        });
      }
    } else {
      if (statusPill) {
        statusPill.className = 'ai-status-pill offline';
        statusPill.textContent = '🟡 Offline Heuristic Mode';
        statusPill.title = 'Local LLM not detected. Running built-in heuristic neural fallback.';
      }
      if (detailEl) detailEl.textContent = 'No local LLM detected — running the built-in heuristic engine. Fully offline, nothing leaves this machine.';
      if (modelSelect) {
        modelSelect.innerHTML = '<option value="heuristic">Built-in Heuristic</option>';
      }
    }
  })
    .catch(() => {
      if (statusPill) { statusPill.className = 'ai-status-pill offline'; statusPill.textContent = '⚠️ AI engine unreachable'; }
      if (detailEl) detailEl.textContent = 'Could not reach the background worker. Click the icon again to retry — if it persists, reload the extension.';
    });

  // Preset chips (role="button" spans — keyboard activation included)
  document.querySelectorAll('.ai-chip').forEach(chip => {
    onActivate(chip, () => {
      const personaKey = chip.dataset.persona;
      const text = PERSONA_PRESETS[personaKey];
      if (text && tasteInput) {
        tasteInput.value = text;
        data.aiTastePrompt = text;
        save();
      }
    });
  });

  if (tasteInput) {
    tasteInput.addEventListener('input', () => {
      data.aiTastePrompt = tasteInput.value;
      save();
    });
  }

  // Synthesize button
  if (synthBtn) {
    synthBtn.addEventListener('click', () => {
      const prompt = tasteInput ? tasteInput.value.trim() : '';
      if (!prompt) {
        alert('Please enter a taste prompt or pick a preset chip first.');
        return;
      }

      synthBtn.disabled = true;
      synthBtn.innerHTML = '<span>⚡ Reading mind & synthesizing...</span>';
      if (resultBox) resultBox.style.display = 'none';

      const chosenModel = currentAiModelChoice();
      if (chosenModel) {
        data.aiModel = chosenModel;
        save();
      }

      chrome.runtime.sendMessage({
        type: 'AI_SYNTHESIZE_RULES',
        prompt,
        modelChoice: chosenModel
      }, (res) => {
        synthBtn.disabled = false;
        synthBtn.innerHTML = '<span>🔮 Synthesize Rules from My Mind</span>';

        // Unread lastError: the "no response" case used to reach the generic
        // prompt error below, telling the user to fix a prompt that was fine.
        if (chrome.runtime?.lastError) {
          alert('The background AI worker did not respond. Reload the extension, then try again.');
          return;
        }

        if (res && res.ok && Array.isArray(res.keywords)) {
          const added = injectRulesIntoBlacklist({ keywords: res.keywords, regex: res.regex });

          save();
          renderAll();
          triggerConfetti();

          if (resultBox) {
            resultBox.style.display = 'block';
            const modelLabel = res.isFallback ? '⚡ Heuristic' : `🧠 AI (${escapeHtml(res.modelUsed || chosenModel)})`;
            resultBox.innerHTML =
              `<div style="font-size:12px;font-weight:700;color:#c084fc;margin-bottom:4px;">${modelLabel} Rationale:</div>` +
              `<div style="font-size:11.5px;color:#e2e8f0;line-height:1.45;margin-bottom:6px;">${escapeHtml(res.rationale || '')}</div>` +
              `<div style="font-size:11.5px;color:#4ade80;font-weight:600;margin-bottom:4px;">✅ Synthesized & injected ${added} new precision rules:</div>` +
              renderRuleChips(res.keywords, res.regex) +
              `<div style="margin-top:8px;"><button class="ai-action-btn" id="gotoKeywordsBtn" style="font-size:11px;padding:5px 10px;">📋 Show rules in Keywords tab</button></div>`;
            const gkBtn = resultBox.querySelector('#gotoKeywordsBtn');
            if (gkBtn) gkBtn.addEventListener('click', gotoKeywordsTab);
          }
          setStatus(`Injected ${added} rules from AI!`);
        } else {
          alert('Could not synthesize rules. Please check your prompt.');
        }
      });
    });
  }

  // Subscription Synthesizer button
  const subSynthBtn = document.getElementById('aiSubSynthBtn');
  if (subSynthBtn) {
    subSynthBtn.addEventListener('click', runSubscriptionSynthesize);
  }

  // Feed Diversity Meter button
  const feedDiversityBtn = document.getElementById('feedDiversityBtn');
  if (feedDiversityBtn) {
    feedDiversityBtn.addEventListener('click', measureFeedDiversity);
  }

  renderAiLog();

  // The Autonomous Guardian appends to aiLog from the content script / worker
  // while the popup is open, so the log rendered once above was frozen for the
  // life of the popup. Re-render on the storage event that other contexts write.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes || !changes.aiLog) return;
      data.aiLog = Array.isArray(changes.aiLog.newValue) ? changes.aiLog.newValue : [];
      renderAiLog();
    });
  } catch (_) {}

  // "Clear Blocks": the ONLY way to drop Guardian verdicts that are already stored.
  // A stored block is a first-class rule in the card evaluator, so verdicts the user
  // no longer wants (the reported over-blocking) would otherwise keep hiding those
  // videos forever, with no UI able to remove them. Clears both `nyt_aiDecisions`
  // and the log, then tells open tabs to re-read so the un-hide happens at once.
  const clearAiBtn = document.getElementById('clearAiDecisionsBtn');
  if (clearAiBtn) {
    clearAiBtn.addEventListener('click', async () => {
      if (!confirm('Clear ALL stored Guardian decisions?\n\nThis removes every autonomous block AND every "allowed" undo, and un-hides those videos. Your keyword/channel rules are untouched.')) return;
      try {
        // Must not leave `undefined` in a storage payload — a key set to undefined is
        // dropped, which would make the clear a silent no-op for that key.
        await chrome.storage.local.set({ nyt_aiDecisions: [], aiLog: [] });
        data.aiLog = [];
        renderAiLog();
        setStatus('Guardian decisions cleared — those videos are no longer hidden.');
        try {
          const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
          await Promise.allSettled((tabs || [])
            .filter((t) => t && t.id != null)
            .map((t) => chrome.tabs.sendMessage(t.id, { type: 'RULES_UPDATED' }).catch(() => {})));
        } catch (_) {}
      } catch (_) {
        setStatus('Could not clear Guardian decisions.');
      }
    });
  }
}

function renderAiLog() {
  const listEl = document.getElementById('aiInterceptLog');
  if (!listEl) return;
  listEl.innerHTML = '';

  const logs = Array.isArray(data.aiLog) ? data.aiLog : [];
  if (!logs.length) {
    listEl.innerHTML = '<div class="empty-state" style="padding: 14px;">No autonomous blocks yet. Enable Autonomous Guardian to see live intercepts.</div>';
    return;
  }

  logs.slice(0, 15).forEach(item => {
    const row = document.createElement('div');
    row.className = 'ai-log-item';

    const title = document.createElement('span');
    title.className = 'ai-log-title';
    title.textContent = item.title || 'Unknown Title';
    title.title = item.title || '';

    const reason = document.createElement('span');
    reason.className = 'ai-log-reason';
    reason.textContent = `🤖 ${item.rationale || 'Flagged by taste persona'}`;

    row.appendChild(title);
    row.appendChild(reason);
    listEl.appendChild(row);
  });
}

// ===== KEYWORD RULE TESTER =====
async function runKeywordTest() {
  const input = document.getElementById('keywordTestInput');
  const resultsEl = document.getElementById('keywordTestResults');
  if (!input || !resultsEl) return;

  const titles = input.value.split('\n').map(t => t.trim()).filter(t => t.length > 0);
  if (!titles.length) {
    resultsEl.innerHTML = '<span style="color: var(--muted);">No titles to test.</span>';
    return;
  }

  resultsEl.innerHTML = '<span style="color: var(--muted);">Testing...</span>';

  // Use the same matching logic as content.js
  function testKeyword(text, keyword) {
    if (!text || !keyword) return false;
    if (keyword.startsWith('/') && keyword.lastIndexOf('/') > 0) {
      const lastSlash = keyword.lastIndexOf('/');
      const pattern = keyword.slice(1, lastSlash);
      const flags = keyword.slice(lastSlash + 1) || 'i';
      if (pattern.length <= 200) {
        try { return new RegExp(pattern, flags).test(text); } catch (_) {}
      }
    }
    try {
      const cleanKw = keyword.toLowerCase().replace(/[^\w\s]/g, '');
      const cleanT = text.toLowerCase().replace(/[^\w\s]/g, '');
      if (cleanKw.length > 200) return cleanT.includes(cleanKw);
      const first = cleanKw[0], last = cleanKw[cleanKw.length - 1];
      const fB = /[a-z0-9_]/.test(first);
      const lB = /[a-z0-9_]/.test(last);
      const start = fB ? '\\b' : '';
      const end = lB ? '\\b' : '';
      return new RegExp(`${start}${cleanKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${end}`, 'i').test(cleanT);
    } catch (_) {
      return text.toLowerCase().includes(keyword.toLowerCase());
    }
  }

  const keywords = data.keywords || [];
  let html = '';
  titles.forEach(title => {
    const matches = keywords.filter(kw => testKeyword(title, kw));
    const safeTitle = escapeHtml(title);
    const safeMatches = matches.map(m => `<code>${escapeHtml(m)}</code>`).join(', ');
    html += `<div style="margin-bottom: 6px; padding: 6px; background: ${matches.length ? 'rgba(255,0,51,0.1)' : 'transparent'}; border-radius: 4px; border-left: 3px solid ${matches.length ? 'var(--accent)' : 'var(--border)'};">
      <div style="font-weight: 600; color: ${matches.length ? 'var(--accent)' : 'var(--text)'};">${safeTitle}</div>`;
    if (matches.length) {
      html += `<div style="font-size: 10px; color: var(--muted); margin-top: 2px;">Matches: ${safeMatches}</div>`;
    }
    html += '</div>';
  });
  resultsEl.innerHTML = html;
}

async function fetchVisibleTitles() {
  const input = document.getElementById('keywordTestInput');
  if (!input) return;

  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*', active: true });
    if (!tabs.length) {
      input.value = 'No active YouTube tab found.';
      return;
    }
    const tab = tabs[0];
    if (!chrome?.scripting?.executeScript) {
      input.value = 'Scripting API unavailable; please check extension permissions.';
      return;
    }
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const cards = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer');
        const titles = [];
        cards.forEach(card => {
          const titleEl = card.querySelector('#video-title, h3 a, a#video-title-link');
          if (titleEl) {
            const t = titleEl.textContent?.trim() || titleEl.getAttribute('title') || '';
            if (t && t.length > 5) titles.push(t);
          }
        });
        return [...new Set(titles)].slice(0, 20);
      }
    });
    if (result && result[0] && result[0].result && result[0].result.length) {
      input.value = result[0].result.join('\n');
    } else {
      input.value = 'No titles found on current page.';
    }
  } catch (e) {
    input.value = 'Error fetching: ' + e.message;
  }
}

// ===== HIT COUNTER UI =====
async function loadHitCounters() {
  const listEl = document.getElementById('hitCounterList');
  if (!listEl) return;
  listEl.innerHTML = '<span style="color: var(--muted);">Loading...</span>';

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_KEYWORD_HITS' }, (res) => {
      if (chrome.runtime?.lastError || !res?.ok) {
        listEl.innerHTML = '<span style="color: var(--danger);">Failed to load hit counters.</span>';
        resolve();
        return;
      }
      const hits = res.hits || {};
      const keywords = data.keywords || [];

      // Combine: all keywords with their hit counts (0 if never matched)
      const combined = keywords.map(kw => ({
        kw,
        hits: hits[kw.toLowerCase()] || 0
      })).sort((a, b) => a.hits - b.hits); // 0-hit rules first

      if (!combined.length) {
        listEl.innerHTML = '<span style="color: var(--muted);">No keyword rules to show.</span>';
        resolve();
        return;
      }

      let html = '';
      combined.forEach(({ kw, hits: h }) => {
        const isZero = h === 0;
        const safeKw = escapeHtml(kw);
        html += `<div class="hit-counter-row" data-kw="${safeKw}" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin: 2px 0; background: ${isZero ? 'rgba(255,0,51,0.05)' : 'transparent'}; border-radius: 4px; border: 1px solid ${isZero ? 'rgba(255,0,51,0.2)' : 'var(--border)'};">
          <code style="font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${safeKw}</code>
          <span style="font-weight: ${isZero ? '700' : '400'}; color: ${isZero ? 'var(--danger)' : 'var(--muted)'}; margin-left: 8px; min-width: 40px; text-align: right;">${h} hit${h !== 1 ? 's' : ''}</span>
          ${isZero ? '<span class="reset-hit-btn" title="Reset counter" style="cursor: pointer; margin-left: 8px; color: var(--muted); font-size: 12px;">↺</span>' : ''}
        </div>`;
      });
      listEl.innerHTML = html;

      // Add click handlers for reset buttons
      listEl.querySelectorAll('.reset-hit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const row = e.target.closest('.hit-counter-row');
          if (row) resetSingleHitCounter(row.dataset.kw);
        });
      });

      // Click on row to reset (for zero-hit rules)
      listEl.querySelectorAll('.hit-counter-row[data-kw]').forEach(row => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          const kw = row.dataset.kw;
          const h = hits[kw.toLowerCase()] || 0;
          if (h === 0) resetSingleHitCounter(kw);
        });
      });

      resolve();
    });
  });
}

async function resetSingleHitCounter(kw) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'RESET_KEYWORD_HITS', keyword: kw }, (res) => {
      if (res?.ok) loadHitCounters().then(resolve);
      else resolve();
    });
  });
}

async function resetAllHitCounters() {
  if (!confirm('Reset ALL keyword hit counters to zero?')) return;
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'RESET_KEYWORD_HITS', keyword: '' }, (res) => {
      if (res?.ok) loadHitCounters().then(resolve);
      else resolve();
    });
  });
}

async function cleanupZeroHitRules() {
  const hits = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_KEYWORD_HITS' }, (res) => {
      resolve(res?.ok ? (res.hits || {}) : {});
    });
  });

  const zeroHitKeywords = (data.keywords || []).filter(kw => !(hits[kw.toLowerCase()] > 0));
  if (!zeroHitKeywords.length) {
    setStatus('No zero-hit rules to remove.');
    return;
  }

  if (!confirm(`Remove ${zeroHitKeywords.length} keyword rule${zeroHitKeywords.length !== 1 ? 's' : ''} with 0 hits?`)) return;

  data.keywords = (data.keywords || []).filter(kw => hits[kw.toLowerCase()] > 0);
  await save();
  renderAll();
  await loadHitCounters();
  setStatus(`Removed ${zeroHitKeywords.length} zero-hit rule${zeroHitKeywords.length !== 1 ? 's' : ''}.`);
}

// ===== Bundled In-Browser AI Provider =====
// No Ollama, no LM Studio, no other app — runs entirely in the browser.
function initBundledAi() {
  const listEl = document.getElementById('bundledAiModelList');
  const progressEl = document.getElementById('bundledAiProgress');
  const progressBar = document.getElementById('bundledAiProgressBar');
  const progressLabel = document.getElementById('bundledAiProgressLabel');

  if (!listEl) return;

  // Fetch the model catalog from the background worker
  chrome.runtime.sendMessage({ type: 'BUNDLED_AI_GET_MODELS' }, (res) => {
    if (chrome.runtime?.lastError || !res || !res.ok || !Array.isArray(res.models)) {
      listEl.innerHTML = '<div style="font-size:11px;color:var(--muted);">Could not load model catalog.</div>';
      return;
    }

    listEl.innerHTML = '';
    res.models.forEach(model => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;background:#1f2937;border-radius:6px;border:1px solid #374151;';

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      info.innerHTML = `
        <div style="font-size:12px;font-weight:600;color:#e5e7eb;">${escapeHtml(model.label)}</div>
        <div style="font-size:10px;color:var(--muted);">${escapeHtml(model.size)} · ${escapeHtml(model.desc)}</div>
      `;

      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.style.cssText = 'padding:4px 10px;font-size:11px;white-space:nowrap;';
      btn.dataset.modelKey = model.key;

      // Check download status
      chrome.runtime.sendMessage({ type: 'BUNDLED_AI_GET_MODEL_STATUS', modelKey: model.key }, (statusRes) => {
        if (statusRes && statusRes.downloaded) {
          btn.textContent = '✓ Ready';
          btn.style.background = '#065f46';
          btn.style.color = '#d1fae5';
          btn.disabled = true;
        } else if (statusRes && statusRes.downloading) {
          btn.textContent = '⏳ Downloading…';
          btn.disabled = true;
        } else {
          btn.textContent = 'Download';
          btn.addEventListener('click', () => {
            btn.disabled = true;
            btn.textContent = '⏳ Downloading…';
            if (progressEl) progressEl.style.display = 'block';
            if (progressBar) progressBar.style.width = '0%';
            if (progressLabel) progressLabel.textContent = `Downloading ${model.label}…`;

            chrome.runtime.sendMessage({ type: 'BUNDLED_AI_DOWNLOAD_MODEL', modelKey: model.key }, (dlRes) => {
              if (progressEl) progressEl.style.display = 'none';
              if (dlRes && dlRes.ok) {
                btn.textContent = '✓ Ready';
                btn.style.background = '#065f46';
                btn.style.color = '#d1fae5';
                btn.disabled = true;
              } else {
                btn.textContent = 'Download';
                btn.disabled = false;
                const errMsg = dlRes && dlRes.error ? dlRes.error : 'Unknown error';
                if (progressLabel) progressLabel.textContent = `Download failed: ${errMsg}`;
              }
            });
          });
        }
      });

      row.appendChild(info);
      row.appendChild(btn);
      listEl.appendChild(row);
    });
  });

  // Listen for progress updates from the background worker
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'BUNDLED_AI_PROGRESS' && msg.modelKey) {
      if (progressEl) progressEl.style.display = 'block';
      if (progressBar) progressBar.style.width = (msg.progress || 0) + '%';
      if (progressLabel) {
        const statusText = msg.status === 'progress' ? 'Downloading…' :
          msg.status === 'done' ? 'Complete!' : msg.status || 'Working…';
        progressLabel.textContent = `${statusText} ${msg.progress || 0}%`;
      }
    }
  });
}

// Initialize new features after renderAll
function initKeywordFeatures() {
  const runTestBtn = document.getElementById('runKeywordTest');
  const fetchBtn = document.getElementById('fetchVisibleTitles');
  const refreshHitsBtn = document.getElementById('refreshHitCounters');
  const cleanupBtn = document.getElementById('cleanupZeroHitRules');
  const resetAllBtn = document.getElementById('resetAllHitCounters');

  if (runTestBtn) runTestBtn.addEventListener('click', runKeywordTest);
  if (fetchBtn) fetchBtn.addEventListener('click', fetchVisibleTitles);
  if (refreshHitsBtn) refreshHitsBtn.addEventListener('click', loadHitCounters);
  if (cleanupBtn) cleanupBtn.addEventListener('click', cleanupZeroHitRules);
  if (resetAllBtn) resetAllBtn.addEventListener('click', resetAllHitCounters);

  // Load hit counters on Keywords tab activation (guard MutationObserver for test env)
  const keywordsTab = document.getElementById('keywordsTab');
  if (keywordsTab && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (keywordsTab.classList.contains('active')) {
        loadHitCounters();
        observer.disconnect();
      }
    });
    observer.observe(keywordsTab, { attributes: true, attributeFilter: ['class'] });
  }
}

// ===== PER-CHANNEL KEYWORD EXCEPTIONS =====
function renderKeywordExceptions() {
  const listEl = document.getElementById('keywordExceptionsList');
  if (!listEl) return;
  const exc = data.keywordExceptions || {};
  if (!Object.keys(exc).length) {
    listEl.innerHTML = '<span style="color: var(--muted);">No exceptions yet.</span>';
    return;
  }
  let html = '';
  for (const [keyword, channels] of Object.entries(exc)) {
    const safeKw = escapeHtml(keyword);
    const safeChannels = Array.isArray(channels) ? channels.map(c => escapeHtml(c)).join(', ') : '';
    html += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin: 2px 0; background: var(--card); border: 1px solid var(--border); border-radius: 4px;">
      <code style="font-size: 11px;">${safeKw}</code>
      <span style="font-size: 10px; color: var(--muted); margin: 0 8px;">→</span>
      <span style="font-size: 11px; flex: 1; text-align: right;">${safeChannels}</span>
      <button class="remove-exception" data-kw="${safeKw}" style="margin-left: 8px; background: none; border: none; color: var(--danger); cursor: pointer; font-size: 14px;">✕</button>
    </div>`;
  }
  listEl.innerHTML = html;
  listEl.querySelectorAll('.remove-exception').forEach(btn => {
    btn.addEventListener('click', () => {
      delete data.keywordExceptions[btn.dataset.kw];
      save();
      renderKeywordExceptions();
      setStatus('Exception removed.');
    });
  });
}

function addKeywordException() {
  const kwInput = document.getElementById('exceptionKeyword');
  const chInput = document.getElementById('exceptionChannel');
  if (!kwInput || !chInput) return;
  const kw = kwInput.value.trim().toLowerCase();
  const ch = chInput.value.trim().toLowerCase();
  if (!kw || !ch) { setStatus('Enter both keyword and channel.'); return; }
  if (!data.keywordExceptions[kw]) data.keywordExceptions[kw] = [];
  if (!data.keywordExceptions[kw].includes(ch)) {
    data.keywordExceptions[kw].push(ch);
  }
  kwInput.value = '';
  chInput.value = '';
  save();
  renderKeywordExceptions();
  setStatus(`Exception added: "${kw}" → ${ch}`);
}

// ===== COMMUNITY BLOCKLIST SUBSCRIPTION =====
async function renderCommunityPacks() {
  const listEl = document.getElementById('communityPacksList');
  if (!listEl) return;
  const packs = data.communityPacks || [];
  if (!packs.length) {
    listEl.innerHTML = '<span style="color: var(--muted);">No community packs subscribed.</span>';
    return;
  }
  let html = '';
  for (let i = 0; i < packs.length; i++) {
    const p = packs[i];
    const safeName = escapeHtml(p.name || 'Unnamed Pack');
    const safeUrl = escapeHtml(p.url || '');
    const last = p.lastFetched ? new Date(p.lastFetched).toLocaleDateString() : 'never';
    const kwCount = p.rules?.keywords?.length || 0;
    const chCount = p.rules?.channels?.length || 0;
    html += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin: 4px 0; background: var(--card); border: 1px solid var(--border); border-radius: 4px;">
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 12px;">${safeName}</div>
        <div style="font-size: 10px; color: var(--muted);">${safeUrl}</div>
        <div style="font-size: 10px; color: var(--muted);">Rules: ${kwCount} kw, ${chCount} ch | Last fetched: ${last} | ${p.enabled ? 'Enabled' : 'Disabled'}</div>
      </div>
      <div style="display: flex; gap: 4px;">
        <button class="toggle-pack" data-i="${i}" style="padding: 2px 8px; font-size: 10px; background: ${p.enabled ? 'var(--accent)' : 'var(--muted)'}; color: white; border: none; border-radius: 3px; cursor: pointer;">${p.enabled ? 'Disable' : 'Enable'}</button>
        <button class="fetch-pack" data-i="${i}" style="padding: 2px 8px; font-size: 10px; background: var(--accent); color: white; border: none; border-radius: 3px; cursor: pointer;">Fetch Now</button>
        <button class="remove-pack" data-i="${i}" style="padding: 2px 8px; font-size: 10px; background: var(--danger); color: white; border: none; border-radius: 3px; cursor: pointer;">Remove</button>
      </div>
    </div>`;
  }
  listEl.innerHTML = html;
  listEl.querySelectorAll('.toggle-pack').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.i);
      const pack = data.communityPacks[i];
      if (!pack) return;
      pack.enabled = !pack.enabled;
      if (!pack.enabled) {
        unmergeCommunityPack(pack);
      } else {
        mergeCommunityPacks();
      }
      save();
      renderAll();
      renderCommunityPacks();
    });
  });
  listEl.querySelectorAll('.fetch-pack').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.i);
      await fetchCommunityPack(i);
      mergeCommunityPacks();
      save();
      renderAll();
      renderCommunityPacks();
    });
  });
  listEl.querySelectorAll('.remove-pack').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.i);
      const [removed] = data.communityPacks.splice(i, 1);
      if (removed) unmergeCommunityPack(removed);
      save();
      renderAll();
      renderCommunityPacks();
      setStatus('Community pack removed.');
    });
  });
}

// Community pack URLs are FETCHED, so the field is a network capability the user pastes
// into. Two rules, enforced at add time AND at fetch time (a stored pack may predate this
// check, or a backup may have been hand-edited):
//   1. https only — a pack list must not be fetched over plaintext.
//   2. an allowlisted host. Without it the extension will fetch ANY address the field is
//      given, including `http://127.0.0.1:PORT/...` — a port scan / request-forgery probe
//      driven from the extension's own privileged context. Packs are public rule lists,
//      so restricting them to the code-hosting hosts that serve them costs nothing.
const PACK_URL_HOSTS = new Set([
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'githubusercontent.com',
  'objects.githubusercontent.com',
  'github.com',
  'codeload.github.com'
]);

function isAllowedPackUrl(raw) {
  let parsed;
  try {
    parsed = new URL(String(raw || '').trim());
  } catch (_) {
    return { ok: false, why: 'Invalid URL.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, why: 'Pack URL must be https:// (plaintext http is not allowed).' };
  }
  const host = String(parsed.hostname || '').toLowerCase();
  if (!PACK_URL_HOSTS.has(host)) {
    return { ok: false, why: `Pack URL host not allowed: ${host}. Use a public rule list on GitHub (raw.githubusercontent.com or gist.githubusercontent.com).` };
  }
  return { ok: true, why: '' };
}

async function addCommunityPack() {
  const urlInput = document.getElementById('communityPackUrl');
  const nameInput = document.getElementById('communityPackName');
  if (!urlInput || !nameInput) return;
  const url = urlInput.value.trim();
  const name = nameInput.value.trim() || 'Community Pack';
  if (!url) { setStatus('Enter a URL.'); return; }
  const verdict = isAllowedPackUrl(url);
  if (!verdict.ok) { setStatus(verdict.why); return; }
  data.communityPacks.push({ url, name, enabled: true, lastFetched: null, rules: { keywords: [], channels: [] } });
  urlInput.value = '';
  nameInput.value = '';
  save();
  await fetchCommunityPack(data.communityPacks.length - 1);
  mergeCommunityPacks();
  renderAll();
  renderCommunityPacks();
  setStatus(`Community pack added: ${name}`);
}

async function fetchCommunityPack(index) {
  const pack = data.communityPacks[index];
  if (!pack) return;
  // Re-check on every fetch: this is the path the weekly auto-fetch also runs through,
  // and the pack may have been stored before the host allowlist existed.
  const verdict = isAllowedPackUrl(pack.url);
  if (!verdict.ok) {
    pack.enabled = false;
    setStatus(`Pack disabled — ${verdict.why}`);
    return;
  }
  try {
    const res = await fetch(pack.url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    pack.rules = {
      keywords: Array.isArray(json.keywords) ? json.keywords.filter(k => typeof k === 'string') : [],
      channels: Array.isArray(json.channels) ? json.channels.filter(c => typeof c === 'string') : []
    };
    pack.lastFetched = new Date().toISOString();
    await save();
    setStatus(`Fetched ${pack.name}: ${pack.rules.keywords.length} keywords, ${pack.rules.channels.length} channels`);
  } catch (e) {
    setStatus(`Fetch failed: ${e.message}`);
  }
}

// Auto-fetch community packs weekly (run on load)
async function autoFetchCommunityPacks() {
  const now = Date.now();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  for (let i = 0; i < (data.communityPacks || []).length; i++) {
    const p = data.communityPacks[i];
    if (!p.enabled) continue;
    const last = p.lastFetched ? new Date(p.lastFetched).getTime() : 0;
    if (now - last > WEEK_MS) {
      await fetchCommunityPack(i);
    }
  }
}

// Unmerge community pack rules cleanly when a pack is removed or disabled
function unmergeCommunityPack(pack) {
  if (!pack || !pack.rules) return;
  const otherPacks = (data.communityPacks || []).filter(p => p !== pack && p.enabled && p.rules);
  const otherKeywords = new Set();
  const otherChannels = new Set();
  otherPacks.forEach(p => {
    (p.rules.keywords || []).forEach(k => otherKeywords.add(k));
    (p.rules.channels || []).forEach(c => otherChannels.add(c));
  });

  if (Array.isArray(pack.rules.keywords)) {
    data.keywords = data.keywords.filter(k => !pack.rules.keywords.includes(k) || otherKeywords.has(k));
  }
  if (Array.isArray(pack.rules.channels)) {
    data.channels = data.channels.filter(c => !pack.rules.channels.includes(c) || otherChannels.has(c));
  }
}

// Merge community pack rules into active rules (run on load)
function mergeCommunityPacks() {
  for (const p of (data.communityPacks || [])) {
    if (!p.enabled || !p.rules) continue;
    if (Array.isArray(p.rules.keywords)) {
      for (const kw of p.rules.keywords) {
        if (!data.keywords.includes(kw)) data.keywords.push(kw);
      }
    }
    if (Array.isArray(p.rules.channels)) {
      for (const ch of p.rules.channels) {
        if (!data.channels.includes(ch)) data.channels.push(ch);
      }
    }
  }
}

// ===== TEMPORAL/SEASONAL RULES =====
function renderTemporalRules() {
  const listEl = document.getElementById('temporalRulesList');
  if (!listEl) return;
  const rules = data.temporalRules || [];
  if (!rules.length) {
    listEl.innerHTML = '<span style="color: var(--muted);">No temporal rules.</span>';
    return;
  }
  // Auto-expire check: end of day local time
  const now = new Date();
  let changed = false;
  for (let i = rules.length - 1; i >= 0; i--) {
    const expDate = new Date(rules[i].expires + 'T23:59:59');
    if (!isNaN(expDate.getTime()) && expDate <= now) {
      const kw = rules[i].keyword;
      const permBefore = Boolean(rules[i].permanentBefore);
      rules.splice(i, 1);
      const stillHasTemporal = rules.some(r => r.keyword === kw);
      if (!stillHasTemporal && !permBefore) {
        data.keywords = data.keywords.filter(k => k !== kw);
      }
      changed = true;
    }
  }
  if (changed) {
    save();
    renderAll();
  }

  let html = '';
  rules.forEach((r, i) => {
    const expDate = new Date(r.expires + 'T23:59:59');
    const exp = !isNaN(expDate.getTime()) ? expDate.toLocaleDateString() : r.expires;
    const daysLeft = !isNaN(expDate.getTime()) ? Math.ceil((expDate - now) / (1000 * 60 * 60 * 24)) : 0;
    const safeKw = escapeHtml(r.keyword);
    const safeReason = r.reason ? `<span style="font-size: 10px; color: var(--muted); margin-left: 8px;">(${escapeHtml(r.reason)})</span>` : '';
    html += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin: 2px 0; background: var(--card); border: 1px solid var(--border); border-radius: 4px;">
      <div style="flex: 1;">
        <code style="font-size: 11px;">${safeKw}</code>
        ${safeReason}
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 10px; color: ${daysLeft <= 3 ? 'var(--danger)' : 'var(--muted)'};">
          Expires ${escapeHtml(exp)} (${daysLeft}d left)
        </span>
        <button class="remove-temporal" data-i="${i}" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 14px;">✕</button>
      </div>
    </div>`;
  });
  listEl.innerHTML = html;
  listEl.querySelectorAll('.remove-temporal').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.i);
      const [removed] = data.temporalRules.splice(i, 1);
      if (removed && !removed.permanentBefore) {
        const stillHas = data.temporalRules.some(r => r.keyword === removed.keyword);
        if (!stillHas) {
          data.keywords = data.keywords.filter(k => k !== removed.keyword);
        }
      }
      save();
      renderAll();
      renderTemporalRules();
      setStatus('Temporal rule removed.');
    });
  });
}

function addTemporalRule() {
  const kwInput = document.getElementById('temporalKeyword');
  const expInput = document.getElementById('temporalExpires');
  const reasonInput = document.getElementById('temporalReason');
  if (!kwInput || !expInput) return;
  const kw = kwInput.value.trim();
  const expires = expInput.value;
  const reason = reasonInput.value.trim();
  if (!kw || !expires) { setStatus('Enter keyword and expiry date.'); return; }
  const normKw = kw.toLowerCase();
  const alreadyPermanent = data.keywords.includes(normKw);
  data.temporalRules.push({ keyword: normKw, expires, reason, permanentBefore: alreadyPermanent });
  if (!alreadyPermanent) data.keywords.push(normKw);
  kwInput.value = '';
  expInput.value = '';
  reasonInput.value = '';
  save();
  renderAll();
  renderTemporalRules();
  setStatus(`Temporal rule added: "${kw}" expires ${expires}`);
}

// ===== FEED HEALTH DASHBOARD =====
async function refreshFeedHealth() {
  const dashEl = document.getElementById('feedHealthDashboard');
  if (!dashEl) return;
  dashEl.innerHTML = '<span style="color: var(--muted);">Loading...</span>';

  // Get current feed stats from content script
  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*', active: true });
    if (!tabs.length) {
      dashEl.innerHTML = '<span style="color: var(--danger);">No active YouTube tab.</span>';
      return;
    }
    if (!chrome?.scripting?.executeScript) {
      dashEl.innerHTML = '<span style="color: var(--danger);">Scripting API unavailable.</span>';
      return;
    }
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        const cards = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer');
        let total = 0, hidden = 0, subbed = 0, hiddenByChannel = 0, hiddenByKeyword = 0, hiddenByAI = 0;
        cards.forEach(card => {
          total++;
          if (card.dataset.hiddenByLocalBlacklist === 'true') {
            hidden++;
            const reason = card.dataset.hiddenReason || '';
            if (reason.startsWith('channel:')) hiddenByChannel++;
            else if (reason.startsWith('keyword')) hiddenByKeyword++;
            else if (reason.startsWith('auto-dub') || reason.startsWith('AI')) hiddenByAI++;
          }
          // Check if subscribed (simplified - check for subscribed badge)
          const subBadge = card.querySelector('ytd-badge-supported-renderer[aria-label*="subscribed" i], yt-icon[aria-label*="subscribed" i]');
          if (subBadge) subbed++;
        });
        return { total, hidden, subbed, hiddenByChannel, hiddenByKeyword, hiddenByAI, purity: total > 0 ? Math.round((subbed / total) * 100) : 0 };
      }
    });
    if (result && result[0] && result[0].result) {
      const stats = result[0].result;
      const logEntry = {
        ts: Date.now(),
        hiddenByChannel: stats.hiddenByChannel,
        hiddenByKeyword: stats.hiddenByKeyword,
        hiddenByAI: stats.hiddenByAI,
        totalVisible: stats.total,
        purity: stats.purity
      };
      data.feedHealthLog.unshift(logEntry);
      if (data.feedHealthLog.length > 100) data.feedHealthLog.pop();
      await save();

      // Render dashboard
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const weekLogs = data.feedHealthLog.filter(l => l.ts > weekAgo);
      const avgPurity = weekLogs.length ? Math.round(weekLogs.reduce((a, b) => a + b.purity, 0) / weekLogs.length) : stats.purity;

      // Top matching rules from hit counters
      const hits = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_KEYWORD_HITS' }, res => resolve(res?.ok ? (res.hits || {}) : {}));
      });
      const topRules = Object.entries(hits)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([kw, h]) => `<code>${escapeHtml(kw)}</code>: ${h} hit${h !== 1 ? 's' : ''}`)
        .join(' • ');

      dashEl.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 12px;">
          <div style="padding: 8px; background: var(--card); border: 1px solid var(--border); border-radius: 6px;">
            <div style="font-size: 10px; color: var(--muted);">Total Cards</div>
            <div style="font-size: 18px; font-weight: 700;">${stats.total}</div>
          </div>
          <div style="padding: 8px; background: var(--card); border: 1px solid var(--border); border-radius: 6px;">
            <div style="font-size: 10px; color: var(--muted);">Hidden</div>
            <div style="font-size: 18px; font-weight: 700; color: var(--danger);">${stats.hidden}</div>
          </div>
          <div style="padding: 8px; background: var(--card); border: 1px solid var(--border); border-radius: 6px;">
            <div style="font-size: 10px; color: var(--muted);">Subscribed Purity</div>
            <div style="font-size: 18px; font-weight: 700; color: ${stats.purity > 50 ? 'var(--success)' : 'var(--danger)'};">${stats.purity}%</div>
          </div>
          <div style="padding: 8px; background: var(--card); border: 1px solid var(--border); border-radius: 6px;">
            <div style="font-size: 10px; color: var(--muted);">7-Day Avg Purity</div>
            <div style="font-size: 18px; font-weight: 700; color: ${avgPurity > 50 ? 'var(--success)' : 'var(--danger)'};">${avgPurity}%</div>
          </div>
        </div>
        <div style="margin-bottom: 8px;">
          <strong>Hidden by:</strong>
          <span style="margin-left: 8px;">Channel: <b>${stats.hiddenByChannel}</b></span>
          <span style="margin-left: 8px;">Keyword: <b>${stats.hiddenByKeyword}</b></span>
          <span style="margin-left: 8px;">AI/Auto-Dub: <b>${stats.hiddenByAI}</b></span>
        </div>
        <div style="margin-bottom: 8px;">
          <strong>Top Matching Rules (all-time):</strong>
          <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">${topRules || 'No hits recorded yet'}</div>
        </div>
        <div style="font-size: 10px; color: var(--muted);">
          Data from current page only. Open feed and click Refresh for latest.
        </div>
      `;
    }
  } catch (e) {
    dashEl.innerHTML = `<span style="color: var(--danger);">Error: ${e.message}</span>`;
  }
}

// ===== INIT ALL NEW FEATURES =====
function initAdvancedFeatures() {
  // Per-channel keyword exceptions
  const addExcBtn = document.getElementById('addKeywordException');
  if (addExcBtn) addExcBtn.addEventListener('click', addKeywordException);

  // Community packs
  const addPackBtn = document.getElementById('addCommunityPack');
  if (addPackBtn) addPackBtn.addEventListener('click', addCommunityPack);

  // Temporal rules
  const addTempBtn = document.getElementById('addTemporalRule');
  if (addTempBtn) addTempBtn.addEventListener('click', addTemporalRule);

  // Feed health
  const refreshHealthBtn = document.getElementById('refreshFeedHealth');
  if (refreshHealthBtn) refreshHealthBtn.addEventListener('click', refreshFeedHealth);

  // Initial renders
  renderKeywordExceptions();
  renderCommunityPacks();
  renderTemporalRules();
  mergeCommunityPacks();
  autoFetchCommunityPacks();

  // Load on Settings tab activation
  const settingsTab = document.getElementById('settingsTab');
  if (settingsTab && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (settingsTab.classList.contains('active')) {
        refreshFeedHealth();
        observer.disconnect();
      }
    });
    observer.observe(settingsTab, { attributes: true, attributeFilter: ['class'] });
  }
}

document.addEventListener('DOMContentLoaded', init);
