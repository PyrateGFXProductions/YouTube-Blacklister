// Popup manager for YouTube Smart Blacklister v1.8.0
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

let data = {
  channels: [],
  keywords: [],
  whitelistChannels: [],
  blockShorts: false,
  blockCommunity: false,
  enableQuickBlock: true,
  triggerServerFeedback: false,
  totalBlocked: 0,
  aiAutonomous: false,
  aiSensitivity: 'balanced',
  aiModel: '',
  aiTastePrompt: '',
  aiLog: [],
  aiDebaitTitles: false,
  aiDebaitModel: '',
  tldwEnabled: true,
  huntMode: false
};

let channelFilter = '';
let keywordFilter = '';

function load() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'channels',
      'keywords',
      'whitelistChannels',
      'blockShorts',
      'blockCommunity',
      'enableQuickBlock',
      'triggerServerFeedback',
      'nyt_totalBlocked',
      'aiAutonomous',
      'aiSensitivity',
      'aiModel',
      'aiTastePrompt',
      'aiLog',
      'aiDebaitTitles',
      'aiDebaitModel',
      'tldwEnabled',
      'huntMode'
    ], (res) => {
      data.channels = Array.isArray(res.channels) ? res.channels : [];
      data.keywords = Array.isArray(res.keywords) ? res.keywords : [];
      data.whitelistChannels = Array.isArray(res.whitelistChannels) ? res.whitelistChannels : [];
      data.blockShorts = Boolean(res.blockShorts);
      data.blockCommunity = Boolean(res.blockCommunity);
      data.enableQuickBlock = res.enableQuickBlock !== false;
      data.triggerServerFeedback = Boolean(res.triggerServerFeedback);
      data.totalBlocked = Number(res.nyt_totalBlocked) || 0;
      data.aiAutonomous = Boolean(res.aiAutonomous);
      data.aiSensitivity = res.aiSensitivity || 'balanced';
      data.aiModel = res.aiModel || '';
      data.aiTastePrompt = res.aiTastePrompt || '';
      data.aiLog = Array.isArray(res.aiLog) ? res.aiLog : [];
      data.aiDebaitTitles = Boolean(res.aiDebaitTitles);
      data.aiDebaitModel = res.aiDebaitModel || res.aiModel || '';
      data.tldwEnabled = res.tldwEnabled !== false;
      data.huntMode = Boolean(res.huntMode);
      resolve();
    });
  });
}

function save() {
  chrome.storage.local.set({
    channels: data.channels,
    keywords: data.keywords,
    whitelistChannels: data.whitelistChannels,
    blockShorts: data.blockShorts,
    blockCommunity: data.blockCommunity,
    enableQuickBlock: data.enableQuickBlock,
    triggerServerFeedback: data.triggerServerFeedback,
    aiAutonomous: data.aiAutonomous,
    aiSensitivity: data.aiSensitivity,
    aiModel: data.aiModel,
    aiTastePrompt: data.aiTastePrompt,
    aiLog: data.aiLog,
    aiDebaitTitles: data.aiDebaitTitles,
    aiDebaitModel: data.aiDebaitModel,
    tldwEnabled: data.tldwEnabled,
    huntMode: data.huntMode
  });

  // Notify active YouTube tabs to re-apply rules immediately
  try {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url && tab.url.startsWith('https://www.youtube.com')) {
          try {
            chrome.tabs.sendMessage(tab.id, { type: 'RULES_UPDATED' }, () => {
              if (chrome.runtime?.lastError) { /* tab not ready — ignore */ }
            });
          } catch (_) {}
        }
      });
    });
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

// Render item row
function itemRow(text, onRemove) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = text;
  name.title = text;

  const btn = document.createElement('button');
  btn.className = 'item-btn';
  btn.textContent = 'Unblock';
  btn.addEventListener('click', onRemove);

  row.appendChild(name);
  row.appendChild(btn);
  return row;
}

