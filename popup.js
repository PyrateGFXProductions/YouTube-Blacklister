// Popup manager for YouTube Smart Blacklister v1.10.1
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
  brainrot: ['prank', 'skibidi', 'in 24 hours', "you won't believe", 'shocking', 'exposed', 'reaction'],
  crypto: ['crypto', 'bitcoin', 'memecoin', '100x', 'passive income', 'dropshipping'],
  aislop: ['ai generated', 'faceless channel', 'text to speech', 'midjourney'],
  drama: ['drama', 'canceled', 'apology video', 'responds to', 'clout']
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
  aiLog: [],
  aiDebaitTitles: false,
  aiDebaitModel: '',
  tldwEnabled: true,
  huntMode: false,
  chipRescue: false,
  newToYouAuto: false
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
      'aiLog',
      'aiDebaitTitles',
      'aiDebaitModel',
      'tldwEnabled',
      'huntMode',
      'chipRescue',
      'newToYouAuto'
    ], (res) => {
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
      data.aiLog = Array.isArray(res.aiLog) ? res.aiLog : [];
      data.aiDebaitTitles = Boolean(res.aiDebaitTitles);
      data.aiDebaitModel = res.aiDebaitModel || res.aiModel || '';
      data.tldwEnabled = res.tldwEnabled !== false;
      data.huntMode = Boolean(res.huntMode);
      data.chipRescue = Boolean(res.chipRescue);
      data.newToYouAuto = Boolean(res.newToYouAuto);
      resolve();
    });
  });
}

async function save() {
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
    aiLog: data.aiLog,
    aiDebaitTitles: data.aiDebaitTitles,
    aiDebaitModel: data.aiDebaitModel,
    tldwEnabled: data.tldwEnabled,
    huntMode: data.huntMode,
    chipRescue: data.chipRescue,
    newToYouAuto: data.newToYouAuto
  });

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

  const saveBtn = document.createElement('button');
  saveBtn.className = 'item-btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', commit);
  row.appendChild(saveBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'item-btn';
  cancelBtn.textContent = '✕';
  cancelBtn.title = 'Cancel';
  cancelBtn.addEventListener('click', () => { if (!done) { done = true; renderAll(); } });
  row.appendChild(cancelBtn);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') { if (!done) { done = true; renderAll(); } }
  });
  input.addEventListener('blur', () => {
    // The Save / ✕ buttons fire after blur — leave the outcome to them.
    if (document.activeElement === saveBtn || document.activeElement === cancelBtn) return;
    commit();
  });

  input.focus();
  input.select();
}

