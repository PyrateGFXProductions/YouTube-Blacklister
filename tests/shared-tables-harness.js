/*
 * Drift guard for shared-tables.js — the single source of the heuristic patterns.
 *
 * WHY: the same heuristics are consumed by TWO JavaScript contexts (the MV3
 * service worker and the YouTube content script). Before shared-tables.js the
 * content script carried a hand-copied subset of the tables, and it had already
 * drifted: the same title could be judged sensational by one engine and not the
 * other, and neutralized differently depending on whether the local model
 * answered or the heuristic fallback ran. This harness fails if that ever comes
 * back — by redeclaring a table, by forking the de-bait body, or by dropping the
 * file from either load path.
 */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// RED/GREEN seam: point CONTENT_JS_PATH at a deliberately forked copy of
// content.js and Test 4/5 must FAIL, proving this guard really catches drift.
const CONTENT_PATH = process.env.CONTENT_JS_PATH || path.join(root, 'content.js');
const readContent = () => fs.readFileSync(CONTENT_PATH, 'utf8');

const TABLE_NAMES = [
  'CLICKBAIT_PATTERNS', 'SENSATIONAL_ADJECTIVES', 'OUTRAGE_WORDS', 'PARASOCIAL_WORDS',
  'DESPERATION_WORDS', 'SPORTS_KEYWORDS', 'CRYPTO_KEYWORDS', 'AI_SLOP_KEYWORDS',
  'BRAINROT_KEYWORDS', 'DRAMA_KEYWORDS', 'SLOP_REGEX', 'DEBait_CLEANERS',
  'FALLBACK_KEYWORDS', 'FALLBACK_REGEX', 'NOISE_PATTERNS',
  // The keyword-extraction tables. These were the LAST copy-paste holdout: content.js
  // carried its own KW_STOP_WORDS and its own positional extractor while background.js
  // used the shared one, so the same video produced different rules depending on which
  // engine answered — and the content-script copy (missing 'day', 'got', 'out') is what
  // filled the blacklist with junk. Pinning them here keeps that from coming back.
  'NYT_KW_STOP_WORDS', 'NYT_KW_WEAK_ALONE', 'NYT_KW_FRAME_WORDS', 'NYT_KW_SOURCE_WEIGHTS', 'NYT_KW_PHRASE_BONUS',
  'NYT_CHANNEL_SQUASH_MIN',
  'NYT_KW_MAX_PHRASE_WORDS', 'NYT_KW_FEED_MIN_CORPUS', 'NYT_KW_FEED_DF_RATIO', 'NYT_KW_FEED_MIN_HITS'
];

let checks = 0;
function ok(cond, msg) {
  checks++;
  assert(cond, msg);
}

console.log('--- Running shared-tables drift guard ---');

const shared = read('shared-tables.js');
const contentSrc = readContent();
const bgSrc = read('background.js');

// 1. Every table is declared exactly once, in shared-tables.js.
console.log('Test 1: tables are declared only in shared-tables.js');
for (const name of TABLE_NAMES) {
  const decl = new RegExp(`^const ${name}\\b`, 'm');
  ok(decl.test(shared), `${name} must be declared in shared-tables.js`);
  ok(!decl.test(contentSrc), `${name} must NOT be redeclared in content.js — load shared-tables.js instead`);
  ok(!decl.test(bgSrc), `${name} must NOT be redeclared in background.js — importScripts shared-tables.js instead`);
}

// 2. Both contexts actually load the file.
console.log('Test 2: both load paths wire shared-tables.js in');
const manifest = JSON.parse(read('manifest.json'));
const cs = (manifest.content_scripts || [])[0] || {};
const csJs = cs.js || [];
ok(csJs.includes('shared-tables.js'), 'manifest content_scripts must inject shared-tables.js');
ok(csJs.indexOf('shared-tables.js') < csJs.indexOf('content.js'),
  'shared-tables.js must be injected BEFORE content.js');
ok(/importScripts\(\s*'shared-tables\.js'\s*\)/.test(bgSrc),
  'background.js must importScripts shared-tables.js for the Chrome MV3 worker');
ok(/typeof importScripts === 'function'/.test(bgSrc),
  'the importScripts call must be guarded so the Firefox (background.scripts) path still loads');

// 3. Firefox has no importScripts outside a worker: the packager must list the
//    file as a second background script, and the packager must ship the file.
console.log('Test 3: packaging covers shared-tables.js for both browsers');
const ps1 = read('package-extension.ps1');
ok(/scripts\s*=\s*@\(\s*"shared-tables\.js"\s*,\s*"background\.js"\s*\)/.test(ps1),
  'the Firefox manifest must load shared-tables.js before background.js in background.scripts');
const copies = (ps1.match(/"shared-tables\.js"/g) || []).length;
ok(copies >= 3, `shared-tables.js must be listed in both packager file arrays (found ${copies} mentions)`);