function renderList(listEl, items, filterText, emptyMsg, onRemove) {
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
    listEl.appendChild(itemRow(it, () => onRemove(it)));
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

// Export backup
function exportBackup() {
  const payload = {
    version: '1.8.0',
    exportedAt: new Date().toISOString(),
    channels: data.channels,
    keywords: data.keywords,
    whitelistChannels: data.whitelistChannels,
    settings: {
      blockShorts: data.blockShorts,
      blockCommunity: data.blockCommunity,
      enableQuickBlock: data.enableQuickBlock,
      triggerServerFeedback: data.triggerServerFeedback,
      aiAutonomous: data.aiAutonomous,
      aiSensitivity: data.aiSensitivity,
      aiModel: data.aiModel,
      aiTastePrompt: data.aiTastePrompt,
      aiDebaitTitles: data.aiDebaitTitles,
      aiDebaitModel: data.aiDebaitModel,
      tldwEnabled: data.tldwEnabled,
      huntMode: data.huntMode
    }
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `youtube_blacklist_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Backup exported.');
}

// Import backup
function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target.result);
      if (!json || typeof json !== 'object') throw new Error('Invalid JSON');

      let addedChannels = 0;
      if (Array.isArray(json.channels)) {
        json.channels.forEach(c => {
          const clean = extractEntityFromInput(c);
          if (clean && !data.channels.includes(clean)) {
            data.channels.push(clean);
            addedChannels++;
          }
        });
      }

      let addedKeywords = 0;
      if (Array.isArray(json.keywords)) {
        json.keywords.forEach(k => {
          const clean = String(k).trim().toLowerCase();
          if (clean && !data.keywords.includes(clean)) {
            data.keywords.push(clean);
            addedKeywords++;
          }
        });
      }

      if (Array.isArray(json.whitelistChannels)) {
        json.whitelistChannels.forEach(w => {
          const clean = extractEntityFromInput(w);
          if (clean && !data.whitelistChannels.includes(clean)) {
            data.whitelistChannels.push(clean);
          }
        });
      }

      if (json.settings) {
        if ('blockShorts' in json.settings) data.blockShorts = Boolean(json.settings.blockShorts);
        if ('blockCommunity' in json.settings) data.blockCommunity = Boolean(json.settings.blockCommunity);
        if ('enableQuickBlock' in json.settings) data.enableQuickBlock = Boolean(json.settings.enableQuickBlock);
        if ('triggerServerFeedback' in json.settings) data.triggerServerFeedback = Boolean(json.settings.triggerServerFeedback);
        if ('aiAutonomous' in json.settings) data.aiAutonomous = Boolean(json.settings.aiAutonomous);
        if ('aiSensitivity' in json.settings) data.aiSensitivity = String(json.settings.aiSensitivity || 'balanced');
        if ('aiModel' in json.settings) data.aiModel = String(json.settings.aiModel || '');
        if ('aiTastePrompt' in json.settings) data.aiTastePrompt = String(json.settings.aiTastePrompt || '');
        if ('aiDebaitTitles' in json.settings) data.aiDebaitTitles = Boolean(json.settings.aiDebaitTitles);
        if ('aiDebaitModel' in json.settings) data.aiDebaitModel = String(json.settings.aiDebaitModel || '');
        if ('tldwEnabled' in json.settings) data.tldwEnabled = Boolean(json.settings.tldwEnabled);
        if ('huntMode' in json.settings) data.huntMode = Boolean(json.settings.huntMode);
      }

      save();
      initToggles();
      renderAll();
      setStatus(`Imported ${addedChannels} channels & ${addedKeywords} keywords.`);
    } catch (err) {
      alert('Failed to import: Invalid backup file.');
    }
  };
  reader.readAsText(file);
}

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

  const bc = document.getElementById('toggleBlockCommunity');
  if (bc) {
    bc.checked = data.blockCommunity;
    bc.onchange = () => { data.blockCommunity = bc.checked; save(); };
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
}

// ------------------------------------------------------------------
// AI FEED FORENSIC DIAGNOSTIC ROAST
// ------------------------------------------------------------------
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getActiveYoutubeTab(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (tab && tab.url && tab.url.startsWith('https://www.youtube.com')) {
      cb(tab);
    } else {
      cb(null);
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

  getActiveYoutubeTab((tab) => {
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

  // Export / Import
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportBackup);

  const importBtn = document.getElementById('importBtn');
  const fileInput = document.getElementById('importFileInput');
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        importBackup(fileInput.files[0]);
        fileInput.value = '';
      }
    });
  }

  // Open YouTube link
  const openYt = document.getElementById('openYoutube');
  if (openYt) {
    openYt.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://www.youtube.com/' });
    });
  }

  // Ko-fi support links
  const openKofi = () => {
    chrome.tabs.create({ url: 'https://ko-fi.com/pyrategfxproductions' });
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

  // Check AI connection
  chrome.runtime.sendMessage({ type: 'CHECK_AI_STATUS' }, (res) => {
    if (res && res.ok && Array.isArray(res.models) && res.models.length) {
      if (statusPill) {
        statusPill.className = 'ai-status-pill';
        statusPill.textContent = `🟢 ${res.provider === 'ollama' ? 'Ollama' : 'LM Studio'} Online`;
      }
      if (modelSelect) {
        modelSelect.innerHTML = '';
        res.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          if (m === data.aiModel) opt.selected = true;
          modelSelect.appendChild(opt);
        });
        if (!data.aiModel) {
          data.aiModel = res.models[0];
          save();
        }
        modelSelect.onchange = () => { data.aiModel = modelSelect.value; save(); };
      }
    } else {
      if (statusPill) {
        statusPill.className = 'ai-status-pill offline';
        statusPill.textContent = '🟡 Offline Heuristic Mode';
        statusPill.title = 'Local LLM not detected. Running built-in heuristic neural fallback.';
      }
      if (modelSelect) {
        modelSelect.innerHTML = '<option value="heuristic">Built-in Heuristic</option>';
      }
    }
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

      chrome.runtime.sendMessage({
        type: 'AI_SYNTHESIZE_RULES',
        prompt,
        modelChoice: data.aiModel
      }, (res) => {
        synthBtn.disabled = false;
        synthBtn.innerHTML = '<span>🔮 Synthesize Rules from My Mind</span>';

        if (res && res.ok && Array.isArray(res.keywords)) {
          let added = 0;
          res.keywords.forEach(k => {
            const clean = String(k).trim().toLowerCase();
            if (clean && !data.keywords.includes(clean)) {
              data.keywords.push(clean);
              added++;
            }
          });
          if (Array.isArray(res.regex)) {
            res.regex.forEach(r => {
              if (r && !data.keywords.includes(r)) {
                data.keywords.push(r);
                added++;
              }
            });
          }

          save();
          renderAll();
          triggerConfetti();

          if (resultBox) {
            resultBox.style.display = 'block';
            resultBox.innerHTML = `<strong>${res.isFallback ? '⚡ Heuristic' : '🧠 AI'} Rationale:</strong> ${res.rationale}<br><span style="color:#4ade80;">Synthesized & injected ${added} new precision rules!</span>`;
          }
          setStatus(`Injected ${added} rules from AI!`);
        } else {
          alert('Could not synthesize rules. Please check your prompt.');
        }
      });
    });
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
