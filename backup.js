// Backup & Restore page for Always New To You - YouTube Smart Blacklister v1.10.1
//
// WHY THIS PAGE EXISTS (and why export/import were broken in the popup):
//  - Export used a detached <a download> + immediate URL.revokeObjectURL(), which
//    Firefox/Zen silently aborts — no file is ever produced.
//  - Import used a file picker while the popup was open; opening a native picker can
//    close the popup before the chosen file is read, and the import path never passed
//    replaceExisting=true, so a restore *merged* instead of replacing.
// This full page has no popup lifecycle: the picker cannot kill it, the download uses
// chrome.downloads (with an anchor fallback), and "Replace existing rules" defaults on.

// --- data model (mirrors popup.js) --------------------------------------------
let data = {
  channels: [], keywords: [], whitelistChannels: [], subsSnapshot: [],
  blockShorts: false, shortsSubOnly: false, blockCommunity: false, autoDubMode: 'off',
  enableQuickBlock: true, triggerServerFeedback: false, totalBlocked: 0,
  aiAutonomous: false, aiSensitivity: 'balanced', aiModel: '', aiTastePrompt: '',
  aiSubscriptionProfile: '', aiLog: [], aiDebaitTitles: false, aiDebaitModel: '',
  tldwEnabled: true, huntMode: false, chipRescue: false, newToYouAuto: false
};

function load() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'channels','keywords','whitelistChannels','subsSnapshot',
      'blockShorts','shortsSubOnly','blockCommunity','autoDubMode','enableQuickBlock',
      'triggerServerFeedback','nyt_totalBlocked','aiAutonomous','aiSensitivity',
      'aiModel','aiTastePrompt','aiSubscriptionProfile','aiLog',
      'aiDebaitTitles','aiDebaitModel','tldwEnabled','huntMode','chipRescue','newToYouAuto'
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

function saveToStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      channels: data.channels, keywords: data.keywords,
      whitelistChannels: data.whitelistChannels, subsSnapshot: data.subsSnapshot,
      blockShorts: data.blockShorts, shortsSubOnly: data.shortsSubOnly,
      blockCommunity: data.blockCommunity, autoDubMode: data.autoDubMode,
      enableQuickBlock: data.enableQuickBlock,
      triggerServerFeedback: data.triggerServerFeedback,
      nyt_totalBlocked: data.totalBlocked, aiAutonomous: data.aiAutonomous,
      aiSensitivity: data.aiSensitivity, aiModel: data.aiModel,
      aiTastePrompt: data.aiTastePrompt, aiSubscriptionProfile: data.aiSubscriptionProfile,
      aiLog: data.aiLog, aiDebaitTitles: data.aiDebaitTitles,
      aiDebaitModel: data.aiDebaitModel, tldwEnabled: data.tldwEnabled,
      huntMode: data.huntMode, chipRescue: data.chipRescue,
      newToYouAuto: data.newToYouAuto
    }, () => resolve(chrome.runtime.lastError ? String(chrome.runtime.lastError.message) : null));
  });
}

// --- sanitizers (mirrors popup.js) --------------------------------------------

