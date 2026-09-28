/*
 * Regression harness: the shorts filter must never undo a real blacklist.
 *
 * WHY: filterShortsToSubscriptions() and the ordinary channel/keyword/video
 * blacklist both hide cards via hideCardElement(), which flags the element with
 * data-hidden-by-local-blacklist="true". `ytd-rich-item-renderer` is BOTH a feed
 * card (VIDEO_CARD_SELECTORS) and a grid slot, so an unhideShorts() that treated
 * that shared flag as proof-of-shorts-origin un-hid every blacklisted card on the
 * home feed — on every pass, since with the default blockShorts=false processFeed()
 * reaches the `else if (!settings.blockShorts)` branch that calls unhideShorts().
 * The signature fast path in processFeed() then skipped re-hiding it (the card's
 * lastSignature was already written), so the card stayed visible for good.
 *
 * content.js is loaded into a vm context with a minimal DOM, and the real
 * filterShortsToSubscriptions()/unhideShorts()/hideCardElement() run in it.
 *
 * RED/GREEN seam: set CONTENT_JS_PATH to a pre-fix copy of content.js (e.g.
 * `git show HEAD:content.js > /tmp/old-content.js`) and every scenario-A check
 * must FAIL, proving this harness actually catches the regression.
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

// Crude selector matcher: enough for the tag names and [data-*="..."] predicates
// and the single descendant combinator this code path uses.
function matchCompound(el, compound) {
  const tag = compound.split('[')[0].toLowerCase();
  if (!tag || el.tagName.toLowerCase() !== tag) return false;
  const attr = compound.match(/\[([^\]="]+)(?:="([^"]*)")?\]/);
  if (!attr) return true;
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

// Never settle: keeps start()'s loadSettings().then(...) chain from running
// (no MutationObserver, no processFeed) while the functions under test stay live.
const never = () => new Promise(() => {});

const context = {
  console,
  document: makeDocument(),
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
    runtime: { onMessage: { addListener() {} }, lastError: null, sendMessage: () => never(), getURL: (p) => p },
    storage: { local: { get: () => never(), set: () => never() } },
    tabs: { query: () => never(), sendMessage: () => never() }
  }
};
vm.createContext(context);
// content.js reads CLICKBAIT_PATTERNS / DEBait_CLEANERS from shared-tables.js,
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

  // --- Scenario A: an ordinary channel-blacklisted home-feed card ------------
  const card = document.createElement('ytd-rich-item-renderer');
  document.body.appendChild(card);
  hideCardElement(card);
  ok('A1: hideCardElement hides the home-feed card and flags it',
    card.dataset.hiddenByLocalBlacklist === 'true' && card.style.getPropertyValue('display') === 'none',
    'dataset=' + JSON.stringify(card.dataset));

  unhideShorts();
  ok('A2: unhideShorts() must NOT resurrect a channel-blacklisted home-feed card',
    card.dataset.hiddenByLocalBlacklist === 'true' && card.style.getPropertyValue('display') === 'none',
    'dataset=' + JSON.stringify(card.dataset) + ' display=' + card.style.getPropertyValue('display'));

  // --- Scenario B: a reel the shorts filter legitimately hid ----------------
  settings.shortsSubOnly = true;
  settings.blockShorts = false;
  getSubscriptionKeySet = () => new Set(['somechannel']);
  cardIsSubscribed = () => false;

  const reel = document.createElement('ytd-reel-item-renderer');
  document.body.appendChild(reel);
  filterShortsToSubscriptions();
  ok('B1: shorts filter hides the unsubscribed reel', reel.dataset.hiddenByLocalBlacklist === 'true',
    'dataset=' + JSON.stringify(reel.dataset));
  ok('B2: shorts filter records WHY it hid it (nytHiddenByShorts)',
    reel.dataset.nytHiddenByShorts === '1', 'dataset=' + JSON.stringify(reel.dataset));

  unhideShorts();
  ok('B3: unhideShorts restores the shorts-hidden reel',
    reel.dataset.hiddenByLocalBlacklist === undefined && reel.style.getPropertyValue('display') === undefined,
    'dataset=' + JSON.stringify(reel.dataset) + ' display=' + reel.style.getPropertyValue('display'));
  ok('B4: unhideShorts clears the shorts marker',
    reel.dataset.nytHiddenByShorts === undefined, 'dataset=' + JSON.stringify(reel.dataset));

  // --- Scenario C: a watched-channel reel is never touched ------------------
  cardIsSubscribed = () => true;
  settings.shortsSubOnly = true;
  const subReel = document.createElement('ytd-reel-item-renderer');
  document.body.appendChild(subReel);
  filterShortsToSubscriptions();
  ok('C1: subscribed reels are left alone by the shorts filter',
    subReel.dataset.hiddenByLocalBlacklist === undefined, 'dataset=' + JSON.stringify(subReel.dataset));

  // The blacklisted card must have survived every pass above.
  ok('A3: the blacklisted card is still hidden after all passes',
    card.dataset.hiddenByLocalBlacklist === 'true' && card.style.getPropertyValue('display') === 'none',
    'dataset=' + JSON.stringify(card.dataset));

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
  console.log('\nThe shorts filter must only undo its OWN hiding (nytHiddenByShorts).\n' +
    'If A2/A3 failed, unhideShorts() is un-hiding ordinary blacklisted cards again.');
  process.exit(1);
}
