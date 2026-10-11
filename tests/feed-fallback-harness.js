/*
 * Feed Fallback harness — the empty-Home safety net.
 *
 * YouTube has a confirmed failure class where Home serves an EMPTY recommendation grid
 * (HTTP 200, zero cards). The fallback renders the user's subscribed-channel uploads from
 * a local cache in that state, and never fires when YouTube actually served cards.
 *
 * Driven here through the REAL functions in a vm with a DOM stub:
 *   D1-D6   feedFallbackDecision: the pure gate (home, master, feature, cards, sources, cooldown)
 *   R1-R4   recordFeedFallbackCards: validation, merge-by-id, timestamp refresh, cap
 *   V1-V4   buildFeedFallbackViewModel: ordering, dedupe, cap, staleness
 *   E1-E3   end-to-end: empty YouTube + warm cache -> panel; served cards -> no panel;
 *           pause -> no panel and no work
 *
 * RED/GREEN seam: CONTENT_JS_PATH at a pre-feature copy fails D1/V1/E1 (symbol absent)
 * rather than crashing — see the typeof guards.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const REPO = path.join(__dirname, '..');
const CONTENT_PATH = process.env.CONTENT_JS_PATH || path.join(REPO, 'content.js');
if (!fs.existsSync(CONTENT_PATH)) {
  console.error('content.js not found at ' + CONTENT_PATH);
  process.exit(1);
}

// ---------------------------------------------------------------- DOM stub --
// Same faithful model the blocking audit harness uses (attribute operators, inherited
// textContent, parentNode removal, classList.toggle(force)).
function makeStyle() {
  const props = {};
  return {
    setProperty(k, v) { props[k] = v; },
    removeProperty(k) { delete props[k]; },
    getPropertyValue(k) { return props[k]; }
  };
}
function matchCompound(el, compound) {
  const nots = [];
  compound = compound.replace(/:not\(([^)]*)\)/g, (m, inner) => { nots.push(inner); return ''; });
  for (const n of nots) if (matchCompound(el, n)) return false;
  let rest = compound;
  const idMatches = rest.match(/#[A-Za-z0-9_-]+/g) || [];
  rest = rest.replace(/#[A-Za-z0-9_-]+/g, '');
  for (const i of idMatches) {
    if (String(el.id || el.getAttribute('id') || '') !== i.slice(1)) return false;
  }
  const classMatches = rest.match(/\.[A-Za-z0-9_-]+/g) || [];
  rest = rest.replace(/\.[A-Za-z0-9_-]+/g, '');
  const cls = String(el.className || '');
  for (const c of classMatches) {
    if (!cls.split(/\s+/).includes(c.slice(1))) return false;
  }
  const tag = rest.split('[')[0].trim().toLowerCase();
  if (tag && tag !== '*' && el.tagName.toLowerCase() !== tag) return false;
  const attrRe = /\[([^\]]+)\]/g;
  let a;
  let hadAttr = false;
  while ((a = attrRe.exec(rest)) !== null) {
    hadAttr = true;
    const m = a[1].match(/^([A-Za-z0-9_-]+)\s*(\^=|\*=|\$=|=)?\s*"?([^"]*)"?$/);
    if (!m) return false;
    const [, name, op, val] = m;
    const actual = el.getAttribute(name);
    if (actual == null) return false;
    if (op === '=' && actual !== val) return false;
    if (op === '*=' && !actual.includes(val)) return false;
    if (op === '^=' && !actual.startsWith(val)) return false;
    if (op === '$=' && !actual.endsWith(val)) return false;
  }
  return Boolean(tag || classMatches.length || idMatches.length || hadAttr);
}
function matchChain(el, part) {
  const compounds = part.trim().split(/\s+/).filter(Boolean);
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
  const attrs = {};
  const el = {
    tagName: String(tagName).toUpperCase(),
    dataset: {},
    id: '',
    className: '',
    parentElement: null,
    parentNode: null,
    children: [],
    isConnected: true,
    offsetParent: {},
    style: makeStyle(),
    _text: '',
    get textContent() {
      if (el.children.length) return el.children.map((c) => c.textContent).join('');
      return el._text;
    },
    set textContent(v) { el._text = String(v == null ? '' : v); el.children.length = 0; },
    classList: {
      contains: (c) => String(el.className).split(/\s+/).includes(c),
      add(c) { if (!el.classList.contains(c)) el.className = (el.className ? el.className + ' ' : '') + c; },
      remove(c) { el.className = String(el.className).split(/\s+/).filter(x => x && x !== c).join(' '); },
      toggle(c, force) { const on = force === undefined ? !el.classList.contains(c) : force; on ? el.classList.add(c) : el.classList.remove(c); }
    },
    appendChild(c) { c.parentElement = el; c.parentNode = el; el.children.push(c); return c; },
    removeChild(c) { el.children = el.children.filter(x => x !== c); if (c.parentElement === el) { c.parentElement = null; c.parentNode = null; } return c; },
    remove() { if (el.parentElement) el.parentElement.removeChild(el); },
    closest(sel) { let n = el; while (n) { if (matchesSelector(n, sel)) return n; n = n.parentElement; } return null; },
    matches(sel) { return matchesSelector(el, sel); },
    contains(n) { if (n === el) return true; let p = n && n.parentElement; while (p) { if (p === el) return true; p = p.parentElement; } return false; },
    querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) { return descendants(el).filter(n => matchesSelector(n, sel)); },
    addEventListener() {}, removeEventListener() {},
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(attrs, n) ? attrs[n] : null; },
    setAttribute(n, v) { attrs[n] = String(v); },
    removeAttribute(n) { delete attrs[n]; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; }
  };
  return el;
}
function makeDocument() {
  const body = makeEl('body');
  return {
    body,
    head: makeEl('head'),
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

const never = () => new Promise(() => {});
const document = makeDocument();
const store = {};   // the synchronous in-memory chrome.storage.local the tests drive
const context = {
  console,
  document,
  makeEl,
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
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
    runtime: { id: 'feed-fallback-harness', onMessage: { addListener() {} }, lastError: null, sendMessage: () => never(), getURL: (p) => p },
    storage: { local: { get: () => never(), set: () => never() } },
    tabs: { query: () => never(), sendMessage: () => never() }
  }
};
context.__storeRef = store;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(REPO, 'shared-tables.js'), 'utf8'), context, { filename: 'shared-tables.js' });
vm.runInContext(fs.readFileSync(CONTENT_PATH, 'utf8'), context, { filename: CONTENT_PATH });

const script = `
(async function () {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });
  const __store = __storeRef;   // in-memory chrome.storage.local, defined in the host scope

  // A pre-feature file has none of these symbols: report FAILED assertions, never crash.
  const hasDecider = typeof feedFallbackDecision === 'function';
  const hasRecord = typeof recordFeedFallbackCards === 'function';
  const hasVm = typeof buildFeedFallbackViewModel === 'function';
  const hasCheck = typeof checkFeedFallback === 'function';
  ok('SEAM: the feed fallback symbols exist in the file under test', hasDecider && hasRecord && hasVm && hasCheck,
     'decider=' + hasDecider + ' record=' + hasRecord + ' vm=' + hasVm + ' check=' + hasCheck);
  if (!hasDecider || !hasRecord || !hasVm || !hasCheck) {
    return out;   // RED run against a pre-feature file ends here with the seam failure.
  }

  // Synchronous in-memory storage, swapped in AFTER load (the script reads it at call time).
  chrome.storage.local = {
    get: (keys, cb) => {
      const list = Array.isArray(keys) ? keys : [keys];
      const res = {};
      for (const k of list) if (k in __store) res[k] = __store[k];
      cb(res);
    },
    set: (obj, cb) => { Object.assign(__store, obj); if (cb) cb(); }
  };

  const now = Date.now();
  const DAY = 86400000;

  // ============ D. the pure decider ============
  ok('D1: fires on empty Home with a warm cache',
     feedFallbackDecision({ isHome: true, enabled: true, featureOn: true, busy: false, totalCards: 0, cooldownRemaining: 0, cache: [{ videoId: 'x' }], subs: [] }).go === true);
  ok('D2: fires on empty Home with ONLY a subscription list (live-only)',
     feedFallbackDecision({ isHome: true, enabled: true, featureOn: true, busy: false, totalCards: 0, cooldownRemaining: 0, cache: [], subs: [{ name: 'a' }] }).go === true);
  ok('D3: REFUSES when YouTube served cards (never competes with a real feed)',
     feedFallbackDecision({ isHome: true, enabled: true, featureOn: true, busy: false, totalCards: 12, cooldownRemaining: 0, cache: [{ videoId: 'x' }], subs: [] }).reason === 'youtube-served');
  ok('D4: refuses when the extension is paused or the feature is off',
     feedFallbackDecision({ isHome: true, enabled: false, featureOn: true, busy: false, totalCards: 0, cooldownRemaining: 0, cache: [{ videoId: 'x' }], subs: [] }).go === false &&
     feedFallbackDecision({ isHome: true, enabled: true, featureOn: false, busy: false, totalCards: 0, cooldownRemaining: 0, cache: [{ videoId: 'x' }], subs: [] }).go === false);
  ok('D5: refuses off-Home (a watch page with zero cards is not an empty feed)',
     feedFallbackDecision({ isHome: false, enabled: true, featureOn: true, busy: false, totalCards: 0, cooldownRemaining: 0, cache: [{ videoId: 'x' }], subs: [] }).reason === 'not-home');
  ok('D6: no source at all (no cache, no subs) -> honest no-source, not a blank panel',
     feedFallbackDecision({ isHome: true, enabled: true, featureOn: true, busy: false, totalCards: 0, cooldownRemaining: 0, cache: [], subs: [] }).reason === 'no-source');
  ok('D7: cooldown and busy hold it down (no thrash)',
     feedFallbackDecision({ isHome: true, enabled: true, featureOn: true, busy: false, totalCards: 0, cooldownRemaining: 30000, cache: [{ videoId: 'x' }], subs: [] }).reason === 'cooldown' &&
     feedFallbackDecision({ isHome: true, enabled: true, featureOn: true, busy: true, totalCards: 0, cooldownRemaining: 0, cache: [{ videoId: 'x' }], subs: [] }).reason === 'busy');

  // ============ R. the cache writer ============
  const r1 = recordFeedFallbackCards([
    { videoId: 'AAAAAAAAAAA', title: '  Spaced   Title  ', channel: '  Some Channel ', t: now },
    { videoId: 'BBBBBBBBBBB', title: 'Second', channel: 'Chan2', t: now },
    { videoId: '', title: 'no id', channel: 'Chan3', t: now },      // unusable: no videoId
    { title: 'no channel', videoId: 'CCCCCCCCCCC', t: now },        // unusable: no channel
    null
  ]);
  ok('R1: invalid entries are rejected, valid ones counted', r1 === 2, 'returned ' + r1);
  const cacheAfterR1 = await new Promise(r => chrome.storage.local.get(['nyt_feedCache'], (s) => r(s.nyt_feedCache || [])));
  ok('R2: stored cleaned entries under nyt_feedCache',
     cacheAfterR1.length === 2 && cacheAfterR1[0].videoId === 'AAAAAAAAAAA' &&
     cacheAfterR1[0].title === 'Spaced   Title' && cacheAfterR1[0].channel === 'Some Channel',
     JSON.stringify(cacheAfterR1));

  // Merge, not replace: a second sighting of one id UPDATES it and keeps the other.
  const r2 = recordFeedFallbackCards([
    { videoId: 'AAAAAAAAAAA', title: 'Spaced   Title', channel: 'Some Channel', t: now + DAY },
    { videoId: 'DDDDDDDDDDD', title: 'New arrival', channel: 'Chan4', t: now + DAY }
  ]);
  const cacheAfterR2 = await new Promise(r => chrome.storage.local.get(['nyt_feedCache'], (s) => r(s.nyt_feedCache || [])));
  ok('R3: a re-encounter merges by videoId (no duplicate), and new entries join',
     r2 === 2 && cacheAfterR2.length === 3 &&
     cacheAfterR2.filter(e => e.videoId === 'AAAAAAAAAAA').length === 1 &&
     cacheAfterR2.some(e => e.videoId === 'DDDDDDDDDDD'),
     JSON.stringify(cacheAfterR2.map(e => e.videoId)));
  ok('R4: the refreshed entry carries the NEW timestamp (recency, not first-seen)',
     (cacheAfterR2.find(e => e.videoId === 'AAAAAAAAAAA') || {}).t === now + DAY);

  // ============ V. the view model ============
  const cache = [
    { videoId: 'EEEEEEEEEEE', title: 'fresh one', channel: 'A', t: now - DAY },
    { videoId: 'FFFFFFFFFFF', title: 'day old', channel: 'B', t: now - 2 * DAY },
    { videoId: 'EEEEEEEEEEE', title: 'duplicate id', channel: 'A', t: now - 3 * DAY },
    { videoId: 'GGGGGGGGGGG', title: 'ancient', channel: 'C', t: now - 30 * DAY },
    { videoId: '', title: 'unusable', channel: 'D', t: now }
  ];
  const vm1 = buildFeedFallbackViewModel(cache, 10);
  ok('V1: newest first, deduped by videoId, invalid dropped',
     vm1.length === 3 && vm1[0].videoId === 'EEEEEEEEEEE' && vm1[1].videoId === 'FFFFFFFFFFF' && vm1[2].videoId === 'GGGGGGGGGGG',
     JSON.stringify(vm1.map(v => v.videoId)));
  ok('V2: ageDays computed from t (1 day old -> 1)',
     vm1[1].ageDays === 2, 'ageDays=' + vm1[1].ageDays);
  ok('V3: a >14-day-old entry is flagged stale, fresh ones are not',
     vm1[2].stale === true && vm1[0].stale === false);
  const vm2 = buildFeedFallbackViewModel(cache, 2);
  ok('V4: the limit caps the panel (and keeps the newest)',
     vm2.length === 2 && vm2[0].videoId === 'EEEEEEEEEEE');

  // ============ E. end-to-end through checkFeedFallback ============
  // Subscriptions present so the live top-up path has something to iterate (it fetches,
  // which the harness stub cannot answer — its failures are the exact "live refused" case).
  await new Promise(r => { loadSettings().then(r); });
  settings.subsSnapshot = [{ name: 'Chan', url: 'https://www.youtube.com/@chan' }];
  settings.extensionEnabled = true;
  settings.feedFallback = true;
  location.pathname = '/';

  // E1: empty Home + warm cache -> panel rendered from the cache.
  recordFeedFallbackCards([{ videoId: 'HHHHHHHHHHH', title: 'cached video', channel: 'Chan', t: now - DAY }]);
  const e1 = await checkFeedFallback('silent');
  const panel = document.body.children.find(n => n.id === 'nyt-feed-fallback');
  const items1 = (panel && panel.querySelectorAll('.nyt-fallback-item')) || [];
  const e1item = items1.find(i => String(i.getAttribute('href')).indexOf('HHHHHHHHHHH') !== -1);
  ok('E1: empty Home renders the fallback panel from cache (the freshly cached video is in it, with its channel)',
     e1 === 'shown' && !!panel && items1.length > 0 && !!e1item &&
     e1item.getAttribute('href') === 'https://www.youtube.com/watch?v=HHHHHHHHHHH' &&
     String(e1item.textContent).includes('cached video') && String(e1item.textContent).includes('Chan'),
     'result=' + e1 + ' panel=' + !!panel + ' items=' + items1.length +
     ' found=' + !!e1item +
     ' text=' + (e1item && JSON.stringify(String(e1item.textContent))));

  // E2: YouTube serves cards -> the panel is removed again (never competes).
  const ytCard = makeEl('ytd-rich-item-renderer');
  document.body.appendChild(ytCard);
  const e2 = await checkFeedFallback('silent');
  const panelGone = !document.body.children.find(n => n.id === 'nyt-feed-fallback');
  ok('E2: YouTube serving cards removes the fallback panel',
     e2 === 'youtube-served' && panelGone, 'result=' + e2);
  ytCard.remove();

  // E3: paused -> no panel and no work (the exact paused contract).
  settings.extensionEnabled = false;
  const e3 = await checkFeedFallback('silent');
  ok('E3: paused extension builds nothing',
     e3 === 'disabled' && !document.body.children.find(n => n.id === 'nyt-feed-fallback'), 'result=' + e3);
  settings.extensionEnabled = true;

  // E4: no source at all -> honest no-data, still no panel.
  __store.nyt_feedCache = [];
  settings.subsSnapshot = [];
  const e4 = await checkFeedFallback('silent');
  ok('E4: no cache and no subscriptions -> no-source/no-data, never an empty panel',
     (e4 === 'no-source' || e4 === 'no-data') && !document.body.children.find(n => n.id === 'nyt-feed-fallback'),
     'result=' + e4);

  return out;
})()
`;

(async () => {
  let results;
  try {
    results = await vm.runInContext(script, context, { filename: 'feed-fallback-harness.js' });
  } catch (e) {
    console.error('HARNESS CRASH (this is a bug in the harness or the file under test):');
    console.error(e && e.stack ? e.stack : String(e));
    process.exit(1);
  }
  let fail = 0;
  for (const r of results) {
    if (!r.pass) fail++;
    console.log((r.pass ? '  PASS  ' : '  FAIL  ') + r.name + (r.pass || !r.detail ? '' : '  — ' + r.detail));
  }
  console.log('\\n' + (results.length - fail) + ' passed, ' + fail + ' failed');
  // The content script registers timers (feed watch); end the process explicitly.
  process.exit(fail ? 1 : 0);
})();
