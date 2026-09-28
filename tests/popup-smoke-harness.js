/*
 * Execution smoke harness for popup.js.
 *
 * WHY THIS EXISTS: popup.js is the largest shipped script and the one with the
 * most DOM surface (70 getElementById call sites), but it was the only shipped
 * module NO test ever executed — every other module runs for real inside a vm.
 * A file that parses is not a file that runs: a typo in an element id, a missing
 * function, or a bad registration only shows up when init() actually walks the
 * DOM. This harness loads the real popup.js into a vm with a DOM shim, fires the
 * DOMContentLoaded listener it registers, and requires init() to complete.
 *
 * The DOM shim is a stub of the BROWSER, not of the code under test: popup.js runs
 * unmodified, so a genuine "x is not a function" surfaces here instead of in the
 * user's popup console.
 */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// RED/GREEN seam: point POPUP_JS_PATH at a broken copy of popup.js and this
// harness must FAIL, proving it really executes the popup instead of greening
// on a file it never ran.
const POPUP_PATH = process.env.POPUP_JS_PATH || path.join(__dirname, '..', 'popup.js');
const MANIFEST_VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8').replace(/^\uFEFF/, '')
).version;

let checks = 0;
function ok(cond, msg) { checks++; assert(cond, msg); }

console.log('--- Running popup.js execution smoke test ---');

// ------------------------------------------------------------------ DOM shim --
function makeStyle() {
  const props = {};
  return {
    setProperty(k, v) { props[k] = v; },
    removeProperty(k) { delete props[k]; },
    getPropertyValue(k) { return props[k] || ''; }
  };
}

function makeEl(tagName) {
  const el = {
    tagName: String(tagName || 'div').toUpperCase(),
    dataset: {}, id: '', className: '', textContent: '', innerHTML: '', title: '',
    value: '', checked: false, disabled: false, type: '', href: '', target: '', rel: '',
    parentElement: null, children: [], isConnected: true,
    offsetHeight: 0, offsetWidth: 0, clientHeight: 0, clientWidth: 0, scrollHeight: 0,
    style: makeStyle(),
    _listeners: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
    },
    addEventListener(type, fn) { (el._listeners[type] = el._listeners[type] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) { c.parentElement = el; el.children.push(c); return c; },
    insertBefore(c) { c.parentElement = el; el.children.push(c); return c; },
    removeChild(c) { el.children = el.children.filter(x => x !== c); return c; },
    remove() {},
    focus() {}, blur() {}, click() {}, scrollIntoView() {},
    insertAdjacentHTML() {}, setAttribute() {}, removeAttribute() {},
    getAttribute() { return null; },
    closest() { return null; },
    matches() { return false; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; },
    add() {}, remove() {}
  };
  return el;
}

// One stable node per id, so repeated lookups see the same element (real DOM
// behaviour; a fresh object per call would hide wiring bugs).
const byId = new Map();
function getById(id) {
  if (!byId.has(id)) { const el = makeEl('div'); el.id = id; byId.set(id, el); }
  return byId.get(id);
}

const chipEls = ['scholar', 'engineer', 'antislop', 'creative'].map((persona, i) => {
  const el = makeEl('span');
  el.className = 'ai-chip';
  el.dataset.persona = persona;
  el._i = i;
  return el;
});
const tabBtns = [0, 1, 2].map(() => makeEl('button'));
const tabPanes = [0, 1, 2].map(() => makeEl('div'));

function queryAll(sel) {
  if (sel === '.ai-chip') return chipEls;
  if (sel === '.tab-btn') return tabBtns;
  if (sel === '.tab-pane') return tabPanes;
  return [];
}

const documentStub = {
  body: makeEl('body'),
  documentElement: makeEl('html'),
  readyState: 'complete',
  visibilityState: 'visible',
  getElementById: getById,
  createElement: (t) => makeEl(t),
  querySelector: (s) => queryAll(s)[0] || null,
  querySelectorAll: queryAll,
  _domReady: [],
  addEventListener(type, fn) { if (type === 'DOMContentLoaded') this._domReady.push(fn); },
  removeEventListener() {}
};