// 4. The two engine bodies must stay identical.
console.log('Test 4: the de-bait / sensationalism bodies match across contexts');
function bodyOf(src, fnName) {
  const start = src.indexOf(`function ${fnName}(`);
  assert(start !== -1, `${fnName} not found`);
  // Walk braces from the function's opening brace to its matching close.
  let i = src.indexOf('{', start);
  let depth = 0;
  let body = null;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) { body = src.slice(start, j + 1); break; }
    }
  }
  if (body === null) throw new Error(`unterminated ${fnName}`);
  // Compare CODE, not commentary: drop whole-line comments and blank lines so a
  // shared implementation passes, while any real fork in the logic fails.
  return body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('//'))
    .join('\n');
}
for (const fn of ['heuristicDebaitTitle', 'looksSensationalist']) {
  const a = bodyOf(contentSrc, fn);
  const b = bodyOf(bgSrc, fn);
  ok(a === b, `${fn}() has forked between content.js and background.js`);
}

// 5. And they must actually agree at runtime, on both sides of the tables.
console.log('Test 5: content.js and background.js agree on a title corpus');

// --- minimal DOM stub: enough for content.js to evaluate at load time ---
function makeStyle() {
  const props = {};
  return {
    setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; },
    getPropertyValue(k) { return props[k]; }
  };
}
function makeEl(tagName) {
  const el = {
    tagName: String(tagName).toUpperCase(), dataset: {}, id: '', className: '',
    textContent: '', parentElement: null, children: [], isConnected: true,
    style: makeStyle(),
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
    appendChild(c) { c.parentElement = el; el.children.push(c); return c; },
    removeChild(c) { el.children = el.children.filter(x => x !== c); return c; },
    remove() {}, closest() { return null; }, matches() { return false; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
    getAttribute() { return null; }, setAttribute() {}, removeAttribute() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; }
  };
  return el;
}
const never = () => new Promise(() => {});
const body = makeEl('body');
const contentCtx = {
  console,
  document: {
    body, documentElement: makeEl('html'), visibilityState: 'visible', readyState: 'complete',
    getElementById: () => null, createElement: (t) => makeEl(t),
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => []
  },
  window: {
    addEventListener() {}, removeEventListener() {},
    location: { pathname: '/', hash: '', href: 'https://www.youtube.com/' }, __blkDebug: false
  },
  location: { pathname: '/', hash: '', href: 'https://www.youtube.com/', search: '' },
  history: { pushState() {}, replaceState() {} },
  navigator: { userAgent: 'node-harness' },
  MutationObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  setTimeout, clearTimeout, setInterval, clearInterval, URL,
  DOMParser: class { parseFromString() { return { getElementsByTagName: () => [] }; } },
  chrome: {
    runtime: { onMessage: { addListener() {} }, lastError: null, sendMessage: () => never(), getURL: (p) => p },
    storage: { local: { get: () => never(), set: () => never() } },
    tabs: { query: () => never(), sendMessage: () => never() }
  }
};
vm.createContext(contentCtx);
vm.runInContext(shared, contentCtx, { filename: 'shared-tables.js' });
vm.runInContext(contentSrc, contentCtx, { filename: 'content.js' });

const bgCtx = {
  chrome: {
    runtime: { onMessage: { addListener: () => {} }, lastError: null },
    storage: { local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() } }
  },
  console, fetch: () => Promise.reject(new Error('no network in harness')),
  AbortController, setTimeout, clearTimeout, URL
};
bgCtx.importScripts = (...files) => {
  for (const f of files) vm.runInContext(read(f), bgCtx, { filename: f });
};
vm.createContext(bgCtx);
vm.runInContext(bgSrc, bgCtx, { filename: 'background.js' });

const CORPUS = [
  "You won't believe what happened next",
  'Top 10 things you must know',
  'SHOCKING FOOTAGE EXPOSED',
  'Hot leaked video banned',
  'Nobody talks about this',
  'Rust Systems Programming Guide',
  'NBA Finals Highlights 2026',
  'skibidi toilet 100x',
  'prank gone wrong!!! please watch',
  'this happened in 24 hours',
  'OMG INSANE EPIC COMEBACK',
  'crypto moon pump to the moon',
  'drama apology cancelled responded to',
  'Are you sure???',
  'C++ tutorial #music',
  'Building a workbench (part 3)',
  ''
];
for (const title of CORPUS) {
  ok(contentCtx.looksSensationalist(title) === bgCtx.looksSensationalist(title),
    `looksSensationalist disagrees for: ${JSON.stringify(title)}`);
  ok(contentCtx.heuristicDebaitTitle(title) === bgCtx.heuristicDebaitTitle(title),
    `heuristicDebaitTitle disagrees for: ${JSON.stringify(title)}`);
}

// 6. The de-bait path is actually reachable: a sensational title must be detected
//    at all (a table that stopped matching would pass every check above).
console.log('Test 6: the tables still detect and neutralize');
ok(contentCtx.looksSensationalist('SHOCKING FOOTAGE EXPOSED') === true, 'sensational title not detected');
ok(contentCtx.looksSensationalist('Building a workbench (part 3)') === false, 'benign title flagged');
ok(contentCtx.heuristicDebaitTitle('SHOCKING FOOTAGE EXPOSED!!') !== 'SHOCKING FOOTAGE EXPOSED!!',
  'sensational title not neutralized');

console.log(`\nAll ${checks} shared-tables checks passed. ✅`);
