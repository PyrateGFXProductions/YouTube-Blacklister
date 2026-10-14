/*
 * Harness for keyword-audit.js — the deterministic keyword consolidator.
 *
 * THE POINT OF THIS HARNESS: consolidation must never change which titles get
 * hidden. So the central test is not "does the audit return the right array" —
 * it is a DIFFERENTIAL test. For a set of titles, it hides nothing differently
 * before and after consolidation. If that ever fails, the audit is unsafe and
 * must not ship, no matter how good its output looks.
 *
 * A secondary duty is pinning kwaPlainKeywordMatches against content.js's real
 * matcher, so the two cannot silently drift apart. The popup's audit runs in a
 * different world from the content script; if their matching semantics diverge,
 * "safe to remove" becomes a lie.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const auditSrc = fs.readFileSync(path.join(__dirname, '..', 'keyword-audit.js'), 'utf8');
const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// Load the audit module in its own context.
const auditCtx = { console };
vm.createContext(auditCtx);
vm.runInContext(auditSrc, auditCtx, { filename: 'keyword-audit.js' });
const A = vm.runInContext('({ kwaCleanChannelText, kwaEscapeRegExp, kwaIsRegexRule, kwaPlainKeywordMatches, kwaRegexCompiles, kwaFindSubsumers, kwaIsOverBroad, kwaAudit, kwaConsolidate, KWA_BROAD_WORDS })', auditCtx);

// Load content.js's REAL matcher for the differential comparison.
// content.js is a big file with chrome APIs; only the pure helpers are needed,
// so extract them the same way the other harnesses do.
function extractFn(name) {
  const m = contentSrc.match(new RegExp('^function ' + name + '\\([\\s\\S]*?^\\}', 'm'));
  if (!m) throw new Error('could not extract ' + name + ' from content.js');
  return m[0];
}
const realCtx = { console };
vm.createContext(realCtx);
vm.runInContext(
  extractFn('cleanChannelText') + '\n' + extractFn('escapeRegExp') + '\n' + extractFn('isReDoSSuspect'),
  realCtx, { filename: 'content.js-pure' }
);
// Provide the shared-table guard so the regex branch behaves as shipped.
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared-tables.js'), 'utf8'), realCtx, { filename: 'shared-tables.js' });
vm.runInContext(extractFn('hasWordBoundaryKeyword'), realCtx, { filename: 'content.js-matcher' });
const REAL = vm.runInContext('({ hasWordBoundaryKeyword })', realCtx);

let checks = 0;
function ok(cond, msg) { checks++; assert(cond, msg); }

// ---------------------------------------------------------------------------
// 1. The audit's matcher agrees with the shipped matcher.
//    If these disagree, "subsumed" is computed against the wrong semantics.
// ---------------------------------------------------------------------------
console.log('1. audit matcher agrees with content.js matcher (plain rules)');
const matcherProbeTexts = [
  'NBA Finals Highlights', 'Top 10 Gadgets', 'the worst review ever',
  'Graham Hancock Podcast', 'Rust Systems Programming Guide', '#music mix',
  'C++ tutorial', 'DW Documentary', 'Live from the studio', 'verified news report',
  'a • b • c', 'Pokémon GO', 'café résumé', '   spaced   out   ', 'MUSIC LOUD',
  'mrbeast challenge', '10 things you did not know', 'Top-10 list'
];
const matcherProbeRules = [
  'nba', 'top 10', 'the', 'worst', 'review', 'graham hancock', 'rust',
  '#music', 'c++', 'dw documentary', 'live', 'verified', 'music', 'loud',
  'mrbeast', '10 things', 'top 10 list', 'café', 'résumé', 'pokemon', 'go'
];
let mismatches = [];
for (const t of matcherProbeTexts) {
  for (const r of matcherProbeRules) {
    const mine = A.kwaPlainKeywordMatches(t, r);
    const theirs = REAL.hasWordBoundaryKeyword(t, r);
    if (mine !== theirs) mismatches.push(`text=${JSON.stringify(t)} rule=${JSON.stringify(r)} audit=${mine} shipped=${theirs}`);
  }
}
ok(mismatches.length === 0,
  `audit matcher must agree with the shipped matcher, differences: ${mismatches.slice(0, 5).join(' | ')}`);
console.log(`   ${matcherProbeTexts.length * matcherProbeRules.length} text/rule pairs agree exactly`);

// ---------------------------------------------------------------------------
// 2. Subsumption is REAL: a subsumed rule never hides anything its subsumer misses.
//    This is the invariant, tested by replaying a corpus through both lists.
// ---------------------------------------------------------------------------
console.log('2. subsumption never changes what gets hidden (differential test)');
const corpus = [
  'NBA Finals Highlights', 'Top 10 Gadgets of 2024', '10 things you must see',
  'Top 10 list revealed', 'the worst review ever', 'Movie review: Dune',
  'Best review channel', 'Graham Hancock Podcast', 'Joe Wanted To Sink His Boat',
  'Off-road adventure in Moab', 'Dub FX live set', 'Rob Dahm rebuild',
  'crypto scams exposed', 'dropshipping made easy', 'skibidi toilet episode',
  'politics news today', 'trump rally coverage', 'volcano kilauea eruption',
  'minecraft hardcore run', 'laptop review 2024', 'mpg test results',
  'early nhl standings', 'daily vlog', 'foreign film festival',
  'text to speech tutorial', 'satisfying slime video', 'oddly satisfying asmr'
];

// A list with genuine redundancy: short rules sitting inside longer ones.
// NOTE the containment must be real — "10 things" does NOT contain "top 10",
// so those two are independent rules and must both be kept. The redundant
// pairs below are true phrase-containments ("the" inside "the worst").
const redundant = [
  'top 10', 'top 10 list', 'the', 'the worst', 'review', 'worst', 'gossip',
  'mpg test', 'mpg test results', 'laptop', 'laptop review', 'off', 'off-road',
  'dub', 'dub fx', 'rob', 'rob dahm', 'boat', 'sink his boat',
  'nba', 'highlights', 'crypto', 'politics', 'live', 'music'
];
const hitsFor = (list) => {
  // Give every rule a hit so nothing is classified as dead — this test is
  // about SUBSUMPTION only.
  const h = {};
  list.forEach(r => { h[r.toLowerCase()] = 5; });
  return h;
};
const report = A.kwaAudit(redundant, hitsFor(redundant));
ok(report.stats.subsumed > 0, 'the redundant list must produce subsumption findings');
// Each of these must be found as subsumed by its SHORTER partner. The LONGER
// rule is the redundant one — everything it hides, the shorter rule already
// hides, because a rule matches any title CONTAINING its text.
for (const [long, short] of [
  ['the worst', 'the'], ['laptop review', 'review'], ['mpg test results', 'mpg test'],
  ['laptop review', 'laptop'], ['off-road', 'off'], ['dub fx', 'dub'],
  ['rob dahm', 'rob'], ['sink his boat', 'boat'], ['top 10 list', 'top 10']
]) {
  const found = report.subsumed.find(s => s.rule === long);
  ok(found && found.subsumedBy.includes(short),
    `"${long}" must be reported as subsumed by "${short}", got ${JSON.stringify(found)}`);
}
// The SHORTER rules must NEVER be flagged — dropping one would let videos in.
for (const broad of ['top 10', 'the', 'review', 'mpg test', 'laptop', 'off', 'dub', 'rob', 'boat']) {
  ok(!report.subsumed.some(s => s.rule === broad),
    `"${broad}" is the BROADER rule and must be KEPT, never reported as subsumed`);
}
// Independent rules with no containment either way stay put.
for (const indep of ['10 things', 'worst', 'gossip', 'nba', 'highlights', 'crypto', 'politics', 'live', 'music']) {
  ok(!report.subsumed.some(s => s.rule === indep),
    `"${indep}" is independent and must NOT be reported as subsumed`);
}
console.log(`   ${report.stats.subsumed} genuinely-redundant (longer) rules found; the broader rules are kept`);
const consolidated = A.kwaConsolidate(redundant, {
  subsumed: report.subsumed.map(s => s.rule)
});

// For every title, the set of rules that match must be non-empty in both lists
// whenever it is non-empty in either. That is the "nothing new hidden, nothing
// newly visible" property.
let coverageLost = [];
for (const title of corpus) {
  const before = redundant.filter(r => REAL.hasWordBoundaryKeyword(title, r));
  const after = consolidated.filter(r => REAL.hasWordBoundaryKeyword(title, r));
  // Nothing may become newly visible.
  const lost = before.filter(r => !after.includes(r));
  if (lost.length && after.length === 0) {
    coverageLost.push(`title=${JSON.stringify(title)} was matched by ${JSON.stringify(before)} but nothing after`);
  }
}
ok(coverageLost.length === 0,
  `consolidation must never make a matched title unmatched: ${coverageLost.slice(0, 3).join(' | ')}`);
console.log(`   ${corpus.length} titles, ${redundant.length} rules -> ${consolidated.length} rules, zero coverage lost`);

// And the reverse direction, explicitly: no title that matched nothing before
// may start matching after (consolidation must not broaden either).
let overBlocked = [];
for (const title of corpus) {
  const before = redundant.filter(r => REAL.hasWordBoundaryKeyword(title, r));
  const after = consolidated.filter(r => REAL.hasWordBoundaryKeyword(title, r));
  if (before.length === 0 && after.length > 0) overBlocked.push(title);
}
ok(overBlocked.length === 0,
  `consolidation must not start hiding previously-visible titles: ${overBlocked.slice(0, 3).join(', ')}`);
console.log('   and no previously-visible title became hidden');

// ---------------------------------------------------------------------------
// 3. Over-broad rules are REPORTED but never removed by consolidation.
// ---------------------------------------------------------------------------
console.log('3. over-broad rules are reported, never auto-removed');
ok(A.kwaIsOverBroad('the'), 'a bare "the" is over-broad');
ok(A.kwaIsOverBroad('review'), 'a bare "review" is over-broad');
ok(A.kwaIsOverBroad('worst'), 'a bare "worst" is over-broad');
ok(!A.kwaIsOverBroad('car review'), 'a two-word rule is a real preference, not over-broad');
ok(!A.kwaIsOverBroad('cryptocurrency'), 'a long word is not over-broad');
ok(!A.kwaIsOverBroad('/top\\s*10/i'), 'regex rules are never judged over-broad');

const broadList = ['the', 'review', 'crypto', 'gossip', 'worst'];
const broadHits = {};
broadList.forEach(r => { broadHits[r.toLowerCase()] = 9; });
const broadReport = A.kwaAudit(broadList, broadHits);
ok(broadReport.stats.overBroad === 3, `expected 3 over-broad rules, got ${broadReport.stats.overBroad}`);
ok(broadReport.overBroad.map(o => o.rule).sort().join(',') === 'review,the,worst',
  `over-broad set wrong: ${JSON.stringify(broadReport.overBroad.map(o => o.rule))}`);
// Crucially: they survive consolidation, because kwaConsolidate accepts no
// over-broad input at all.
const afterBroad = A.kwaConsolidate(broadList, { overBroad: ['the', 'review', 'worst'] });
ok(afterBroad.length === broadList.length,
  `over-broad rules must survive consolidation even if asked to remove them: ${JSON.stringify(afterBroad)}`);
ok(afterBroad.includes('the') && afterBroad.includes('review') && afterBroad.includes('worst'),
  'the over-broad rules must still be present');
console.log('   "the", "review", "worst" flagged; all 5 rules survive consolidation');

// ---------------------------------------------------------------------------
// 4. Dead (0-hit) rules are caught, and the pre-existing behaviour still works.
// ---------------------------------------------------------------------------
console.log('4. dead rules are identified');
const mixed = ['nba', 'nevermatched', 'crypto', 'alsonever', 'gossip'];
const mixedHits = { nba: 12, crypto: 3, gossip: 1 };
const mixedReport = A.kwaAudit(mixed, mixedHits);
ok(mixedReport.stats.dead === 2, `expected 2 dead rules, got ${mixedReport.stats.dead}`);
ok(mixedReport.dead.map(d => d.rule).sort().join(',') === 'alsonever,nevermatched',
  `dead set wrong: ${JSON.stringify(mixedReport.dead.map(d => d.rule))}`);
const afterDead = A.kwaConsolidate(mixed, { dead: mixedReport.dead.map(d => d.rule) });
ok(afterDead.length === 3 && afterDead.includes('nba') && afterDead.includes('crypto'),
  `dead removal must keep the live rules: ${JSON.stringify(afterDead)}`);
console.log('   "nevermatched" and "alsonever" flagged; live rules kept');

// A rule with 0 hits that IS subsumed is reported as subsumed, not dead —
// one rule, one classification, no double-counting. Use a REAL containment:
// "top 10 list" contains "top 10", so the longer rule is the redundant one.
ok(mixedReport.stats.subsumed === 0, 'nothing in this list is subsumed');
const deadAndSubsumed = A.kwaAudit(['top 10', 'top 10 list'], { 'top 10': 7, 'top 10 list': 0 });
const tenList = deadAndSubsumed.subsumed.find(s => s.rule === 'top 10 list');
ok(tenList, '"top 10 list" (longer) must be classified as subsumed by "top 10"');
ok(!deadAndSubsumed.dead.some(d => d.rule === 'top 10 list'),
  'a subsumed rule must not ALSO be reported as dead (no double-counting)');
// The broader rule stays classified on its own merits (it has hits, so it is kept).
ok(deadAndSubsumed.keep.includes('top 10'),
  '"top 10" is the broader rule with hits and must be kept');
console.log('   a subsumed rule is classified once, not twice');

// ---------------------------------------------------------------------------
// 5. Broken regex rules are dead weight and safe to remove.
// ---------------------------------------------------------------------------
console.log('5. broken regex rules are detected');
ok(A.kwaRegexCompiles('/top\\s*10/i') === true, 'a valid regex compiles');
ok(A.kwaRegexCompiles('/[unclosed(/i') === false, 'an unclosed group does not compile');
ok(A.kwaRegexCompiles('/a{2,1}/i') === false, 'an invalid quantifier does not compile');
ok(A.kwaRegexCompiles('not a regex') === null, 'a plain rule is not judged as a regex');
const brokenList = ['nba', '/[unclosed(/i', 'crypto'];
const brokenReport = A.kwaAudit(brokenList, { nba: 5, crypto: 5 });
ok(brokenReport.stats.brokenRegex === 1, `expected 1 broken regex, got ${brokenReport.stats.brokenRegex}`);
const afterBroken = A.kwaConsolidate(brokenList, { brokenRegex: brokenReport.brokenRegex.map(b => b.rule) });
ok(afterBroken.length === 2 && !afterBroken.some(r => r.includes('unclosed')),
  `the broken regex must be removable: ${JSON.stringify(afterBroken)}`);
console.log('   an uncompilable regex is flagged and removable (the matcher can never run it)');

// ---------------------------------------------------------------------------
// 6. Regex rules are NEVER consolidated by containment.
// ---------------------------------------------------------------------------
console.log('6. regex rules are never consolidated by string containment');
const twoRegex = ['/top\\s*10/i', '/10\\s+things/i'];
const rxReport = A.kwaAudit(twoRegex, { '/top\\s*10/i': 5, '/10\\s+things/i': 5 });
ok(rxReport.stats.subsumed === 0,
  'no regex may be declared subsumed — containment does not prove coverage');
ok(rxReport.keep.length === 2, 'both regexes must be kept');
const { subsumedBy } = A.kwaFindSubsumers('/top\\s*10/i', twoRegex);
ok(subsumedBy.length === 0, 'kwaFindSubsumers must return nothing for a regex rule');
console.log('   regexes are left alone (coverage is not decidable by containment)');

// ---------------------------------------------------------------------------
// 7. Input hygiene: the audit never mutates its inputs and tolerates junk.
// ---------------------------------------------------------------------------
console.log('7. input hygiene');
const original = ['top 10', '10 things', 'nba'];
const frozenCopy = original.slice();
const h = { 'top 10': 5, '10 things': 5, nba: 5 };
const hCopy = JSON.parse(JSON.stringify(h));
A.kwaAudit(original, h);
A.kwaConsolidate(original, { subsumed: ['top 10'] });
assert.deepStrictEqual(original, frozenCopy, 'kwaAudit/kwaConsolidate must not mutate the rules array');
assert.deepStrictEqual(h, hCopy, 'kwaAudit must not mutate the hits object');
ok(true, 'inputs are not mutated');

const junkReport = A.kwaAudit([null, undefined, '', '   ', 'nba', 42], { nba: 3 });
ok(junkReport.total === 1, `junk entries must be filtered, total was ${junkReport.total}`);
ok(junkReport.keep.includes('nba'), 'the one real rule must survive a junk-filled list');
const emptyReport = A.kwaAudit([], {});
ok(emptyReport.total === 0 && emptyReport.keep.length === 0, 'an empty list audits cleanly');
const nullReport = A.kwaAudit(null, null);
ok(nullReport.total === 0, 'null input must not throw');
console.log('   junk filtered, no mutation, null-safe');

// ---------------------------------------------------------------------------
// 8. Order is preserved, so the user's list does not get reshuffled.
// ---------------------------------------------------------------------------
console.log('8. consolidation preserves order');
const ordered = ['zebra', 'nba', 'apple', 'crypto'];
const orderedOut = A.kwaConsolidate(ordered, { dead: ['nba'] });
assert.deepStrictEqual(orderedOut, ['zebra', 'apple', 'crypto'], 'order must be preserved');
console.log('   [' + orderedOut.join(', ') + ']');

// ---------------------------------------------------------------------------
// 9. The differential test on a larger realistic list.
//
//    IMPORTANT: this list deliberately contains 0-hit (dead) rules, and dead
//    rules ARE removed. So "a title that only matched a dead rule becomes
//    visible" is the CORRECT, INTENDED behaviour — that rule had never fired,
//    which means it had never been hiding that title either.
//
//    The invariant that must hold unconditionally is about SUBSUMPTION only:
//    removing a subsumed rule may never change coverage. So this section runs
//    two differential passes: one with ONLY subsumption applied (must be
//    perfectly coverage-preserving) and one with everything applied (must only
//    differ by rules that had zero recorded hits).
// ---------------------------------------------------------------------------
console.log('9. differential safety on a larger realistic list');
const bigList = [
  'nba', 'highlights', 'finals', 'top 10', '10 things', 'the', 'review',
  'worst', 'best', 'crypto', 'bitcoin', 'scam', 'dropshipping', 'dropshipp',
  'gossip', 'drama', 'politics', 'trump', 'news', 'skibidi', 'brainrot',
  'mrbeast', 'challenge', '100x', 'foreign', 'dubbed', 'subtitle',
  '/top\\s*10|10\\s+things/i', 'minecraft', 'hardcore', 'run'
];
const bigHits = {};
bigList.forEach((r, i) => { bigHits[r.toLowerCase()] = i % 4; });   // some 0-hit, some not
const bigReport = A.kwaAudit(bigList, bigHits);
console.log(`   ${bigList.length} rules -> ` +
  `subsumed ${bigReport.stats.subsumed}, dead ${bigReport.stats.dead}, ` +
  `over-broad ${bigReport.stats.overBroad} (kept), broken regex ${bigReport.stats.brokenRegex}`);

const allTitles = corpus.concat([
  'Bitcoin scam exposed', 'Dropshipping in 2024', 'Skibidi toilet remix',
  'MrBeast challenge winner', 'Minecraft hardcore world', 'Foreign dubbed anime',
  'Subtitle breakdown', 'Top 10 worst reviews', 'NBA finals game 7 highlights'
]);

// --- Pass A: SUBSUMPTION ONLY. Coverage must be bit-for-bit identical. ---
const subsOnly = A.kwaConsolidate(bigList, { subsumed: bigReport.subsumed.map(s => s.rule) });
let aLost = [], aGained = [];
for (const title of allTitles) {
  const before = bigList.filter(r => REAL.hasWordBoundaryKeyword(title, r));
  const after = subsOnly.filter(r => REAL.hasWordBoundaryKeyword(title, r));
  if (before.length && !after.length) aLost.push(title);
  if (!before.length && after.length) aGained.push(title);
}
ok(aLost.length === 0, `subsumption alone must lose no coverage: ${aLost.slice(0, 3).join(', ')}`);
ok(aGained.length === 0, `subsumption alone must gain no coverage: ${aGained.slice(0, 3).join(', ')}`);
console.log(`   pass A (subsumption only, ${bigList.length}->${subsOnly.length} rules): ` +
  `${allTitles.length} titles, coverage identical`);

// --- Pass B: everything approved. Coverage may only shrink where the removed
//     rule had ZERO hits (it was never hiding anything). ---
const everything = A.kwaConsolidate(bigList, {
  subsumed: bigReport.subsumed.map(s => s.rule),
  dead: bigReport.dead.map(d => d.rule),
  brokenRegex: bigReport.brokenRegex.map(b => b.rule)
});
const zeroHitSet = new Set(bigReport.dead.map(d => d.rule.toLowerCase()));
let bLost = [], bGained = [];
for (const title of allTitles) {
  const before = bigList.filter(r => REAL.hasWordBoundaryKeyword(title, r));
  const after = everything.filter(r => REAL.hasWordBoundaryKeyword(title, r));
  if (before.length && !after.length) {
    // Acceptable ONLY if every rule that used to match had zero hits.
    const allZero = before.every(r => zeroHitSet.has(r.toLowerCase()));
    if (!allZero) bLost.push(`${title} (was matched by ${JSON.stringify(before)})`);
  }
  if (!before.length && after.length) bGained.push(title);
}
ok(bLost.length === 0,
  `full consolidation may only shrink coverage via 0-hit rules: ${bLost.slice(0, 3).join(' | ')}`);
ok(bGained.length === 0,
  `full consolidation must never gain coverage: ${bGained.slice(0, 3).join(', ')}`);
console.log(`   pass B (everything, ${bigList.length}->${everything.length} rules): ` +
  `coverage shrank only through rules that had never matched`);

// And the over-broad rules are still present after full consolidation.
for (const o of bigReport.overBroad) {
  ok(everything.includes(o.rule), `over-broad rule "${o.rule}" must survive full consolidation`);
}

console.log(`\nAll ${checks} keyword-audit checks passed. ✅`);
