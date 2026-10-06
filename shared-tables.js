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

// ------------------------------------------------------------------
// KEYWORD CANDIDATE EXTRACTION (shared by both contexts)
// ------------------------------------------------------------------
// A keyword rule is matched word-for-word (case-insensitive) against a feed card's
// title, badge text and channel name, so candidate rules must be short literal
// phrases. Both consumers must agree on what qualifies: the content script's
// one-click extractor AND the service worker's offline keyword-suggestion fallback.
// Two copies here would mean the same video yields different rules depending on
// whether the local model happened to be reachable.

// WHAT THIS FILE GOT WRONG (the "The / day / we" bug)
// ---------------------------------------------------
// Candidates used to come out in POSITIONAL order: the first non-filler words of the
// title, then 2- and 3-word phrases glued together after the filler words had been
// deleted. Both halves were broken.
//
//   * Position is not relevance. "The Day We Got Out Of Prison" puts its actual
//     subject at word 8, and the front of the title is 'day' — a word that matches a
//     huge slice of YouTube, so the rule silently blacklists unrelated videos.
//   * Deleting filler BEFORE building phrases forged phrases the title never
//     contained ("Rust vs Go" -> "rust go"): rules that can never match anything.
//     A dead rule is invisible to the user, still in their blacklist, and hides the
//     fact that the extraction failed.
//
// Ranking is now explicit. A candidate is scored by where it came from (the creator's
// own tags are the strongest statement of topic, the channel name the weakest), by
// its own informativeness, and — in the content script — by how specific it is to the
// video being looked at compared with the rest of the visible feed.

// Filler words dropped from candidate rules. Kept deliberately broad: a rule like
// "just" or "video" matches half of YouTube.
const NYT_KW_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'in', 'on', 'of', 'for', 'is', 'it', 'at', 'by',
  'with', 'from', 'as', 'this', 'that', 'these', 'those', 'your', 'you', 'we', 'our',
  'be', 'been', 'was', 'are', 'were', 'so', 'if', 'no', 'not', 'but', 'than', 'then',
  'will', 'can', 'just', 'more', 'what', 'how', 'why', 'when', 'where', 'which', 'who',
  'new', 'now', 'has', 'have', 'had', 'do', 'does', 'did', 'going', 'video', 'videos',
  'youtube', 'channel', 'content', 'feat', 'ft', 'vs', 'vs.', 'very', 'really', 'still',
  'ever', 'never', 'too', 'also', 'such', 'much', 'many', 'most', 'least', 'best',
  'worst', 'better', 'worse', 'thing', 'things', 'part', 'episode', 'full', 'official',
  'subscribe', 'like', 'live', 'watch', 'today', 'made', 'make', 'get', 'got', 'let',
  'one', 'two', 'all', 'any', 'some', 'out', 'up', 'down', 'about', 'into', 'over',
  'after', 'before', 'while', 'during', 'since', 'until', 'because', 'through',
  'between', 'against', 'without', 'within', 'along', 'around', 'behind', 'beyond',
  'across', 'under', 'above', 'below', 'near', 'off', 'onto', 'upon', 'per', 'via',
  'etc', 'aka',
]);

