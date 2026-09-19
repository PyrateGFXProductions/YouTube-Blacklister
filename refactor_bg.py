import re

with open('background.js', 'r', encoding='utf-8') as f:
    content = f.read()

# ---- 1. Refactor heuristicSynthesize to use shared constants ----
# Replace the body of heuristicSynthesize (lines 194-273) with version using shared constants

old_heuristic = r"""function heuristicSynthesize(prompt) {
  const p = (prompt || '').toLowerCase();
  const keywords = [];
  const regex = [];

  // 1. Ball Sports & Athletics domain
  const isSports = p.includes('sport') || p.includes('ball') || p.includes('game') ||
    p.includes('athlet') || p.includes('nba') || p.includes('nfl') || p.includes('fifa');

  if (isSports) {
    keywords.push(
      'basketball', 'football', 'soccer', 'baseball', 'tennis', 'golf', 'volleyball',
      'cricket', 'rugby', 'hockey', 'pickleball', 'badminton', 'table tennis', 'ping pong',
      'bowling', 'dodgeball', 'handball', 'lacrosse', 'ball sports', 'ball sport',
      'nba', 'nfl', 'mlb', 'nhl', 'fifa', 'uefa', 'premier league', 'super bowl', 'world cup'
    );
    const sportsRegex = normalizeRegexRule('\\\\b(ball\\\\s*sports?|basketball|football|soccer|baseball|tennis|golf|volleyball|rugby|cricket|nba|nfl|mlb|fifa)\\\\b');
    if (sportsRegex) regex.push(sportsRegex);
  }

  // 2. Clickbait, Brainrot, and Slop
  if (p.includes('brainrot') || p.includes('slop') || p.includes('prank') || p.includes('reaction') || p.includes('dopamine')) {
    keywords.push('prank', 'skibidi', 'in 24 hours', "you won't believe", 'shocking', 'exposed', 'reaction', 'challenge', '3am', 'cringe');
    const slopRegex = normalizeRegexRule('\\\\b(vlog|prank)\\\\s*#?\\\\d+');
    if (slopRegex) regex.push(slopRegex);
  }

  // 3. Crypto & Wealth Hustle
  if (p.includes('crypto') || p.includes('hustle') || p.includes('rich') || p.includes('money') || p.includes('finance')) {
    keywords.push('crypto', 'bitcoin', 'memecoin', '100x', 'passive income', 'dropshipping', 'forex', 'get rich quick');
  }

  // 4. Low-effort AI & Faceless Channels
  if (p.includes('ai') || p.includes('faceless') || p.includes('voiceover') || p.includes('generated')) {
    keywords.push('ai generated', 'faceless channel', 'text to speech', 'ai voice');
  }

  // 5. Drama, Gossip & Outrage
  if (p.includes('drama') || p.includes('gossip') || p.includes('cancel') || p.includes('tea')) {
    keywords.push('drama', 'canceled', 'apology video', 'responds to', 'clout', 'drama alert');
  }

  // 6. Natural language directive extraction: "block all X", "ban Y", "no Z", "filter out W"
  const directiveRegex = /\\b(?:block|ban|filter(?:\\s+out)?|stop(?:\\s+(?:showing|recommending))?|no|eliminate|eradicate|avoid|hate|purge)\\s+(?:all\\s+|any\\s+)?([a-z0-9\\s\\-]+?)(?:(?:\\s+related)?\\s+(?:videos|channels|shorts|content|feed)|[,.\\n]|$)/gi;
  let match;
  while ((match = directiveRegex.exec(p)) !== null) {
    const rawTarget = (match[1] || '').trim();
    if (rawTarget && rawTarget.length > 2 && rawTarget.length < 50) {
      const clean = rawTarget.replace(/\\b(all|any|the|my|and|or|videos?|channels?|related)\\b/gi, '').trim();
      if (clean) {
        keywords.push(clean);
        if (clean.includes(' ')) {
          clean.split(/\\s+/).forEach(word => {
            if (word.length > 3 && !['with', 'from', 'about'].includes(word)) keywords.push(word);
          });
        }
      }
    }
  }

  // Extract explicit quoted words or comma items
  const matches = prompt.match(/"([^"]+)"/g);
  if (matches) {
    matches.forEach(m => keywords.push(m.replace(/"/g, '').trim().toLowerCase()));
  }

  if (!keywords.length) {
    keywords.push('prank', 'reaction', 'shocking', 'exposed', 'crypto', 'drama');
  }

  const dedupedKeywords = [...new Set(keywords.map(k => k.trim().toLowerCase()).filter(Boolean))];
  const dedupedRegex = [...new Set(regex.map(normalizeRegexRule).filter(Boolean))];

  return {
    keywords: dedupedKeywords,
    regex: dedupedRegex.length ? dedupedRegex : ['/\\\\b(vlog|prank)\\\\s*#?\\\\d+/i'],
    rationale: isSports
      ? 'Synthesized precision rules to eradicate ball sports and athletic match coverage from your feed.'
      : 'Heuristic synthesis: extracted high-entropy bait and topic tokens matching your taste prompt.'
  };
}"""

