// Comprehensive test suite for AI Guardian Mind Reader & Keyword/Regex matching
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

global.chrome = {
  runtime: {
    onMessage: { addListener: () => {} },
    lastError: null
  },
  storage: {
    local: {
      get: (keys, cb) => cb({}),
      set: (obj, cb) => cb && cb()
    }
  }
};

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanChannelText(str) {
  if (!str) return '';
  try {
    return String(str)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\bverified\b/gi, '')
      .replace(/[•✔✓]/g, '')
      .trim();
  } catch (_) {
    return String(str).replace(/\s+/g, ' ').trim();
  }
}

function hasWordBoundaryKeyword(text, keyword) {
  if (!text || !keyword) return false;
  if (keyword.startsWith('/') && keyword.lastIndexOf('/') > 0) {
    const lastSlash = keyword.lastIndexOf('/');
    const pattern = keyword.slice(1, lastSlash);
    const flags = keyword.slice(lastSlash + 1) || 'i';
    try {
      return new RegExp(pattern, flags).test(text);
    } catch (_) {}
  }
  try {
    const cleanKw = cleanChannelText(keyword);
    const cleanT = cleanChannelText(text);
    if (cleanKw.length > 200) return cleanT.includes(cleanKw.toLowerCase());
    // Match content.js: \b only where a word char sits so "#music"/"C++" work.
    const first = cleanKw[0], last = cleanKw[cleanKw.length - 1];
    const start = /[a-zA-Z0-9_]/.test(first) ? '\\b' : '';
    const end = /[a-zA-Z0-9_]/.test(last) ? '\\b' : '';
    return new RegExp(`${start}${escapeRegExp(cleanKw)}${end}`, 'i').test(cleanT);
  } catch (_) {
    return text.toLowerCase().includes(keyword.toLowerCase());
  }
}

// Load background script functions into context
const bgCode = fs.readFileSync(__dirname + '/../background.js', 'utf8');
const bgContext = {
  chrome: global.chrome,
  fetch: global.fetch,
  console,
  AbortController,
  setTimeout,
  clearTimeout,
  URL
};
// background.js loads its heuristic pattern tables from shared-tables.js via
// importScripts() (Chrome MV3 classic worker). Mirror that here so the test
// exercises the same single source the extension ships.
bgContext.importScripts = (...files) => {
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), bgContext, { filename: f });
  }
};
vm.createContext(bgContext);
vm.runInContext(bgCode, bgContext);

console.log('--- Running AI Guardian Tests ---');

// Test 1: Heuristic synthesize must handle sports directive
console.log('Test 1: Heuristic synthesis on "block all ball sports related videos"');
const rules = bgContext.heuristicSynthesize("block all ball sports related videos");

assert(rules && Array.isArray(rules.keywords), 'Rules should be generated');
const hasSportsKeywords = rules.keywords.some(k => 
  ['basketball', 'football', 'soccer', 'baseball', 'tennis', 'golf', 'ball sports', 'sports', 'nba', 'nfl'].includes(k.toLowerCase())
);
assert(hasSportsKeywords, 'Generated rules should contain sports keywords, but got: ' + JSON.stringify(rules.keywords));
console.log('  -> Keywords synthesized:', rules.keywords.slice(0, 8).join(', '), '...');
console.log('  -> Regex synthesized:', rules.regex);

// Test 2: Regex patterns must be valid and properly delimited (/.../i)
console.log('Test 2: Valid regex delimiters and compilation');
if (rules.regex && rules.regex.length) {
  rules.regex.forEach(r => {
    assert(r.startsWith('/'), `Regex should start with /: ${r}`);
    assert(r.lastIndexOf('/') > 0, `Regex should have closing /: ${r}`);
    const lastSlash = r.lastIndexOf('/');
    const pattern = r.slice(1, lastSlash);
    const flags = r.slice(lastSlash + 1);
    assert.doesNotThrow(() => new RegExp(pattern, flags), `Regex should be compilable: ${r}`);
  });
}

