/*
 * End-to-end audit harness: the extension's two user-facing promises.
 *
 *   1. "It blocks channels."  — a rule the user saved must match the card on EVERY
 *      surface it renders on (display name, @handle, channel id, channel URL), must not
 *      match a different channel by fragment, must survive a reload, and must lose to the
 *      whitelist.
 *   2. "It parses keywords from titles." — a rule that comes out of a title must MATCH
 *      that title through the real matcher, must never be a word that describes nothing,
 *      and must not be able to blank the whole feed.
 *
 * content.js runs in a vm with a DOM stub that is faithful where it matters — an attribute
 * map (so `a[href*="/@"]` matches), `#id` / `.class` / substring attribute selectors, and a
 * synchronous in-memory chrome.storage. Every assertion runs against the REAL functions.
 *
 * RED/GREEN seam: CONTENT_JS_PATH=... pointing at a pre-fix copy (git show HEAD:content.js)
 * must FAIL — A8-A10, B4/B5, C9/C12/C13, D3, F1, G4/G5 are the regressions it pins.
 *
 * Section H is static + functional cross-file wiring: the state keys ride content
 * RULE_KEYS, the content load list, the popup load list, the popup save payload and the
 * backup export/import round trip. A key missing from any one of them is a rule that
 * silently stops re-applying or vanishes on the next export/import.
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
function makeStyle() {
  const props = {};
  return {
    setProperty(k, v) { props[k] = v; },
    removeProperty(k) { delete props[k]; },
    getPropertyValue(k) { return props[k]; }
  };
}

// Tag / #id / .class / [attr] / [attr*="x"] compounds, :not(...), descendant combinator.
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
    if (!op) continue;
    if (op === '=' && actual !== val) return false;
    if (op === '*' && !actual.includes(val)) return false;
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
    // `textContent` INHERITS from children, like the real DOM. The stub used to be a
    // plain '' field, so a card whose channel name lived in a descendant <span> read as
    // an EMPTY channel — which made a correctly-working identity match look broken and,
    // worse, made an exemption test pass for the wrong reason. `_text` holds a node's own
    // text; a write to `textContent` sets that node only, as in the DOM.
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
    // `id` must be truthy or isExtensionValid() short-circuits every storage write.
    runtime: { id: 'blocking-keyword-audit-harness', onMessage: { addListener() {} }, lastError: null, sendMessage: () => never(), getURL: (p) => p },
    storage: { local: { get: () => never(), set: () => never() } },
    tabs: { query: () => never(), sendMessage: () => never() }
  }
};
vm.createContext(context);
// The manifest injects shared-tables.js ahead of content.js — mirror it.
vm.runInContext(fs.readFileSync(path.join(REPO, 'shared-tables.js'), 'utf8'), context, { filename: 'shared-tables.js' });
vm.runInContext(fs.readFileSync(CONTENT_PATH, 'utf8'), context, { filename: CONTENT_PATH });

// ------------------------------------------------------------- test script --
const script = `
(async function () {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });

  // Symbols a pre-fix file does not have must produce a FAILED assertion, not a crash —
  // otherwise the RED run cannot report which invariant broke.
  const hasChannelNameText = typeof isChannelNameText === 'function';
  const channelNameText = (v) => (hasChannelNameText ? isChannelNameText(v) : undefined);

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
  const loaded = () => new Promise(r => { loadSettings().then(r); });

  // ===================== A. the keyword matcher =====================
  ok('A1: "prison" matches a title containing it', hasWordBoundaryKeyword('Prison Break Story', 'prison') === true);
  ok('A2: word boundary — "prison" does NOT match "imprisonment"', hasWordBoundaryKeyword('How imprisonment works', 'prison') === false);
  ok('A3: a "#music" rule matches a literal #music', hasWordBoundaryKeyword('Top #music picks', '#music') === true);
  ok('A4: a "C++" rule matches a literal C++', hasWordBoundaryKeyword('Learn C++ fast', 'C++') === true);
  ok('A5: an empty rule never matches', hasWordBoundaryKeyword('anything at all', '') === false);
  ok('A6: a regex rule matches', hasWordBoundaryKeyword('10 things you missed', '/^\\\\d+ things?/i') === true);
  ok('A7: and does not match when it should not', hasWordBoundaryKeyword('A calm video', '/\\\\b(moon|mars)\\\\b/i') === false);

  // A rule that NORMALIZES AWAY (cleanChannelText strips YouTube's "verified" word and its
  // badge glyphs) used to compile to \\b\\b — an expression that matches every title, so one
  // such rule blanked the entire feed.
  ok('A8: a "verified" rule does not match a title without it',
    hasWordBoundaryKeyword('How to verify your account', 'verified') === false,
    'matched=' + hasWordBoundaryKeyword('How to verify your account', 'verified'));
  ok('A9: a whitespace-only rule matches nothing',
    hasWordBoundaryKeyword('Any title at all', '   ') === false,
    'matched=' + hasWordBoundaryKeyword('Any title at all', '   '));
  ok('A10: a badge-glyph rule matches nothing',
    hasWordBoundaryKeyword('Any title at all', '✓') === false,
    'matched=' + hasWordBoundaryKeyword('Any title at all', '✓'));

  // ===================== B. row text vs channel identity =====================
  ok('B1: "3d ago" is time text', isViewCountOrTimeText('3d ago') === true);
  ok('B2: "1.2M views" is view text', isViewCountOrTimeText('1.2M views') === true);
  ok('B3: "MrBeast" is a channel name', isViewCountOrTimeText('MrBeast') === false);
  // The row classifier legitimately rejects these (a compact row can render "1900" for the
  // views); as a channel IDENTITY they are real channels, and asking the row question here
  // deleted the user's saved rule on every load.
  ok('B4: a numeric channel name ("1900") is a usable identity',
    channelNameText('1900') === true,
    'isChannelNameText("1900")=' + channelNameText('1900') + ' rowClassifier=' + isViewCountOrTimeText('1900'));
  ok('B5: a channel named "Live" is a usable identity',
    channelNameText('Live') === true,
    'isChannelNameText("Live")=' + channelNameText('Live'));
  ok('B6: the row classifier stays strict (control for B4/B5)',
    isViewCountOrTimeText('1.2M views 8d ago') === true && channelNameText('3d ago') === false &&
    channelNameText('') === false && channelNameText(null) === false);

  // ---------------- build a realistic feed card ----------------
  function buildCard(opts) {
    const card = makeEl(opts.tag || 'ytd-rich-item-renderer');
    card.dataset.videoId = opts.vid || '';
    if (opts.handle || opts.channelId) {
      const owner = makeEl('div'); owner.setAttribute('id', 'owner'); card.appendChild(owner);
      const cn = makeEl('ytd-channel-name'); owner.appendChild(cn);
      const a = makeEl('a');
      a.setAttribute('href', opts.channelId ? ('/channel/' + opts.channelId) : ('/@' + opts.handle.replace(/^@/, '')));
      if (opts.name) a.textContent = opts.name;
      cn.appendChild(a);
    } else if (opts.name) {
      const owner = makeEl('div'); owner.setAttribute('id', 'owner'); card.appendChild(owner);
      const cn = makeEl('ytd-channel-name'); owner.appendChild(cn);
      const span = makeEl('span'); span.textContent = opts.name; cn.appendChild(span);
    }
    if (opts.title) {
      const t = makeEl('a'); t.setAttribute('id', 'video-title'); t.textContent = opts.title; card.appendChild(t);
    }
    document.body.appendChild(card);
    return card;
  }
  function clearFeed() { document.body.children = []; }

  // ===================== C. channel blocking =====================
  clearFeed();
  let card = buildCard({ name: 'MrBeast', handle: '@MrBeast', title: 'I gave away a private island' });
  ok('C1: a display-name rule blocks the card', channelMatches(card, ['MrBeast']) === true);
  ok('C2: an "@handle" rule blocks the card', channelMatches(card, ['@MrBeast']) === true);
  ok('C3: a lowercase rule blocks the card', channelMatches(card, ['mrbeast']) === true);
  ok('C4: a channel URL rule blocks the card', channelMatches(card, ['https://www.youtube.com/@MrBeast']) === true);

  clearFeed();
  card = buildCard({ name: 'Samsung Official', handle: '@samsung', title: 'Galaxy S26 review' });
  ok('C5: a short fragment ("sam") must NOT match "Samsung Official"', channelMatches(card, ['sam']) === false);
  ok('C6: the real name still does (control for C5)', channelMatches(card, ['samsung official']) === true);

  clearFeed();
  card = buildCard({ name: 'Some Channel', channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA', title: 'A video' });
  ok('C7: a stored channel ID blocks a card that only renders the ID',
    channelMatches(card, ['UCX6OQ3DkcsbYNE6H8uQQuVA']) === true);

  clearFeed();
  card = buildCard({ name: '1900', handle: '@1900', title: 'Old recordings archive' });
  ok('C8: a numeric channel can be blocked', channelMatches(card, ['1900']) === true,
    'keys=' + JSON.stringify(getCardChannelKeys(card)));
  ok('C9: getChannelName() reads a numeric channel back', getChannelName(card) === '1900',
    'got=' + JSON.stringify(getChannelName(card)));

  clearFeed();
  card = buildCard({ name: 'Live', handle: '@live', title: 'Always-on stream' });
  ok('C10: a channel named "Live" can be blocked', channelMatches(card, ['live']) === true,
    'name=' + JSON.stringify(getChannelName(card)));

  clearFeed();
  card = buildCard({ name: 'Sam & Nebula', handle: '@samandnebula', title: 'Collab special' });
  ok('C11: a multi-word name is not split into poisoning fragments',
    getCardChannelKeys(card).every(k => k === 'sam & nebula' || k === 'samandnebula' || k.length > 2),
    'keys=' + JSON.stringify(getCardChannelKeys(card)));

  // A saved rule must SURVIVE A RELOAD. loadSettings() classifies the persisted channel list.
  store.channels = ['MrBeast', '1900', 'Live', '3d ago'];
  await loaded();
  ok('C12: a saved rule for channel "1900" survives a reload', settings.channels.includes('1900'),
    'channels=' + JSON.stringify(settings.channels));
  ok('C13: a saved rule for channel "Live" survives a reload', settings.channels.includes('Live'),
    'channels=' + JSON.stringify(settings.channels));
  ok('C14: real garbage ("3d ago") IS still dropped (control for C12/C13)', !settings.channels.includes('3d ago'),
    'channels=' + JSON.stringify(settings.channels));

  // ===================== D. keyword rules + per-channel exceptions =====================
  clearFeed();
  card = buildCard({ name: 'News Channel', handle: '@news', title: 'Prison break story' });
  const baseKw = (kw, exc, ch, keys) => keywordRulesHidden({
    title: 'Prison break story', channel: ch || 'news channel', keywords: [kw],
    keywordExceptions: exc || {}, channelKeys: keys || undefined
  });

  ok('D1: a matching keyword hides the card', baseKw('prison').hidden === true);
  ok('D2: a non-matching keyword does not', baseKw('astrophysics').hidden === false);
  ok('D3: an exception listing the card handle exempts it (as evaluateCard supplies it)',
    baseKw('prison', { prison: ['@news'] }, undefined, ['news', 'news channel']).hidden === false);
  ok('D4: an exception listing the display name exempts it',
    baseKw('prison', { prison: ['news channel'] }).hidden === false);
  ok('D5: an exception stored with capitalisation still exempts it',
    baseKw('prison', { Prison: ['news channel'] }).hidden === false,
    'hidden=' + baseKw('prison', { Prison: ['news channel'] }).hidden);
  ok('D6: an exception for a different channel does not exempt it',
    baseKw('prison', { prison: ['@otherchannel'] }).hidden === true);

  // ===================== E. extraction: a rule must match its own source =====================
  // Guarded: a pre-fix file (the RED seam) may not have the extraction engine at all, and a
  // crash there would hide which invariant actually broke.
  const hasExtractionEngine = typeof rankKeywordCandidates === 'function' && typeof selectKeywordRules === 'function';
  function extractionProbe(title) {
    if (!hasExtractionEngine) return null;
    const otherTitles = [];
    const dropped = [];
    const fromTitle = rankKeywordCandidates({ title }, 8, otherTitles, dropped);
    return selectKeywordRules(fromTitle, [], otherTitles, 3).terms;
  }
  const corpus = [
    'The Day We Got Out Of Prison',
    'Prison-Break Story',
    'Prison_Break Documentary',
    'Rust vs Go: which wins?',
    'C++ in 100 Seconds',
    'Day 3 of building a log cabin',
    'First Day Out Of Prison',
    'The Last Night On Earth'
  ];
  const forged = [];
  const weak = [];
  for (const t of corpus) {
    const rules = extractionProbe(t) || [];
    for (const r of rules) {
      if (!hasWordBoundaryKeyword(t, r)) forged.push(t + ' -> ' + r);
      if (nytKwIsGenericRule(r)) weak.push(t + ' -> ' + r);
    }
  }
  ok('E1: every derived rule matches its own source through the REAL matcher',
    hasExtractionEngine && forged.length === 0,
    hasExtractionEngine ? 'forged=' + JSON.stringify(forged) : 'extraction engine missing (selectKeywordRules)');
  const prisonRules = extractionProbe('The Day We Got Out Of Prison') || [];
  ok('E2: the subject (not the first words) is chosen',
    hasExtractionEngine && prisonRules.includes('prison') && !prisonRules.includes('day'),
    JSON.stringify(prisonRules));
  ok('E3: no rule is a word that describes nothing',
    hasExtractionEngine && weak.length === 0, JSON.stringify(weak));

  // ===================== F. temporal rules expire in the HIDING context =====================
  clearFeed();
  store.keywords = ['year review'];
  store.temporalRules = [{ keyword: 'year review', expires: '2020-01-01', reason: 'seasonal' }];
  store.channels = [];
  await loaded();
  ok('F1: an EXPIRED temporal keyword stops being active in an open tab',
    !settings.keywords.includes('year review'), 'settings.keywords=' + JSON.stringify(settings.keywords));

  store.keywords = ['black friday'];
  store.temporalRules = [{ keyword: 'black friday', expires: '2099-01-01', reason: 'seasonal' }];
  await loaded();
  ok('F2: a LIVE temporal keyword stays active (control for F1)',
    settings.keywords.includes('black friday'), 'settings.keywords=' + JSON.stringify(settings.keywords));

  store.keywords = ['permanent rule', 'timer rule'];
  store.temporalRules = [{ keyword: 'timer rule', expires: '2020-01-01', permanentBefore: true }];
  await loaded();
  ok('F3: a keyword that was permanent before the timer is never removed',
    settings.keywords.includes('timer rule'),
    'settings.keywords=' + JSON.stringify(settings.keywords));

  // ===================== G. end to end: does the card actually hide? =====================
  const resetSettings = () => {
    settings.keywords = []; settings.channels = []; settings.whitelistChannels = [];
    settings.subsSnapshot = []; settings.keywordExceptions = {}; settings.extensionEnabled = true;
    settings.autoDubMode = 'off'; settings.temporalRules = [];
  };

  clearFeed();
  resetSettings();
  settings.keywords = ['prison'];
  const card2 = buildCard({ name: 'News Channel', handle: '@news', title: 'Prison break story' });
  const h1 = processFeed(true);
  ok('G1: a keyword-matched card is hidden',
    h1 === 1 && card2.style.getPropertyValue('display') === 'none',
    'hidden=' + h1 + ' display=' + card2.style.getPropertyValue('display'));

  clearFeed();
  resetSettings();
  settings.channels = ['MrBeast'];
  const card3 = buildCard({ name: 'MrBeast', handle: '@MrBeast', title: 'A video' });
  const h2 = processFeed(true);
  ok('G2: a channel-matched card is hidden',
    h2 === 1 && card3.style.getPropertyValue('display') === 'none',
    'hidden=' + h2 + ' display=' + card3.style.getPropertyValue('display'));

  clearFeed();
  resetSettings();
  settings.channels = ['MrBeast'];
  settings.whitelistChannels = ['@MrBeast'];
  const card4 = buildCard({ name: 'MrBeast', handle: '@MrBeast', title: 'A video' });
  const h3 = processFeed(true);
  ok('G3: the whitelist overrides the channel blacklist', h3 === 0 && card4.style.getPropertyValue('display') !== 'none',
    'hidden=' + h3);

  clearFeed();
  resetSettings();
  settings.keywords = ['verified'];
  const card5 = buildCard({ name: 'Some Channel', handle: '@some', title: 'A completely unrelated calm video' });
  const h4 = processFeed(true);
  ok('G4: a "verified" rule does not hide an unrelated video',
    h4 === 0 && card5.style.getPropertyValue('display') !== 'none',
    'hidden=' + h4 + ' display=' + card5.style.getPropertyValue('display'));

  clearFeed();
  resetSettings();
  settings.keywords = ['prison'];
  settings.keywordExceptions = { prison: ['@news'] };
  const card6 = buildCard({ name: 'News Channel', handle: '@news', title: 'Prison break story' });
  const h5 = processFeed(true);
  ok('G5: a handle-keyed exception exempts the card end to end',
    h5 === 0 && card6.style.getPropertyValue('display') !== 'none',
    'hidden=' + h5 + ' keys=' + JSON.stringify(getCardChannelKeys(card6)));

  clearFeed();
  settings.keywordExceptions = { prison: ['@someotherchannel'] };
  const card7 = buildCard({ name: 'News Channel', handle: '@news', title: 'Prison break story' });
  const h6 = processFeed(true);
  ok('G6: an unrelated exception does not (control for G5)', h6 === 1, 'hidden=' + h6);
  resetSettings();

  // ===================== I. the BLOCK GESTURE =====================
  // One gesture (quick-block / 3-dot row / 'B' / right-click) must leave a rule that fires on
  // every surface the channel renders on — search results and the watch sidebar do not all
  // render the display name — and must never persist card noise (video ids, view counts,
  // fragments of a multi-collaborator byline).
  clearFeed();
  resetSettings();
  let gestureToast = '';
  showToast = function (msg) { gestureToast = msg; };
  store.channels = [];
  const gestureCard = buildCard({ name: 'Some Creator', handle: '@somecreator', title: 'A video' });
  blacklistActiveChannel(gestureCard);
  const storedKeys = Array.isArray(store.channels) ? store.channels.slice() : [];
  ok('I1: the gesture saves the display name', storedKeys.includes('some creator'), JSON.stringify(storedKeys));
  ok('I2: and the handle, so the block fires where only the handle renders',
    storedKeys.includes('somecreator'), JSON.stringify(storedKeys));
  ok('I3: and nothing else — no video id, view count or fragment noise',
    storedKeys.length > 0 && storedKeys.every(k => k === 'some creator' || k === 'somecreator'),
    JSON.stringify(storedKeys));

  clearFeed();
  settings.channels = storedKeys;
  const otherSurface = buildCard({ name: '', handle: '@SomeCreator', title: 'Another video' });
  ok('I4: the saved rule blocks the channel on a surface that renders only the handle',
    channelMatches(otherSurface, settings.channels) === true,
    'keys=' + JSON.stringify(getCardChannelKeys(otherSurface)));
  ok('I5: the toast names the channel it blocked', /Some Creator/.test(gestureToast),
    'toast=' + gestureToast);

  // A whitelisted channel must not be blockable by the gesture path either.
  clearFeed();
  resetSettings();
  settings.whitelistChannels = ['@somecreator'];
  store.channels = [];
  const wlCard = buildCard({ name: 'Some Creator', handle: '@somecreator', title: 'A video' });
  blacklistActiveChannel(wlCard);
  ok('I6: the gesture still records the rule, but the whitelist still wins at match time',
    channelMatches(wlCard, settings.whitelistChannels) === true && evaluateCard(wlCard).hidden === false,
    'evaluate=' + JSON.stringify(evaluateCard(wlCard)));
  resetSettings();

  // ===================== K. THE REPORTED INVERSION, end to end =====================
  // Verbatim shape of the report: on one page, two videos about the ancient world /
  // pyramids vanished while two promo videos ("Cool Tech Under $50", "Best bang 4 buck…")
  // stayed. The cause was not the keyword engine — it was the keyword engine never
  // running for a channel the user is subscribed to, combined with an identity match
  // that missed the subscription snapshot's spelling. Both directions are pinned here,
  // because a fix that only makes the wanted content survive would leave the promo
  // videos passing, which is the other half of the same complaint.
  clearFeed();
  resetSettings();
  // The subscription snapshot as YouTube's capture stores it: a squashed spelling.
  settings.subsSnapshot = [
    { name: 'Cosmic Summit', handle: '@cosmicsummit', url: 'https://www.youtube.com/@cosmicsummit' },
    { name: 'grahamhancock', handle: '@GrahamHancock', url: 'https://www.youtube.com/@GrahamHancock' }
  ];
  refreshSubscriptionKeySet();
  // The user's rules: the promo framing they want gone, and the ancient subject they do NOT.
  settings.keywords = ['under $50', 'bang 4 buck', 'gadget', 'ancient', 'pyramid'];
  store.keywords = settings.keywords.slice();

  const pyramidCard = buildCard({ name: 'Graham Hancock', title: 'The Great Pyramid Was Not Built By Humans?' });
  const ancientCard = buildCard({ name: 'Cosmic Summit', handle: '@cosmicsummit', title: 'Ancient Egypt: A Fresh Look At The Evidence' });
  const promoCard = buildCard({ name: 'Tech Deals Daily', handle: '@techdeals', title: 'Cool Tech Under $50' });
  const bangCard = buildCard({ name: 'Bargain Hunter', handle: '@bargain', title: 'Best bang 4 buck gadgets right now' });

  processFeed(true);
  const hidden = (c) => c.dataset.hiddenByLocalBlacklist === 'true';
  ok('K1: a SUBSCRIBED channel is exempt from keyword rules even when its title matches one ("Ancient…")',
    !hidden(ancientCard), 'hidden=' + hidden(ancientCard) + ' reason=' + ancientCard.dataset.hiddenReason);
  ok('K2: ...and so is the spaced display name of a snapshot entry stored squashed ("Graham Hancock")',
    !hidden(pyramidCard), 'hidden=' + hidden(pyramidCard) + ' reason=' + pyramidCard.dataset.hiddenReason +
    ' subscribed=' + cardIsSubscribed(pyramidCard) + ' keys=' + JSON.stringify(getCardChannelKeys(pyramidCard)));
  // K2 is only meaningful because this card exposes NO channel anchor — just the spaced
  // display name, which is how the reported surface rendered it. An anchor would hand the
  // matcher the handle directly and the comparison would succeed for the wrong reason.
  ok('K2b: the card under test really has no channel anchor (control for K2)',
    !getCardChannelKeys(pyramidCard).some(k => k === 'grahamhancock'),
    'keys=' + JSON.stringify(getCardChannelKeys(pyramidCard)));
  ok('K3: the promo video the rules were written for IS hidden ("Cool Tech Under $50")',
    hidden(promoCard), 'hidden=' + hidden(promoCard) + ' reason=' + promoCard.dataset.hiddenReason);
  ok('K4: ...and so is the second one ("Best bang 4 buck…")',
    hidden(bangCard), 'hidden=' + hidden(bangCard) + ' reason=' + bangCard.dataset.hiddenReason);
  // Control: the same promo title on a channel the user follows must still be spared —
  // the exemption is about the CHANNEL, not a blanket pass for promo titles.
  clearFeed();
  const promoFromSub = buildCard({ name: 'Cosmic Summit', handle: '@cosmicsummit', title: 'Cool Tech Under $50' });
  processFeed(true);
  ok('K5: the exemption is per-channel, not per-title (promo title from a subscribed channel survives)',
    !hidden(promoFromSub), 'hidden=' + hidden(promoFromSub) + ' reason=' + promoFromSub.dataset.hiddenReason);
  resetSettings();

  return out;
})()
`;

async function runVm() {
  try {
    return await vm.runInContext(script, context, { filename: 'harness-inline.js' });
  } catch (err) {
    console.error('Harness crashed inside the vm: ' + (err && err.stack || err));
    process.exit(1);
  }
}

// --------------------------------------------------- H. cross-file wiring --
// Static: every rule key must ride each bus, or a rule stops re-applying in open tabs /
// vanishes on the next export-import round trip — both silent.
const staticChecks = [];
const staticOk = (name, cond, detail) => staticChecks.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });

const contentSrc = fs.readFileSync(CONTENT_PATH, 'utf8');
const popupJs = fs.readFileSync(path.join(REPO, 'popup.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(REPO, 'popup.html'), 'utf8');

const listBetween = (src, startMarker, endMarker) => {
  const i = src.indexOf(startMarker);
  if (i < 0) return null;
  const j = src.indexOf(endMarker, i + startMarker.length);
  return j < 0 ? null : src.slice(i, j);
};
// Scope to the function: several helpers call storage.local.get() too, and the first hit
// would otherwise be one of those.
const listInside = (src, fnMarker, startMarker, endMarker) => {
  const base = src.indexOf(fnMarker);
  if (base < 0) return null;
  return listBetween(src.slice(base), startMarker, endMarker);
};

const ruleKeysLine = listBetween(contentSrc, 'const RULE_KEYS = [', ']');
const contentLoadList = listInside(contentSrc, 'function loadSettings()', 'chrome.storage.local.get([', '], (res)');
const popupLoadList = listInside(popupJs, 'function load()', 'chrome.storage.local.get([', '], (res)');
const popupSavePayload = listInside(popupJs, 'async function save()', 'chrome.storage.local.set({', '}).catch');

const RULE_KEYS_EXPECTED = [
  'channels', 'keywords', 'whitelistChannels', 'subsSnapshot', 'blockShorts', 'shortsSubOnly',
  'blockCommunity', 'autoDubMode', 'chipRescue', 'newToYouAuto', 'extensionEnabled',
  'keywordExceptions', 'temporalRules'
];
const missing = (haystack, key) => !haystack || !haystack.includes(key);
for (const k of RULE_KEYS_EXPECTED) {
  const absent = [];
  if (missing(ruleKeysLine, k)) absent.push('RULE_KEYS');
  if (missing(contentLoadList, k)) absent.push('content load list');
  if (missing(popupLoadList, k)) absent.push('popup load list');
  if (missing(popupSavePayload, k)) absent.push('popup save payload');
  staticOk('H: "' + k + '" rides every bus', absent.length === 0, 'missing from: ' + absent.join(', '));
}

// Every control the audited popup features query must exist in the markup.
const CONTROL_IDS = [
  'toggleExtensionEnabled', 'exceptionKeyword', 'exceptionChannel', 'addKeywordException',
  'keywordExceptionsList', 'temporalKeyword', 'temporalExpires', 'temporalReason',
  'addTemporalRule', 'temporalRulesList', 'communityPackUrl', 'addCommunityPack', 'communityPacksList'
];
for (const id of CONTROL_IDS) {
  staticOk('H: popup.html exposes #' + id, popupHtml.includes('id="' + id + '"'));
}

(async () => {
  const results = await runVm();
  // Functional: keywordExceptions / temporalRules must survive a real export -> import.
  const backupChecks = [];
  const backupOk = (name, cond, detail) => backupChecks.push({ name, pass: !!cond, detail: detail || '' });
  try {
    let saved = null;
    global.chrome = {
      runtime: { getManifest: () => ({ version: '1.0.0' }) },
      storage: {
        local: {
          get: (_k, cb) => cb({}),
          set: (obj, cb) => { saved = JSON.parse(JSON.stringify(obj)); cb && cb(); }
        }
      }
    };
    // backup.js wires its page controls in an async init(); every element must exist or the
    // rejection from that chain kills the process before the assertions report.
    const stubEl = () => ({
      checked: false, textContent: '', value: '', disabled: false, files: null, style: {},
      classList: { add() {}, remove() {}, contains: () => false },
      addEventListener() {}, removeEventListener() {}, click() {}
    });
    global.document = {
      getElementById: (id) => (id === 'replaceRules' ? { checked: true } : stubEl())
    };
    global.location = { hash: '' };
    const B = require(path.join(REPO, 'backup.js'));
    B.data.keywordExceptions = { prison: ['@news'] };
    B.data.temporalRules = [{ keyword: 'black friday', expires: '2099-01-01', reason: 'seasonal' }];
    B.data.channels = ['@science'];
    const payload = JSON.stringify(B.buildPayload());
    const imported = await B.doImportFile({ text: async () => payload });
    backupOk('H: backup export/import round-trips keywordExceptions',
      imported === true && saved && saved.keywordExceptions && Array.isArray(saved.keywordExceptions.prison) &&
      saved.keywordExceptions.prison.includes('@news'),
      'saved=' + JSON.stringify(saved && saved.keywordExceptions));
    backupOk('H: backup export/import round-trips temporalRules',
      imported === true && saved && Array.isArray(saved.temporalRules) && saved.temporalRules.length === 1 &&
      saved.temporalRules[0].keyword === 'black friday',
      'saved=' + JSON.stringify(saved && saved.temporalRules));
  } catch (err) {
    backupOk('H: backup round trip ran', false, String(err && err.message || err));
  }

  const all = results.concat(staticChecks, backupChecks);
  let pass = 0, fail = 0;
  for (const r of all) {
    if (r.pass) { pass++; console.log('  PASS  ' + r.name); }
    else { fail++; console.log('  FAIL  ' + r.name + (r.detail ? '  [' + r.detail + ']' : '')); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) {
    console.log('\nA - "it blocks channels", B - "it parses keywords from titles".\n' +
      'C/D = rule identity + exceptions, E = extraction, F = expiry, G = end-to-end, H = wiring.');
    process.exit(1);
  }
})();
