/*
 * Keyword audit + consolidation — the DETERMINISTIC half of rule cleanup.
 *
 * WHY THIS IS NOT IN popup.js: this is pure logic over data, with no DOM and no
 * chrome APIs, so it lives in its own file and is exercised directly by
 * tests/keyword-audit-harness.js. Putting it inline in the popup would mean the
 * only way to test "is this consolidation actually safe?" was to click a button
 * in a browser.
 *
 * THE ONE INVARIANT: consolidating must never change which titles get hidden.
 * Every rule this file proposes to drop is proved redundant BEFORE it is offered,
 * by replaying both rules through the extension's own matcher. Nothing here is
 * a heuristic about what a rule "probably" covers.
 *
 * Two safe removals are defined:
 *
 *   1. SUBSUMED — rule B's whole text sits inside rule A as a word-bounded match.
 *      Every title B matches, A matches too, so B can never hide anything A would
 *      not. Proven by construction, not by testing examples.
 *
 *   2. DEAD — B has never matched anything (0 recorded hits) AND is not subsumed
 *      by anything. A rule that has never fired and adds no coverage is noise.
 *      This is the existing "Remove 0-Hit Rules" behaviour, folded in so one
 *      pass reports both kinds.
 *
 * A third class is REPORTED BUT NEVER AUTO-REMOVED:
 *
 *   3. OVER-BROAD — a single short common word ("the", "can", "review", "worst").
 *      These match a large share of titles and are the usual cause of "it blocked
 *      too much", but whether one is wanted is a taste call only the user can
 *      make. Surfacing it with its hit count is the honest behaviour; silently
 *      deleting someone's rule is not.
 *
 * Regex rules are NEVER consolidated. A regex is an arbitrary program: whether
 * one subsumes another is not decidable by string containment, and guessing would
 * break the invariant above. They are audited only for validity and staleness.
 */

// ---------------------------------------------------------------------------
// Shared helpers. These MUST agree with content.js's matcher for the audit to
// mean anything, so they are written to the same semantics and pinned by tests.
// ---------------------------------------------------------------------------

// Mirrors content.js cleanChannelText(): NFKD-fold, strip diacritics, collapse
// whitespace, strip the word "verified" and YouTube's badge glyphs.
function kwaCleanChannelText(str) {
  if (!str) return '';
  try {
    return String(str)
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\bverified\b/gi, '')
      .replace(/[•✔✓]/g, '')
      .trim();
  } catch (_) {
    return String(str).replace(/\s+/g, ' ').trim();
  }
}

function kwaEscapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Is this rule a regex rule (/pattern/flags)? Same test the matcher uses.
function kwaIsRegexRule(keyword) {
  return typeof keyword === 'string' && keyword.startsWith('/') && keyword.lastIndexOf('/') > 0;
}

/*
 * Mirror of content.js hasWordBoundaryKeyword() for a PLAIN (non-regex) rule.
 *
 * This is a deliberate copy rather than an import: the content script and the
 * popup are separate worlds, and the audit must run in whichever one opened the
 * popup. The semantics are pinned by the harness — if content.js changes its
 * matching, the harness fails here rather than the audit quietly diverging.
 */
function kwaPlainKeywordMatches(text, keyword) {
  if (!text || !keyword) return false;
  try {
    const cleanKw = kwaCleanChannelText(keyword);
    const cleanT = kwaCleanChannelText(text);
    // A keyword that normalizes away must never match (see content.js).
    if (!cleanKw) return false;
    if (cleanKw.length > 200) return cleanT.includes(cleanKw.toLowerCase());
    const first = cleanKw[0], last = cleanKw[cleanKw.length - 1];
    const fB = /[a-zA-Z0-9_]/.test(first);
    const lB = /[a-zA-Z0-9_]/.test(last);
    const start = fB ? '\\b' : '';
    const end = lB ? '\\b' : '';
    return new RegExp(`${start}${kwaEscapeRegExp(cleanKw)}${end}`, 'i').test(cleanT);
  } catch (_) {
    return String(text).toLowerCase().includes(String(keyword).toLowerCase());
  }
}

