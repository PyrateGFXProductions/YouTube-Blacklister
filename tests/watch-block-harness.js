'use strict';
// Watch-page + feed keyword decision harness for content.js pure functions.
// No browser is launched. content.js top-level code is shimmed: readyState
// 'loading' means start() never runs; window/document stubs absorb listeners.

const path = require('path');

// --- Minimal browser shims (only what content.js touches at load time) ---
global.window = {
  addEventListener() {},
  location: { href: 'https://www.youtube.com/watch?v=_BcdZSgsVRg', pathname: '/watch', search: '?v=_BcdZSgsVRg', protocol: 'https:' },
  history: { length: 0 },
  __blkDebug: false
};
global.self = global.window;
global.document = {
  readyState: 'loading', // prevents start() from executing
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
global.MutationObserver = class { constructor() {} observe() {} disconnect() {} };
Object.defineProperty(global, 'navigator', { value: {}, configurable: true, writable: true });
global.location = global.window.location;

const src = require(path.join(__dirname, '..', 'content.js'));
const { watchPageBlockDecision, keywordRulesHidden, normalizeChannel, isAutoDubBadgeText, autoDubHideDecision, chipRescueState, shouldAutoEnterNewToYou } = src;

let pass = 0, fail = 0;
const errors = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; errors.push(`${name}\n    expected ${e}\n    actual   ${a}`); console.log(`  FAIL  ${name}\n    expected ${e}\n    actual   ${a}`); }
}

// Subscribed set built the same way buildSubscriptionKeySet does: names,
// handles (@ stripped by normalize) and channel URLs (extractEntityKey).
const subscribedSet = new Set([
  normalizeChannel('CinemaSins'),
  normalizeChannel('@SomeHandle'),
  'uc_abc123channelid'
]);
const emptySubs = new Set();
const WL = ['@cinemasins'];            // user protected via "Protect my subscriptions"
const CHANNELS = ['cinemasins', '@blockedchan'];
const keyws = ['movie', '/sins/i'];    // plausible synth rules hitting CinemaSins

console.log('WATCH PAGE decisions (watch=deliberate; only explicit blacklists interrupt):');
// 1. THE FIX: title keyword matched, NOT subscribed, NOT whitelisted -> still plays
// (channels list must NOT contain this channel — explicit blacklist correctly blocks)
check('1: keyword-in-title must NOT interrupt watch page',
  watchPageBlockDecision({ vid: '_bcdzsgsvrg', channel: 'cinemasins', title: 'Everything Wrong With Some Movie',
    channels: ['@blockedchan'], whitelistChannels: [], keywords: keyws, subscribed: emptySubs }),
  { block: false, reason: null });

// 2. channel-name regex /sins/i matched, not subscribed -> still plays
check('2: keyword-in-channel-name must NOT interrupt watch page',
  watchPageBlockDecision({ vid: '_bcdzsgsvrg', channel: 'cinemasins', title: 'Title',
    channels: [], whitelistChannels: [], keywords: keyws, subscribed: emptySubs }),
  { block: false, reason: null });

// 3. subscribed + title keyword -> never interrupted
check('3: subscribed channel + title keyword -> no block',
  watchPageBlockDecision({ vid: '_bcdzsgsvrg', channel: 'cinemasins', title: 'Everything Wrong With Some Movie',
    channels: ['cinemasins'], whitelistChannels: [], keywords: keyws, subscribed: subscribedSet }),
  { block: false, reason: 'subscribed' });

// 4. subscribed + EXPLICIT channel blacklist -> watch page still plays (feed still hides)
check('4: subscribed + explicit channel blacklist -> no bigger block (subscriptions never kidnapped)',
  watchPageBlockDecision({ vid: '_bcdzsgsvrg', channel: 'cinemasins', title: 'Everything Wrong With Some Movie',
    channels: ['cinemasins'], whitelistChannels: [], keywords: [], subscribed: subscribedSet }),
  { block: false, reason: 'subscribed' });

// 5. whitelisted + explicit channel blacklist -> never interrupted
// (channel passed pre-normalized, matching the production call site)
check('5: whitelisted + explicit blacklist -> no block',
  watchPageBlockDecision({ vid: '_bcdzsgsvrg', channel: 'cinemasins', title: 'Anything',
    channels: ['cinemasins'], whitelistChannels: WL, keywords: ['any'], subscribed: emptySubs }),
  { block: false, reason: 'whitelisted' });

