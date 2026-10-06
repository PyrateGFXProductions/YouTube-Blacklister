/*
 * Regression harness: the blacklist must SURVIVE.
 *
 * Four invariants that each produced a user-visible "the extension is broken"
 * report, all of them invisible to a smoke test because they only show up across
 * passes, refreshes, or recycled DOM:
 *
 *   A. AI blocks persist. A verdict lived only in the tab's memory, so the next
 *      processFeed() pass — or any refresh — brought the video back.
 *   B. Keyword rules persist. Extraction auto-removed its own rules five seconds
 *      after the toast, so the feature looked like it never worked.
 *   C. A collapsed grid slot is repaired. YouTube recycles the inner card and
 *      survives the slot, so a slot left at display:none !important was a
 *      permanent blank hole in the feed.
 *   D. Repair never resurrects a card hidden by its OWN rule (channel, keyword,
 *      AI, shorts) — only slots collapsed BY ASSOCIATION are candidates.
 *
 * content.js is loaded into a vm with a minimal DOM + a synchronous in-memory
 * chrome.storage, and the real functions run in it.
 *
 * RED/GREEN seam: CONTENT_JS_PATH=... pointing at a pre-fix copy must fail A/B/D.
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

// Crude selector matcher: tag names, [data-*="..."] predicates, and the single
// descendant combinator this code path uses. Unlike the other harnesses this one
// must also match a BARE attribute selector (`[data-nyt-collapsed-slot="1"]`),
// which is what the collapsed-slot sweep queries with.
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
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
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
    location: { pathname: '/', hash: '', href: 'https://www.youtube.com/' },
    __blkDebug: false
  },
  location: { pathname: '/', hash: '', href: 'https://www.youtube.com/', search: '' },
  history: { pushState() {}, replaceState() {} },
  navigator: { userAgent: 'node-harness' },
  MutationObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  setTimeout, clearTimeout, setInterval, clearInterval,
  URL, DOMParser: class { parseFromString() { return { getElementsByTagName: () => [] }; } },
  chrome: {
    // `id` must be truthy or content.js's isExtensionValid() short-circuits every
    // storage write — which is exactly the bug this harness is meant to catch, so
    // without it the harness would fail for the wrong reason.
    runtime: { id: 'blocking-invariants-harness', onMessage: { addListener() {} }, lastError: null, sendMessage: () => never(), getURL: (p) => p },
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

  // ---- toast capture (so Undo callbacks are reachable) ----------------------
  let lastToast = null;
  let lastUndo = null;
  showToast = function (msg, onUndo) { lastToast = msg; lastUndo = onUndo || null; };

  // =========================================================================
  // A. AI blocks persist across passes and refreshes
  // =========================================================================
  persistAiDecisions([{ key: 'vid_blocked', state: 'blocked', id: 'vid_blocked', title: 'Slop Video' }], []);
  ok('A1: a persisted AI block is live immediately (optimistic in-memory update)',
    isAiBlocked('vid_blocked', 'Slop Video') === true, 'isAiBlocked=false');
  ok('A2: the AI block reached storage',
    Array.isArray(store.nyt_aiDecisions) && store.nyt_aiDecisions.length === 1 &&
    store.nyt_aiDecisions[0].key === 'vid_blocked',
    'stored=' + JSON.stringify(store.nyt_aiDecisions));

  // Simulate a full page reload: memory wiped, then rehydrated from storage.
  applyAiDecisions([]);
  ok('A3: memory really was wiped (control for A4)', isAiBlocked('vid_blocked', 'Slop Video') === false);
  applyAiDecisions(store.nyt_aiDecisions);
  ok('A4: rehydrating from storage restores the block (survives a refresh)',
    isAiBlocked('vid_blocked', 'Slop Video') === true, 'isAiBlocked=false');

  ok('A5: identity falls back to the title when a card exposes no id',
    isAiBlocked('', 'Slop Video') === false, 'a vid-keyed block must not match a bare title');
  persistAiDecisions([{ key: 't:no id here', state: 'blocked', title: 'No Id Here' }], []);
  ok('A6: a title-keyed decision matches by title', isAiBlocked('', 'No Id Here') === true);

  // An entry the user explicitly undid must be REMEMBERED but never re-blocked.
  persistAiDecisions([{ key: 'vid_allowed', state: 'allowed', id: 'vid_allowed', title: 'Made By Me' }], []);
  ok('A7: an "allowed" verdict is handled but not blocked',
    isAiHandled('vid_allowed', 'Made By Me') === true && isAiBlocked('vid_allowed', 'Made By Me') === false,
    'handled=' + isAiHandled('vid_allowed', 'Made By Me') + ' blocked=' + isAiBlocked('vid_allowed', 'Made By Me'));

  persistAiDecisions([], ['vid_blocked']);
  ok('A8: removing a decision drops it from memory and storage',
    isAiBlocked('vid_blocked', 'Slop Video') === false &&
    !store.nyt_aiDecisions.some(e => e.key === 'vid_blocked'),
    'stored=' + JSON.stringify(store.nyt_aiDecisions.map(e => e.key)));

  // =========================================================================
  // B. Keyword rules persist (and Undo removes them)
  // =========================================================================
  settings.keywords = [];
  store.keywords = [];

  const added = addExtractedKeywords(['crypto signals', 'get rich quick'], '(test)');
  // Capture the Undo NOW: any later toast (e.g. the duplicate no-op below) replaces
  // lastUndo, so reading it after another call would exercise the wrong callback.
  const undoAdded = lastUndo;
  ok('B1: extracted keywords are persisted, not just toasted',
    added === true && store.keywords.includes('crypto signals') && store.keywords.includes('get rich quick'),
    'store=' + JSON.stringify(store.keywords));
  ok('B2: in-memory settings agree with storage right away (next pass sees them)',
    settings.keywords.includes('crypto signals') && settings.keywords.includes('get rich quick'),
    'settings=' + JSON.stringify(settings.keywords));
  ok('B3: the toast offers an Undo instead of auto-removing the rules',
    typeof undoAdded === 'function', 'toast=' + String(lastToast) + ' undo=' + typeof undoAdded);

  ok('B4: adding the same keywords again is a no-op', addExtractedKeywords(['crypto signals'], '') === false);

  undoAdded();
  ok('B5: Undo removes exactly the rules it added',
    !store.keywords.includes('crypto signals') && !store.keywords.includes('get rich quick') &&
    !settings.keywords.includes('crypto signals'),
    'store=' + JSON.stringify(store.keywords));

  // Mixed case must land in storage in the canonical (lowercase) form, or the
  // whole-word matcher — which lowercases at match time — would still work while
  // the popup list showed duplicates.
  addExtractedKeywords(['  Mixed Case  '], '');
  ok('B6: rules are stored in canonical lowercase form',
    store.keywords.includes('mixed case') && !store.keywords.includes('  Mixed Case  '),
    'store=' + JSON.stringify(store.keywords));

  // A rule that already exists must not be blocked-and-added twice.
  const before = store.keywords.length;
  addExtractedKeywords(['MIXED CASE'], '');
  ok('B7: case-insensitive duplicate check', store.keywords.length === before,
    'store=' + JSON.stringify(store.keywords));

  // =========================================================================
  // C. A collapsed grid slot is repaired (no permanent blank hole)
  // =========================================================================
  const slot = document.createElement('ytd-rich-item-renderer');
  const inner = document.createElement('ytd-rich-grid-media');
  slot.appendChild(inner);
  document.body.appendChild(slot);

  hideCardElement(inner);
  ok('C1: hiding a card inside a grid slot collapses the slot',
    slot.style.getPropertyValue('display') === 'none' && inner.style.getPropertyValue('display') === 'none',
    'slot=' + slot.style.getPropertyValue('display'));
  ok('C2: the slot is marked as collapsed BY ASSOCIATION (its own flag)',
    slot.dataset.nytCollapsedSlot === '1' && inner.dataset.nytCollapsedSlot === undefined,
    'dataset=' + JSON.stringify(slot.dataset));

  // YouTube recycles the inner node: the slot survives, the inner card is gone.
  inner.remove();
  const recycled = document.createElement('ytd-rich-grid-media');
  slot.appendChild(recycled);
  ok('C3: the slot is still collapsed after the inner card was recycled',
    slot.style.getPropertyValue('display') === 'none');

  unhideCardElement(recycled);
  ok('C4: unhideCardElement repairs the slot even though THIS node was never flagged',
    slot.style.getPropertyValue('display') === undefined && slot.dataset.nytCollapsedSlot === undefined,
    'display=' + slot.style.getPropertyValue('display') + ' dataset=' + JSON.stringify(slot.dataset));

  // The sweep must repair a slot left collapsed with nothing hidden inside it.
  const orphanSlot = document.createElement('ytd-rich-item-renderer');
  const orphanCard = document.createElement('ytd-rich-grid-media');
  orphanSlot.appendChild(orphanCard);
  document.body.appendChild(orphanSlot);
  hideCardElement(orphanCard);
  delete orphanCard.dataset.hiddenByLocalBlacklist; // rule removed / node reused
  reconcileCollapsedSlots();
  ok('C5: reconcileCollapsedSlots() repairs a stale collapsed slot',
    orphanSlot.style.getPropertyValue('display') === undefined && orphanSlot.dataset.nytCollapsedSlot === undefined,
    'display=' + orphanSlot.style.getPropertyValue('display') + ' dataset=' + JSON.stringify(orphanSlot.dataset));

  // =========================================================================
  // D. Repair never resurrects a card hidden by its OWN rule
  // =========================================================================
  const ownCard = document.createElement('ytd-rich-item-renderer');
  document.body.appendChild(ownCard);
  hideCardElement(ownCard);
  reconcileCollapsedSlots();
  ok('D1: a card hidden by its own rule is not a collapsed slot and survives the sweep',
    ownCard.style.getPropertyValue('display') === 'none' &&
    ownCard.dataset.hiddenByLocalBlacklist === 'true' &&
    ownCard.dataset.nytCollapsedSlot === undefined,
    'display=' + ownCard.style.getPropertyValue('display') + ' dataset=' + JSON.stringify(ownCard.dataset));

  // A reel the shorts filter hid carries the shared hidden flag but never the
  // collapsed-slot flag — the sweep must leave it exactly as it found it.
  const reel = document.createElement('ytd-reel-item-renderer');
  document.body.appendChild(reel);
  hideCardElement(reel);
  reel.dataset.nytHiddenByShorts = '1';
  reconcileCollapsedSlots();
  ok('D2: a shorts-hidden reel survives the collapsed-slot sweep',
    reel.style.getPropertyValue('display') === 'none' && reel.dataset.nytHiddenByShorts === '1',
    'display=' + reel.style.getPropertyValue('display') + ' dataset=' + JSON.stringify(reel.dataset));

  // A slot that still CONTAINS a hidden card must stay collapsed.
  const occupied = document.createElement('ytd-rich-item-renderer');
  const occupiedInner = document.createElement('ytd-rich-grid-media');
  occupied.appendChild(occupiedInner);
  document.body.appendChild(occupied);
  hideCardElement(occupiedInner);
  reconcileCollapsedSlots();
  ok('D3: a slot that still contains a hidden card stays collapsed',
    occupied.style.getPropertyValue('display') === 'none' && occupied.dataset.nytCollapsedSlot === '1',
    'display=' + occupied.style.getPropertyValue('display'));

  // =========================================================================
  // E. One shared tokenizer (content script + service worker agree)
  // =========================================================================
  const cand = keywordCandidates('The Best 5 Crypto Signals Video!!', 8);
  ok('E1: stop words and short tokens are dropped',
    !cand.includes('the') && !cand.includes('best') && !cand.includes('video') && cand.includes('crypto'),
    'cand=' + JSON.stringify(cand));
  ok('E2: the topic words survive the shared tokenizer (order is relevance, not position)',
    cand.indexOf('crypto') >= 0 && cand.indexOf('crypto') < cand.length,
    'cand=' + JSON.stringify(cand));
  ok('E3: the cap is honoured', keywordCandidates('alpha bravo charlie delta echo foxtrot', 3).length === 3,
    'cand=' + JSON.stringify(keywordCandidates('alpha bravo charlie delta echo foxtrot', 3)));
  ok('E4: garbage in -> empty list',
    keywordCandidates('', 8).length === 0 && keywordCandidates(null, 8).length === 0 &&
    keywordCandidates('the a an and or of to', 8).length === 0,
    'cand=' + JSON.stringify(keywordCandidates('the a an and or of to', 8)));
  ok('E5: the content script extracts through the shared ranker (no forked tokenizer)',
    typeof rankKeywordCandidates === 'function' && typeof nytKwIsGenericRule === 'function' &&
    rankKeywordCandidates({ title: 'The Best 5 Crypto Signals Video!!' }, 8).includes('crypto'),
    'ranker=' + typeof rankKeywordCandidates + ' got=' +
    JSON.stringify(rankKeywordCandidates({ title: 'The Best 5 Crypto Signals Video!!' }, 8)));

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

let pass = 0, fail = 0;
for (const r of results) {
  if (r.pass) { pass++; console.log('  PASS  ' + r.name); }
  else { fail++; console.log('  FAIL  ' + r.name + (r.detail ? '  [' + r.detail + ']' : '')); }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('\nA blacklist that does not survive the next pass is not a blacklist.\n' +
    'A = AI verdict persistence, B = keyword persistence, C/D = collapsed grid slots.');
  process.exit(1);
}