// Swap oldVal for newVal inside arr (dedup-aware); returns 1 if a change happened.
function replaceRule(arr, oldVal, newVal) {
  const idx = arr.indexOf(oldVal);
  if (idx === -1) return 0;
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
      replaceRule(data.channels, oldV, newV);
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
      replaceRule(data.keywords, oldV, newV.trim().toLowerCase());
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
      replaceRule(data.whitelistChannels, oldV, newV);
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
    const words = STARTER_PACKS[packKey];
    if (words && words.length) {
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
    chrome.tabs.create({ url: chrome.runtime.getURL('backup.html' + (mode === 'import' ? '#import' : '#export')) });
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
          modelChoice: data.aiModel
        }, (roastRes) => {
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
      const clean = String(k).trim().toLowerCase();
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
    return `<div class="sub-conflict-row" data-kw="${escapeHtml(c.keyword)}" style="font-size:10.5px;line-height:1.5;margin-top:5px;">
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
      const kw = row && row.dataset.kw;
      if (kw) {
        const idx = data.keywords.indexOf(kw);
        if (idx !== -1) {
          data.keywords.splice(idx, 1);
          save();
          renderAll();
          setStatus(`Removed “${kw}” from the blacklist.`);
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

        const total = Math.max(res.total || res.visible, res.visible);
        const pct = Math.round((res.subscribed / res.visible) * 100);
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
              ${res.hidden ? `<span style="color:#9aa3b2;">·</span> <span style="color:#f87171;">🚫 ${res.hidden} hidden by rules</span>` : ''}
            </div>` +
            `<div style="position:relative;height:6px;background:#262a33;border-radius:3px;margin-top:5px;overflow:hidden;">
              <div style="position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:linear-gradient(90deg,#1f7a33,#2ba640);border-radius:3px 0 0 3px;"></div>
              <div style="position:absolute;left:${pct}%;top:0;bottom:0;width:${newPct}%;background:linear-gradient(90deg,#6d28d9,#8b5cf6);"></div>
            </div>` +
            `<div style="font-size:10px;color:#9aa3b2;margin-top:4px;">${res.visible} visible cards on this page${res.hidden ? ` · ${res.hidden} hidden` : ''} · ${total} total tracked</div>`;
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
  const btn = document.getElementById('aiSubSynthBtn');
  const card = document.getElementById('aiSubResultBox');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>🔭 Scanning your subscriptions...</span>';
  }
  if (card) card.style.display = 'none';
  if (subSynthBusy) return; // single-scan guard: one scan at a time, no tab stacking
  subSynthBusy = true;

  let createdTabId = null;
  let prevActiveTabId = null;

  const releaseCreatedTab = (keepOpen) => {
    if (createdTabId != null) {
      if (keepOpen) {
        // Kept open for the user to act on (sign-in wall): give it focus so they
        // see it — otherwise they'd stack a fresh tab on top on the next click.
        try { chrome.tabs.update(createdTabId, { active: true }); } catch (_) {}
      } else {
        try { chrome.tabs.remove(createdTabId); } catch (_) {}
      }
      createdTabId = null;
    }
    if (!keepOpen && prevActiveTabId != null) {
      try { chrome.tabs.update(prevActiveTabId, { active: true }); } catch (_) {}
    }
    prevActiveTabId = null;
    subSynthBusy = false;
  };

  const handleScrape = (res) => {
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

let synthAttempts = 0;
    const requestSynthesis = () => {
      synthAttempts++;
      chrome.runtime.sendMessage({
        type: 'AI_SYNTHESIZE_SUBSCRIPTION_RULES',
        channels: res.channels,
        modelChoice: data.aiModel
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
        out.innerHTML =
          `<div style="font-size:12px;font-weight:700;color:#4db6ff;margin-bottom:4px;">🔭 Taste Profile: ${escapeHtml(aiRes.profile || 'Subscription Insights')} — ${count} subscriptions analyzed</div>` +
          `<div style="font-size:11.5px;color:#e5e7eb;line-height:1.45;">${escapeHtml(aiRes.rationale || '')}</div>` +
          `<div style="font-size:11.5px;color:#4ade80;margin-top:6px;">${aiRes.isFallback ? '⚡ Heuristic' : '🧠 AI'} synthesis — ${added} new precision rules injected:</div>` +
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
    requestSynthesis();
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
        handleScrape(res);
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
      chrome.tabs.create({ url: SUBSCRIPTIONS_URL, active: true }, async (tab) => {
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
        // Let the SPA hydrate its channel grid before scraping. Background tabs
        // get throttled and never build the grid — that's why the scan used to
        // report "no subscriptions" even while signed in.
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

async function init() {
  await load();

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
      try { chrome.tabs.create({ url: 'https://www.youtube.com/' }); } catch (_) {}
    });
  }

  // Ko-fi support links
  const openKofi = () => {
    try { chrome.tabs.create({ url: 'https://ko-fi.com/pyrategfxproductions' }); } catch (_) {}
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
      const words = STARTER_PACKS[packKey];
      if (!words || !words.length) return;

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

  // Feed Forensic Diagnostic Roast
  const roastBtn = document.getElementById('aiRoastBtn');
  if (roastBtn) {
    roastBtn.addEventListener('click', () => {
      runFeedRoast();
    });
  }

  renderAll();
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
    const providerName = res && res.provider === 'ollama' ? 'Ollama'
      : res && res.provider === 'lmstudio' ? 'LM Studio'
      : res && res.provider === 'onnx' ? 'Local Phi (ONNX)' : '';
    const offeringBox = document.getElementById('aiOnnxOffering');

    if (res && res.offering && res.provider === 'onnx') {
      // Third engine detected but the runtime/model isn't ready to serve yet —
      // mirror the framework's own offering: show the option + download link.
      if (statusPill) {
        statusPill.className = 'ai-status-pill offline';
        statusPill.textContent = '🟠 Local Phi (ONNX) — download to enable';
        const setup = res.setup || {};
        statusPill.title = [
          setup.installCommand,
          setup.downloadCommand
        ].filter(Boolean).join('\n') || 'Local Phi (ONNX) offline engine offered via asus_argb_framework';
      }
      if (modelSelect) {
        modelSelect.innerHTML = '<option value="heuristic">Built-in Heuristic</option>';
      }
      const link = offeringBox && offeringBox.querySelector('a');
      if (link) {
        const setup = res.setup || {};
        link.href = setup.downloadCommand
          ? 'https://huggingface.co/microsoft/Phi-3.5-mini-instruct-onnx'
          : '#';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      const cmdEl = offeringBox && offeringBox.querySelector('#aiOnnxCommand');
      if (cmdEl) {
        const setup = res.setup || {};
        cmdEl.textContent = [setup.installCommand, setup.downloadCommand].filter(Boolean).join('  ⏎  ') || 'pip install onnxruntime-genai huggingface-hub';
      }
      if (offeringBox) offeringBox.style.display = 'block';
      if (detailEl) detailEl.textContent = 'Local Phi (ONNX) engine detected but not ready to serve — install the runtime to enable this fully offline engine.';
      return;
    }

    if (res && res.ok && Array.isArray(res.models) && res.models.length) {
      if (statusPill) {
        statusPill.className = 'ai-status-pill';
        statusPill.textContent = `🟢 ${providerName} Online`;
      }
      if (detailEl) {
        const active = (data.aiModel || '').trim();
        detailEl.textContent = `${providerName} connected — ${res.models.length} model${res.models.length === 1 ? '' : 's'} ready${active ? ` · active: ${active}` : ''}. 100% offline, zero telemetry.`;
      }
      if (offeringBox) offeringBox.style.display = 'none';
      if (modelSelect) {
        modelSelect.innerHTML = '';
        res.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          const current = (data.aiModel || '').trim().toLowerCase();
          const candidate = m.trim().toLowerCase();
          if (current && (candidate === current || candidate.startsWith(current + ':') || current.startsWith(candidate + ':'))) {
            opt.selected = true;
          }
          modelSelect.appendChild(opt);
        });
        if (modelSelect.value) {
          data.aiModel = modelSelect.value;
          save();
        }
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
      if (offeringBox) offeringBox.style.display = 'none';
      if (modelSelect) {
        modelSelect.innerHTML = '<option value="heuristic">Built-in Heuristic</option>';
      }
    }
  })
    .catch(() => {
      if (statusPill) { statusPill.className = 'ai-status-pill offline'; statusPill.textContent = '⚠️ AI engine unreachable'; }
      if (detailEl) detailEl.textContent = 'Could not reach the background worker. Click the icon again to retry — if it persists, reload the extension.';
    });

  // Preset chips
  document.querySelectorAll('.ai-chip').forEach(chip => {
    chip.addEventListener('click', () => {
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

      const chosenModel = (modelSelect && modelSelect.value) ? modelSelect.value : (data.aiModel || '');
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

document.addEventListener('DOMContentLoaded', init);