// Words that carry no topic on their own, but are perfectly good INSIDE a phrase.
// "day" as a standalone rule matches "Day 3 of…", "one day in…", "day in the life":
// that is how a rule ends up blocking videos the user never meant to touch, which is
// the whole complaint. "day trading" or "release day" are specific, so these words
// must stay in the token stream for phrases to be built from them — they may just
// never be offered as a rule by themselves. This is also why the filler set above is
// not simply extended: a stop word breaks a phrase, a weak word does not.
const NYT_KW_WEAK_ALONE = new Set([
  'day', 'days', 'night', 'nights', 'week', 'weeks', 'month', 'months', 'year', 'years',
  'hour', 'hours', 'minute', 'minutes', 'second', 'seconds', 'first', 'last', 'next',
  'final', 'beginning', 'end', 'life', 'time', 'times', 'world', 'people', 'person',
  'man', 'men', 'woman', 'women', 'guy', 'girl', 'boy', 'kids', 'kid', 'child',
  'children', 'story', 'stories', 'stuff', 'home', 'house', 'back', 'way', 'ways',
  'place', 'morning', 'evening', 'moment', 'moments', 'start', 'started', 'stop',
  'stopped', 'went', 'goes', 'come', 'came', 'know', 'knew', 'think', 'thought',
  'look', 'looks', 'looked', 'want', 'wanted', 'need', 'needed', 'take', 'took',
  'give', 'gave', 'good', 'bad', 'great', 'big', 'small', 'long', 'short', 'hard',
  'easy', 'high', 'low', 'true', 'real', 'actually', 'literally', 'entire', 'whole',
  'every', 'nothing', 'something', 'everything', 'anything', 'someone', 'old',
  'young', 'right', 'left', 'wrong', 'less', 'little', 'crazy', 'insane', 'wild',
  'epic', 'huge', 'massive', 'side', 'main', 'trying', 'tried', 'spent', 'spend',
  'spending', 'getting', 'making', 'doing', 'used', 'using', 'kept', 'put', 'left',
  'found', 'called', 'asked', 'told', 'became', 'become', 'turned', 'ended',
  'happened', 'happens', 'watched', 'played', 'bought', 'sold', 'gave', 'seemed',
  'decided', 'realized', 'realised', 'free', 'full', 'half', 'sure',
  'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'hundred',
  'thousand', 'million', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
]);

// FRAME / CATEGORY words: they describe the shape of a video, not what it is about, and
// they are everywhere on YouTube, so a rule built from one is noise that hides unrelated
// videos. This is the class the key-icon extraction kept offering — for
// "Cool Tech Under $50" it proposed 'cool', 'tech' and 'cool tech', and for
// "Inside the Lost City of the Maya" it proposed 'inside', 'city' and 'lost' while the
// subject ('maya') fell off the end of the list. The user asked for the subject.
//
// A frame word may still appear INSIDE a real phrase: "ancient rome" and "cool tech deals"
// are specific because of the other word. Only a phrase made ENTIRELY of frame/weak words
// ("cool tech") is refused. Kept deliberately separate from NYT_KW_WEAK_ALONE, which is
// about position/quantity words ("day", "first") rather than about topic framing.
const NYT_KW_FRAME_WORDS = new Set([
  // topic framings that describe a category rather than a subject
  'cool', 'tech', 'technology', 'technologies', 'gadget', 'gadgets', 'gear', 'device',
  'devices', 'product', 'products', 'item', 'items', 'inside', 'outside', 'city',
  'town', 'country', 'countries', 'humans', 'human', 'humanity', 'mankind', 'built',
  'build', 'building', 'builds', 'lost', 'dont', 'don', 'doesnt', 'cant', 'wont', 'im', 'ive',
  // consumer / review framing
  'buy', 'buying', 'cheap', 'cheapest', 'expensive', 'budget', 'affordable', 'price',
  'prices', 'pricing', 'worth', 'deal', 'deals', 'sale', 'sales', 'review', 'reviews',
  'unboxing', 'tutorial', 'tutorials', 'guide', 'guides', 'tips', 'tricks', 'hacks',
  'diy', 'explained', 'explanation', 'compilation', 'footage', 'clip', 'clips',
  // genre framings
  'documentary', 'documentaries', 'history', 'ancient', 'mystery', 'mysteries',
  'conspiracy', 'paranormal', 'science', 'facts', 'top', 'trending', 'viral', 'shorts',
  'news', 'update', 'updates', 'reaction', 'reactions', 'reacts'
]);

// Where a candidate came from decides what it is worth. The creator's own tags are a
// declaration of what the video is about; the title is the text a rule is matched
// against; a channel name is the weakest evidence of all, because it repeats on every
// card from that channel — it looks "specific" while being the opposite.
const NYT_KW_SOURCE_WEIGHTS = {
  tags: 3.2,
  title: 2.4,
  description: 1.2,
  note: 1.0,
  transcript: 0.8,
  channel: 0.5
};