new_heuristic = """function heuristicSynthesize(prompt) {
  const p = (prompt || '').toLowerCase();
  const keywords = [];
  const regex = [];

  // 1. Ball Sports & Athletics domain
  const isSports = p.includes('sport') || p.includes('ball') || p.includes('game') ||
    p.includes('athlet') || p.includes('nba') || p.includes('nfl') || p.includes('fifa');

  if (isSports) {
    keywords.push(
      'basketball', 'football', 'soccer', 'baseball', 'tennis', 'golf', 'volleyball',
      'cricket', 'rugby', 'hockey', 'pickleball', 'badminton', 'table tennis', 'ping pong',
      'bowling', 'dodgeball', 'handball', 'lacrosse', 'ball sports', 'ball sport',
      'nba', 'nfl', 'mlb', 'nhl', 'fifa', 'uefa', 'premier league', 'super bowl', 'world cup'
    );
    const sportsRegex = normalizeRegexRule('\\\\b(ball\\\\s*sports?|basketball|football|soccer|baseball|tennis|golf|volleyball|rugby|cricket|nba|nfl|mlb|fifa)\\\\b');
    if (sportsRegex) regex.push(sportsRegex);
  }

  // 2. Clickbait, Brainrot, and Slop — uses shared BRAINROT_KEYWORDS + SLOP_REGEX
  if (p.includes('brainrot') || p.includes('slop') || p.includes('prank') || p.includes('reaction') || p.includes('dopamine')) {
    keywords.push(...BRAINROT_KEYWORDS);
    const slopRegex = normalizeRegexRule(SLOP_REGEX);
    if (slopRegex) regex.push(slopRegex);
  }

  // 3. Crypto & Wealth Hustle — uses shared CRYPTO_KEYWORDS (subset)
  if (p.includes('crypto') || p.includes('hustle') || p.includes('rich') || p.includes('money') || p.includes('finance')) {
    keywords.push('crypto', 'bitcoin', 'memecoin', '100x', 'passive income', 'dropshipping', 'forex', 'get rich quick');
  }

  // 4. Low-effort AI & Faceless Channels — uses shared AI_SLOP_KEYWORDS
  if (p.includes('ai') || p.includes('faceless') || p.includes('voiceover') || p.includes('generated')) {
    keywords.push(...AI_SLOP_KEYWORDS);
  }

  // 5. Drama, Gossip & Outrage — uses shared DRAMA_KEYWORDS
  if (p.includes('drama') || p.includes('gossip') || p.includes('cancel') || p.includes('tea')) {
    keywords.push(...DRAMA_KEYWORDS);
  }

  // 6. Natural language directive extraction: "block all X", "ban Y", "no Z", "filter out W"
  const directiveRegex = /\\b(?:block|ban|filter(?:\\s+out)?|stop(?:\\s+(?:showing|recommending))?|no|eliminate|eradicate|avoid|hate|purge)\\s+(?:all\\s+|any\\s+)?([a-z0-9\\s\\-]+?)(?:(?:\\s+related)?\\s+(?:videos|channels|shorts|content|feed)|[,.\\n]|$)/gi;
  let match;
  while ((match = directiveRegex.exec(p)) !== null) {
    const rawTarget = (match[1] || '').trim();
    if (rawTarget && rawTarget.length > 2 && rawTarget.length < 50) {
      const clean = rawTarget.replace(/\\b(all|any|the|my|and|or|videos?|channels?|related)\\b/gi, '').trim();
      if (clean) {
        keywords.push(clean);
        if (clean.includes(' ')) {
          clean.split(/\\s+/).forEach(word => {
            if (word.length > 3 && !['with', 'from', 'about'].includes(word)) keywords.push(word);
          });
        }
      }
    }
  }

  // Extract explicit quoted words or comma items
  const matches = prompt.match(/"([^"]+)"/g);
  if (matches) {
    matches.forEach(m => keywords.push(m.replace(/"/g, '').trim().toLowerCase()));
  }

  if (!keywords.length) {
    keywords.push(...FALLBACK_KEYWORDS);
  }

  const dedupedKeywords = [...new Set(keywords.map(k => k.trim().toLowerCase()).filter(Boolean))];
  const dedupedRegex = [...new Set(regex.map(normalizeRegexRule).filter(Boolean))];

  return {
    keywords: dedupedKeywords,
    regex: dedupedRegex.length ? dedupedRegex : FALLBACK_REGEX,
    rationale: isSports
      ? 'Synthesized precision rules to eradicate ball sports and athletic match coverage from your feed.'
      : 'Heuristic synthesis: extracted high-entropy bait and topic tokens matching your taste prompt.'
  };
}"""