const resolveEmpty = () => Promise.resolve({});
const resolveList = () => Promise.resolve([]);

const chromeStub = {
  runtime: {
    lastError: null,
    getManifest: () => ({ version: MANIFEST_VERSION }),
    getURL: (p) => p,
    sendMessage: resolveEmpty,
    onMessage: { addListener() {} },
    openOptionsPage() {}
  },
  storage: {
    local: {
      get(_keys, cb) { if (cb) cb({}); return Promise.resolve({}); },
      set(_o, cb) { if (cb) cb(); return Promise.resolve(); }
    },
    onChanged: { addListener() {} }
  },
  tabs: {
    query: resolveList,
    create: resolveEmpty,
    update: resolveEmpty,
    remove: resolveEmpty,
    get: resolveEmpty,
    sendMessage: resolveEmpty
  },
  downloads: { download: resolveEmpty }
};

const sandbox = {
  console: { log() {}, warn() {}, error(...a) { errors.push(a.join(' ')); }, info() {}, debug() {} },
  document: documentStub,
  window: {
    addEventListener() {}, removeEventListener() {},
    location: { href: 'chrome-extension://test/popup.html', pathname: '/popup.html' },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    open() {}, scrollTo() {}, getComputedStyle: () => makeStyle()
  },
  location: { href: 'chrome-extension://test/popup.html', pathname: '/popup.html' },
  navigator: { userAgent: 'node-harness', clipboard: { writeText: resolveEmpty } },
  chrome: chromeStub,
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, JSON, Math, Date, RegExp, String, Number, Boolean, Array, Object, Error, Set, Map,
  alert() {}, confirm: () => false, prompt: () => null
};
const errors = [];
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

vm.createContext(sandbox);

// ------------------------------------------------------------------- run it --
const popupSrc = fs.readFileSync(POPUP_PATH, 'utf8');
vm.runInContext(popupSrc, sandbox, { filename: POPUP_PATH });

ok(documentStub._domReady.length >= 1,
  'popup.js must register a DOMContentLoaded listener — that is how the popup starts');
ok(typeof sandbox.init === 'function', 'init() must be defined in the popup scope');

(async () => {
  // Drives the real init(): load() -> version -> every wiring block.
  await sandbox.init();

  // 1. init() completed. This is the "runs, not just parses" assertion.
  ok(true, 'init() completed without throwing');

  // 2. The version is read from the manifest at runtime, not hardcoded in HTML.
  const versionEl = getById('versionText');
  ok(versionEl.textContent === 'v' + MANIFEST_VERSION,
    `versionText must be set from the manifest, got ${JSON.stringify(versionEl.textContent)}`);

  // 3. Persona chips are keyboard-operable (role="button" in popup.html +
  //    the onActivate() helper): both handlers must be attached.
  for (const chip of chipEls) {
    const types = Object.keys(chip._listeners);
    ok(types.includes('click'), `chip ${chip.dataset.persona} must have a click handler`);
    ok(types.includes('keydown'), `chip ${chip.dataset.persona} must have a keydown handler (Enter/Space)`);
  }

  // 4. A chip activation must actually apply the persona preset.
  const chip = chipEls[0];
  chip._listeners.click[0]();
  const taste = getById('aiTastePrompt');
  ok(typeof taste.value === 'string' && taste.value.length > 0,
    'clicking a persona chip must fill the taste prompt');

  // 5. No console.error from the real code paths.
  ok(errors.length === 0, `popup.js logged errors during init: ${errors.join(' | ')}`);

  console.log(`\nAll ${checks} popup.js smoke checks passed. ✅`);
})().catch((e) => {
  console.error('\npopup.js smoke test FAILED:', e && e.message);
  console.error(e && e.stack);
  process.exit(1);
});