// A phrase is more precise than the bare word inside it but matches far less, so it
// scores below its own words while still outranking a weak single word.
const NYT_KW_PHRASE_BONUS = 0.9;
const NYT_KW_MAX_PHRASE_WORDS = 3;

// Feed-specificity guard. `otherTitles` is the list of the OTHER cards on screen at
// the moment of the click: a local corpus that costs nothing. A candidate appearing
// across a meaningful slice of it is a stock phrase of this feed, not a description
// of this video, and must not become a rule. This is the part that makes the feature
// smarter than any fixed word list: it adapts to what the user is actually looking at.
const NYT_KW_FEED_MIN_CORPUS = 5;  // below this there is not enough evidence to judge
const NYT_KW_FEED_DF_RATIO = 0.12; // of the other cards on screen
const NYT_KW_FEED_MIN_HITS = 3;    // but never drop a candidate on one or two coincidences

function nytKwEscape(s) {
  return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary match, so "prison" does not fire on "imprisonment".
function nytKwTermRegex(term) {
  return new RegExp('(?:^|[^a-z0-9])' + nytKwEscape(term) + '(?:[^a-z0-9]|$)', 'i');
}

// ------------------------------------------------------------------
// CHANNEL IDENTITY, SPELLING-INSENSITIVE
// ------------------------------------------------------------------
// "Graham Hancock", "@grahamhancock" and "grahamhancock" are the same creator, and YouTube
// renders all three depending on the surface: the display name in the byline, the handle in
// the anchor href, and a squashed form in the subscription snapshot this extension captures.
// Comparing only the normalized display name meant a snapshot entry stored squashed
// ("grahamhancock") did NOT match a card that showed only the spaced display name ("Graham
// Hancock" -> "graham hancock") on any surface without a channel anchor. The consequences
// were the reported ones: the subscription/keyword exemption silently FAILED for exactly
// those channels, so keyword rules hid videos from channels the user follows, and 'smart'
// auto-dub filtering hid their auto-dubbed uploads.
//
// The squash is only ever compared for EQUALITY and only when the result is at least this
// long, so short fragments ("sam") can never reach a longer name ("Samsung") — the same
// reason matchChannelIn() refuses substring matching.
const NYT_CHANNEL_SQUASH_MIN = 6;

function squashChannelKey(name) {
  const s = String(name == null ? '' : name).toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9]/g, '');
  return s.length >= NYT_CHANNEL_SQUASH_MIN ? s : '';
}

function nytKwFeedHits(term, corpus) {
  if (!term || !Array.isArray(corpus) || !corpus.length) return 0;
  const re = nytKwTermRegex(term);
  let hits = 0;
  for (const t of corpus) if (re.test(String(t == null ? '' : t))) hits++;
  return hits;
}

// How many other on-screen cards a candidate may appear in before it counts as noise.
// Infinity disables the guard, which is correct when there is no corpus to judge by.
function nytKwFeedHitsLimit(corpus) {
  const n = Array.isArray(corpus) ? corpus.length : 0;
  if (n < NYT_KW_FEED_MIN_CORPUS) return Infinity;
  return Math.max(NYT_KW_FEED_MIN_HITS, Math.ceil(n * NYT_KW_FEED_DF_RATIO));
}

// A candidate too generic to stand as a rule: a bare weak word ("day", "first"), or a
// phrase made only of weak/filler words ("day we", "first day", "last night"). Used by
// the model path AND the offline path so a model that drifts soft cannot flood the
// blacklist with rules no better than the heuristic's.
function nytKwIsGenericRule(term) {
  const words = String(term == null ? '' : term).trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  if (words.length === 1) {
    return NYT_KW_WEAK_ALONE.has(words[0]) || NYT_KW_STOP_WORDS.has(words[0]) ||
      NYT_KW_FRAME_WORDS.has(words[0]);
  }
  return !words.some(w => !NYT_KW_WEAK_ALONE.has(w) && !NYT_KW_STOP_WORDS.has(w) &&
    !NYT_KW_FRAME_WORDS.has(w));
}