// 6. video ID explicitly blacklisted -> interrupt (user intent)
check('6: explicit video-ID blacklist -> block',
  watchPageBlockDecision({ vid: '_bcdzsgsvrg', channel: 'unrelated', title: 'T',
    channels: ['https://www.youtube.com/watch?v=_BcdZSgsVRg'], whitelistChannels: [], keywords: [], subscribed: emptySubs }),
  { block: true, reason: 'video-id' });

// 7. explicit channel blacklist, NOT subscribed -> interrupt (user intent)
check('7: explicit channel blacklist, unsubscribed -> block',
  watchPageBlockDecision({ vid: '_bcdzsgsvrg', channel: 'cinemasins', title: 'T',
    channels: ['cinemasins'], whitelistChannels: [], keywords: [], subscribed: emptySubs }),
  { block: true, reason: 'channel' });

// 8. nothing matches -> play
check('8: no rules match -> no block',
  watchPageBlockDecision({ vid: '_bcdzsgsvrg', channel: 'cinemasins', title: 'T',
    channels: [], whitelistChannels: [], keywords: [], subscribed: emptySubs }),
  { block: false, reason: null });

console.log('FEED keyword rules (hiding is cheap/reversible; subscriptions immune):');
// 9. unsubscribed + title keyword -> hidden (existing behavior preserved)
check('9: unsubscribed + title keyword -> hidden',
  keywordRulesHidden({ title: 'Everything Wrong With Some Movie', channel: 'CinemaSins',
    keywords: ['movie'], subscribed: false, whitelisted: false }),
  { hidden: true, reason: 'keyword in Everything Wrong With Some Movie', matchedKeyword: 'movie' });

// 10. unsubscribed + channel-name regex -> hidden (existing behavior preserved)
check('10: unsubscribed + /sins/i on channel-name -> hidden',
  keywordRulesHidden({ title: 'Title', channel: 'CinemaSins',
    keywords: ['/sins/i'], subscribed: false, whitelisted: false }),
  { hidden: true, reason: 'keyword in CinemaSins', matchedKeyword: '/sins/i' });

// 11. subscribed -> keyword rules skip entirely
check('11: subscribed + title keyword -> not hidden',
  keywordRulesHidden({ title: 'Everything Wrong With Some Movie', channel: 'CinemaSins',
    keywords: ['movie'], subscribed: true, whitelisted: false }),
  { hidden: false, reason: null, matchedKeyword: null });

// 12. whitelisted -> keyword rules skip entirely
check('12: whitelisted + title keyword -> not hidden',
  keywordRulesHidden({ title: 'Everything Wrong With Some Movie', channel: 'CinemaSins',
    keywords: ['movie'], subscribed: false, whitelisted: true }),
  { hidden: false, reason: null, matchedKeyword: null });

// 13. no match -> not hidden
check('13: no keyword match -> not hidden',
  keywordRulesHidden({ title: 'A Totally Fine Video', channel: 'SomeChannel',
    keywords: ['movie'], subscribed: false, whitelisted: false }),
  { hidden: false, reason: null, matchedKeyword: null });

console.log('AUTO-DUB badge detection (the "Auto-dubbed" TAG is the ONLY signal):');
// 14-16. the auto-dub tag itself -> detected (long and short form of the same tag)
check('14: "Auto-dubbed" tag -> detected', isAutoDubBadgeText('Auto-dubbed'), true);
// 15. A PLAIN "Dubbed" label is NOT the Auto-dubbed tag. It appears in YouTube's audio-track
//     picker on perfectly ordinary uploads, and counting it as evidence is what hid
//     non-dubbed videos (the reported false positives). Only the Auto-dubbed tag counts.
check('15: "Dubbed" (no auto- prefix) -> NOT detected', isAutoDubBadgeText('Dubbed'), false);
check('16: "Auto-dub" tag -> detected', isAutoDubBadgeText('Auto-dub'), true);
check('16b: "Audio track: Auto-dubbed" -> detected', isAutoDubBadgeText('Audio track: Auto-dubbed'), true);
check('16c: a label merely CONTAINING "dubbed" -> NOT detected',
  isAutoDubBadgeText('Dune (dubbed version) review'), false);
