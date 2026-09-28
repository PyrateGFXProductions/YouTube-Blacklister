/*
 * Regression harness for the de-bait RECYCLE fix.
 *
 * WHY: the de-baiter used to mark a card with a flat `dataset.debaitState`
 * boolean and skip anything carrying it. YouTube recycles card elements, so a
 * node de-baited once was skipped FOREVER — the next video that landed in that
 * element was never de-baited. The state is now keyed to the video id
 * (`debaitFor`), and stale per-video fields are dropped when the element moves
 * on. The delicate half is the other direction: while the card still shows the
 * SAME video the state must survive, or the ✨ original/neutral toggle fights
 * itself on every feed pass.
 *
 * content.js is loaded into a vm with a minimal DOM and the real functions run.
 *
 * RED/GREEN seam: set CONTENT_JS_PATH to a copy with the old sticky logic (see
 * tests/... or the probe) and the "recycled" checks below must FAIL.
 */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONTENT_PATH = process.env.CONTENT_JS_PATH || path.join(ROOT, 'content.js');
if (!fs.existsSync(CONTENT_PATH)) {
  console.error('content.js not found at ' + CONTENT_PATH);
  process.exit(1);
}

let pass = 0, fail = 0;
function check(actual, expected, label) {
  const ok = actual === expected;
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

// ------------------------------------------------------------------ DOM stub --
function makeStyle() {
  const p = {};
  return { setProperty(k, v) { p[k] = v; }, removeProperty(k) { delete p[k]; }, getPropertyValue(k) { return p[k] || ''; } };
}
function makeEl(tagName) {
  const el = {
    tagName: String(tagName || 'div').toUpperCase(),
    dataset: {}, id: '', className: '', textContent: '', innerHTML: '',
    parentElement: null, children: [], isConnected: true,
    style: makeStyle(),
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { c.parentElement = el; el.children.push(c); return c; },
    removeChild(c) { el.children = el.children.filter(x => x !== c); return c; },
    remove() {}, closest() { return null; }, matches() { return false; },
    setAttribute() {}, removeAttribute() {},
    getAttribute() { return null; },
    querySelectorAll() { return []; },
    // Faithful only where it matters: content.js asks the card for its title by
    // passing the big title-selector list, so match on the id inside it.
    querySelector(sel) {
      if (String(sel).includes('#video-title')) return el._titleEl || null;
      return null;
    },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; }
  };
  return el;
}

const never = () => new Promise(() => {});
const sandbox = {
  console,
  document: {
    body: makeEl('body'), documentElement: makeEl('html'),
    visibilityState: 'visible', readyState: 'complete',
    getElementById: () => null, createElement: (t) => makeEl(t),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}
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
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared-tables.js'), 'utf8'), sandbox, { filename: 'shared-tables.js' });
vm.runInContext(fs.readFileSync(CONTENT_PATH, 'utf8'), sandbox, { filename: CONTENT_PATH });

// --------------------------------------------------------------- the scenario --
function makeCard(videoId, title) {
  const card = makeEl('ytd-rich-item-renderer');
  card.dataset.videoId = videoId;
  const titleEl = makeEl('a');
  titleEl.textContent = title;
  card._titleEl = titleEl;
  return card;
}

console.log('--- Running de-bait recycle harness ---');

// Guard: the helpers under test must exist (a rename would otherwise silently
// turn this harness into a no-op that always passes).
for (const fn of ['showDebaitState', 'debaitIdentity', 'debaitAlreadyApplied', 'resetDebaitStateIfRecycled']) {
  check(typeof sandbox[fn], 'function', `${fn}() is exposed by content.js`);
}

const card = makeCard('VIDAAAAAAA1', "You won't believe this SHOCKING thing!!!");

// 1. De-bait video A.
sandbox.showDebaitState(card, 'ai', 'A calm neutral title');
check(card.dataset.debaitState, 'ai', 'video A: debaitState recorded');
check(card.dataset.debaitFor, 'VIDAAAAAAA1', 'video A: state keyed to the video id');
check(card.dataset.neutralTitle, 'A calm neutral title', 'video A: neutral title stored');

// 2. Same video -> the ✨ original/neutral toggle must keep working.
check(sandbox.debaitAlreadyApplied(card), true, 'same video: treated as already de-baited (toggle preserved)');
check(sandbox.resetDebaitStateIfRecycled(card), false, 'same video: reset must NOT fire (it would fight the toggle)');
check(card.dataset.debaitState, 'ai', 'same video: state untouched by the no-op reset');

// 3. YouTube recycles the node; it now shows video B. THIS is the regression:
//    with the old sticky boolean this returned true and the new title was skipped.
card.dataset.videoId = 'VIDBBBBBBB2';
check(sandbox.debaitAlreadyApplied(card), false, 'recycled card is NOT treated as already de-baited (the bug)');

// 4. Stale per-video fields must be dropped, not inherited by the new video.
check(sandbox.resetDebaitStateIfRecycled(card), true, 'recycled: reset reports the stale state was cleared');
check(card.dataset.debaitState, undefined, 'recycled: debaitState cleared');
check(card.dataset.debaitFor, undefined, 'recycled: debaitFor cleared');
check(card.dataset.neutralTitle, undefined, "recycled: previous video's neutral title cleared (not inherited)");
check(card.dataset.originalTitle, undefined, "recycled: previous video's original title cleared");

// 5. The recycled card is eligible again for its NEW title.
check(sandbox.debaitAlreadyApplied(card), false, 'recycled: eligible for de-baiting its new title');
sandbox.showDebaitState(card, 'ai', 'B calm neutral title');
check(card.dataset.debaitFor, 'VIDBBBBBBB2', 'video B: state re-keyed to the new video id');
check(card.dataset.neutralTitle, 'B calm neutral title', 'video B: its own neutral title stored');

// 6. A card with no resolvable id keeps the sticky fallback (recycling cannot be
//    detected without an identity, so the old guard is all there is).
const noId = makeCard('', 'A title');
sandbox.showDebaitState(noId, 'ai', 'neutral');
check(sandbox.debaitAlreadyApplied(noId), true, 'no video id: sticky fallback still guards re-processing');
check(sandbox.resetDebaitStateIfRecycled(noId), false, 'no video id: reset cannot fire (nothing to compare)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
