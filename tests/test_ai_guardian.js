// Comprehensive test suite for AI Guardian Mind Reader & Keyword/Regex matching
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

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
    return new RegExp(`\\b${escapeRegExp(cleanKw)}\\b`, 'i').test(cleanT);
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
  clearTimeout
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

const withMarkdown = '```json\n{"keywords": ["cricket"]}\n```';
const parsed2 = bgContext.cleanJsonParse(withMarkdown);
assert.deepEqual(parsed2, { keywords: ["cricket"] });

// Test 5: normalizeRegexRule handles unadorned regex
console.log('Test 5: normalizeRegexRule handling');
assert.strictEqual(bgContext.normalizeRegexRule('ball\\s*sports?'), '/ball\\s*sports?/i');
assert.strictEqual(bgContext.normalizeRegexRule('/football/g'), '/football/g');
assert.strictEqual(bgContext.normalizeRegexRule('[unclosed('), null);

// Test 6: evaluateBatchWithAi respects sports persona in fallback
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

  console.log('All 6 Test Suites Passed Successfully! ✅');
})();