// Does a regex rule compile? An uncompilable rule is dead weight: the matcher
// can never run it, so it has never hidden and never will hide anything.
function kwaRegexCompiles(keyword) {
  if (!kwaIsRegexRule(keyword)) return null;      // not a regex rule
  const lastSlash = keyword.lastIndexOf('/');
  const pattern = keyword.slice(1, lastSlash);
  const flags = keyword.slice(lastSlash + 1) || 'i';
  try { new RegExp(pattern, flags); return true; } catch (_) { return false; }
}

// ---------------------------------------------------------------------------
// The audit itself
// ---------------------------------------------------------------------------

/*
 * Classify one rule against every other rule.
 *
 * THE DIRECTION MATTERS AND IS EASY TO GET WRONG. Read this carefully.
 *
 * A rule matches a title when the title CONTAINS the rule's text. So a LONGER
 * rule matches FEWER titles than a shorter rule it contains:
 *
 *     "top 10"       matches every title containing "top 10"
 *     "top 10 list"  matches only titles containing "top 10 list"
 *                  ⊂ the set "top 10" matches
 *
 * Therefore the SHORTER rule is the broader one, and it is the one that must be
 * KEPT. The LONGER rule is the redundant one: everything it hides, the shorter
 * rule already hides. Dropping the shorter one would let videos back in — which
 * is precisely the bug this whole feature exists to avoid, and precisely the
 * inversion the differential test in the harness caught.
 *
 * So: rule B is subsumed by rule A when B's text CONTAINS A's text as a
 * word-bounded match (B is the longer, narrower rule).
 *
 * @param {string}   rule       the rule under examination
 * @param {string[]} allRules   every rule in the list (including `rule`)
 * @returns {{subsumedBy: string[]}}
 */
function kwaFindSubsumers(rule, allRules) {
  const subsumedBy = [];
  if (kwaIsRegexRule(rule)) return { subsumedBy };   // never consolidate regexes
  for (const other of allRules) {
    if (other === rule) continue;
    if (other.length >= rule.length) continue;       // a subsumer must be SHORTER
    // A subsumer must itself be a working rule: a broken regex proves nothing,
    // and a compiling regex is not PROVABLY broader, so it never counts.
    if (kwaIsRegexRule(other)) continue;
    // B (the longer rule) is subsumed by A (the shorter one) when B's own text
    // matches A's pattern — i.e. A's text sits inside B's text.
    if (kwaPlainKeywordMatches(rule, other)) subsumedBy.push(other);
  }
  return { subsumedBy };
}

/*
 * Is this rule dangerously over-broad? Single short common words match a large
 * share of real titles. Reported, never auto-removed.
 *
 * The word list is deliberately small and obviously-generic. It is a smoke
 * detector, not a filter: it exists to make the user look at a rule, and it
 * errs toward listing something questionable rather than staying silent.
 */
const KWA_BROAD_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'can', 'could', 'should', 'would',
  'will', 'do', 'does', 'did', 'not', 'no', 'yes', 'if', 'then', 'than',
  'this', 'that', 'these', 'those', 'it', 'its', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'get', 'got', 'go', 'going',
  'make', 'made', 'new', 'now', 'one', 'two', 'all', 'any', 'some', 'more',
  'most', 'very', 'just', 'only', 'also', 'too', 'how', 'what', 'when',
  'where', 'who', 'why', 'video', 'videos', 'review', 'reviews', 'best',
  'worst', 'top', 'full', 'part', 'episode', 'official', 'live', 'hd',
  'free', 'official', 'trailer', 'gameplay', 'lets', 'play', 'playing',
  'day', 'days', 'week', 'year', 'time', 'thing', 'things', 'stuff', 'people'
]);

function kwaIsOverBroad(rule) {
  if (!rule || kwaIsRegexRule(rule)) return false;
  const clean = kwaCleanChannelText(rule).toLowerCase();
  if (!clean) return false;
  // Only a bare single word is "over-broad" in this sense. A two-word rule like
  // "car review" is a real preference; "review" alone usually is not.
  if (/\s/.test(clean)) return false;
  if (clean.length > 8) return false;
  return KWA_BROAD_WORDS.has(clean);
}