// Test 3: Titles must be blocked by the generated rules
console.log('Test 3: Title filtering with synthesized rules');
const allRules = [...rules.keywords, ...(rules.regex || [])];

const sportsTitle1 = "Lakers vs Celtics Full Game Highlights | NBA 2026";
const sportsTitle2 = "Top 10 Football Goals of the Season";
const sportsTitle3 = "World Cup Soccer Penalty Shootout";
const nonSportsTitle = "Building an 8-bit computer from scratch";

assert(allRules.some(r => hasWordBoundaryKeyword(sportsTitle1, r)), `Should match: "${sportsTitle1}"`);
assert(allRules.some(r => hasWordBoundaryKeyword(sportsTitle2, r)), `Should match: "${sportsTitle2}"`);
assert(allRules.some(r => hasWordBoundaryKeyword(sportsTitle3, r)), `Should match: "${sportsTitle3}"`);
assert(!allRules.some(r => hasWordBoundaryKeyword(nonSportsTitle, r)), `Should NOT match non-sports: "${nonSportsTitle}"`);

// Test 4: cleanJsonParse handles thinking tags and markdown blocks
console.log('Test 4: cleanJsonParse resilience');
const withThinking = '<thought>Let me ponder this for 30 seconds...</thought>{"keywords": ["tennis", "golf"], "regex": ["/tennis/i"]}';
const parsed1 = bgContext.cleanJsonParse(withThinking);
assert.deepEqual(parsed1, { keywords: ["tennis", "golf"], regex: ["/tennis/i"] });

const withThinkTag = '<think>I should output {"keywords": ["formula 1"]} for the user.</think>{"keywords": ["formula 1"]}';
const parsedThink = bgContext.cleanJsonParse(withThinkTag);
assert.deepEqual(parsedThink, { keywords: ["formula 1"] });

const withMarkdown = '```json\n{"keywords": ["cricket"]}\n```';
const parsed2 = bgContext.cleanJsonParse(withMarkdown);
assert.deepEqual(parsed2, { keywords: ["cricket"] });

// Test 5: normalizeRegexRule handles unadorned regex
console.log('Test 5: normalizeRegexRule handling');
assert.strictEqual(bgContext.normalizeRegexRule('ball\\s*sports?'), '/ball\\s*sports?/i');
assert.strictEqual(bgContext.normalizeRegexRule('/football/g'), '/football/g');
assert.strictEqual(bgContext.normalizeRegexRule('[unclosed('), null);

// Test 7: only loopback AI endpoints are accepted. This is the code-level
// enforcement of the "nothing leaves your machine" privacy claim: customUrl rides
// in on the message payload, so it must not be usable as an arbitrary fetch base.
console.log('Test 7: local-only AI endpoint validation');
const localOnly = (v, fb) => bgContext.resolveLocalAiBaseUrl(v, fb);
assert.strictEqual(localOnly('http://localhost:11434', null), 'http://localhost:11434');
assert.strictEqual(localOnly('http://127.0.0.1:1234/v1', null), 'http://127.0.0.1:1234');
assert.strictEqual(localOnly('  http://localhost:11434  ', null), 'http://localhost:11434');
// 8080 was dropped along with the ONNX offering: it is no longer an allowed port.
assert.strictEqual(localOnly('http://localhost:8080', 'FALLBACK'), 'FALLBACK', 'port 8080 is no longer an allowed local-AI port');
assert.strictEqual(localOnly('http://evil.example.com', 'FALLBACK'), 'FALLBACK', 'remote host must be rejected');
assert.strictEqual(localOnly('https://notlocalhost.com:11434', 'FALLBACK'), 'FALLBACK', 'hostname lookalike must be rejected (exact match, not suffix)');
assert.strictEqual(localOnly('file:///etc/passwd', 'FALLBACK'), 'FALLBACK', 'non-http scheme must be rejected');
assert.strictEqual(localOnly('not a url', 'FALLBACK'), 'FALLBACK', 'garbage must be rejected');
assert.strictEqual(localOnly('', 'FALLBACK'), 'FALLBACK');
assert.strictEqual(localOnly(undefined, 'FALLBACK'), 'FALLBACK');
assert.strictEqual(localOnly('http://localhost:11434/../../evil', 'FALLBACK'), 'http://localhost:11434', 'traversal must collapse to the origin');