// 17-19. non-badge text must NOT trigger
check('17: "LIVE" badge -> not detected', isAutoDubBadgeText('LIVE'), false);
check('18: "Premieres" badge -> not detected', isAutoDubBadgeText('Premieres in 2 days'), false);
check('19: title containing "double" -> not detected', isAutoDubBadgeText('How to make a double espresso'), false);

console.log('KEYWORD rules now SEE badge text (so the user\'s "auto-dubbed" rule finally works):');
// 20. THE USER'S RULE: keyword "auto-dubbed" now matches the badge on an otherwise-clean card
check('20: keyword "auto-dubbed" + card with Auto-dubbed badge -> hidden',
  keywordRulesHidden({ title: 'Everything Wrong With Dune', channel: 'CinemaSins',
    keywords: ['auto-dubbed'], subscribed: false, whitelisted: false, extraText: 'Auto-dubbed' }),
  { hidden: true, reason: 'keyword in Auto-dubbed', matchedKeyword: 'auto-dubbed' });
// 21. regex /auto.?dubbed/i form
check('21: regex /auto.?dubbed/i + badge -> hidden',
  keywordRulesHidden({ title: 'Everything Wrong With Dune', channel: 'CinemaSins',
    keywords: ['/auto.?dubbed/i'], subscribed: false, whitelisted: false, extraText: 'Auto-dubbed' }),
  { hidden: true, reason: 'keyword in Auto-dubbed', matchedKeyword: '/auto.?dubbed/i' });
// 22. badge does NOT trip keywords on a subscribed channel (soft rules respect subscriptions)
check('22: subscribed + badge + keyword -> NOT hidden (soft rule)',
  keywordRulesHidden({ title: 'Everything Wrong With Dune', channel: 'CinemaSins',
    keywords: ['auto-dubbed'], subscribed: true, whitelisted: false, extraText: 'Auto-dubbed' }),
  { hidden: false, reason: null, matchedKeyword: null });
// 23. no badge -> no keyword hit
check('23: no badge text -> not hidden',
  keywordRulesHidden({ title: 'Everything Wrong With Dune', channel: 'CinemaSins',
    keywords: ['auto-dubbed'], subscribed: false, whitelisted: false, extraText: '' }),
  { hidden: false, reason: null, matchedKeyword: null });

console.log('AUTO-DUB MODE semantics (the "not even from watched channels" nuance):');
// 24. TOTAL + subscribed + badge -> hidden  (THE USER CASE: Garage54ENG watched + subscribed, still hidden)
check('24: total + subscribed + badge -> hidden ("watched" channels lose too)',
  autoDubHideDecision('total', true, 'Auto-dubbed'),
  { hidden: true, reason: 'auto-dubbed:Auto-dubbed' });
// 25. TOTAL + unsubscribed + badge -> hidden
check('25: total + unsubscribed + badge -> hidden',
  autoDubHideDecision('total', false, 'Auto-dubbed'),
  { hidden: true, reason: 'auto-dubbed:Auto-dubbed' });
// 26. SMART keeps subscribed channels' auto-dubbed
check('26: smart + subscribed + badge -> NOT hidden (kept for subscriptions)',
  autoDubHideDecision('smart', true, 'Auto-dubbed'),
  { hidden: false, reason: null });
// 27. SMART hides recommended auto-dubbed (the common case)
check('27: smart + unsubscribed + badge -> hidden',
  autoDubHideDecision('smart', false, 'Auto-dubbed'),
  { hidden: true, reason: 'auto-dubbed:Auto-dubbed' });
// 28. OFF -> no auto-dub filtering (keyword rules still catch badges separately)
check('28: off + badge -> not hidden',
  autoDubHideDecision('off', false, 'Auto-dubbed'),
  { hidden: false, reason: null });
// 29. no badge, even in total -> not hidden
check('29: total + no badge -> not hidden',
  autoDubHideDecision('total', false, ''),
  { hidden: false, reason: null });
// 30. invalid mode string -> treated as off
check('30: garbage mode -> not hidden',
  autoDubHideDecision('banana', false, 'Auto-dubbed'),
  { hidden: false, reason: null });

console.log('CHIP RESCUE triage (YouTube-side vanishing chips bug):');
// 31. chips present + visible -> do nothing
check('31: chips present + visible -> none', chipRescueState(true, true), { action: 'none' });
// 32. chips present but hidden -> unhide (cheap, no reload)
check('32: chips present + hidden -> unhide', chipRescueState(true, false), { action: 'unhide' });
// 33. chips completely missing -> offer the restore button (never auto-reload)
check('33: chips missing -> missing', chipRescueState(false, false), { action: 'missing' });
check('34: chips missing (visible arg irrelevant) -> missing', chipRescueState(false, true), { action: 'missing' });