/*
 * The full audit. Pure: same inputs always produce the same report, and the
 * report never mutates its inputs.
 *
 * @param {string[]} rules         the current keyword list
 * @param {Object}   hits          { lowercasedRule: matchCount }
 * @returns {{
 *   total: number,
 *   subsumed:  Array<{rule: string, subsumedBy: string[], hits: number}>,
 *   dead:      Array<{rule: string, reason: string, hits: number}>,
 *   overBroad: Array<{rule: string, hits: number}>,
 *   keep:      string[],
 *   brokenRegex: Array<{rule: string}>,
 *   stats: {subsumed: number, dead: number, overBroad: number, brokenRegex: number, keep: number}
 * }}
 */
function kwaAudit(rules, hits) {
  const list = Array.isArray(rules) ? rules.filter(r => typeof r === 'string' && r.trim()) : [];
  const hitMap = (hits && typeof hits === 'object') ? hits : {};
  const hitsOf = (r) => Number(hitMap[String(r).toLowerCase()]) || 0;

  const subsumed = [];
  const dead = [];
  const overBroad = [];
  const brokenRegex = [];
  const keep = [];

  for (const rule of list) {
    const h = hitsOf(rule);

    // 1. A regex that cannot compile is dead by definition — the matcher can
    //    never run it, so it has never hidden anything and never will.
    if (kwaIsRegexRule(rule) && kwaRegexCompiles(rule) === false) {
      brokenRegex.push({ rule });
      continue;
    }

    // 2. Subsumed by another working rule: safe to drop, coverage unchanged.
    const { subsumedBy } = kwaFindSubsumers(rule, list);
    if (subsumedBy.length) {
      subsumed.push({ rule, subsumedBy, hits: h });
      continue;
    }

    // 3. Never matched anything, and not covered by anything else. This is the
    //    pre-existing "0-hit" cleanup, now reported alongside the rest.
    if (h <= 0) {
      dead.push({ rule, reason: 'never matched a title', hits: h });
      continue;
    }

    // 4. Still active — but flag it if it looks dangerously broad.
    if (kwaIsOverBroad(rule)) {
      overBroad.push({ rule, hits: h });
      continue;   // reported, NOT removed
    }

    keep.push(rule);
  }

  // Rules reported as over-broad are still KEPT. They are a warning, not a
  // removal. keep[] therefore excludes them from the "safe to drop" total but
  // the consolidation must not discard them.
  const keptFinal = keep.concat(overBroad.map(o => o.rule));

  return {
    total: list.length,
    subsumed,
    dead,
    overBroad,
    brokenRegex,
    keep: keptFinal,
    stats: {
      subsumed: subsumed.length,
      dead: dead.length,
      overBroad: overBroad.length,
      brokenRegex: brokenRegex.length,
      keep: keptFinal.length
    }
  };
}

/*
 * Build the consolidated list for a set of approved removals.
 *
 * @param {string[]} rules       current list
 * @param {Object}   approved    { subsumed?: string[], dead?: string[], brokenRegex?: string[] }
 *                               (overBroad is deliberately NOT accepted here)
 * @returns {string[]} the new list, order preserved, nothing else touched
 */
function kwaConsolidate(rules, approved) {
  const list = Array.isArray(rules) ? rules.filter(r => typeof r === 'string' && r.trim()) : [];
  const ap = approved || {};
  const drop = new Set([
    ...(Array.isArray(ap.subsumed) ? ap.subsumed : []),
    ...(Array.isArray(ap.dead) ? ap.dead : []),
    ...(Array.isArray(ap.brokenRegex) ? ap.brokenRegex : [])
  ]);
  // Over-broad rules are never droppable through this API. They survive unless
  // the user removes them by hand through the normal rule editor.
  return list.filter(r => !drop.has(r));
}

// Exported for the harness (CommonJS) and for the popup (script tag).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    kwaCleanChannelText, kwaEscapeRegExp, kwaIsRegexRule, kwaPlainKeywordMatches,
    kwaRegexCompiles, kwaFindSubsumers, kwaIsOverBroad, kwaAudit, kwaConsolidate,
    KWA_BROAD_WORDS
  };
}
