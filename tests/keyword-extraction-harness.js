/*
 * Regression harness: KEYWORD EXTRACTION must find the words that describe the video.
 *
 * The bug this exists for: candidates were emitted in POSITIONAL order — the first few
 * non-filler words of the title, then 2-3 word phrases glued together after the filler
 * had been deleted — and the caller stored the first three. On
 * "The Day We Got Out Of Prison" that produced a rule like 'day': a word that describes
 * nothing, matches a large slice of YouTube, and blocks videos the user never meant to
 * touch. The subject of that title sits at word 8, and it has to be found there.
 *
 * Invariants:
 *   K1. Relevance, not position. The words carrying the topic are found wherever they
 *       sit in the title, and a bare weak word ("day", "first") is never a rule on its
 *       own — that shape IS the bug.
 *   K2. Every multi-word rule must appear VERBATIM in the text it came from. The old
 *       phrase builder forged "rust go" out of "Rust vs Go": a rule that can never
 *       match, invisible in the list, and it hides the fact that extraction failed.
 *   K3. Specificity against the live feed. The other cards on screen are a free local
 *       corpus; a candidate that already matches several of them is a stock phrase of
 *       this feed, not a description of this video, and gets refused.
 *   K4. The model is not trusted either. A soft model answer ("day", "first day") goes
 *       through the same gate as the heuristic.
 *   K5. The user can see WHY: refused rules are named in the toast, not silently
 *       dropped.
 *
 * content.js runs in a vm against a minimal DOM + in-memory chrome.storage, so the real
 * click path (extractKeywordsFromCard -> storage) is what gets asserted.
 *
 * RED/GREEN seam: CONTENT_JS_PATH=<pre-fix content.js> must fail K1/K3/K4 — the old
 * caller slices the model's answer positionally instead of gating it.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONTENT_PATH = process.env.CONTENT_JS_PATH || path.join(ROOT, 'content.js');
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

function makeEl(tagName) {
  const el = {
    tagName: String(tagName).toUpperCase(),
    dataset: {}, id: '', className: '', textContent: '', cssText: '',
    parentElement: null, children: [], isConnected: true,
    style: makeStyle(),
    get parentNode() { return el.parentElement; },
    classList: {
      _s: {}, contains(c) { return Boolean(el.classList._s[c]); },
      add(c) { el.classList._s[c] = true; }, remove(c) { delete el.classList._s[c]; },
      toggle(c, on) { if (on) el.classList.add(c); else el.classList.remove(c); }
    },
    appendChild(c) { c.parentElement = el; el.children.push(c); return c; },
    removeChild(c) { el.children = el.children.filter(x => x !== c); return c; },
    remove() { if (el.parentElement) el.parentElement.removeChild(el); },
    closest() { return null; }, matches() { return false; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
    getAttribute() { return null; }, setAttribute() {}, removeAttribute() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; }
  };
  return el;
}

// A feed card with just enough surface for the extraction path: querySelector() answers
// the title lookup (getVideoTitleElement) and querySelectorAll() returns nothing, which
// is what getChannelName() walks. The card's own `contains` is identity, so the
// nesting check in collectOtherTitles() behaves like the real DOM.
function makeCard(title, videoId) {
  const card = {
    tagName: 'YTD-RICH-ITEM-RENDERER',
    dataset: videoId ? { videoId } : {},
    id: '', className: '', textContent: '', isConnected: true,
    parentElement: null, children: [],
    style: makeStyle(),
    classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
    querySelector() {
      return { textContent: title, getAttribute: () => title, style: makeStyle(), classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} }, appendChild(c) { return c; } };
    },
    querySelectorAll() { return []; },
    closest() { return null; }, matches() { return false; },
    contains(other) { return other === card; },
    appendChild(c) { card.children.push(c); return c; },
    addEventListener() {}, removeEventListener() {},
    getAttribute() { return null; }, setAttribute() {}, removeAttribute() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; }
  };
  return card;
}

const never = () => new Promise(() => {});
const body = makeEl('body');

// The visible feed. Tests replace its contents; document.querySelectorAll() keys off it.
let CARDS = [];

const context = {
  console,
  // Exposed so the inline script can swap the visible feed for each case.
  CARDS,
  makeCard,
  document: {
    body, documentElement: makeEl('html'), visibilityState: 'visible', readyState: 'complete',
    getElementById: () => null,
    createElement: (t) => makeEl(t),
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null,
    // Only the card selector matters here; everything else gets nothing, so the
    // 250ms re-scan persistKeywords() schedules is a no-op and cannot throw.
    querySelectorAll: (sel) => (String(sel).includes('ytd-rich-item-renderer') ? CARDS : [])
  },
  window: {
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, scrollBy() {},
    innerHeight: 800,
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
    // `id` must be truthy or isExtensionValid() short-circuits every storage write.
    runtime: { id: 'keyword-harness', onMessage: { addListener() {} }, lastError: null, sendMessage: () => never(), getURL: (p) => p },
    storage: { local: { get: () => never(), set: () => never() } },
    tabs: { query: () => never(), sendMessage: () => never() }
  }
};
vm.createContext(context);
// The manifest injects shared-tables.js ahead of content.js — do the same.
vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared-tables.js'), 'utf8'), context, { filename: 'shared-tables.js' });
vm.runInContext(fs.readFileSync(CONTENT_PATH, 'utf8'), context, { filename: CONTENT_PATH });

// ------------------------------------------------------------- test script --
// Plain concatenation only: this is a template literal, so backticks and ${} would end it.
const script = `
(async function () {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });
  const j = (v) => JSON.stringify(v);
  const descendants = (root, acc) => { acc = acc || []; for (const c of root.children) { acc.push(c); descendants(c, acc); } return acc; };

  // ---- the visible feed, which the tests swap per case ----------------------
  const setFeed = (titles) => {
    CARDS.length = 0;
    for (const t of titles) CARDS.push(makeCard(t));
  };

  // ---- live, synchronous storage + a controllable model --------------------
  const store = {};
  const writes = [];
  const aiCalls = [];
  let aiResponse = { ok: true, keywords: [], isFallback: false };
  chrome.storage.local = {
    get(keys, cb) {
      const list = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
      const res = {};
      for (const k of list) res[k] = store[k];
      if (typeof cb === 'function') { cb(res); return; }
      return Promise.resolve(res);
    },
    set(obj, cb) { Object.assign(store, obj); writes.push(JSON.parse(JSON.stringify(obj))); if (typeof cb === 'function') cb(); }
  };
  chrome.runtime.sendMessage = (msg, cb) => { aiCalls.push(msg); if (typeof cb === 'function') cb(aiResponse); };

  const persisted = () => {
    let last = [];
    for (const w of writes) if (Array.isArray(w.keywords)) last = w.keywords.slice();
    return last;
  };
  const resetState = () => {
    writes.length = 0;
    settings.keywords = [];
    store.keywords = [];
  };

  // =========================================================== A. the ranker ==
  // A1. The reported title. Position must not decide anything.
  const prison = 'The Day We Got Out Of Prison';
  const got = rankKeywordCandidates({ title: prison }, 8);
  ok('K1a: the subject of "The Day We Got Out Of Prison" is found (word 8), not "day" (word 2)',
    got.includes('prison') && !got.includes('day') && !got.includes('the') && !got.includes('we') &&
    !got.includes('out') && !got.includes('got'),
    'got ' + j(got));
  ok('K1b: the top candidate is not one of the title\\'s first three words',
    got.length > 0 && prison.toLowerCase().split(/[^a-z]+/).slice(0, 3).indexOf(got[0]) === -1,
    'top=' + j(got[0]));

  const gotSecond = rankKeywordCandidates({ title: 'First Day Out Of Prison \u2014 My Story' }, 8);
  ok('K1c: "First Day Out Of Prison" yields prison, never first/day/out/story',
    gotSecond.includes('prison') && !gotSecond.includes('first') && !gotSecond.includes('day') &&
    !gotSecond.includes('out') && !gotSecond.includes('story'),
    'got ' + j(gotSecond));

  // A2. Title + the creator's tags (the escalation path).
  const withTags = rankKeywordCandidates({
    title: 'The Day We Got Out Of Prison',
    tags: ['prison', 'prison release', 'reentry', 'documentary'],
    description: 'My first day out of prison after twelve years.'
  }, 8);
  ok('K1d: tags + description keep the rule on the subject',
    withTags.includes('prison') && withTags.includes('prison release') && !withTags.includes('day'),
    'got ' + j(withTags));

  // A3/A4. Over a corpus: no forged phrases, no bare filler as a rule.
  //
  // The punctuation cases are here because the first version of this harness only tested
  // space-separated titles, and passed while the invariant was false: "Prison-Break Story"
  // produced the rule "prison break", which the matcher's word-boundary regex (\bprison
  // break\b over the raw title) can never match, because a hyphen is not a space. Dead
  // against the title it came from, still live against unrelated videos.
  const CORPUS = [
    'The Day We Got Out Of Prison',
    'First Day Out Of Prison \u2014 My Story',
    'Rust vs Go: Which Is Better For Systems Programming',
    'I Spent 30 Days Building A Log Cabin In The Woods',
    'NBA Finals Highlights 2026',
    'Building a workbench (part 3)',
    'Why I Quit My Job As A Nurse',
    'Cooking A Steak Dinner On A Cast Iron Skillet',
    'Learning To Weld In A Weekend',
    'Cheap DIY Kitchen Renovation',
    'Airport Security Secrets Nobody Tells You',
    'Growing Tomatoes From Seed Indoors',
    'Prison-Break Story',
    'Prison/Break Story',
    'Prison.Break.Story',
    'Prison\u2014Break Story',
    'Prison \ud83d\ude94 Break',
    "Prison's Darkest Secret",
    'C++ Prison Break',
    'Top 10 Prison Escapes',
    'Prison_Break Documentary',
    'Log-Cabin Build'
  ];
  const forged = [], bare = [];
  for (const t of CORPUS) {
    const low = t.toLowerCase();
    for (const term of rankKeywordCandidates({ title: t }, 8)) {
      if (term.includes(' ')) { if (!low.includes(term)) forged.push(term + ' <- ' + t); }
      else if (NYT_KW_WEAK_ALONE.has(term) || NYT_KW_STOP_WORDS.has(term)) bare.push(term + ' <- ' + t);
    }
  }
  ok('K2: every multi-word rule appears verbatim in the text it came from (punctuation included)',
    forged.length === 0, forged.join(' ; '));
  ok('K1e: no bare weak/filler word is ever offered as a rule', bare.length === 0, bare.join(' ; '));
  ok('K2b: "Rust vs Go" no longer yields the impossible phrase "rust go"',
    !rankKeywordCandidates({ title: 'Rust vs Go: Which Is Better For Systems Programming' }, 8).includes('rust go'),
    j(rankKeywordCandidates({ title: 'Rust vs Go: Which Is Better For Systems Programming' }, 8)));

  // A3b. A derived rule must MATCH the title it was derived from, through the SAME
  // matcher the feed uses. Substring identity is necessary but not sufficient: the rule has
  // to survive the word-boundary regex, or it is a rule that can only ever fire on videos
  // the user never looked at. This is the assertion that catches a tokenizer and a matcher
  // disagreeing about what a word boundary is (an underscore counts as a word character
  // for a regex boundary, so "prison" in "prison_break" is not a whole word).
  const derived = [], unmatchable = [];
  for (const t of CORPUS) {
    for (const term of rankKeywordCandidates({ title: t }, 8)) {
      derived.push(term);
      if (!hasWordBoundaryKeyword(t, term)) unmatchable.push(term + ' !~ ' + t);
    }
  }
  ok('K2c: every derived rule matches its own title through the real word-boundary matcher',
    unmatchable.length === 0, unmatchable.join(' ; '));
  // Only the PUNCTUATION-GLUED forms are forgeries: "prison break" out of "Prison-Break
  // Story" can never match. "prison break" out of "C++ Prison Break" is a legitimate rule
  // (the words really are space-separated there), so the assertion is per-source, not a
  // blanket ban on the phrase.
  const forgedPhrases = [];
  for (const t of CORPUS) {
    const low = t.toLowerCase();
    for (const term of rankKeywordCandidates({ title: t }, 8)) {
      if (term.includes(' ') && !low.includes(term)) forgedPhrases.push(term + ' <- ' + t);
    }
  }
  ok('K2d: no rule is a punctuation-glued forgery of its own source',
    forgedPhrases.length === 0 && !rankKeywordCandidates({ title: 'Prison-Break Story' }, 8).includes('prison break') &&
    !rankKeywordCandidates({ title: 'Prison_Break Documentary' }, 8).includes('prison'),
    'forged=' + j(forgedPhrases) +
    ' underscore-derived=' + j(rankKeywordCandidates({ title: 'Prison_Break Documentary' }, 8)));

  // A3d. FRAME WORDS. The reported failure: the key icon proposed the frame of the title
  // instead of its subject — 'cool'/'tech' for "Cool Tech Under $50", 'inside'/'city'/'lost'
  // for "Inside the Lost City of the Maya" (with 'maya' falling off the end of the list).
  // A frame word is never a rule on its own; the subject word must still be found.
  const frameCases = [
    { title: 'Cool Tech Under $50', banned: ['cool', 'tech', 'cool tech'] },
    { title: 'Inside the Lost City of the Maya', banned: ['inside', 'city', 'lost'] },
    { title: 'The Great Pyramid Was Not Built By Humans?', banned: ['built', 'humans'] },
    { title: 'Best bang 4 buck gadgets you can buy right now', banned: ['gadgets', 'buy'] }
  ];
  const frameLeaks = [];
  for (const c of frameCases) {
    const got = rankKeywordCandidates({ title: c.title }, 8);
    for (const b of c.banned) if (got.includes(b)) frameLeaks.push(b + ' <- ' + c.title);
  }
  ok('K6a: a frame word ("cool", "tech", "inside", "city", "lost", "built", "humans") is never offered as a rule',
    frameLeaks.length === 0, frameLeaks.join(' ; '));
  ok('K6b: the SUBJECT of "Inside the Lost City of the Maya" is the rule it offers',
    j(rankKeywordCandidates({ title: 'Inside the Lost City of the Maya' }, 8)) === j(['maya']),
    j(rankKeywordCandidates({ title: 'Inside the Lost City of the Maya' }, 8)));
  ok('K6c: the subject of "The Great Pyramid Was Not Built By Humans?" is the rule it offers',
    j(rankKeywordCandidates({ title: 'The Great Pyramid Was Not Built By Humans?' }, 8)) === j(['pyramid', 'great pyramid']),
    j(rankKeywordCandidates({ title: 'The Great Pyramid Was Not Built By Humans?' }, 8)));
  ok('K6d: a frame word inside a real phrase stays usable ("maya civilization" keeps maya)',
    nytKwIsGenericRule('cool tech') && !nytKwIsGenericRule('maya civilization') &&
    !nytKwIsGenericRule('ancient rome') && nytKwIsGenericRule('tech'),
    'framed=' + j(['cool tech', 'maya civilization', 'ancient rome', 'tech'].map(nytKwIsGenericRule)));

  // A3c. Tag lists must not fuse into phrases no title contains.
  ok('K2e: separate tags do not fuse into a fake phrase',
    !rankKeywordCandidates({ tags: ['prison', 'reentry', 'documentary'] }, 5).includes('prison reentry documentary') &&
    j(rankKeywordCandidates({ tags: ['prison', 'reentry', 'documentary'] }, 5)) ===
    j(rankKeywordCandidates({ tags: 'prison, reentry, documentary' }, 5)),
    'array=' + j(rankKeywordCandidates({ tags: ['prison', 'reentry', 'documentary'] }, 5)) +
    ' string=' + j(rankKeywordCandidates({ tags: 'prison, reentry, documentary' }, 5)));

  // A5. Source weighting: the creator's tags outrank the transcript.
  ok('K1f: a tag beats a longer transcript word',
    rankKeywordCandidates({ tags: ['forge'], transcript: 'blacksmithing' }, 2)[0] === 'forge',
    j(rankKeywordCandidates({ tags: ['forge'], transcript: 'blacksmithing' }, 2)));

  // A6. The feed-specificity guard.
  const crowded = ['Prison life documentary', 'Leaving prison after 20 years', 'Prison food review',
    'Cooking a steak dinner', 'Learning to weld', 'Growing tomatoes', 'Cheap DIY kitchen'];
  const clean = ['Cooking a steak dinner', 'Learning to weld in a weekend', 'Growing tomatoes from seed',
    'Cheap DIY kitchen renovation', 'Airport security secrets', 'Cast iron skillet care', 'Kayaking rivers'];
  const guarded = rankKeywordCandidates({ title: 'Prison Release Day' }, 8, crowded);
  const unguarded = rankKeywordCandidates({ title: 'Prison Release Day' }, 8, clean);
  ok('K3a: a candidate already matching 3 other cards on screen is refused',
    !guarded.includes('prison') && guarded.includes('release'), 'got ' + j(guarded));
  ok('K3b: the same candidate survives an unrelated feed (the guard is not a blunt ban)',
    unguarded.includes('prison'), 'got ' + j(unguarded));
  ok('K3c: too small a corpus disables the guard instead of guessing',
    nytKwFeedHitsLimit(['a', 'b']) === Infinity && nytKwFeedHitsLimit(crowded) === Math.max(3, Math.ceil(crowded.length * 0.12)),
    'small=' + nytKwFeedHitsLimit(['a', 'b']) + ' big=' + nytKwFeedHitsLimit(crowded));
  ok('K3d: word-boundary matching ("prison" must not fire on "imprisonment")',
    nytKwFeedHits('prison', ['imprisonment tales', 'prison life']) === 1,
    'hits=' + nytKwFeedHits('prison', ['imprisonment tales', 'prison life']));

  // A7. The generic gate applied to model output.
  const generic = ['day', 'first', 'first day', 'day we', 'last night', 'the', 'we'];
  const specific = ['prison', 'prison release', 'day trading', 'out of prison', 'log cabin'];
  ok('K4a: filler-shaped rules are refused by the gate',
    generic.every(k => nytKwIsGenericRule(k)) && specific.every(k => !nytKwIsGenericRule(k)),
    'generic=' + j(generic.map(nytKwIsGenericRule)) + ' specific=' + j(specific.map(nytKwIsGenericRule)));

  // A8. Determinism, cap, junk input.
  ok('K1g: the same text always ranks the same way',
    j(rankKeywordCandidates({ title: 'Alpha Bravo Charlie Delta' }, 4)) ===
    j(rankKeywordCandidates({ title: 'Alpha Bravo Charlie Delta' }, 4)),
    j(rankKeywordCandidates({ title: 'Alpha Bravo Charlie Delta' }, 4)));
  ok('K1h: the limit is honoured and junk input yields nothing',
    rankKeywordCandidates({ title: 'alpha bravo charlie delta echo foxtrot' }, 3).length === 3 &&
    rankKeywordCandidates(null, 8).length === 0 && rankKeywordCandidates({}, 8).length === 0 &&
    keywordCandidates('', 8).length === 0 && keywordCandidates('the a an and or of to', 8).length === 0,
    'cap=' + rankKeywordCandidates({ title: 'alpha bravo charlie delta echo foxtrot' }, 3).length);

  // ================================================= B. the real click path ===
  loadSettings();
  resetState();

  // B1. THE REPORTED CASE, end to end. The title alone has a complete answer, so this must
  //     NOT touch the network or the model — that is the whole point of the fast path.
  setFeed(['Cooking a steak dinner', 'Learning to weld in a weekend', 'Growing tomatoes from seed',
    'Cheap DIY kitchen renovation', 'Airport security secrets', 'Cast iron skillet care',
    'Kayaking rivers', 'Sourdough starter guide']);
  const target = makeCard('The Day We Got Out Of Prison');
  CARDS.push(target);
  aiResponse = { ok: true, keywords: ['day', 'first day', 'prison', 'out of prison'], isFallback: false };
  await extractKeywordsFromCard(target);
  const b1 = persisted();
  ok('K1k: the reported title stores the subject word and nothing else',
    j(b1) === j(['prison']), 'stored ' + j(b1));
  ok('K1l: and it is instant — no model round trip for a title that already answers',
    aiCalls.length === 0, 'calls=' + aiCalls.length);

  // B1b. THE MODEL GATE. A title with nothing usable of its own escalates, and the junk the
  //      model proposes must be refused by the same gate the heuristic uses.
  resetState();
  const thinCard = makeCard('Day One');
  CARDS.push(thinCard);
  aiResponse = { ok: true, keywords: ['day', 'first day', 'prison', 'out of prison'], isFallback: false };
  await extractKeywordsFromCard(thinCard);
  const b1b = persisted();
  ok('K4b: the junk the model proposed is refused, the subject word is kept',
    b1b.includes('prison') && !b1b.includes('day') && !b1b.includes('first day') &&
    !b1b.includes('the') && !b1b.includes('we') && !b1b.includes('out') && !b1b.includes('got'),
    'stored ' + j(b1b));
  ok('K4c: the model was consulted and given the rest of the feed to judge against',
    aiCalls.length === 1 && Array.isArray(aiCalls[0].otherTitles) && aiCalls[0].otherTitles.length === 9,
    'calls=' + aiCalls.length + ' otherTitles=' + j(aiCalls[0] && aiCalls[0].otherTitles && aiCalls[0].otherTitles.length));

  const toasts = () => document.body.children.filter(el => el.id === 'nyt-ext-toast');
  const toastText = (t) => descendants(t).map(n => n.textContent).filter(Boolean).join(' | ');
  const lastToast = () => { const t = toasts(); return t.length ? toastText(t[t.length - 1]) : ''; };
  ok('K5: the toast names the rules that were refused, so the result is not a mystery',
    /Skipped 2 too-generic rules?: day, first day/i.test(lastToast()),
    'toast=' + j(lastToast()));

  // B2. The feed guard on the real path: the subject word is everywhere on screen.
  resetState();
  setFeed(['Prison life documentary', 'Leaving prison after 20 years', 'Prison food review',
    'Cooking a steak dinner', 'Learning to weld in a weekend', 'Growing tomatoes from seed',
    'Cheap DIY kitchen renovation', 'Airport security secrets']);
  const crowdedCard = makeCard('Prison Release Day');
  CARDS.push(crowdedCard);
  const aiCallsBefore = aiCalls.length;
  await extractKeywordsFromCard(crowdedCard);
  const b2 = persisted();
  ok('K3e: end to end, a rule that already matches the visible feed is not stored',
    !b2.includes('prison') && b2.length > 0, 'stored ' + j(b2));
  ok('K3f: the title alone was enough here — no model round trip',
    aiCalls.length === aiCallsBefore, 'calls=' + (aiCalls.length - aiCallsBefore));
  ok('K5a: the refusal reason is reported as a feed match, not as a generic word',
    /already matching other videos on screen: prison/.test(lastToast()), 'toast=' + j(lastToast()));

  // B3. A normal title: instant, and every rule is visibly from that title.
  resetState();
  setFeed(['Cooking a steak dinner', 'Learning to weld in a weekend', 'Growing tomatoes from seed',
    'Cheap DIY kitchen renovation', 'Airport security secrets']);
  const normalCard = makeCard('Wiring A Solar Array In A Log Cabin');
  CARDS.push(normalCard);
  const callsBefore = aiCalls.length;
  await extractKeywordsFromCard(normalCard);
  const b3 = persisted();
  const normalTitle = 'wiring a solar array in a log cabin';
  ok('K1i: a normal title yields its own distinctive rules',
    b3.length === 3 && b3.every(k => normalTitle.includes(k)), 'stored ' + j(b3));
  ok('K1j: the title path makes no model call (it stays instant)',
    aiCalls.length === callsBefore, 'calls=' + (aiCalls.length - callsBefore));

  // B4. Re-clicking does not re-add what is already there — it finds the rules the title
  //     still has to offer, and it never duplicates an entry.
  resetState();
  setFeed(['Cooking a steak dinner', 'Learning to weld in a weekend', 'Growing tomatoes from seed',
    'Cheap DIY kitchen renovation', 'Airport security secrets']);
  const again = makeCard('Wiring A Solar Array In A Log Cabin');
  CARDS.push(again);
  settings.keywords = b3.slice();
  store.keywords = b3.slice();
  aiResponse = { ok: true, keywords: ['wiring', 'array', 'cabin'], isFallback: false };
  await extractKeywordsFromCard(again);
  const b4 = persisted();
  ok('K5b: a re-click adds only new rules, keeps the existing ones first, and never duplicates',
    b4.length >= b3.length && j(b4.slice(0, b3.length)) === j(b3) &&
    b4.length === new Set(b4).size &&
    b4.slice(b3.length).every(k => 'wiring a solar array in a log cabin'.includes(k)),
    'stored ' + j(b4));

  // B4b. A title with nothing left to offer says so instead of writing junk.
  resetState();
  setFeed(['Cooking a steak dinner', 'Learning to weld in a weekend', 'Growing tomatoes from seed',
    'Cheap DIY kitchen renovation', 'Airport security secrets']);
  const exhausted = makeCard('The Day We Got Out Of Prison');
  CARDS.push(exhausted);
  settings.keywords = ['prison'];
  store.keywords = ['prison'];
  aiResponse = { ok: true, keywords: ['prison'], isFallback: false };
  const writesBefore = writes.length;
  await extractKeywordsFromCard(exhausted);
  ok('K5c: nothing is written when every candidate is already on the list',
    writes.length === writesBefore && j(store.keywords) === j(['prison']),
    'writes=' + (writes.length - writesBefore) + ' store=' + j(store.keywords));
  ok('K5d: and it says so instead of silently doing nothing',
    /No distinctive keyword/i.test(lastToast()), 'toast=' + j(lastToast()));

  // Leave nothing for the 250ms re-scan persistKeywords() schedules.
  CARDS.length = 0;
  return out;
})()
`;

let results;
try {
  results = vm.runInContext(script, context, { filename: 'harness-inline.js' });
} catch (err) {
  console.error('Harness crashed inside the vm: ' + ((err && err.stack) || err));
  process.exit(1);
}

new Promise((resolve) => resolve(results)).then((results) => {
  // ------------------------------------------------ cross-file wiring (C) ----
  const contentSrc = fs.readFileSync(CONTENT_PATH, 'utf8');
  const bgSrc = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
  const sharedSrc = fs.readFileSync(path.join(ROOT, 'shared-tables.js'), 'utf8');

  const fileChecks = [
    ['C1: extractKeywordsFromCard ranks the title instead of slicing it positionally',
      /rankKeywordCandidates\(\{ title: titleText \}/.test(contentSrc) &&
      !/addExtractedKeywords\(fromTitle\.slice/.test(contentSrc) &&
      !/fromTitle\.length >= 3/.test(contentSrc)],
    ['C2: the model round trip carries the visible feed with it',
      /type: 'AI_SUGGEST_KEYWORDS',[\s\S]{0,500}?otherTitles/.test(contentSrc)],
    ['C3: the extraction gate is shared, not re-implemented per call site',
      contentSrc.includes('function selectKeywordRules(') &&
      contentSrc.includes('nytKwIsGenericRule(norm)') &&
      contentSrc.includes('nytKwFeedHits(norm, otherTitles)')],
    ['C4: background.js gates model output through the same generic + feed checks',
      bgSrc.includes('nytKwIsGenericRule(kw)') && bgSrc.includes('nytKwFeedHits(kw, corpus)')],
    ['C5: background.js no longer fuses the sources into one string (the dead-phrase bug)',
      /rankKeywordCandidates\(\{/.test(bgSrc) && !/keywordCandidates\(\[title, note/.test(bgSrc)],
    ['C6: the new tables live only in shared-tables.js',
      /^const NYT_KW_WEAK_ALONE\b/m.test(sharedSrc) &&
      !/^const NYT_KW_WEAK_ALONE\b/m.test(contentSrc) &&
      !/^const NYT_KW_WEAK_ALONE\b/m.test(bgSrc) &&
      /^const NYT_KW_SOURCE_WEIGHTS\b/m.test(sharedSrc) &&
      !/^const NYT_KW_SOURCE_WEIGHTS\b/m.test(bgSrc)],
    ['C7: both engines still extract through the same shared entry point',
      sharedSrc.includes('function rankKeywordCandidates(') &&
      sharedSrc.includes('function keywordCandidates(text, limit)') &&
      contentSrc.includes('rankKeywordCandidates') && bgSrc.includes('rankKeywordCandidates')]
  ];
  for (const [name, pass] of fileChecks) results.push({ name, pass, detail: '' });

  let pass = 0, fail = 0;
  for (const r of results) {
    if (r.pass) { pass++; console.log('  PASS  ' + r.name); }
    else { fail++; console.log('  FAIL  ' + r.name + (r.detail ? '  [' + r.detail + ']' : '')); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) {
    console.log('\nA keyword rule that describes nothing still blocks real videos.\n' +
      'K1 relevance, K2 verbatim phrases, K3 feed specificity, K4 the model is gated too, K5 visible reasons.');
    process.exit(1);
  }
}).catch((err) => {
  console.error('Harness rejected: ' + ((err && err.stack) || err));
  process.exit(1);
});