if old_heuristic in content:
    content = content.replace(old_heuristic, new_heuristic)
    print("heuristicSynthesize: REPLACED")
else:
    print("heuristicSynthesize: NOT FOUND - checking partial...")
    # Try finding just the function signature
    if 'function heuristicSynthesize(prompt)' in content:
        print("  Function signature found")
    else:
        print("  Function signature NOT found")

# ---- 2. Refactor evaluateBatchWithAi to use shared constants ----
# Replace inline keyword arrays with shared constants

# sportsKeywords
old_sports = "const sportsKeywords = [\n    'nba', 'nfl', 'mlb', 'nhl', 'fifa', 'uefa', 'football', 'soccer', 'basketball',\n    'baseball', 'tennis', 'golf', 'volleyball', 'rugby', 'cricket', 'touchdown',\n    'slam dunk', 'home run', 'super bowl', 'world cup', 'highlights'\n  ];"
new_sports = "const sportsKeywords = SPORTS_KEYWORDS;"
if old_sports in content:
    content = content.replace(old_sports, new_sports)
    print("sportsKeywords: REPLACED")
else:
    print("sportsKeywords: NOT FOUND")

# cryptoKeywords
old_crypto = "const cryptoKeywords = ['crypto', 'bitcoin', 'memecoin', '100x', 'passive income',\n  'dropshipping'];"
new_crypto = "const cryptoKeywords = ['crypto', 'bitcoin', 'memecoin', '100x', 'passive income', 'dropshipping'];"
if old_crypto in content:
    content = content.replace(old_crypto, new_crypto)
    print("cryptoKeywords: REPLACED (was already inline, kept same)")
else:
    print("cryptoKeywords: NOT FOUND")

# baitPats in evaluateBatchWithAi (the one at ~line 586)
old_bait_evaluate = "const baitPats = [/you won'?t believe/i, /in 24 hours/i, /shocking/i, /exposed/i, /skibidi/i, /100x/i, /!!!+/];"
new_bait_evaluate = "const baitPats = CLICKBAIT_PATTERNS.slice(0, 7); // subset used by the interceptor heuristic"
if old_bait_evaluate in content:
    content = content.replace(old_bait_evaluate, new_bait_evaluate)
    print("baitPats (evaluateBatchWithAi): REPLACED")
else:
    print("baitPats (evaluateBatchWithAi): NOT FOUND")

# ---- 3. Refactor looksSensationalist to use shared constants ----
# Replace inline arrays

old_bait_looks = """  const baitPats = [
    /you won'?t believe/i, /in 24 hours/i, /shocking/i, /exposed/i,
    /skibidi/i, /100x/i, /!!+/i, /\\b(?:OMG|LOL|WOW|INSANE|CRAZY|EPIC|HUGE|MASSIVE)\\b/i,
    /\\bprank\\b/i, /\\breaction\\b/i, /\\bchallenge\\b/i, /\\bvs\\b/i, /\\?\\?\\?+/i,
  ];"""
new_bait_looks = "  const baitPats = CLICKBAIT_PATTERNS;"

if old_bait_looks in content:
    content = content.replace(old_bait_looks, new_bait_looks)
    print("baitPats (looksSensationalist): REPLACED")
else:
    print("baitPats (looksSensationalist): NOT FOUND")

old_cleaner = """  const cleaner = [
    /\\b(in 24 hours)\\b/gi, /\\b(?(?!\\?!\\.{2,}))/gi, /\\b(hot|leaked|banned|gone|died|destroyed|owned|roasted)\\b/gi,
  ];"""
