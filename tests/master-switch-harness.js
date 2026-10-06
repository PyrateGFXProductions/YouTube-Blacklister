/*
 * Regression harness: the MASTER SWITCH must actually switch everything off.
 *
 * The pause feature is easy to half-build: flip a flag and stop EVALUATING cards,
 * while every card a rule already hid stays hidden, the stylesheet keeps hiding
 * shorts/community, the collapsed grid slots stay collapsed, the badge keeps
 * counting, and a hover/menu gesture still writes to the blocklist. From the user's
 * side that is not "off" — the feed is still filtered and the extension still acts.
 *
 * Invariants:
 *   F. Absent key = ENABLED (an upgrade must not pause the whole user base), and an
 *      explicit false must (a) restore EVERY hiding mechanism — each owns a different
 *      marker — plus (b) make every user-facing control inert, with no card
 *      evaluation happening at all. The probe is a card that genuinely MATCHES a
 *      rule: in this stub an identity-less card is un-hidden by ANY pass, so "it came
 *      back" would prove nothing about the pause path.
 *   G. The popup and the backup page must carry the same key — a switch the UI never
 *      writes, or a backup that silently drops it, is a switch that does not exist.
 *
 * content.js is loaded into a vm with a minimal DOM + a synchronous in-memory
 * chrome.storage, and the real functions run in it.
 *
 * RED/GREEN seam: CONTENT_JS_PATH=... pointing at a pre-fix copy must fail F.
 * (G checks popup.js/popup.html/backup.js, which CONTENT_JS_PATH does not swap.)
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const CONTENT_PATH = process.env.CONTENT_JS_PATH || path.join(__dirname, '..', 'content.js');
if (!fs.existsSync(CONTENT_PATH)) {
  console.error('content.js not found at ' + CONTENT_PATH);
  process.exit(1);
}

// ---------------------------------------------------------------- DOM stub --
function makeStyle() {
  const props = {};
  return {
    setProperty(k, v) { props[k] = v; },
    removeProperty(k) { delete props[k]; },
    getPropertyValue(k) { return props[k]; }
  };
}

// Crude selector matcher: tag names, [data-*="..."] predicates and the single
// descendant combinator these code paths use.
function matchCompound(el, compound) {
  const tag = compound.split('[')[0].toLowerCase();
  if (tag && el.tagName.toLowerCase() !== tag) return false;
  const attr = compound.match(/\[([^\]="]+)(?:="([^"]*)")?\]/);
  if (!attr) return Boolean(tag);
  const name = attr[1];
  if (!name.startsWith('data-')) return false;
  const key = name.slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase());
  const val = el.dataset[key];
  if (val === undefined) return false;
  return attr[2] === undefined ? true : val === attr[2];
}

function matchChain(el, part) {
  const compounds = part.trim().split(/\s+/);
  if (!matchCompound(el, compounds[compounds.length - 1])) return false;
  let node = el.parentElement;
  for (let i = compounds.length - 2; i >= 0; i--) {
    let found = false;
    while (node) {
      if (matchCompound(node, compounds[i])) { found = true; node = node.parentElement; break; }
      node = node.parentElement;
    }
    if (!found) return false;
  }
  return true;
}

function matchesSelector(el, selector) {
  return selector.split(',').map(s => s.trim()).filter(Boolean).some(part => matchChain(el, part));
}

function descendants(root, acc = []) {
  for (const child of root.children) { acc.push(child); descendants(child, acc); }
  return acc;
}

function makeEl(tagName) {
  const el = {
    tagName: String(tagName).toUpperCase(),
    dataset: {},
    id: '',
    className: '',
    textContent: '',
    parentElement: null,
    children: [],
    isConnected: true,
    style: makeStyle(),
    // Real DOM nodes expose BOTH parentElement and parentNode; content.js removes
    // injected nodes via parentNode, so a stub with only parentElement silently
    // no-ops the removal (and reports a code bug that is not one).
    get parentNode() { return el.parentElement; },
    classList: { _s: {}, contains(c) { return Boolean(el.classList._s[c]); }, add(c) { el.classList._s[c] = true; }, remove(c) { delete el.classList._s[c]; }, toggle(c, on) { if (on) el.classList.add(c); else el.classList.remove(c); } },
    appendChild(c) { c.parentElement = el; el.children.push(c); return c; },
    removeChild(c) { el.children = el.children.filter(x => x !== c); if (c.parentElement === el) c.parentElement = null; return c; },
    remove() { if (el.parentElement) el.parentElement.removeChild(el); },
    closest(sel) {
      let n = el;
      while (n) { if (matchesSelector(n, sel)) return n; n = n.parentElement; }
      return null;
    },
    matches(sel) { return matchesSelector(el, sel); },
    querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) { return descendants(el).filter(n => matchesSelector(n, sel)); },
    addEventListener() {}, removeEventListener() {},
    getAttribute() { return null; }, setAttribute() {}, removeAttribute() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; }
  };
  return el;
}

function makeDocument() {
  const body = makeEl('body');
  return {
    body,
    documentElement: makeEl('html'),
    visibilityState: 'visible',
    readyState: 'complete',
    getElementById: () => null,
    createElement: (t) => makeEl(t),
    addEventListener() {}, removeEventListener() {},
    querySelector: (s) => body.querySelector(s),
    querySelectorAll: (s) => body.querySelectorAll(s)
  };
}

// Never settle: keeps start()'s loadSettings().then(...) chain from running, so the
// harness controls every call. The test script swaps in a live storage below.
const never = () => new Promise(() => {});

const document = makeDocument();
const context = {
  console,
  document,
  window: {
    addEventListener() {}, removeEventListener() {},
    dispatchEvent() {}, scrollBy() {}, innerHeight: 800,
    location: { pathname: '/', hash: '', href: 'https://www.youtube.com/' },
    __blkDebug: false
  },
  location: { pathname: '/', hash: '', href: 'https://www.youtube.com/', search: '' },
  history: { pushState() {}, replaceState() {} },
  navigator: { userAgent: 'node-harness' },
  MutationObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  setTimeout, clearTimeout, setInterval, clearInterval,
  Event: class { constructor(t) { this.type = t; } },
  URL, DOMParser: class { parseFromString() { return { getElementsByTagName: () => [] }; } },
  chrome: {
    // `id` must be truthy or content.js's isExtensionValid() short-circuits every
    // storage write and the harness fails for the wrong reason.
    runtime: { id: 'master-switch-harness', onMessage: { addListener() {} }, lastError: null, sendMessage: () => never(), getURL: (p) => p },
    storage: { local: { get: () => never(), set: () => never() } },
    tabs: { query: () => never(), sendMessage: () => never() }
  }
};
vm.createContext(context);
// content.js reads CLICKBAIT_PATTERNS / keywordCandidates from shared-tables.js,
// which the manifest injects ahead of it — do the same here.
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'shared-tables.js'), 'utf8'),
  context, { filename: 'shared-tables.js' }
);
vm.runInContext(fs.readFileSync(CONTENT_PATH, 'utf8'), context, { filename: CONTENT_PATH });

// ------------------------------------------------------------- test script --
const script = `
(function () {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });

  // ---- live, synchronous in-memory storage ---------------------------------
  // content.js looks up chrome.storage.local at call time, so replacing it here
  // (after load) is enough to drive the real read-modify-write paths.
  const store = {};
  chrome.storage.local = {
    get: (keys, cb) => {
      const list = Array.isArray(keys) ? keys : [keys];
      const res = {};
      for (const k of list) if (k in store) res[k] = store[k];
      cb(res);
    },
    set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); }
  };

  // The stub's getElementById always returns null; restoreHiddenByRules() removes the
  // stylesheet BY ID, so that lookup has to work for the test to be about anything.
  const byId = (id) => {
    let found = null;
    const walk = (n) => {
      if (!n || found) return;
      if (n.id === id) { found = n; return; }
      (n.children || []).forEach(walk);
    };
    walk(document.documentElement);
    walk(document.body);
    return found;
  };
  document.getElementById = byId;

  const sent = [];
  chrome.runtime.sendMessage = (msg, cb) => { sent.push(msg); if (typeof cb === 'function') cb(null); };
  chrome.runtime.lastError = null;
  const badgeClears = () => sent.filter(m => m && m.type === 'UPDATE_BADGE' && Number(m.count) === 0).length;
  const isHidden = (el) => el.style.getPropertyValue('display') !== undefined;

  // =========================================================================
  // F. The master switch really switches everything off
  // =========================================================================
  // Default-on matters more than it looks: EVERY existing install has no such key,
  // and an absent key that paused the extension would switch it off for the whole
  // user base on upgrade.
  ok('F1: the in-code default is enabled', settings.extensionEnabled === true,
    'value=' + String(settings.extensionEnabled));

  delete store.extensionEnabled;
  loadSettings();
  ok('F2: an install with no stored key loads as ENABLED', settings.extensionEnabled === true,
    'value=' + String(settings.extensionEnabled));

  store.extensionEnabled = false;
  loadSettings();
  ok('F3: an explicit false loads as paused', settings.extensionEnabled === false,
    'value=' + String(settings.extensionEnabled));

  store.extensionEnabled = true;
  loadSettings();
  ok('F4: enabled -> the rules stylesheet is present', !!byId('nyt-blacklist-styles'));

  // A card that genuinely MATCHES a rule is what gives the pause test teeth: in this
  // stub an identity-less card is un-hidden by ANY pass, so "it came back" would prove
  // nothing about the pause path. getVideoId() reads dataset.videoId first, so the
  // stub can carry a real identity.
  const blocked = document.createElement('ytd-rich-item-renderer');
  blocked.dataset.videoId = 'blockedvid1';
  document.body.appendChild(blocked);
  settings.channels = ['blockedvid1'];
  store.channels = ['blockedvid1'];

  processFeed(true);
  ok('F5: control — while ENABLED a matching card IS hidden by the rule',
    isHidden(blocked) && blocked.dataset.hiddenByLocalBlacklist === 'true',
    'display=' + blocked.style.getPropertyValue('display') + ' ds=' + JSON.stringify(blocked.dataset));

  // The state a running extension leaves behind: a card inside a grid slot (slot
  // collapsed by association), a bare hidden card, and a reel the shorts filter hid.
  const slot = document.createElement('ytd-rich-item-renderer');
  const inner = document.createElement('ytd-rich-grid-media');
  slot.appendChild(inner);
  document.body.appendChild(slot);
  hideCardElement(inner);

  const plain = document.createElement('ytd-rich-item-renderer');
  document.body.appendChild(plain);
  hideCardElement(plain);

  const reel = document.createElement('ytd-reel-item-renderer');
  document.body.appendChild(reel);
  hideCardElement(reel);
  reel.dataset.nytHiddenByShorts = '1';

  ok('F6: control — everything is hidden before the pause',
    isHidden(inner) && isHidden(slot) && isHidden(plain) && isHidden(reel) && isHidden(blocked),
    'plain=' + plain.style.getPropertyValue('display') + ' slot=' + slot.style.getPropertyValue('display'));

  // Counters prove a paused pass does no WORK, not merely that it produced the right
  // DOM: a pass that evaluates every card and happens to re-hide nothing still burns
  // the CPU the user paused to reclaim.
  let evalCalls = 0, hideCalls = 0;
  const realEvaluateCard = evaluateCard, realHideCardElement = hideCardElement;
  evaluateCard = function (c) { evalCalls++; return realEvaluateCard(c); };
  hideCardElement = function (c) { hideCalls++; return realHideCardElement(c); };

  lastBadgeCount = 7;                 // make the badge clear observable
  settings.extensionEnabled = false;
  const hidWhilePaused = processFeed(true);

  ok('F7: a paused pass evaluates NO card and hides nothing',
    evalCalls === 0 && hideCalls === 0, 'evaluateCard=' + evalCalls + ' hideCardElement=' + hideCalls);

  ok('F8: pausing un-hides the card a rule hid',
    !isHidden(blocked) && blocked.dataset.hiddenByLocalBlacklist === undefined,
    'display=' + blocked.style.getPropertyValue('display') + ' ds=' + JSON.stringify(blocked.dataset));

  ok('F9: pausing un-hides an identity-less card too',
    !isHidden(plain) && plain.dataset.hiddenByLocalBlacklist === undefined,
    'display=' + plain.style.getPropertyValue('display') + ' ds=' + JSON.stringify(plain.dataset));

  ok('F10: pausing repairs a slot collapsed by association',
    !isHidden(slot) && slot.dataset.nytCollapsedSlot === undefined,
    'display=' + slot.style.getPropertyValue('display') + ' ds=' + JSON.stringify(slot.dataset));

  ok('F11: pausing restores reels the shorts filter hid (its OWN marker)',
    !isHidden(reel) && reel.dataset.nytHiddenByShorts === undefined,
    'display=' + reel.style.getPropertyValue('display') + ' ds=' + JSON.stringify(reel.dataset));

  ok('F12: pausing removes the rules stylesheet (shorts/community CSS hides with it)',
    !byId('nyt-blacklist-styles'));

  ok('F13: pausing clears the per-tab badge', badgeClears() > 0,
    'sent=' + JSON.stringify(sent));

  ok('F14: a paused pass reports nothing hidden', hidWhilePaused === 0,
    'returned ' + String(hidWhilePaused));

  // ---- the user-facing controls must be inert, not merely unstyled ----------
  evaluateCard = realEvaluateCard;
  hideCardElement = realHideCardElement;

  settings.channels = [];
  store.channels = [];
  const gesture = document.createElement('ytd-rich-item-renderer');
  gesture.dataset.videoId = 'freshvid001';
  document.body.appendChild(gesture);
  blacklistActiveChannel(gesture);
  ok('F15: a paused block gesture adds no rule and hides nothing',
    (store.channels || []).length === 0 && settings.channels.length === 0 && !isHidden(gesture),
    'store=' + JSON.stringify(store.channels) + ' ds=' + JSON.stringify(gesture.dataset));

  ok('F16: the 3-dot menu row is not injected while paused', injectCustomMenuItem() === null);

  ok('F17: extensionEnabled rides the RULE_KEYS bus (open tabs re-apply it)',
    Array.isArray(RULE_KEYS) && RULE_KEYS.includes('extensionEnabled'),
    'RULE_KEYS=' + JSON.stringify(RULE_KEYS));

  ok('F18: while paused, no stylesheet is re-injected', !byId('nyt-blacklist-styles'));

  // ---- and switching back ON must re-arm the rules -------------------------
  store.extensionEnabled = true;
  store.channels = ['blockedvid1'];
  loadSettings();
  ok('F19: re-enabling re-injects the rules stylesheet', !!byId('nyt-blacklist-styles'));

  processFeed(true);
  ok('F20: re-enabling hides the matching card again', isHidden(blocked),
    'display=' + blocked.style.getPropertyValue('display'));

  return out;
})()
`;

let results;
try {
  results = vm.runInContext(script, context, { filename: 'harness-inline.js' });
} catch (err) {
  console.error('Harness crashed inside the vm: ' + (err && err.stack || err));
  process.exit(1);
}

// ------------------------------------------- cross-file wiring (G) ----------
const repo = path.join(__dirname, '..');
const popupJs = fs.readFileSync(path.join(repo, 'popup.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(repo, 'popup.html'), 'utf8');
const backupJs = fs.readFileSync(path.join(repo, 'backup.js'), 'utf8');

const fileChecks = [
  ['G1: popup.html exposes the master switch control',
    popupHtml.includes('id="toggleExtensionEnabled"')],
  ['G2: popup.html ships a paused banner with a resume control',
    popupHtml.includes('id="pauseBannerResume"')],
  ['G3: popup.js reads the key on load', popupJs.includes("'extensionEnabled'")],
  ['G4: popup.js writes the key through save()', popupJs.includes('extensionEnabled: data.extensionEnabled')],
  // G5: the master switch is wired through EVERY element marked data-master-toggle
  // (header + Settings) rather than one hardcoded lookup, so the two cannot drift.
  ['G5: popup.js selects every master switch by its data attribute',
    popupJs.includes("querySelectorAll('input[data-master-toggle]')")],
  ['G5b: the selected master switch(es) get an onchange handler',
    /querySelectorAll\('input\[data-master-toggle\]'\)[\s\S]{0,400}\.onchange\s*=/.test(popupJs)],
  // G8/G9: the on/off switch must be on the MAIN UI — visible on every tab, not
  // only inside Settings — and both instances must share one state attribute.
  ['G8: popup.html exposes the always-visible HEADER master switch',
    popupHtml.includes('id="toggleExtensionEnabledHeader"')],
  ['G9: both master switches are marked data-master-toggle (one state, two controls)',
    (popupHtml.match(/data-master-toggle/g) || []).length >= 2],
  ['G6: popup.js drives the paused banner from a body class',
    popupJs.includes("classList.toggle('nyt-paused'")],
  ['G7: backup.js carries the key through save/export/import',
    backupJs.includes('extensionEnabled') && backupJs.includes("if ('extensionEnabled' in s)")]
];
for (const [name, pass] of fileChecks) results.push({ name, pass, detail: '' });

let pass = 0, fail = 0;
for (const r of results) {
  if (r.pass) { pass++; console.log('  PASS  ' + r.name); }
  else { fail++; console.log('  FAIL  ' + r.name + (r.detail ? '  [' + r.detail + ']' : '')); }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('\nA master switch that leaves the feed filtered is not a master switch.\n' +
    'F = pause/restore semantics, G = popup + backup carry the same key.');
  process.exit(1);
}