// Test 6: evaluateBatchWithAi respects sports persona in fallback
// Tests 8-11 (below, same async chain): the user's own rules are HARD constraints.
// Each of these was a real "the extension blocks too much / too little" report.
console.log('Test 6: evaluateBatchWithAi persona-aware evaluation');
(async () => {
  const testVideos = [
    { id: 'v1', title: 'NBA Finals Highlights', channel: 'ESPN' },
    { id: 'v2', title: 'Rust Systems Programming Guide', channel: 'TechPro' }
  ];
  const evalRes = await bgContext.evaluateBatchWithAi(testVideos, 'block all ball sports related videos', 'balanced', 'non-existent-model', 'http://127.0.0.1:99999');
  assert(evalRes && Array.isArray(evalRes.evaluations), 'Evaluations array expected');
  const v1 = evalRes.evaluations.find(e => e.id === 'v1');
  const v2 = evalRes.evaluations.find(e => e.id === 'v2');
  assert(v1 && v1.block === true, 'NBA video should be blocked by sports persona');
  assert(v2 && v2.block === false, 'Rust video should NOT be blocked');

  // Test 8: a whitelisted channel is never blocked, whatever the persona says.
  // The whitelist wins over every blacklist rule in content.js; a fallback that
  // blocked a protected channel was the "it blocks too much" half of the report.
  console.log('Test 8: user whitelist is a HARD stop in the offline fallback');
  const wlRes = await bgContext.evaluateBatchWithAi(
    [{ id: 'w1', title: 'NBA Finals Highlights', channel: 'ESPN' }, { id: 'w2', title: 'Basketball Weekly Roundup', channel: 'Serious News' }],
    'block all ball sports related videos', 'balanced', 'non-existent-model', 'http://127.0.0.1:99999',
    [], [], ['ESPN']
  );
  const w1 = wlRes.evaluations.find(e => e.id === 'w1');
  const w2 = wlRes.evaluations.find(e => e.id === 'w2');
  assert(w1 && w1.block === false, 'whitelisted ESPN must never be blocked, got: ' + JSON.stringify(w1));
  assert(w2 && w2.block === true, 'an unprotected sports channel must still be blocked');
  assert(/whitelist/i.test(w1.rationale || ''), 'the rationale should say WHY it was spared: ' + w1.rationale);

  // Test 9: the user's keyword rules match the badge and the channel name, not only
  // the title — the content script matches all three haystacks, so the fallback must
  // agree or the same video is judged differently with/without the model.
  console.log('Test 9: keyword rules match title, badge AND channel');
  const badgeRes = await bgContext.evaluateBatchWithAi(
    [{ id: 'b1', title: 'Episode 12', channel: 'Quiet Channel', badge: 'Auto-dubbed' }],
    'nothing in particular', 'balanced', 'non-existent-model', 'http://127.0.0.1:99999',
    ['auto-dubbed'], [], []
  );
  assert(badgeRes.evaluations[0].block === true, 'a badge-text keyword rule must fire, got: ' + JSON.stringify(badgeRes.evaluations[0]));
  assert(/keyword rule/i.test(badgeRes.evaluations[0].rationale || ''), 'rationale should name the matched rule');

  const chanRes = await bgContext.evaluateBatchWithAi(
    [{ id: 'b2', title: 'Episode 12', channel: 'Dub FM' }],
    'nothing in particular', 'balanced', 'non-existent-model', 'http://127.0.0.1:99999',
    ['dub fm'], [], []
  );
  assert(chanRes.evaluations[0].block === true, 'a channel-name keyword rule must fire, got: ' + JSON.stringify(chanRes.evaluations[0]));

  // Test 10: model output is validated, never trusted. A non-boolean `block` used to
  // count as a block (the string "false" is truthy), and a hallucinated id maps onto
  // no card at all.
  console.log('Test 10: model output validation (hallucinated ids, non-boolean block)');
  const realLlm = bgContext.queryLocalLlm;
  bgContext.queryLocalLlm = async () => ({
    ok: true,
    content: JSON.stringify({
      evaluations: [
        { id: 'v1', block: 'false', rationale: 'string, not a boolean' },
        { id: 'ghost-video', block: true, rationale: 'hallucinated id' },
        { id: 'v2', block: true, rationale: 'genuine verdict' }
      ]
    })
  });
  const valRes = await bgContext.evaluateBatchWithAi(
    [{ id: 'v1', title: 'A' }, { id: 'v2', title: 'B' }],
    'anything', 'balanced', 'stub-model', undefined
  );
  bgContext.queryLocalLlm = realLlm;
  assert(valRes.evaluations.length === 1, 'only the valid verdict should survive, got: ' + JSON.stringify(valRes.evaluations));
  assert(valRes.evaluations[0].id === 'v2' && valRes.evaluations[0].block === true, 'the surviving verdict must be v2/true');

  // Test 11: keyword suggestion. A thin title plus the user's own sentence must
  // produce usable rules even with no model and no captions.
  console.log('Test 11: keyword suggestion (offline fallback + sanitizer)');
  assert(bgContext.sanitizeKeywordList(['ok', 'a b c d e f', 'the', 42, 'Valid Rule'], [], 10).length === 1,
    'sanitizeKeywordList must drop short/over-long/non-string input');

  const sanitized = bgContext.sanitizeKeywordList(
    ['"Crypto Signals!"', 'crypto signals', 'get rich quick schemes now', 'Crypto', 'slop'],
    ['slop'], 5
  );
  assert(sanitized[0] === 'crypto signals', 'quotes/punctuation stripped + lowercased, got: ' + JSON.stringify(sanitized));
  assert(!sanitized.includes('crypto signals') === false && sanitized.filter(k => k === 'crypto signals').length === 1,
    'duplicates collapse to one entry');
  assert(sanitized.includes('crypto'), 'a second distinct rule survives');
  assert(!sanitized.includes('slop'), 'rules the user already has are never re-suggested');
  assert(!sanitized.some(k => k.split(' ').length > 4), 'rules longer than 4 words are rejected');

  const thinSug = await bgContext.suggestKeywordsWithAi({
    title: 'Episode 12', channel: 'Quiet Channel', description: '', tags: [], transcript: '', note: '',
    keywords: [], modelChoice: 'non-existent-model', customUrl: 'http://127.0.0.1:99999'
  });
  assert(thinSug && thinSug.ok === false && thinSug.keywords.length === 0,
    'a title with nothing but filler must yield NO rules (honest empty result), got: ' + JSON.stringify(thinSug));

  const noteSug = await bgContext.suggestKeywordsWithAi({
    title: 'Episode 12', channel: 'Quiet Channel', description: '', tags: [], transcript: '',
    note: 'low-effort crypto get-rich-quick reaction channel that wastes my time',
    keywords: [], modelChoice: 'non-existent-model', customUrl: 'http://127.0.0.1:99999'
  });
  assert(noteSug && noteSug.ok === true && noteSug.keywords.length > 0,
    'the user\'s own description must produce rules, got: ' + JSON.stringify(noteSug));
  assert(noteSug.keywords.includes('crypto'), 'expected "crypto" among ' + JSON.stringify(noteSug.keywords));
  assert(noteSug.isFallback === true, 'with no reachable model this must be flagged as the offline fallback');

  console.log('All 11 Test Suites Passed Successfully! ✅');
})().catch((err) => {
  console.error('AI Guardian test failed: ' + (err && err.message || err));
  process.exit(1);
});