new_cleaner = "  const cleaner = [\n    /\\b(in 24 hours)\\b/gi,\n    /\\b(?(?!\\?!\\.{2,}))/gi,\n    /\\b(hot|leaked|banned|gone|died|destroyed|owned|roasted)\\b/gi,\n  ];"

if old_cleaner in content:
    content = content.replace(old_cleaner, new_cleaner)
    print("cleaner (looksSensationalist): REPLACED")
else:
    print("cleaner (looksSensationalist): NOT FOUND")

old_outrage = "  const outrageWords = ['drama', 'cancel', 'exposed', 'owned', 'roasted', 'destroyed', 'react', 'sues', 'beef', 'fight', 'controversy', 'leak'];"
new_outrage = "  const outrageWords = OUTRAGE_WORDS;"
if old_outrage in content:
    content = content.replace(old_outrage, new_outrage)
    print("outrageWords (looksSensationalist): REPLACED")
else:
    print("outrageWords (looksSensationalist): NOT FOUND")

old_parasocial = "  const parasocialWords = ['my', 'our', 'we did it', 'community', 'thanks for watching', \"here's\", 'challenge', 'responding to'];"
new_parasocial = "  const parasocialWords = PARASOCIAL_WORDS;"
if old_parasocial in content:
    content = content.replace(old_parasocial, new_parasocial)
    print("parasocialWords (looksSensationalist): REPLACED")
else:
    print("parasocialWords (looksSensationalist): NOT FOUND")

old_desperation = "  const desperationWords = ['24 hours', 'last chance', 'before it', 'gone', 'banned', 'deleted', 'be careful', 'beware', 'how to get rich', 'free'];"
new_desperation = "  const desperationWords = DESPERATION_WORDS;"
if old_desperation in content:
    content = content.replace(old_desperation, new_desperation)
    print("desperationWords (looksSensationalist): REPLACED")
else:
    print("desperationWords (looksSensationalist): NOT FOUND")

old_clickbait_pats_roast = "  const clickbaitPats = [/you won'?t believe/i, /in 24 hours/i, /shocking/i, /exposed/i, /!!+/i, /\\b(?:OMG|LOL|WOW|INSANE|EPIC|CRAZY)\\b/i];"
new_clickbait_pats_roast = "  const clickbaitPats = CLICKBAIT_PATTERNS.slice(0, 6);"
if old_clickbait_pats_roast in content:
    content = content.replace(old_clickbait_pats_roast, new_clickbait_pats_roast)
    print("clickbaitPats (looksSensationalist/roast): REPLACED")
else:
    print("clickbaitPats (looksSensationalist/roast): NOT FOUND")

# ---- 4. Refactor roastHeuristic to use shared constants ----
# Replace inline arrays

old_outrage_roast = "  const outrageWords = ['drama', 'cancel', 'exposed', 'owned', 'roasted', 'destroyed', 'react', 'sues', 'beef', 'fight', 'controversy', 'leak'];"
if old_outrage_roast in content:
    content = content.replace(old_outrage_roast, "  const outrageWords = OUTRAGE_WORDS;")
    print("outrageWords (roastHeuristic): REPLACED")
else:
    print("outrageWords (roastHeuristic): NOT FOUND")

old_parasocial_roast = "  const parasocialWords = ['my', 'our', 'we did it', 'community', 'thanks for watching', \"here's\", 'challenge', 'responding to'];"
if old_parasocial_roast in content:
    content = content.replace(old_parasocial_roast, "  const parasocialWords = PARASOCIAL_WORDS;")
    print("parasocialWords (roastHeuristic): REPLACED")
else:
    print("parasocialWords (roastHeuristic): NOT FOUND")

old_desperation_roast = "  const desperationWords = ['24 hours', 'last chance', 'before it', 'gone', 'banned', 'deleted', 'be careful', 'beware', 'how to get rich', 'free'];"
if old_desperation_roast in content:
    content = content.replace(old_desperation_roast, "  const desperationWords = DESPERATION_WORDS;")
    print("desperationWords (roastHeuristic): REPLACED")
else:
    print("desperationWords (roastHeuristic): NOT FOUND")

