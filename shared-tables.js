/*
 * shared-tables.js — SINGLE SOURCE OF TRUTH for the heuristic pattern tables.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * These tables are consumed by code in TWO different JavaScript contexts:
 *
 *   1. the background service worker (autonomous interceptor, subscription
 *      synthesizer, feed forensic roast, title de-baiter, TL;DW inspector), and
 *   2. the content script (the de-baiter's synchronous pre-filter and its
 *      heuristic fallback, which decide whether a card is even worth sending
 *      to the model).
 *
 * They used to be copy-pasted between the two files, and promptly drifted: the
 * content-script copy of the clickbait list was missing the `!!!` / `???` /
 * `LMAO|ROFL|WTF` patterns, and its de-bait cleaner was missing the
 * hot/leaked/banned/gone/died/destroyed/owned/roasted rule plus the `(?![?!.])`
 * lookahead — so the same title was neutralized differently depending on whether
 * the local model answered or the heuristic ran.
 *
 * HOW IT IS LOADED (both paths must stay wired)
 * --------------------------------------------
 *   Chrome / Chromium (MV3 service worker): the manifest names only
 *     "background.js", which calls importScripts('shared-tables.js') at its top.
 *   Firefox / Zen (MV3 event page): no importScripts in a non-worker context, so
 *     the packager emits background.scripts = ["shared-tables.js","background.js"]
 *     and this file simply loads first.
 *   Content script (everywhere): manifest content_scripts[].js =
 *     ["shared-tables.js","content.js"], injected into the same isolated world.
 *
 * Consequence: a top-level `const` here is visible to both consumers, so a
 * pattern added or removed here reaches every caller. No copy exists anywhere
 * else, and no consumer may redeclare these names.
 *
 * tests/tables-harness.js fails the build if any of these names is redeclared or
 * reverted to a local copy in background.js or content.js.
 */

// Clickbait / manipulation patterns. Consumers may slice() a subset in order of
// severity (e.g. the interceptor's fast path uses the first 7), but they must
// never re-declare the list itself.
const CLICKBAIT_PATTERNS = [
  /you won'?t believe/i,
  /in 24 hours/i,
  /shocking/i,
  /exposed/i,
  /skibidi/i,
  /100x/i,
  /!!!+/i,
  /!!+/i,
  /\b(?:OMG|LOL|WOW|INSANE|EPIC|CRAZY|HUGE|MASSIVE|LMAO|ROFL|WTF)\b/i,
  /\b(?:prank|reaction|challenge|vs)\b/i,
  /\?\?\?+/i,
  /\b(?:drama|cancelled|canceled|apology)\b/i,
  /\b(?:crypto|moon|pump|dump|rich|hustle)\b/i,
  /\b(?:hot|sexy|leaked|banned|gone|died|destroyed|owned|roasted)\b/i,
  /\b(?:nobody|everyone|anyone|somebody) (?:knows?|talks?|says?)\b/i,
  /(?:\d+\s+)?(?:things?|ways?|reasons?|secrets?|hacks?|tricks?) (?:you|to|that)/i
];

const SENSATIONAL_ADJECTIVES = [
  'shocking', 'exposed', 'insane', 'epic', 'crazy', 'massive', 'huge', 'wild',
  'incredible', 'unbelievable', 'mind-blowing', 'jaw-dropping', 'absolutely'
];

const OUTRAGE_WORDS = ['drama', 'cancel', 'exposed', 'owned', 'roasted', 'destroyed',
  'react', 'sues', 'beef', 'fight', 'controversy', 'leak'];

const PARASOCIAL_WORDS = ['my', 'our', 'we did it', 'community', 'thanks for watching',
  "here's", 'challenge', 'responding to'];

const DESPERATION_WORDS = ['24 hours', 'last chance', 'before it', 'gone', 'banned',
  'deleted', 'be careful', 'beware', 'how to get rich', 'free'];

const SPORTS_KEYWORDS = [
  'nba', 'nfl', 'mlb', 'nhl', 'fifa', 'uefa', 'football', 'soccer', 'basketball',
  'baseball', 'tennis', 'golf', 'volleyball', 'rugby', 'cricket', 'touchdown',
  'slam dunk', 'home run', 'super bowl', 'world cup', 'highlights'
];

const CRYPTO_KEYWORDS = ['crypto', 'bitcoin', 'memecoin', '100x', 'passive income',
  'dropshipping', 'forex', 'get rich quick', 'signals', 'guaranteed', 'airdrops',
  'pump', 'reversal packed', 'to the moon', 'crypto wealth', 'forex guru'];

const AI_SLOP_KEYWORDS = ['ai generated', 'faceless channel', 'text to speech',
  'ai voice', 'ai art', 'midjourney', 'stable diffusion'];

const BRAINROT_KEYWORDS = ['prank', 'skibidi', 'in 24 hours', "you won't believe",
  'shocking', 'exposed', 'reaction', 'challenge', '3am', 'cringe'];

const DRAMA_KEYWORDS = ['drama', 'canceled', 'apology video', 'responds to',
  'clout', 'drama alert'];

const SLOP_REGEX = '\\b(vlog|prank)\\s*#?\\d+';

// Title de-baiter: patterns stripped from sensational titles. Consumed by BOTH
// the service worker's heuristicDebaitTitle and the content script's.
const DEBait_CLEANERS = [
  /\b(in 24 hours)\b/gi,
  /\b(?:shocking|exposed|insane|epic|crazy|massive|huge|wild)(?![?!.])\b/gi,
  /\b(hot|leaked|banned|gone|died|destroyed|owned|roasted)\b/gi,
];

// Heuristic fallback keyword set used when nothing in the persona matched.
// Deliberately overlaps with the persona-specific tables above so the fallback
// is never completely empty.
const FALLBACK_KEYWORDS = ['prank', 'reaction', 'shocking', 'exposed', 'crypto', 'drama', 'skibidi'];

// Heuristic fallback regex rules — mirrors the persona-specific regex tables.
const FALLBACK_REGEX = ['/\\b(vlog|prank)\\s*#?\\d+/i'];

// Patterns used by the subscription synthesizer's heuristic noise filter.
// Shared with roastHeuristic's sensationalPatterns where they overlap.
const NOISE_PATTERNS = [
  /\b(prank|reaction|challenge|vs|showdown|competition|vs\.)\b/i,
  /\b(diss|beef|response|reply|reaction video|cancellation|apology)\b/i,
  /\b(how to get rich|passive income|side hustle|make money|crypto|100x|signals|guaranteed)\b/i,
  /uploaded \d{4}|\b(?:day|week|month|year|hours?|minutes?|seconds?|today|tonight|last chance)\b/i,
  /\?\?\?+|!!+|click here|must see|don't miss|subscribe|notification|follow\b/i,
];
