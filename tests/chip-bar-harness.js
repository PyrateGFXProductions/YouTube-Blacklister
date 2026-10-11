/*
 * Chip-bar persistence harness — the Home topic bar must not depend on a refresh.
 *
 * Measured live: when YouTube serves Home with an empty feed it sends NO chip data at all
 * (`chipCloudRenderer` absent from ytInitialData, zero chips in the DOM). The old rescue could
 * only UNHIDE a bar YouTube rendered, so its only remedy was a reload — the "refresh for five
 * minutes" complaint. This harness drives the REAL functions that capture the bar's data on a
 * good page and rebuild it on a bad one.
 *
 *   C1-C4  chipBarCaptureIsUseful: the pure "worth persisting?" gate
 *   N1-N4  normalizeChipEntry: both renderer shapes (chipCloudChipRenderer / chipViewModel)
 *   X1-X3  extractChipsFromInitialData: finds the bar wherever it sits
 *   R1-R6  chipRebuildDecision: home / enabled / feature / present / cache / age / navigated
 *   B1-B3  buildChipBarElement + insertRebuiltChipBar: a real bar lands in the page
 *   E1-E3  end to end: capture on a good page -> rebuild on an empty one; and the guards
 *
 * RED/GREEN seam: CONTENT_JS_PATH at a pre-feature copy fails the SEAM assertion (symbols
 * absent) rather than crashing.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const REPO = path.join(__dirname, '..');
const CONTENT_PATH = process.env.CONTENT_JS_PATH || path.join(REPO, 'content.js');
const SHARED_PATH = process.env.SHARED_TABLES_PATH || path.join(REPO, 'shared-tables.js');
if (!fs.existsSync(CONTENT_PATH)) { console.error('content.js not found'); process.exit(1); }

function makeStyle() {
  const props = {};
  return { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; }, getPropertyValue(k) { return props[k]; } };
}
function matchCompound(el, compound) {
  const nots = [];
  compound = compound.replace(/:not\(([^)]*)\)/g, (m, inner) => { nots.push(inner); return ''; });
  for (const n of nots) if (matchCompound(el, n)) return false;
  let rest = compound;
  const ids = rest.match(/#[A-Za-z0-9_-]+/g) || []; rest = rest.replace(/#[A-Za-z0-9_-]+/g, '');
  for (const i of ids) if (String(el.id || el.getAttribute('id') || '') !== i.slice(1)) return false;
  const cls = rest.match(/\.[A-Za-z0-9_-]+/g) || []; rest = rest.replace(/\.[A-Za-z0-9_-]+/g, '');
  const own = String(el.className || '');
  for (const c of cls) if (!own.split(/\s+/).includes(c.slice(1))) return false;
  const tag = rest.split('[')[0].trim().toLowerCase();
  if (tag && tag !== '*' && el.tagName.toLowerCase() !== tag) return false;
  const attrRe = /\[([^\]]+)\]/g; let a, hadAttr = false;
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
  return Boolean(tag || cls.length || ids.length || hadAttr);
}
function matchChain(el, part) {
  const parts = part.trim().split(/\s+/).filter(Boolean);
  if (!matchCompound(el, parts[parts.length - 1])) return false;
  let node = el.parentElement;
  for (let i = parts.length - 2; i >= 0; i--) {
    let found = false;
    while (node) { if (matchCompound(node, parts[i])) { found = true; node = node.parentElement; break; } node = node.parentElement; }
    if (!found) return false;
  }
  return true;
}
function matchesSelector(el, sel) { return sel.split(',').map(s => s.trim()).filter(Boolean).some(p => matchChain(el, p)); }
function descendants(root, acc = []) { for (const c of root.children) { acc.push(c); descendants(c, acc); } return acc; }
function makeEl(tagName) {
  const attrs = {};
  const el = {
    tagName: String(tagName).toUpperCase(), dataset: {}, id: '', className: '',
    parentElement: null, parentNode: null, children: [], isConnected: true, offsetParent: {},
    style: makeStyle(), _text: '',
    get textContent() { return el.children.length ? el.children.map(c => c.textContent).join('') : el._text; },
    set textContent(v) { el._text = String(v == null ? '' : v); el.children.length = 0; },
    classList: {
      contains: (c) => String(el.className).split(/\s+/).includes(c),
      add(c) { if (!el.classList.contains(c)) el.className = (el.className ? el.className + ' ' : '') + c; },
      remove(c) { el.className = String(el.className).split(/\s+/).filter(x => x && x !== c).join(' '); },
      toggle(c, f) { const on = f === undefined ? !el.classList.contains(c) : f; on ? el.classList.add(c) : el.classList.remove(c); }
    },
    appendChild(c) { c.parentElement = el; c.parentNode = el; el.children.push(c); return c; },
    insertBefore(c, ref) { c.parentElement = el; c.parentNode = el; const i = el.children.indexOf(ref); el.children.splice(i < 0 ? 0 : i, 0, c); return c; },
    removeChild(c) { el.children = el.children.filter(x => x !== c); if (c.parentElement === el) { c.parentElement = null; c.parentNode = null; } return c; },
    remove() { if (el.parentElement) el.parentElement.removeChild(el); },
    closest(sel) { let n = el; while (n) { if (matchesSelector(n, sel)) return n; n = n.parentElement; } return null; },
    matches(sel) { return matchesSelector(el, sel); },
    contains(n) { if (n === el) return true; let p = n && n.parentElement; while (p) { if (p === el) return true; p = p.parentElement; } return false; },
    querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) { return descendants(el).filter(n => matchesSelector(n, sel)); },
    addEventListener() {}, removeEventListener() {},
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(attrs, n) ? attrs[n] : null; },
    hasAttribute(n) { return Object.prototype.hasOwnProperty.call(attrs, n); },
    setAttribute(n, v) {
      attrs[n] = String(v);
      // The real DOM reflects these onto properties; the stub must too, or `el.id` stays ''
      // after setAttribute('id', ...) and getElementById can never find the node.
      if (n === 'id') el.id = String(v);
      if (n === 'class') el.className = String(v);
    },
    removeAttribute(n) { delete attrs[n]; if (n === 'id') el.id = ''; if (n === 'class') el.className = ''; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; }
  };
  return el;
}
function makeDocument() {
  const body = makeEl('body');
  return {
    body, head: makeEl('head'), documentElement: makeEl('html'),
    visibilityState: 'visible', readyState: 'complete',
    getElementById: (id) => descendants(body).find(n => n.id === id) || null,
    createElement: (t) => makeEl(t), addEventListener() {}, removeEventListener() {},
    querySelector: (s) => body.querySelector(s), querySelectorAll: (s) => body.querySelectorAll(s)
  };
}

const never = () => new Promise(() => {});
const document = makeDocument();
const store = {};
const context = {
  console, document, makeEl,
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  window: { addEventListener() {}, removeEventListener() {}, location: { pathname: '/', href: 'https://www.youtube.com/' }, ytInitialData: null },
  location: { pathname: '/', hash: '', href: 'https://www.youtube.com/', search: '' },
  history: { pushState() {}, replaceState() {} },
  navigator: { userAgent: 'node-harness' },
  MutationObserver: class { observe() {} disconnect() {} },
  PopStateEvent: class { constructor() {} },
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  setTimeout, clearTimeout, setInterval, clearInterval,
  URL, DOMParser: class { parseFromString() { return { getElementsByTagName: () => [] }; } },
  chrome: {
    runtime: { id: 'chip-bar-harness', onMessage: { addListener() {} }, lastError: null, sendMessage: () => never(), getURL: (p) => p },
    storage: { local: { get: () => never(), set: () => never() } },
    tabs: { query: () => never(), sendMessage: () => never() }
  }
};
context.__storeRef = store;
vm.createContext(context);
vm.runInContext(fs.readFileSync(SHARED_PATH, 'utf8'), context, { filename: 'shared-tables.js' });
vm.runInContext(fs.readFileSync(CONTENT_PATH, 'utf8'), context, { filename: CONTENT_PATH });

const script = `
(async function () {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });
  const __store = __storeRef;
  const j = (v) => JSON.stringify(v);

  const syms = ['chipBarCaptureIsUseful','normalizeChipEntry','extractChipsFromInitialData','extractChipsFromDom','chipRebuildDecision','buildChipBarElement','insertRebuiltChipBar','captureChipBarIfUseful','tryRebuildChipBar'];
  const missing = syms.filter(s => eval('typeof ' + s) !== 'function');
  ok('SEAM: the chip-bar persistence symbols exist', missing.length === 0, 'missing=' + j(missing));
  if (missing.length) return out;

  chrome.storage.local = {
    get: (keys, cb) => { const l = Array.isArray(keys) ? keys : [keys]; const r = {}; for (const k of l) if (k in __store) r[k] = __store[k]; cb(r); },
    set: (obj, cb) => { Object.assign(__store, obj); if (cb) cb(); }
  };

  // ---- C. the capture gate ----
  ok('C1: a real topic bar is worth persisting',
     chipBarCaptureIsUseful([{text:'All'},{text:'Music'},{text:'Gaming'}]) === true);
  ok('C2: the unpersonalized shell ("All" alone) is NOT worth persisting',
     chipBarCaptureIsUseful([{text:'All'}]) === false && chipBarCaptureIsUseful([{text:'All'},{text:''}]) === false);
  ok('C3: an empty / unlabelled array is refused',
     chipBarCaptureIsUseful([]) === false && chipBarCaptureIsUseful([{text:'  '},{text:''}]) === false && chipBarCaptureIsUseful(null) === false);
  ok('C4: two real chips are enough', chipBarCaptureIsUseful([{text:'Music'},{text:'News'}]) === true);

  // ---- N. both renderer shapes normalize ----
  ok('N1: the older chipCloudChipRenderer shape normalizes',
     (function(){ const c = normalizeChipEntry({ chipCloudChipRenderer: { style:{styleType:'STYLE_HOME_FILTER'}, text:{simpleText:'Music'}, isSelected:true, location:'CHIP_LOCATION_HOME' } }); return c && c.text === 'Music' && c.isSelected === true; })());
  ok('N2: the newer chipViewModel shape normalizes (runs text, not simpleText)',
     (function(){ const c = normalizeChipEntry({ chipViewModel: { style:{styleType:'STYLE_HOME_FILTER'}, text:{runs:[{text:'New to '},{text:'you'}]}, location:'CHIP_LOCATION_HOME' } }); return c && c.text === 'New to you'; })());
  ok('N3: a chip with no label is dropped',
     normalizeChipEntry({ chipViewModel: { text:{} } }) === null && normalizeChipEntry(null) === null);
  ok('N4: the navigation endpoint is preserved for click-through',
     (function(){ const ep = { commandMetadata:{ webCommandMetadata:{ url:'/feed/trending' } } }; const c = normalizeChipEntry({ chipViewModel:{ text:{simpleText:'Trending'}, navigationEndpoint: ep } }); return c && c.endpoint && c.endpoint.commandMetadata.webCommandMetadata.url === '/feed/trending'; })());

  // ---- X. extraction from ytInitialData ----
  const shaped = { contents: { a: { chipCloudRenderer: { chips: [
    { chipCloudChipRenderer: { text:{simpleText:'All'} } },
    { chipCloudChipRenderer: { text:{simpleText:'Music'} } },
    { chipCloudChipRenderer: { text:{simpleText:'Gaming'} } }
  ] } } } };
  ok('X1: the chip array is found wherever it sits in ytInitialData',
     j(extractChipsFromInitialData(shaped).map(c=>c.text)) === j(['All','Music','Gaming']),
     j(extractChipsFromInitialData(shaped).map(c=>c.text)));
  ok('X2: an empty feed payload yields no chips',
     j(extractChipsFromInitialData({ contents: {} })) === j([]));
  ok('X3: a feedFilterChipBarRenderer shape is also understood',
     j(extractChipsFromInitialData({ x: { feedFilterChipBarRenderer: { chips: [{ chipCloudChipRenderer:{ text:{simpleText:'Live'} } }, { chipCloudChipRenderer:{ text:{simpleText:'News'} } }] } } }).map(c=>c.text)) === j(['Live','News']));

  // ---- R. the rebuild decision ----
  const cached = [{text:'All'},{text:'Music'},{text:'Gaming'}];
  ok('R1: rebuilds when YouTube served no bar and a cache exists',
     chipRebuildDecision({ isHome:true, enabled:true, featureOn:true, barPresent:false, cachedChips:cached, cacheAgeMs:1000 }).go === true);
  ok('R2: never rebuilds over a bar YouTube DID serve',
     chipRebuildDecision({ isHome:true, enabled:true, featureOn:true, barPresent:true, cachedChips:cached, cacheAgeMs:1000 }).reason === 'youtube-served');
  ok('R3: refuses with no usable cache, off-Home, paused, or feature off',
     chipRebuildDecision({ isHome:true, enabled:true, featureOn:true, barPresent:false, cachedChips:[], cacheAgeMs:1 }).reason === 'no-cache' &&
     chipRebuildDecision({ isHome:false, enabled:true, featureOn:true, barPresent:false, cachedChips:cached }).reason === 'not-home' &&
     chipRebuildDecision({ isHome:true, enabled:false, featureOn:true, barPresent:false, cachedChips:cached }).reason === 'disabled' &&
     chipRebuildDecision({ isHome:true, enabled:true, featureOn:false, barPresent:false, cachedChips:cached }).reason === 'feature-off');
  ok('R4: a stale cache (>30 days) is refused', chipRebuildDecision({ isHome:true, enabled:true, featureOn:true, barPresent:false, cachedChips:cached, cacheAgeMs: 31*24*3600*1000 }).reason === 'stale');
  ok('R5: it rebuilds at most once per page', chipRebuildDecision({ isHome:true, enabled:true, featureOn:true, alreadyRebuilt:true, barPresent:false, cachedChips:cached, cacheAgeMs:1 }).reason === 'already-rebuilt');
  ok('R6: navigating away cancels a pending rebuild', chipRebuildDecision({ isHome:true, enabled:true, featureOn:true, barPresent:false, cachedChips:cached, cacheAgeMs:1, userNavigatedAway:true }).reason === 'navigated');

  // ---- B. building + inserting the bar ----
  const built = buildChipBarElement(cached);
  ok('B1: the built bar is a plain element this extension owns, with one chip per entry',
     built.tagName === 'DIV' && built.id === 'nyt-chip-cloud-rebuilt' &&
     built.children.length === 3 && built.children[0].tagName === 'BUTTON',
     built.tagName + ' id=' + built.id + ' chips=' + built.children.length);
  ok('B2: each chip carries its visible label',
     built.children[1].textContent === 'Music' && built.children[1].getAttribute('aria-label') === 'Music');

  // Insert into a home-like page and prove it lands at the top of the feed.
  const browse = makeEl('ytd-browse'); browse.setAttribute('page-subtype', 'home');
  const primary = makeEl('div'); primary.id = 'primary';
  const grid = makeEl('ytd-rich-grid-renderer');
  const card = makeEl('ytd-rich-item-renderer');
  grid.appendChild(card); primary.appendChild(grid); browse.appendChild(primary); document.body.appendChild(browse);
  const inserted = insertRebuiltChipBar(cached);
  ok('B3: the rebuilt bar is inserted into the home feed',
     inserted === true && !!document.getElementById('nyt-chip-cloud-rebuilt') &&
     grid.children[0].id === 'nyt-chip-cloud-rebuilt',
     'inserted=' + inserted + ' firstChild=' + (grid.children[0] && grid.children[0].id));

  // ---- E. end to end: capture on a good page, rebuild on an empty one ----
  // A good page: a rendered chip bar in the DOM.
  const goodBar = makeEl('yt-chip-cloud-renderer');
  for (const t of ['All', 'Music', 'Gaming', 'News']) {
    const c = makeEl('yt-chip-cloud-chip-renderer'); c.setAttribute('chip-style','STYLE_HOME_FILTER'); c.textContent = t; goodBar.appendChild(c);
  }
  document.body.appendChild(goodBar);
  const captured = captureChipBarIfUseful();
  const stored = __store.nyt_chipBarCache;
  ok('E1: a good page captures the bar into storage',
     captured === true && stored && Array.isArray(stored.chips) && stored.chips.length === 4 && stored.chips[1].text === 'Music',
     'captured=' + captured + ' stored=' + j(stored && stored.chips && stored.chips.map(c=>c.text)));

  // Now the empty page: remove everything YouTube served and the rebuilt bar.
  goodBar.remove();
  const rebuiltEl = document.getElementById('nyt-chip-cloud-rebuilt');
  if (rebuiltEl) rebuiltEl.remove();
  chipBarRebuiltThisPage = false;
  const res = await tryRebuildChipBar();
  ok('E2: on a page YouTube served no bar for, the bar is rebuilt from the cache',
     res === 'rebuilt' && !!document.getElementById('nyt-chip-cloud-rebuilt'),
     'result=' + res);
  ok('E3: the rebuilt bar carries the cached topics',
     (function(){ const b = document.getElementById('nyt-chip-cloud-rebuilt'); return b && b.children.length === 4 && b.children[2].textContent === 'Gaming'; })(),
     (function(){ const b = document.getElementById('nyt-chip-cloud-rebuilt'); return b ? j(b.children.map(c=>c.textContent)) : 'none'; })());

  return out;
})()
`;

(async () => {
  let results;
  try {
    results = await vm.runInContext(script, context, { filename: 'chip-bar-harness.js' });
  } catch (e) {
    console.error('HARNESS CRASH:'); console.error(e && e.stack ? e.stack : String(e));
    process.exit(1);
  }
  let fail = 0;
  for (const r of results) {
    if (!r.pass) fail++;
    console.log((r.pass ? '  PASS  ' : '  FAIL  ') + r.name + (r.pass || !r.detail ? '' : '  — ' + r.detail));
  }
  console.log(`\n${results.length - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