// Positioned tokens: [{ t, start, end, clean }] over the ORIGINAL (lowercased) string, so
// the gap between two tokens can be inspected. Needed because adjacency in the token
// stream is not adjacency in the text.
//
// `clean` means the token is a WHOLE WORD in the source — not glued to another word
// character. The matcher is a `\b`-bounded regex, and `\b` counts `_` as a word character,
// so "prison" inside "prison_break" is not a word boundary: a rule built from it can never
// match the very title it came from. The tokenizer must therefore agree with the matcher on
// what a word boundary is, or the two disagree silently and only the blacklist suffers.
function nytKwTokensWithPositions(text) {
  const s = String(text == null ? '' : text).toLowerCase();
  const out = [];
  const re = /[a-z0-9]+/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const before = start > 0 ? s[start - 1] : '';
    const after = end < s.length ? s[end] : '';
    const clean = !/^[a-z0-9_]$/.test(before) && !/^[a-z0-9_]$/.test(after);
    out.push({ t: m[0], start, end, clean });
  }
  return out;
}

// Maximal runs of consecutive usable tokens that are ALSO adjacent in the source text,
// separated by whitespace alone.
//
// Both conditions matter, and each catches a different way of forging a rule that no video
// contains:
//   * filler between them ("log cabin" out of "log of a cabin") — the run breaks, because
//     the phrase is not a contiguous substring of the text.
//   * PUNCTUATION between them ("prison break" out of "Prison-Break Story") — the run
//     breaks too. This one is the subtle case: the phrase IS a plausible-looking rule, but
//     the matcher is a word-boundary regex over the raw title, and a hyphen is not a space,
//     so the rule cannot match the very title it was derived from while remaining able to
//     match other videos. Dead against its source, live against strangers — the worst
//     combination, and invisible in the blacklist.
//   * a token glued to an underscore ("prison" in "prison_break") — dropped entirely, for
//     the same reason (see nytKwTokensWithPositions).
function nytKwRuns(text) {
  const toks = nytKwTokensWithPositions(text);
  const runs = [];
  let run = [];
  let prev = null;
  for (const tok of toks) {
    if (!tok.clean || tok.t.length < 3 || /^\d+$/.test(tok.t) || NYT_KW_STOP_WORDS.has(tok.t)) {
      if (run.length) runs.push(run);
      run = [];
      prev = tok; // still the adjacency reference, so the gap check stays honest
      continue;
    }
    if (prev && !/^\s*$/.test(text.slice(prev.end, tok.start))) {
      // Something other than whitespace sits between these two words.
      if (run.length) runs.push(run);
      run = [];
    }
    run.push(tok.t);
    prev = tok;
  }
  if (run.length) runs.push(run);
  return runs;
}

// Longer words tend to be the specific ones ("astrophysics" vs "thing"). A nudge, not
// a deciding factor — nothing here is positional.
function nytKwWordBonus(token) {
  return 1 + Math.max(0, Math.min(token.length, 16) - 4) * 0.12;
}

