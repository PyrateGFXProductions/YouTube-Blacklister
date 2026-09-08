// Popup manager for YouTube Smart Blacklister v1.5.2
// Manages rules, settings, search filtering, import/export, and stats.

let data = {
  channels: [],
  keywords: [],
  whitelistChannels: [],
  blockShorts: false,
  blockCommunity: false,
  enableQuickBlock: true,
  triggerServerFeedback: false,
  totalBlocked: 0
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
      'nyt_totalBlocked'
    ], (res) => {
      data.channels = Array.isArray(res.channels) ? res.channels : [];
      data.keywords = Array.isArray(res.keywords) ? res.keywords : [];
      data.whitelistChannels = Array.isArray(res.whitelistChannels) ? res.whitelistChannels : [];
      data.blockShorts = Boolean(res.blockShorts);
      data.blockCommunity = Boolean(res.blockCommunity);
      data.enableQuickBlock = res.enableQuickBlock !== false;
      data.triggerServerFeedback = Boolean(res.triggerServerFeedback);
      data.totalBlocked = Number(res.nyt_totalBlocked) || 0;
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
    triggerServerFeedback: data.triggerServerFeedback
  });

  // Notify active YouTube tabs to re-apply rules immediately
  try {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url && tab.url.startsWith('https://www.youtube.com')) {
          try {
            chrome.tabs.sendMessage(tab.id, { type: 'RULES_UPDATED' });
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
    version: '1.5.2',
    exportedAt: new Date().toISOString(),
    channels: data.channels,
    keywords: data.keywords,
    whitelistChannels: data.whitelistChannels,
    settings: {
      blockShorts: data.blockShorts,
      blockCommunity: data.blockCommunity,
      enableQuickBlock: data.enableQuickBlock,
      triggerServerFeedback: data.triggerServerFeedback
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

  initToggles();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