function extractEntityFromInput(val) {
  if (val == null) return '';
  if (typeof val !== 'string' && typeof val !== 'number') return ''; // reject objects/arrays -> "[object object]" garbage
  const s = String(val).trim();
  if (!s) return '';
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

// ReDoS-suspect regex signatures are rejected at import time.
function isReDoSSuspect(pattern) {
  return /\([^()]*(?:[*+{]|\|)[^()]*\)\s*[*+{]/.test(pattern);
}

// Regex-form keywords keep their case and flags (lowercasing them silently corrupts
// the pattern source); every keyword is length-capped; slash-form regex rules must
// actually compile — and must not be ReDoS-suspect — or they're dropped.
function sanitizeImportedKeyword(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || s.length > 200) return '';
  if (s.startsWith('/') && s.lastIndexOf('/') > 0) {
    try {
      const lastSlash = s.lastIndexOf('/');
      const pattern = s.slice(1, lastSlash);
      const flags = s.slice(lastSlash + 1);
      new RegExp(pattern, flags);
      if (isReDoSSuspect(pattern)) return '';
      return s;
    } catch (_) {
      return '';
    }
  }
  return s.toLowerCase();
}

// --- export ---------------------------------------------------------------------

function buildPayload() {
  return {
    snapshotVersion: 1,
    version: chrome.runtime.getManifest().version,
    exportedAt: new Date().toISOString(),
    channels: data.channels,
    keywords: data.keywords,
    whitelistChannels: data.whitelistChannels,
    settings: {
      blockShorts: data.blockShorts, shortsSubOnly: data.shortsSubOnly,
      blockCommunity: data.blockCommunity, autoDubMode: data.autoDubMode,
      enableQuickBlock: data.enableQuickBlock,
      triggerServerFeedback: data.triggerServerFeedback, aiAutonomous: data.aiAutonomous,
      aiSensitivity: data.aiSensitivity, aiModel: data.aiModel,
      aiTastePrompt: data.aiTastePrompt, aiDebaitTitles: data.aiDebaitTitles,
      aiDebaitModel: data.aiDebaitModel, tldwEnabled: data.tldwEnabled,
      huntMode: data.huntMode, chipRescue: data.chipRescue,
      newToYouAuto: data.newToYouAuto
    }
  };
}

function downloadBlob(blob, filename, saveAs) {
  const url = URL.createObjectURL(blob);
  const revoke = () => setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 60000);
  if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
    try {
      chrome.downloads.download({ url, filename, saveAs: saveAs !== false }, () => {
        if (chrome.runtime.lastError) {
          const why = (chrome.runtime.lastError.message || 'operation was cancelled');
          setStatus('Export did not complete: ' + why, 'err');
        } else {
          setStatus('Backup exported: ' + filename, 'ok');
        }
        revoke();
      });
      setStatus('Exporting ' + filename + ' … choose a location if prompted.', '');
      return;
    } catch (_) { /* fall through to anchor */ }
  }
  anchorFallback(url, filename);
  setStatus('Backup exported: ' + filename + ' (Downloads folder).', 'ok');
  revoke();
}