// Keyword candidates from arbitrary text, best-first.
//
// `sources` is { title, tags, description, transcript, note, channel } — any subset;
// `tags` may be a string or an array. `otherTitles` (optional) is the corpus of other
// cards on screen, used to reject candidates that are just common phrases in this feed.
// `dropped` (optional) is an array the caller passes in to be told WHICH candidates the
// feed guard refused — a silent drop leaves the user unable to tell a considered
// extraction from a broken one.
//
// NOT positional. For "The Day We Got Out Of Prison" the surviving candidates score
// roughly
//     prison              2.98   (the only word in the title carrying any topic)
//     prison              2.98   (tags: the creator's own declaration of subject)
// so the rule describes the video no matter where in the title the subject sat. The
// same title used to yield 'day' (word 2) for exactly the opposite reason.
function rankKeywordCandidates(sources, limit, otherTitles, dropped) {
  const max = Math.max(1, Number(limit) || 8);
  const src = (sources && typeof sources === 'object' && !Array.isArray(sources))
    ? sources
    : { title: sources };

  const corpus = (Array.isArray(otherTitles) ? otherTitles : [])
    .map(t => String(t == null ? '' : t).toLowerCase())
    .filter(Boolean);
  const hitsLimit = nytKwFeedHitsLimit(corpus);

  const scores = new Map();
  const bump = (term, points) => scores.set(term, (scores.get(term) || 0) + points);

  for (const key of Object.keys(NYT_KW_SOURCE_WEIGHTS)) {
    const raw = src[key];
    if (raw == null || raw === '') continue;
    const weight = NYT_KW_SOURCE_WEIGHTS[key];
    // Tags arrive as separate entries. Splitting on separators stops "cooking" and
    // "vlog" from fusing into the phrase "cooking vlog", which no title contains.
    // ORDER MATTERS: split on the separators FIRST (the join below uses '\n', so a
    // collapse-then-split would have already erased the very boundary it needs), then
    // collapse whitespace within each line so a run joined with single spaces is exactly
    // a substring of the text the run came from. The matcher collapses whitespace too,
    // so this cannot make a rule match less than it should.
    const text = Array.isArray(raw) ? raw.join('\n') : String(raw);
    for (const line of text.split(/[\n,;|]+/)) {
      const flat = line.replace(/\s+/g, ' ').trim();
      if (!flat) continue;
      for (const run of nytKwRuns(flat)) {
        for (const token of run) {
          // Weak-alone words ("day", "first") carry no topic but are fine inside a
          // phrase. FRAME words ("cool", "tech", "inside", "city", "lost", "built",
          // "humans") are not the subject in any form, so they are never offered at all.
          if (NYT_KW_WEAK_ALONE.has(token) || NYT_KW_FRAME_WORDS.has(token)) continue;
          bump(token, weight * nytKwWordBonus(token));
        }
        for (let n = 2; n <= NYT_KW_MAX_PHRASE_WORDS; n++) {
          for (let i = 0; i + n <= run.length; i++) {
            const words = run.slice(i, i + n);
            // A phrase of nothing but weak/frame words is a stock phrase ("first day",
            // "cool tech") — the exact noise this gate exists to remove. One real word
            // is enough to make it specific ("ancient rome", "cool tech deals").
            if (!words.some(w => !NYT_KW_WEAK_ALONE.has(w) && !NYT_KW_FRAME_WORDS.has(w))) continue;
            const phrase = words.join(' ');
            if (phrase.length < 5) continue;
            bump(phrase, weight * NYT_KW_PHRASE_BONUS);
          }
        }
      }
    }
  }

  const ranked = [];
  for (const [term, base] of scores) {
    const hits = nytKwFeedHits(term, corpus);
    if (hits >= hitsLimit) {
      if (Array.isArray(dropped)) dropped.push(term);
      continue;
    }
    ranked.push({ term, score: base / (1 + hits * 0.9) });
  }
  // Deterministic and position-free: score, then the longer (more specific) term,
  // then alphabetical. Without the tie-breaks two runs of the same text could offer
  // the caller different rules, and the harnesses could not pin the behaviour.
  ranked.sort((a, b) =>
    b.score - a.score ||
    b.term.length - a.term.length ||
    (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
  return ranked.slice(0, max).map(r => r.term);
}

// Convenience entry point for a caller holding a single blob of text (treated as the
// title). Both engines use the multi-source ranker above; this exists so the shared
// behaviour is still reachable — and still tested — from one string.
function keywordCandidates(text, limit) {
  return rankKeywordCandidates({ title: text }, limit);
}