console.log('NEW TO YOU auto-start (closest native "not promoted" surface):');
// 35. chip present + active chip is "All" -> click it
check('35: "New to you" chip present + default All active -> click',
  shouldAutoEnterNewToYou(['All', 'New to you', 'Music'], 'All', false), true);
// 36. chip already active (SPA already on it) -> no repeat click
check('36: already on "New to you" -> no click',
  shouldAutoEnterNewToYou(['All', 'New to you', 'Music'], 'New to you', false), false);
// 37. chip missing for the account -> silent no-op
check('37: no "New to you" chip (personalized unavailable) -> no click',
  shouldAutoEnterNewToYou(['All', 'Gaming', 'Music'], 'All', false), false);
// 38. already clicked this session -> never re-click
check('38: already clicked -> no click',
  shouldAutoEnterNewToYou(['All', 'New to you', 'Music'], 'All', true), false);
// 39. empty chip bar -> no click
check('39: empty chip bar -> no click',
  shouldAutoEnterNewToYou([], '', false), false);
// 40. case-insensitive text variant ("NEW TO YOU") -> click
check('40: uppercase variant "NEW TO YOU" -> click',
  shouldAutoEnterNewToYou(['All', 'NEW TO YOU'], 'All', false), true);

console.log('BUG-SWEEP regression (content.js fixes):');
const { hasWordBoundaryKeyword, extractChannelNamesFromByline } = src;
// 41. multi-word channel names must never be split on whitespace
check('41: byline "Mark Rober and 2 more" -> ["Mark Rober"]',
  extractChannelNamesFromByline('Mark Rober and 2 more'), ['Mark Rober']);
// 42. same with a comma-separated collaborator — main channel must be [0]
check('42: "Mark Rober, Impractical Jokers and 2 more" -> main first, both names',
  extractChannelNamesFromByline('Mark Rober, Impractical Jokers and 2 more'),
  ['Mark Rober', 'Impractical Jokers']);
// 43. "A & B and 2 more" collaborator split on "&" not whitespace
check('43: "Vanoss & H2O and 2 more" -> ["Vanoss", "H2O"]',
  extractChannelNamesFromByline('Vanoss & H2O and 2 more'), ['Vanoss', 'H2O']);
// 44. plain name unaffected
check('44: byline plain name -> single entry',
  extractChannelNamesFromByline('MrBeast'), ['MrBeast']);
// 45. keyword starting with non-word char must match (previously \b-broken)
check('45: "#music" matches title with #music',
  hasWordBoundaryKeyword('Chill Lofi #music mix', '#music'), true);
// 46. keyword ending with non-word char must match
check('46: "C++" matches "C++ crash course"',
  hasWordBoundaryKeyword('C++ crash course', 'C++'), true);
// 47. C++ must NOT match "C" alone (no substring relaxation)
check('47: "C++" does not match plain "C" title',
  hasWordBoundaryKeyword('C programming basics', 'C++'), false);
// 48. real word boundaries still enforced
check('48: "movie" still needs a boundary',
  hasWordBoundaryKeyword('the cinematic artwork', 'movie'), false);
check('49: "movie" matches "movie review"',
  hasWordBoundaryKeyword('A movie review', 'movie'), true);
// 50. bare "Dub" must NOT flag a channel named "Dub FM" (FP fix)
check('50: "Go to channel Dub FM" is NOT an auto-dub badge',
  isAutoDubBadgeText('Go to channel Dub FM'), false);
// 51. real badges still detected
check('51: "Auto-dubbed" IS an auto-dub badge',
  isAutoDubBadgeText('Auto-dubbed'), true);
check('52: "Dubbed (English)" is NOT the Auto-dubbed tag -> not a trigger',
  isAutoDubBadgeText('Dubbed (English)'), false);
check('53: "Dublin" is NOT a badge',
  isAutoDubBadgeText('Dublin'), false);
// 54. regex /.../i rule path unaffected
check('54: regex keyword path unchanged',
  hasWordBoundaryKeyword('Sins everywhere', '/sins/i'), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('\n--- FAILURES ---\n' + errors.join('\n\n')); process.exit(1); }