function anchorFallback(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function doExport() {
  const saveAs = document.getElementById('exportAuto').checked;
  const filename = 'youtube_blacklist_backup_' + new Date().toISOString().slice(0, 10) + '.json';
  const blob = new Blob([JSON.stringify(buildPayload(), null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename, saveAs);
}

// --- import ----------------------------------------------------------------------

function applyImport(json) {
  // Returns { ok, channels, keywords, whitelist, settings }
  if (!json || typeof json !== 'object') return { ok: false };
  if (json.snapshotVersion && Number(json.snapshotVersion) > 1) return { ok: false, newer: true };

  const hasAny = Array.isArray(json.channels) || Array.isArray(json.keywords) || Array.isArray(json.whitelistChannels);
  if (!hasAny) return { ok: false };

  const result = { ok: true, channels: [], keywords: [], whitelist: [], settings: null };

  if (Array.isArray(json.channels)) {
    json.channels.forEach(c => {
      const clean = extractEntityFromInput(c);
      if (clean) result.channels.push(clean);
    });
  }
  if (Array.isArray(json.keywords)) {
    json.keywords.forEach(k => {
      const clean = sanitizeImportedKeyword(k);
      if (clean) result.keywords.push(clean);
    });
  }
  if (Array.isArray(json.whitelistChannels)) {
    json.whitelistChannels.forEach(w => {
      const clean = extractEntityFromInput(w);
      if (clean) result.whitelist.push(clean);
    });
  }
  result.settings = json.settings ? json.settings : null;
  return result;
}

async function doImportFile(file) {
  const text = await file.text().catch(() => null);
  if (text == null) { setStatus('Could not read that file.', 'err'); return false; }
  let json;
  try { json = JSON.parse(text); } catch (_) { setStatus('Invalid backup: not readable JSON.', 'err'); return false; }

  const replace = document.getElementById('replaceRules').checked;
  const r = applyImport(json);
  if (!r.ok) {
    setStatus(r.newer
      ? 'This backup was created by a newer version — update the extension first.'
      : 'Invalid backup file: it contains no channels/keywords/whitelist.', 'err');
    return false;
  }

  // Only now that the file is valid: replace or merge.
  if (replace) {
    data.channels = [];
    data.keywords = [];
    data.whitelistChannels = [];
  }
  r.channels.forEach(c => { if (!data.channels.includes(c)) data.channels.push(c); });
  r.keywords.forEach(k => { if (!data.keywords.includes(k)) data.keywords.push(k); });
  r.whitelist.forEach(w => { if (!data.whitelistChannels.includes(w)) data.whitelistChannels.push(w); });

  if (r.settings) {
    const s = r.settings;
    if ('blockShorts' in s) data.blockShorts = Boolean(s.blockShorts);
    if ('shortsSubOnly' in s) data.shortsSubOnly = Boolean(s.shortsSubOnly);
    if ('blockCommunity' in s) data.blockCommunity = Boolean(s.blockCommunity);
    if ('autoDubMode' in s) data.autoDubMode = ['off', 'smart', 'total'].includes(s.autoDubMode) ? s.autoDubMode : 'off';
    if ('enableQuickBlock' in s) data.enableQuickBlock = Boolean(s.enableQuickBlock);
    if ('triggerServerFeedback' in s) data.triggerServerFeedback = Boolean(s.triggerServerFeedback);
    if ('aiAutonomous' in s) data.aiAutonomous = Boolean(s.aiAutonomous);
    if ('aiSensitivity' in s) data.aiSensitivity = String(s.aiSensitivity || 'balanced');
    if ('aiModel' in s) data.aiModel = String(s.aiModel || '');
    if ('aiTastePrompt' in s) data.aiTastePrompt = String(s.aiTastePrompt || '');
    if ('aiDebaitTitles' in s) data.aiDebaitTitles = Boolean(s.aiDebaitTitles);
    if ('aiDebaitModel' in s) data.aiDebaitModel = String(s.aiDebaitModel || '');
    if ('tldwEnabled' in s) data.tldwEnabled = Boolean(s.tldwEnabled);
    if ('huntMode' in s) data.huntMode = Boolean(s.huntMode);
    if ('chipRescue' in s) data.chipRescue = Boolean(s.chipRescue);
    if ('newToYouAuto' in s) data.newToYouAuto = Boolean(s.newToYouAuto);
  }

  const saveErr = await saveToStorage();
  if (saveErr) {
    setStatus('Import applied, but storage reported an error: ' + saveErr, 'err');
    return false;
  }
  const mode = replace ? 'replaced' : 'merged';
  setStatus(`Imported & ${mode}: ${r.channels.length} channels, ${r.keywords.length} keywords, ${r.whitelist.length} whitelisted.`, 'ok');
  return true;
}

// --- UI --------------------------------------------------------------------------

function setStatus(msg, kind) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.className = kind || '';
}

function init() {
  if (document.getElementById('ver')) {
    document.getElementById('ver').textContent =
      (chrome.runtime.getManifest() && chrome.runtime.getManifest().version) || '?';
  }

  document.getElementById('exportBtn').addEventListener('click', doExport);

  const fileInput = document.getElementById('fileInput');
  const drop = document.getElementById('drop');
  const pick = () => fileInput.click();
  drop.addEventListener('click', pick);
  document.getElementById('importBtn').addEventListener('click', pick);
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      doImportFile(fileInput.files[0]);
      fileInput.value = '';
    }
  });
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.remove('over');
  }));
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) doImportFile(f);
  });

  // #export auto-runs the download; #import focuses the picker.
  if (location.hash === '#export') doExport();
  else if (location.hash === '#import') pick();
}

if (typeof document !== 'undefined') {
  load().then(() => { if (typeof init === 'function') init(); });
}

// --- test seam (node harness only) ----------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { data, load, saveToStorage, buildPayload, applyImport, doImportFile, sanitizeImportedKeyword, extractEntityFromInput, isReDoSSuspect };
}