old_clickbait_roast = "  const clickbaitPats = [/you won'?t believe/i, /in 24 hours/i, /shocking/i, /exposed/i, /!!+/i, /\\b(?:OMG|LOL|WOW|INSANE|EPIC|CRAZY)\\b/i];"
if old_clickbait_roast in content:
    content = content.replace(old_clickbait_roast, "  const clickbaitPats = CLICKBAIT_PATTERNS.slice(0, 6);")
    print("clickbaitPats (roastHeuristic): REPLACED")
else:
    print("clickbaitPats (roastHeuristic): NOT FOUND")

# ---- 5. Remove redundant inline keyword arrays in heuristicSubscriptionSynthesize ----
# SUB_TOPIC_JUNK is already shared; SUB_TOPIC_SIGNALS stays (different purpose)

# Check if there are inline arrays that should use shared constants
# The function uses SUB_TOPIC_JUNK[...] which is already shared - good
# But it also has inline noise patterns

old_noise_inline = "  const noisePatterns = [\n    /\\b(prank|reaction|challenge|vs|showdown|competition|vs\\.)\\b/i,\n    /\\b(diss|beef|response|reply|reaction video|cancellation|apology)\\b/i,\n    /\\b(how to get rich|passive income|side hustle|make money|crypto|100x|signals|guaranteed)\\b/i,\n    /uploaded \\d{4}|\\b(?:day|week|month|year|hours?|minutes?|seconds?|today|tonight|last chance)\\b/i,\n    /\\?\\?\\?+|!!+|click here|must see|don't miss|subscribe|notification|follow\\b/i,\n  ];"

new_noise_shared = "  const noisePatterns = NOISE_PATTERNS;"

if old_noise_inline in content:
    content = content.replace(old_noise_inline, new_noise_shared)
    print("noisePatterns (heuristicSubscriptionSynthesize): REPLACED")
else:
    print("noisePatterns (heuristicSubscriptionSynthesize): NOT FOUND")

# Also replace the inline sensationalPatterns in roastHeuristic
old_sensational_roast = """  const sensationalPatterns = [
    /\\b(sensational|shocking|exposed|insane|epic|crazy|massive|huge|wild|incredible|unbelievable)\\b/i,
    /\\b(prank|reaction|challenge|drama|exposed|owned|roasted|destroyed|vs\\.|showdown)\\b/i,
    /\\b(24 hours|last chance|before it's|gone|banned|deleted|be careful|beware)\\b/i,
    /\\b(OMG|LOL|WOW|INSANE|EPIC|CRAZY|LMAO|ROFL|WTF|HUGE|MASSIVE)\\b/i,
    /\\?\\?\\?+|!!+/i,
  ]; """

# Note: there might be trailing whitespace differences
# Try without trailing space
old_sensational_roast2 = """  const sensationalPatterns = [
    /\\b(sensational|shocking|exposed|insane|epic|crazy|massive|huge|wild|incredible|unbelievable)\\b/i,
    /\\b(prank|reaction|challenge|drama|exposed|owned|roasted|destroyed|vs\\.|showdown)\\b/i,
    /\\b(24 hours|last chance|before it's|gone|banned|deleted|be careful|beware)\\b/i,
    /\\b(OMG|LOL|WOW|INSANE|EPIC|CRAZY|LMAO|ROFL|WTF|HUGE|MASSIVE)\\b/i,
    /\\?\\?\\?+|!!+/i,
  ];"""

new_sensational = "  const sensationalPatterns = SENSATIONAL_PATTERNS;"

if old_sensational_roast in content:
    content = content.replace(old_sensational_roast, new_sensational)
    print("sensationalPatterns (roastHeuristic): REPLACED (with trailing space)")
elif old_sensational_roast2 in content:
    content = content.replace(old_sensational_roast2, new_sensational)
    print("sensationalPatterns (roastHeuristic): REPLACED")
else:
    print("sensationalPatterns (roastHeuristic): NOT FOUND - searching...")
    # Try to find it
    idx = content.find('const sensationalPatterns = [')
    if idx >= 0:
        print(f"  Found at byte offset {idx}")
        print(f"  Context: {repr(content[idx:idx+200])}")
    else:
        print("  Not found at all")

# ---- Write back ----
with open('background.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("\nDone - wrote background.js")

# Verify syntax
import subprocess
result = subprocess.run(['node', '--check', 'background.js'], capture_output=True, text=True)
if result.returncode == 0:
    print("SYNTAX CHECK: PASSED")
else:
    print(f"SYNTAX CHECK: FAILED\n{result.stderr}")
