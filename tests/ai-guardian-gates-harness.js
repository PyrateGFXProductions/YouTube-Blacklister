/*
 * Regression harness: THE AI GUARDIAN MAY NOT UNDO WHAT THE USER CHOSE.
 *
 * The reported failure, verbatim in shape:
 *   "The AI guardian is blocking too much and is not being at all intelligent about what
 *    it is blocking in relationship to my subscriptions, blocked channels and keywords!
 *    I don't want 'Ancient' blocked or 'Cosmic Summit/pyramid' content blocked primarily
 *    because I am subscribed to Cosmic Summit!"
 * and, from the extension's own stored verdicts, a block whose rationale read
 *   "'10 Prehistoric Blades Made From Metal That Doesn't Exist Yet' -> matches the 'top 10' rule"
 * for a title that no rule in the user's list matches.
 *
 * The Guardian is allowed to make taste calls. It is NOT allowed to:
 *   G1. hide a video from a channel the user is subscribed to (the reported case);
 *   G2. hide a video from a channel the user whitelisted (the matcher's own precedence);
 *   G3. hide a video because the model APPROXIMATE-MATCHED the user's keyword/channel
 *       rules — those are enforced exactly and deterministically elsewhere (a card that
 *       really matched is already hidden before the Guardian's batch is even built);
 *   G4. (control) stop doing its actual job: a genuine slop verdict on an ordinary
 *       channel still hides the card, persists, and offers the Undo toast.
 *   G5. be PROMPTED with the user's rule lists in the first place, which is what invited
 *       the approximate matching (the rules are enforced exactly, so handing them to the
 *       model can only produce guesses).
 *
 * content.js runs in a vm against a minimal DOM + synchronous in-memory chrome.storage,
 * so the real runAiEvaluationBatch() path — gates, hide, persistence, toast — is what
 * gets asserted, not a copy of it.
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

// A feed card with exactly the surface runAiEvaluationBatch() touches:
//   getVideoId()          -> dataset.videoId
//   getVideoTitle()       -> querySelector('#video-title...')
//   getChannelName() / getCardChannelKeys() -> querySelectorAll(... '#channel-name', 'a[href*="/@"]' ...)
//   cardAutoDubBadgeText()-> querySelectorAll('[aria-label]')  (nothing here: no badge)
function makeCard(title, opts) {
  const o = opts || {};
  const titleEl = { textContent: title, getAttribute: () => title };
  const channelEl = { textContent: o.channel || '', getAttribute: () => null };
  const card = {
    tagName: 'YTD-RICH-ITEM-RENDERER',
    dataset: o.vid ? { videoId: o.vid } : {},
    id: '', className: '', textContent: '', isConnected: true,
    parentElement: null, children: [],
    style: makeStyle(),
    classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
    querySelector(sel) {
      const s = String(sel);
      if (s.includes('video-title') || s.includes('title')) return titleEl;
      return null;
    },
    querySelectorAll(sel) {
      const s = String(sel);
      if (s.includes('channel') || s.includes('#owner') || s.includes('#byline') || s.includes('/@')) {
        return [channelEl];
      }
      return [];
    },
    closest() { return null; },
    matches() { return false; },
    appendChild(c) { card.children.push(c); return c; },
    addEventListener() {}, removeEventListener() {},
    getAttribute() { return null; }, setAttribute() {}, removeAttribute() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; }
  };
  return card;
}

const never = () => new Promise(() => {});
let CARDS = [];
const body = makeCard('', {});

const context = {
  console,
  CARDS,
  makeCard,
  document: {
    body, documentElement: makeCard('', {}), visibilityState: 'visible', readyState: 'complete',
    getElementById: () => null,
    createElement: () => makeCard('', {}),
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null,
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
  URL, DOMParser: class { parseFromString() { return { getElementsByTagName: () => [] }; } },
  chrome: {
    runtime: { id: 'ai-guardian-gates-harness', onMessage: { addListener() {} }, lastError: null, sendMessage: () => never(), getURL: (p) => p },
    storage: { local: { get: () => never(), set: () => never() } },
    tabs: { query: () => never(), sendMessage: () => never() }
  }
};
vm.createContext(context);
// The manifest injects shared-tables.js ahead of content.js — do the same.
vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared-tables.js'), 'utf8'), context, { filename: 'shared-tables.js' });
vm.runInContext(fs.readFileSync(CONTENT_PATH, 'utf8'), context, { filename: CONTENT_PATH });

// ------------------------------------------------------------- test script --
const script = `
(async function () {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });

  // ---- synchronous in-memory storage, and a controllable model ---------------
  const store = {};
  chrome.storage.local = {
    get(keys, cb) { const res = {}; const list = Array.isArray(keys) ? keys : [keys]; for (const k of list) if (k in store) res[k] = store[k]; if (cb) cb(res); },
    set(obj, cb) { Object.assign(store, obj); if (cb) cb(); }
  };
  let sentBatches = [];
  let aiResponse = { evaluations: [] };
  chrome.runtime.sendMessage = (msg, cb) => {
    if (msg && msg.type === 'AI_EVALUATE_BATCH') sentBatches.push(msg);
    if (typeof cb === 'function') cb(aiResponse);
  };

  let lastToast = null;
  let lastUndo = null;
  showToast = function (msg, onUndo) { lastToast = msg; lastUndo = onUndo || null; };

  // ---- the user's own configuration -----------------------------------------
  // A subscribed channel (the reported Cosmic Summit case) and a whitelisted one.
  settings.extensionEnabled = true;
  settings.aiAutonomous = true;
  settings.aiTastePrompt = '';
  settings.aiSubscriptionProfile = 'DIY Adventure Enthusiast';
  settings.keywords = ['top 10', 'should you buy'];
  settings.channels = ['Some Blocked Channel'];
  settings.whitelistChannels = ['Whitelisted Wonder'];
  settings.subsSnapshot = [
    { name: 'Cosmic Summit', handle: '@cosmicsummit', url: 'https://www.youtube.com/@cosmicsummit' },
    { name: 'UnchartedX', handle: '@unchartedx', url: 'https://www.youtube.com/@unchartedx' }
  ];
  refreshSubscriptionKeySet();

  const runBatch = async (cards, verdicts) => {
    CARDS.length = 0;
    for (const c of cards) CARDS.push(c);
    aiResponse = { evaluations: verdicts };
    sentBatches = [];
    lastToast = null;
    lastUndo = null;
    aiBatchPending = false;
    await runAiEvaluationBatch();
    // The batch's own callback is synchronous in this harness; give any microtask a turn.
    await new Promise(r => setTimeout(r, 0));
  };
  const isHidden = (card) => card.style.getPropertyValue('display') === 'none';
  const aiDecisionKeys = () => (Array.isArray(store.nyt_aiDecisions) ? store.nyt_aiDecisions.map(e => e.key) : []);
  // "not persisted" must be checked per video: a later case legitimately persists its own
  // block, so total emptiness is not the invariant.
  const notPersisted = (vid) => !aiDecisionKeys().includes(String(vid).toLowerCase());

  // =====================================================================
  // G1. SUBSCRIBED CHANNEL — the reported case (Cosmic Summit / UnchartedX)
  // =====================================================================
  const subCard = makeCard('The Great Pyramid Was Not Built By Humans?', { vid: 'subVid00001', channel: 'Cosmic Summit' });
  await runBatch([subCard], [
    { id: 'subVid00001', block: true, rationale: 'Ancient pyramid claims presented as fact' }
  ]);
  ok('G1: a video from a SUBSCRIBED channel is not hidden, whatever the model says',
    !isHidden(subCard) && !subCard.dataset.hiddenByAi,
    'display=' + subCard.style.getPropertyValue('display') + ' hiddenByAi=' + subCard.dataset.hiddenByAi);
  ok('G1b: and no block decision is persisted for it',
    notPersisted('subVid00001'), 'aiDecisions=' + JSON.stringify(aiDecisionKeys()));

  // The handle-only form must match too (snapshot entries carry handles).
  const handleCard = makeCard('Ancient Egypt: A Fresh Look', { vid: 'handleVid01', channel: 'UnchartedX' });
  await runBatch([handleCard], [{ id: 'handleVid01', block: true, rationale: 'Alternative history content' }]);
  ok('G1c: subscription identity matches by name or handle', !isHidden(handleCard),
    'display=' + handleCard.style.getPropertyValue('display'));

  // The SNAPSHOT may hold a squashed spelling ("grahamhancock") while the card renders the
  // spaced display name and exposes no channel anchor at all. Comparing only the normalized
  // display name made the exemption silently miss those channels — which is how keyword
  // rules and 'smart' auto-dub ended up hiding videos from channels the user FOLLOWS.
  settings.subsSnapshot = [
    { name: 'Cosmic Summit', handle: '@cosmicsummit', url: 'https://www.youtube.com/@cosmicsummit' },
    { name: 'grahamhancock', handle: '@GrahamHancock', url: 'https://www.youtube.com/@GrahamHancock' }
  ];
  refreshSubscriptionKeySet();
  const squashCard = makeCard('Ancient Apocalypse: The Evidence', { vid: 'squashVid01', channel: 'Graham Hancock' });
  await runBatch([squashCard], [{ id: 'squashVid01', block: true, rationale: 'Alternative archaeology claims' }]);
  ok('G1d: a SNAPSHOT entry stored squashed still protects the spaced display name ("Graham Hancock")',
    !isHidden(squashCard) && notPersisted('squashVid01'),
    'display=' + squashCard.style.getPropertyValue('display') + ' aiDecisions=' + JSON.stringify(aiDecisionKeys()));

  // ...and the spelling-insensitive match must not become a fuzzy match: a short snapshot
  // entry ("sam") can never reach a longer, different channel ("Samsung").
  settings.subsSnapshot = [{ name: 'sam', handle: '@sam' }];
  refreshSubscriptionKeySet();
  const samsungCard = makeCard('Galaxy S30 Ultra Review And Teardown', { vid: 'samsungVid1', channel: 'Samsung' });
  await runBatch([samsungCard], [{ id: 'samsungVid1', block: true, rationale: 'Sponsored product placement' }]);
  ok('G1e: a short snapshot entry ("sam") does NOT protect a different channel ("Samsung")',
    isHidden(samsungCard), 'display=' + samsungCard.style.getPropertyValue('display'));
  settings.subsSnapshot = [
    { name: 'Cosmic Summit', handle: '@cosmicsummit', url: 'https://www.youtube.com/@cosmicsummit' },
    { name: 'UnchartedX', handle: '@unchartedx', url: 'https://www.youtube.com/@unchartedx' }
  ];
  refreshSubscriptionKeySet();

  // =====================================================================
  // G2. WHITELISTED CHANNEL
  // =====================================================================
  const wlCard = makeCard('A Perfectly Ordinary Video', { vid: 'wlVid000001', channel: 'Whitelisted Wonder' });
  await runBatch([wlCard], [{ id: 'wlVid000001', block: true, rationale: 'Too clickbaity for my taste' }]);
  ok('G2: a WHITELISTED channel is not hidden by the Guardian',
    !isHidden(wlCard) && notPersisted('wlVid000001'),
    'display=' + wlCard.style.getPropertyValue('display') + ' aiDecisions=' + JSON.stringify(aiDecisionKeys()));

  // =====================================================================
  // G3. THE MODEL APPROXIMATE-MATCHING THE USER'S RULES
  // =====================================================================
  // The real rationale out of the user's stored verdicts. The title contains no rule
  // from the list ('top 10' does not match "10 Prehistoric Blades …"), so the block is
  // the model reasoning from the rule list. Rule enforcement is deterministic.
  const ruleCard = makeCard('10 Prehistoric Blades Made From Metal That Does Not Exist Yet', { vid: 'ruleVid0001', channel: 'Odd Discoveries' });
  await runBatch([ruleCard], [
    { id: 'ruleVid0001', block: true, rationale: "The title matches the blocked keyword rule for 'top 10' style lists" }
  ]);
  ok('G3: a verdict that cites one of the user\\'s own RULES is refused (those blocks are deterministic)',
    !isHidden(ruleCard) && notPersisted('ruleVid0001'),
    'display=' + ruleCard.style.getPropertyValue('display') + ' aiDecisions=' + JSON.stringify(aiDecisionKeys()));

  const chanCite = makeCard('Some Video With No Id Here At All', { vid: 'chanVid0001', channel: 'Ordinary Channel' });
  await runBatch([chanCite], [
    { id: 'chanVid0001', block: true, rationale: 'Matches your channel block: "Some Blocked Channel"' }
  ]);
  ok('G3b: the same refusal covers a verdict citing a channel rule',
    !isHidden(chanCite) && notPersisted('chanVid0001'), 'display=' + chanCite.style.getPropertyValue('display'));

  // =====================================================================
  // G4. CONTROL — the Guardian still does its job on an ordinary channel
  // =====================================================================
  const slopCard = makeCard('You Wont BELIEVE What Happened Next!! (GONE WRONG)', { vid: 'slopVid0001', channel: 'Slop Factory' });
  await runBatch([slopCard], [
    { id: 'slopVid0001', block: true, rationale: 'Pure engagement bait with a fake stakes hook' }
  ]);
  ok('G4: a genuine slop verdict on an ordinary channel still hides the card',
    isHidden(slopCard) && slopCard.dataset.hiddenByAi === 'slopvid0001',
    'display=' + slopCard.style.getPropertyValue('display') + ' hiddenByAi=' + slopCard.dataset.hiddenByAi);
  ok('G4b: ...and it is persisted, so it survives the next feed pass',
    aiDecisionKeys().includes('slopvid0001'), 'aiDecisions=' + JSON.stringify(aiDecisionKeys()));
  ok('G4c: ...and the Undo toast is offered, so the hide is visible and reversible',
    /AI Intercepted/.test(String(lastToast || '')) && typeof lastUndo === 'function',
    'toast=' + JSON.stringify(lastToast));

  // A verdict with a non-boolean block never hides anything (unchanged invariant).
  const junkCard = makeCard('Another Ordinary Video Here', { vid: 'junkVid0001', channel: 'Ordinary Channel' });
  await runBatch([junkCard], [{ id: 'junkVid0001', block: 'true', rationale: 'string, not a boolean' }]);
  ok('G4d: a non-boolean block verdict is ignored', !isHidden(junkCard),
    'display=' + junkCard.style.getPropertyValue('display'));

  // =====================================================================
  // G5. WHAT THE MODEL IS TOLD
  // =====================================================================
  const payCard = makeCard('Basketball Weekly Roundup Episode 4', { vid: 'payVid00001', channel: 'Ordinary Channel' });
  await runBatch([payCard], [{ id: 'payVid00001', block: false, rationale: 'Clear' }]);
  const payload = sentBatches[0] || {};
  ok('G5: the batch carries the subscriptions (so they can be enforced on every side)',
    Array.isArray(payload.subscribed) && payload.subscribed.includes('Cosmic Summit'),
    'subscribed=' + JSON.stringify(payload.subscribed));
  ok('G5b: the batch carries the whitelist unchanged',
    Array.isArray(payload.whitelist) && payload.whitelist.includes('Whitelisted Wonder'),
    'whitelist=' + JSON.stringify(payload.whitelist));

  // =====================================================================
  // Unit level: the gate helpers themselves
  // =====================================================================
  const cited = [
    "matches the blocked keyword rule for 'should you buy'",
    "the title contains the phrase '6 8', which matches the blocked keyword rule",
    "Matches your keyword rule: “auto-dubbed”",
    'Matched your channel block: “Some Blocked Channel”',
    'this violates rule 3 of your blacklist'
  ];
  const taste = [
    'Pure engagement bait with a fake stakes hook',
    'Looks like an algorithmic auto-generated compilation',
    'Your whitelisted channel: “Whitelisted Wonder”',
    'Clear'
  ];
  ok('G6: rule-citing rationales are detected (the shape of the reported false blocks)',
    cited.every(r => aiRationaleCitesUserRule(r)), 'missed=' + JSON.stringify(cited.filter(r => !aiRationaleCitesUserRule(r))));
  ok('G6b: genuine taste rationales are NOT misread as rule citations',
    taste.every(r => !aiRationaleCitesUserRule(r)), 'misread=' + JSON.stringify(taste.filter(r => aiRationaleCitesUserRule(r))));

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
  // ------------------------------------------------ cross-file wiring (W) ----
  const contentSrc = fs.readFileSync(CONTENT_PATH, 'utf8');
  const bgSrc = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
  const fileChecks = [
    ['W1: the batch handler gates on whitelist, subscription and rule-citation before hiding',
      /if \(channelMatches\(match\.card, settings\.whitelistChannels\)\) return;/.test(contentSrc) &&
      /if \(cardIsSubscribed\(match\.card\)\) return;/.test(contentSrc) &&
      /if \(aiRationaleCitesUserRule\(ev\.rationale\)\) return;/.test(contentSrc) &&
      contentSrc.indexOf('channelMatches(match.card, settings.whitelistChannels)') <
      contentSrc.indexOf('persistAiDecisions([{\n        key,')],
    ['W2: the content script sends the subscription list with the batch',
      /subscribed: subscriptionDisplayNames\(\)/.test(contentSrc)],
    ['W3: the model prompt no longer receives the rule lists (that is what it approximate-matched)',
      !/User blocked channels: \$\{JSON\.stringify\(chList/.test(bgSrc) &&
      !/User blocked keyword rules: \$\{JSON\.stringify\(kwList/.test(bgSrc) &&
      /subscriptions \+ whitelist \(NEVER block\)/.test(bgSrc)],
    ['W4: the prompt says rules are enforced elsewhere and to answer block=false when unsure',
      /enforced separately and EXACTLY/.test(bgSrc) && /not confident, answer block=false/.test(bgSrc)],
    ['W5: the offline fallback hard-stops subscriptions as well as the whitelist',
      /const subHit = matchChannelIn\(channelName, subList\);/.test(bgSrc) &&
      /Your subscription: /.test(bgSrc)],
    ['W6: the model\'s own answers are filtered against whitelist + subscriptions',
      /if \(matchChannelIn\(vid\.channel, wlList\) \|\| matchChannelIn\(vid\.channel, subList\)\) continue;/.test(bgSrc)]
  ];
  for (const [name, pass] of fileChecks) results.push({ name, pass, detail: '' });

  let pass = 0, fail = 0;
  for (const r of results) {
    if (r.pass) { pass++; console.log('  PASS  ' + r.name); }
    else { fail++; console.log('  FAIL  ' + r.name + (r.detail ? '  [' + r.detail + ']' : '')); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) {
    console.log('\nThe Guardian is an assistant, not a second owner of the blacklist.\n' +
      'G1/G2 subscriptions + whitelist win, G3 rules stay deterministic, G4 taste calls still work, G5/W4 the prompt.');
    process.exit(1);
  }
}).catch((err) => {
  console.error('Harness rejected: ' + ((err && err.stack) || err));
  process.exit(1);
});
