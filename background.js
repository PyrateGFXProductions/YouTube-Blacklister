// Background service worker for Always New To You - YouTube Blacklister v1.11.1
// Manages badges, statistics, and the Autonomous AI Neural Slop Interceptor

// The heuristic pattern tables live in ONE file, shared with the content script so
// the two contexts can never drift apart. Chrome's MV3 service worker is a classic
// worker and loads it with importScripts(); Firefox has no importScripts in its
// event-page context, which is why the packager ALSO lists shared-tables.js in
// background.scripts. This guard makes either load path work — if the tables are
// already defined, the manifest loaded them and there is nothing to do.
try {
  if (typeof importScripts === 'function' && typeof CLICKBAIT_PATTERNS === 'undefined') {
    importScripts('shared-tables.js');
  }
} catch (_) {}

const OLLAMA_DEFAULT_URL = 'http://localhost:11434';
const LMSTUDIO_DEFAULT_URL = 'http://localhost:1234';
let blockedCounterQueue = Promise.resolve();

// Channel-sample bounds for the subscription synthesizer prompt.
// These mirror the values in content.js but must be defined here too —
// the service worker cannot see content-script constants (isolated worlds).
const CHANNEL_SAMPLE_MAX_VIDEOS = 6;
const CHANNEL_SAMPLE_DESC_CHARS = 300;

// Bundled in-browser AI provider (transformers.js + onnxruntime-web, vendored).
// Loaded lazily on first use — no Ollama, no LM Studio, no other app required.
let _bundledAi = null;
let _bundledAiLoading = null;

async function loadBundledAi() {
  if (_bundledAi) return _bundledAi;
  if (_bundledAiLoading) return _bundledAiLoading;
  _bundledAiLoading = (async () => {
    const mod = await import(chrome.runtime.getURL('bundled-ai.js'));
    _bundledAi = mod.BundledAiProvider || globalThis.BundledAiProvider;
    return _bundledAi;
  })();
  return _bundledAiLoading;
}

// Only loopback AI endpoints are ever contacted. `customUrl` rides in on the
// message payload, so validating it here makes the "nothing leaves your machine"
// guarantee a property of the code rather than a coincidence of the current popup
// UI never populating that field. Returns `fallback` for anything that is not a
// well-formed http(s) URL on a loopback host AND one of the two supported ports.
const LOCAL_AI_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
// The ports the manifest actually grants host permissions for (Ollama, LM Studio).
// Port 8080 was removed with the ONNX offering — pinning it here too means a
// stale caller cannot talk us into fetching a port we no longer declare.
const LOCAL_AI_PORTS = new Set(['11434', '1234']);

function resolveLocalAiBaseUrl(candidate, fallback) {
  if (!candidate || typeof candidate !== 'string') return fallback;
  try {
    const parsed = new URL(candidate.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback;
    if (!LOCAL_AI_HOSTS.has(parsed.hostname.toLowerCase())) return fallback;
    if (!LOCAL_AI_PORTS.has(parsed.port)) return fallback;
    return parsed.origin;
  } catch (_) {
    return fallback;
  }
}

function incrementBlockedTotal(inc) {
  blockedCounterQueue = blockedCounterQueue.then(() => new Promise((resolve) => {
    try {
      chrome.storage.local.get(['nyt_totalBlocked'], (res) => {
        if (chrome.runtime?.lastError) { resolve(null); return; }
        const current = Number(res.nyt_totalBlocked) || 0;
        const total = Math.max(0, current + inc);
        chrome.storage.local.set({ nyt_totalBlocked: total }, () => {
          resolve(chrome.runtime?.lastError ? null : total);
        });
      });
    } catch (_) {
      resolve(null);
    }
  }));
  return blockedCounterQueue;
}

// Check local AI server status.
// Errors are COLLECTED per provider instead of swallowed: the popup shows the
// real reason in the pill title, so "offline" means something — ECONNREFUSED =
// server actually down, while 'Failed to fetch' / 'NetworkError' = the browser
// (extension context) blocked the request despite the manifest.
async function checkAiStatus(customUrl) {
  const ollamaUrl = resolveLocalAiBaseUrl(customUrl, OLLAMA_DEFAULT_URL);
  const errors = [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models.map(m => m.name || m.model) : [];
      return { ok: true, provider: 'ollama', url: ollamaUrl, models, errors };
    }
    errors.push({ provider: 'ollama', url: ollamaUrl, error: `HTTP ${res.status}` });
  } catch (e) {
    errors.push({
      provider: 'ollama',
      url: ollamaUrl,
      error: e && e.name === 'AbortError' ? 'timeout 2500ms' : (e && e.message) || String(e)
    });
  }

  // Fallback check LM Studio / OpenAI-compatible
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${LMSTUDIO_DEFAULT_URL}/v1/models`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const models = Array.isArray(data.data) ? data.data.map(m => m.id) : [];
      return { ok: true, provider: 'lmstudio', url: LMSTUDIO_DEFAULT_URL, models, errors };
    }
    errors.push({ provider: 'lmstudio', url: LMSTUDIO_DEFAULT_URL, error: `HTTP ${res.status}` });
  } catch (e) {
    errors.push({
      provider: 'lmstudio',
      url: LMSTUDIO_DEFAULT_URL,
      error: e && e.name === 'AbortError' ? 'timeout 2000ms' : (e && e.message) || String(e)
    });
  }

  return { ok: false, provider: 'none', models: [], errors };
}

// Helper to safely extract and parse JSON from local LLM outputs (handles thinking tags and codeblocks)
function cleanJsonParse(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  // Strip common thought-block formats emitted by local LLM runtimes.
  // Uses global replace so multiple blocks are removed, not just the first.
  let text = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<\|thinking\|>[\s\S]*?<\|end\|think\|>/gi, '')
    .replace(/<｜｜DSML｜｜think>[\s\S]*?<｜｜DSML｜｜end｜｜think｜｜>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/<\|reasoning\|>[\s\S]*?<\|end\|reason\|>/gi, '')
    .trim();
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    text = codeBlockMatch[1].trim();
  }
  try {
    return JSON.parse(text);
  } catch (_) {}
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch (_) {}
  }
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(text.slice(firstBracket, lastBracket + 1));
    } catch (_) {}
  }
  return null;
}

// Normalizes a regex string into standard /pattern/flags format and validates compilation
function normalizeRegexRule(raw) {
  if (!raw) return null;
  let str = String(raw).trim();
  if (!str) return null;
  if (!str.startsWith('/')) {
    str = `/${str}/i`;
  } else if (str.lastIndexOf('/') === 0) {
    str = `${str}/i`;
  }
  const lastSlash = str.lastIndexOf('/');
  const pattern = str.slice(1, lastSlash);
  const flags = str.slice(lastSlash + 1) || 'i';
  try {
    new RegExp(pattern, flags);
    return `/${pattern}/${flags}`;
  } catch (_) {
    return null;
  }
}

// Resolves the exact active model: explicit choice > storage > Ollama detected > fallback.
// Detection is EXPENSIVE when the servers are down (2.5s Ollama + 2s LM Studio),
// so the probe result is cached for 60s. Without the cache, every AI
// batch/tldw/debait call without an explicit model choice would
// stall before falling back to the heuristic path.
let modelProbeCache = null;
let modelProbeAt = 0;
const MODEL_PROBE_TTL = 60000;

async function resolveActiveModel(modelChoice) {
  if (modelChoice && typeof modelChoice === 'string' && modelChoice.trim() && modelChoice !== 'heuristic') {
    return modelChoice.trim();
  }
  try {
    const store = await new Promise(r => chrome.storage.local.get(['aiModel'], r));
    if (store && store.aiModel && typeof store.aiModel === 'string' && store.aiModel.trim() && store.aiModel !== 'heuristic') {
      return store.aiModel.trim();
    }
  } catch (_) {}
  const now = Date.now();
  if (modelProbeCache !== undefined && now - modelProbeAt < MODEL_PROBE_TTL) {
    return modelProbeCache;
  }
  try {
    const status = await checkAiStatus();
    const picked = status && status.ok && Array.isArray(status.models) && status.models.length
      ? status.models[0]
      : null;
    modelProbeCache = picked;
    modelProbeAt = now;
    return picked;
  } catch (_) {
    modelProbeCache = null;
    modelProbeAt = now;
    return null;
  }
}

// Heuristic pattern tables (CLICKBAIT_PATTERNS, SPORTS_KEYWORDS, DEBait_CLEANERS,
// NOISE_PATTERNS, …) are NOT declared here. They live in shared-tables.js, which
// this file loads at the top and the content script loads via the manifest, so a
// pattern can only ever be added, renamed, or removed in one place.

// Unified query runner for local LLMs (Ollama with think:false + LM Studio / OpenAI-compatible)
async function queryLocalLlm({ messages, format = 'json', model, customUrl, timeoutMs = 35000 }) {
  const localCustomUrl = resolveLocalAiBaseUrl(customUrl, null);
  const isCustom = Boolean(localCustomUrl);
  const targetUrl = localCustomUrl || OLLAMA_DEFAULT_URL;
  const timeout = Math.max(5000, Number(timeoutMs) || 35000);
  const activeModel = await resolveActiveModel(model);

  // No model available anywhere — signal callers to fall back to heuristic mode
  if (!activeModel) {
    return { ok: false, content: null, provider: 'none', modelUsed: null, reason: 'no_model' };
  }

  // Try Ollama endpoint first
  let ollamaError = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const body = {
      model: activeModel,
      messages,
      stream: false,
      think: false
    };
    if (format === 'json') body.format = 'json';

    const res = await fetch(`${targetUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const content = data?.message?.content || '';
      return { ok: true, content, provider: 'ollama', modelUsed: activeModel };
    }
    ollamaError = `ollama HTTP ${res.status}`;
  } catch (e) {
    ollamaError = e && e.name === 'AbortError' ? `ollama timeout (${timeout}ms)` : (e && e.message) || String(e);
  }

  // Fallback to OpenAI / LM Studio endpoint
  const openAiUrl = isCustom ? localCustomUrl : LMSTUDIO_DEFAULT_URL;
  let openAiError = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const body = {
      model: activeModel,
      messages,
      stream: false,
      temperature: 0.1
    };
    if (format === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(`${openAiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content || '';
      return { ok: true, content, provider: 'lmstudio', modelUsed: activeModel };
    }
    openAiError = `lmstudio HTTP ${res.status}`;
  } catch (e) {
    openAiError = e && e.name === 'AbortError' ? `lmstudio timeout (${timeout}ms)` : (e && e.message) || String(e);
  }

  // Surface the real failure reason instead of swallowing it — callers and the
  // diagnostics UI can show WHY the local model call fell back to heuristics.
  return { ok: false, content: '', modelUsed: activeModel, reason: ollamaError || openAiError || 'unknown' };
}

// Fallback heuristic rule synthesizer when no LLM is running or query fails
function heuristicSynthesize(prompt) {
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
    const sportsRegex = normalizeRegexRule('\\b(ball\\s*sports?|basketball|football|soccer|baseball|tennis|golf|volleyball|rugby|cricket|nba|nfl|mlb|fifa)\\b');
    if (sportsRegex) regex.push(sportsRegex);
  }

  // 2. Clickbait, Brainrot, and Slop
  if (p.includes('brainrot') || p.includes('slop') || p.includes('prank') || p.includes('reaction') || p.includes('dopamine')) {
    keywords.push('prank', 'skibidi', 'in 24 hours', "you won't believe", 'shocking', 'exposed', 'reaction', 'challenge', '3am', 'cringe');
    const slopRegex = normalizeRegexRule('\\b(vlog|prank)\\s*#?\\d+');
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
  const directiveRegex = /\b(?:block|ban|filter(?:\s+out)?|stop(?:\s+(?:showing|recommending))?|no|eliminate|eradicate|avoid|hate|purge)\s+(?:all\s+|any\s+)?([a-z0-9\s\-]+?)(?:(?:\s+related)?\s+(?:videos|channels|shorts|content|feed)|[,.\n]|$)/gi;
  let match;
  while ((match = directiveRegex.exec(p)) !== null) {
    const rawTarget = (match[1] || '').trim();
    if (rawTarget && rawTarget.length > 2 && rawTarget.length < 50) {
      const clean = rawTarget.replace(/\b(all|any|the|my|and|or|videos?|channels?|related)\b/gi, '').trim();
      if (clean) {
        keywords.push(clean);
        if (clean.includes(' ')) {
          clean.split(/\s+/).forEach(word => {
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
    regex: dedupedRegex.length ? dedupedRegex : ['/\\b(vlog|prank)\\s*#?\\d+/i'],
    rationale: isSports
      ? 'Synthesized precision rules to eradicate ball sports and athletic match coverage from your feed.'
      : 'Heuristic synthesis: extracted high-entropy bait and topic tokens matching your taste prompt.'
  };
}

// Query local LLM for taste synthesis
async function synthesizeRulesWithAi(prompt, modelChoice, customUrl) {
  const systemPrompt =
    'You are the YouTube Slop Defense Intelligence. Analyze the user\'s taste description and output ONLY valid JSON in this exact structure: ' +
    '{"keywords": string[], "regex": string[], "rationale": string}. ' +
    'The "keywords" array should contain 6-12 high-impact clickbait, slop, or specific topic words to blacklist based on what they want to avoid. ' +
    'The "regex" array should contain 1-3 valid regex patterns formatted as /pattern/i to block these topics. ' +
    'Do not output markdown codeblocks, just raw JSON.';

  try {
    const res = await queryLocalLlm({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `User Taste & Preferences: ${prompt}` }
      ],
      format: 'json',
      model: modelChoice,
      customUrl,
      timeoutMs: 35000
    });

    if (res.ok && res.content) {
      const parsed = cleanJsonParse(res.content);
      if (parsed && Array.isArray(parsed.keywords) && parsed.keywords.length) {
        const rawRegex = Array.isArray(parsed.regex) ? parsed.regex : [];
        const validRegex = rawRegex.map(normalizeRegexRule).filter(Boolean);
        return {
          ok: true,
          keywords: parsed.keywords.map(k => String(k).trim().toLowerCase()).filter(Boolean),
          regex: validRegex,
          rationale: parsed.rationale || 'Synthesized by local neural model.',
          modelUsed: res.modelUsed
        };
      }
    }
  } catch (_) {}

  const fallback = heuristicSynthesize(prompt);
  return { ok: true, ...fallback, isFallback: true };
}

// ------------------------------------------------------------------
// SUBSCRIPTION SYNTHESIZER (companion to Mind Reader)
// ------------------------------------------------------------------

// Channel-name keyword signals for heuristic topic classification
const SUB_TOPIC_SIGNALS = {
  tech: ['tech', 'computer', 'code', 'coding', 'programm', 'dev', 'developer', 'linux', 'hardware', 'raspberry', 'arduino', 'electro', 'engineer', 'fireship', 'primeagen', 'unbox', 'benchmark', 'pixel'],
  science: ['science', 'physics', 'space', 'astro', 'cosmo', 'chem', 'bio', 'math', 'numberphile', 'universe', 'document', 'explain', 'veritasium', 'kurzgesagt', 'minutephysics', '3blue1brown'],
  crypto: ['crypto', 'bitcoin', 'blockchain', 'defi', 'nft', 'wallet', 'kucoin', 'binance', 'coinbase', 'trading', 'altcoin'],
  finance: ['finance', 'money', 'invest', 'stock', 'market', 'econom', 'wealth', 'retire', 'budget', 'frugal'],
  gaming: ['game', 'gaming', 'speedrun', 'minecraft', 'fortnite', 'valorant', 'esport', 'lets play', 'retro', 'emulation'],
  music: ['music', 'guitar', 'piano', 'drum', 'producer', 'synth', 'audio', 'sound', 'band', 'beat', 'rap', 'mix'],
  art: ['art', 'draw', 'paint', 'blender', 'vfx', 'animation', 'design', 'photoshop', 'cinema', 'film', 'movie', 'edit', 'lighting', 'color'],
  cooking: ['cook', 'recipe', 'kitchen', 'bake', 'baking', 'food', 'chef', 'meal', 'grill', 'culinary'],
  fitness: ['fitness', 'gym', 'workout', 'muscle', 'yoga', 'run', 'running', 'strength', 'calisthenic', 'health', 'athl', 'training']
};

// Parasitic junk clusters that ride each topic's coattails (for heuristic mode)
const SUB_TOPIC_JUNK = {
  tech: ['crypto', 'bitcoin', 'memecoin', 'dropshipping', 'ai generated', 'faceless channel', 'text to speech', '100x', 'passive income'],
  science: ["you won't believe", 'shocking', 'exposed', 'top 10', 'end of the world', 'conspiracy', 'mystery'],
  crypto: ['100x', 'signals', 'guaranteed', 'airdrops', 'pump', 'get rich quick', 'reversal packed'],
  finance: ['get rich quick', 'guaranteed', 'to the moon', 'passive income', 'crypto wealth', 'forex guru'],
  gaming: ['prank', 'skibidi', 'brainrot', 'in 24 hours', 'reaction', "you won't believe", 'shocking'],
  music: ['reaction', 'lyric video', 'tiktok compilation', 'try not to sing', 'nightcore'],
  art: ['ai generated', 'faceless channel', 'text to speech', '5 minute crafts', 'free stock clips'],
  cooking: ['5 minute crafts', 'life hacks', 'satisfying', 'oddly satisfying', 'instant noodles', 'mukbang'],
  fitness: ['before and after', '7 day transformation', 'detox', 'miracle', '6 pack in 30 days', 'fat burning']
};

const SUB_TOPIC_LABELS = {
  tech: 'Tech & Hardware', science: 'Science & Education', crypto: 'Web3 & Crypto',
  finance: 'Finance & Investing', gaming: 'Gaming', music: 'Music & Audio',
  art: 'Art & Film', cooking: 'Food & Cooking', fitness: 'Health & Fitness'
};

// Fallback heuristic: topic-classify subscription names, block junk-neighbor clusters
function heuristicSubscriptionSynthesize(channels) {
  const names = (channels || [])
    .map(c => String((c && c.name) || '').trim() || String((c && c.handle) || '').trim())
    .filter(Boolean);

  const topicHits = {};
  names.forEach(raw => {
    const n = raw.toLowerCase();
    Object.keys(SUB_TOPIC_SIGNALS).forEach(topic => {
      if (SUB_TOPIC_SIGNALS[topic].some(sig => n.includes(sig))) {
        topicHits[topic] = (topicHits[topic] || 0) + 1;
      }
    });
  });

  const ranked = Object.keys(topicHits)
    .sort((a, b) => topicHits[b] - topicHits[a])
    .slice(0, 3);

  const seen = new Set();
  ranked.forEach(topic => {
    (SUB_TOPIC_JUNK[topic] || []).forEach(k => seen.add(k));
  });
  if (!seen.size) {
    FALLBACK_KEYWORDS.forEach(k => seen.add(k));
  }

  const profile = ranked.length
    ? ranked.map(t => SUB_TOPIC_LABELS[t] || t).join(' + ')
    : 'General Interest';

  return {
    keywords: [...seen],
    regex: FALLBACK_REGEX,
    rationale: `Heuristic synthesis from ${names.length} subscriptions (profile: ${profile}). Blacklists the junk-neighbor clusters that parasitically ride your subscribed topics.`,
    profile
  };
}

// ------------------------------------------------------------------
// SUBSCRIPTION ↔ RULE CONFLICT AUDIT
// Mirrors content.js's hasWordBoundaryKeyword() semantics so the audit
// reports exactly what the real matcher would do against channel names.
// ------------------------------------------------------------------
function auditEscapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function auditCleanText(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function auditRuleHitsName(rule, channelName) {
  const kw = auditCleanText(rule);
  const name = auditCleanText(channelName);
  if (!kw || !name) return false;

  // Regex rule — test directly against the name, same as the content matcher
  if (kw.startsWith('/') && kw.lastIndexOf('/') > 0) {
    try {
      const lastSlash = kw.lastIndexOf('/');
      return new RegExp(kw.slice(1, lastSlash), kw.slice(lastSlash + 1) || 'i').test(channelName);
    } catch (_) { return false; }
  }
  // Plain keyword — word-boundary match, same as hasWordBoundaryKeyword().
  // \b can never match keywords that start/end with non-word characters
  // ("#music", "C++"), so the boundary is only applied where a word char sits.
  try {
    const first = kw[0], last = kw[kw.length - 1];
    const start = /[a-zA-Z0-9_]/.test(first) ? '\\b' : '';
    const end = /[a-zA-Z0-9_]/.test(last) ? '\\b' : '';
    return new RegExp(`${start}${auditEscapeRegExp(kw)}${end}`, 'i').test(name);
  } catch (_) {
    return name.toLowerCase().includes(kw.toLowerCase());
  }
}

// Semantic collision report: newly synthesized rules vs the user's own subscriptions.
// The exact-name guardrail already strips identity collisions silently; this one
// surfaces *semantic* overlaps ("reaction" vs a subscribed "Reaction Time TV") for the user to judge.
function auditKeywordConflicts(rules, channelEntries) {
  const conflicts = [];
  if (!Array.isArray(rules)) return conflicts;

  const names = (channelEntries || [])
    .map(entry => {
      const s = String(entry || '');
      return s.includes(' (') ? s.slice(0, s.indexOf(' (')) : s;
    })
    .map(s => s.trim())
    .filter(Boolean);

  const uniqRules = [...new Set(rules.map(r => String(r || '').trim()).filter(Boolean))];
  uniqRules.forEach(rule => {
    const hits = [];
    names.forEach(n => { if (auditRuleHitsName(rule, n)) hits.push(n); });
    if (hits.length) conflicts.push({ keyword: rule, channels: hits.slice(0, 3), more: Math.max(0, hits.length - 3) });
  });
  return conflicts;
}

// Synthesize blacklist rules from the user's actual YouTube subscriptions.
//
// `options` (all optional): { samples: [{name, description, videos:[{title,description,length}]}],
//   liked: string[], disliked: string[], existingProfile: string, tastePrompt: string }
//
// The samples are the whole point. A channel LIST can only support topic inference
// ("you like drag racing"), which cannot express the preference that actually matters to a
// viewer — Cleetus McFarland yes, Beater Bomb no; Matt's Off Road Recovery yes, Murphy's no.
// Those pairs share a subject and differ in personality, presentation and edit, so the
// model is given the creators' own titles/descriptions and asked for the STYLE the user
// keeps choosing, plus a short list of presentation traits to hide. `liked`/`disliked` are
// the user's own corrections and always outrank anything inferred.
async function synthesizeSubscriptionRulesWithAi(channels, modelChoice, customUrl, options) {
  const baseUrl = customUrl || OLLAMA_DEFAULT_URL;
  const opts = (options && typeof options === 'object') ? options : {};
  const liked = Array.isArray(opts.liked) ? opts.liked.map(String).map(s => s.trim()).filter(Boolean).slice(0, 40) : [];
  const disliked = Array.isArray(opts.disliked) ? opts.disliked.map(String).map(s => s.trim()).filter(Boolean).slice(0, 40) : [];
  const existingProfile = String(opts.existingProfile || '').trim().slice(0, 800);
  const tastePrompt = String(opts.tastePrompt || '').trim().slice(0, 1500);
  const samples = Array.isArray(opts.samples) ? opts.samples.slice(0, 24) : [];

  // Flatten + bound the channel list (name + handle), defensive against malformed entries
  const cleanChannels = (channels || []).slice(0, 500).map(c => {
    const name = String((c && c.name) || '').trim();
    const handle = String((c && c.handle) || '').trim();
    if (!name && !handle) return '';
    return handle ? `${name} (${handle})` : name;
  }).filter(Boolean);

  // The style evidence, as compact readable text rather than raw JSON — the model reasons
  // far better about "titles look like this" than about an object graph, and it keeps the
  // prompt inside a small model's context.
  const styleBlock = samples.map(s => {
    const vids = (s.videos || []).slice(0, CHANNEL_SAMPLE_MAX_VIDEOS).map(v => {
      const len = v.length ? ` [${v.length}]` : '';
      return `    - ${v.title}${len}`;
    }).join('\n');
    const desc = s.description ? `\n  About: ${String(s.description).slice(0, CHANNEL_SAMPLE_DESC_CHARS)}` : '';
    return `- ${s.name}${s.handle ? ' ' + s.handle : ''}${desc}${vids ? '\n  Recent titles:\n' + vids : ''}`;
  }).join('\n');

  const systemPrompt =
    'You are the YouTube Taste Analyst for ONE viewer. You are given the channels they ' +
    'subscribe to, plus — for a sample of those channels — the creator\'s own channel blurb ' +
    'and recent video titles.\n' +
    'Your job is NOT to name their topics. It is to describe the STYLE they keep choosing: ' +
    'the presentation, tone, pacing, production feel and personality of the creators they ' +
    'follow. Two channels can share a subject and differ completely in style — one is a ' +
    'calm, well-edited documentary voice, the other is loud hype and manufactured outrage. ' +
    'The viewer follows one and not the other, so style is the signal that matters.\n' +
    'Output ONLY valid JSON in this exact structure: ' +
    '{"profile": string, "styleLikes": string[], "styleDislikes": string[], ' +
    '"keywords": string[], "regex": string[], "rationale": string, "sampleNotes": string}.\n' +
    '- "profile": ONE sentence, max 25 words, describing the style this viewer enjoys. Not a topic list.\n' +
    '- "styleLikes": 3-6 short phrases naming presentation/personality traits visible in the ' +
    'sampled channels (e.g. "unscripted workshop builds", "dry deadpan narration", ' +
    '"long-form single-project documentary").\n' +
    '- "styleDislikes": 3-6 short phrases naming the PRESENTATION traits that are the ' +
    'opposite of what they watch — the neighbouring style they do NOT follow (e.g. ' +
    '"manufactured outrage", "shouty reaction faces", "listicle narration"). These describe ' +
    'STYLE, never a topic and never a named channel.\n' +
    '- "keywords": 6-12 blacklist keywords for clickbait/slop that parasitically rides the ' +
    'viewer\'s topics. NEVER a keyword that matches a subscribed channel name or handle, and ' +
    'never a bare topic word the viewer actually watches.\n' +
    '- "regex": 1-3 regex patterns, each written as /pattern/i, targeting PRESENTATION ' +
    'clickbait (shouty casing, bait phrases), not subject matter.\n' +
    '- "rationale": 2-4 sentences explaining what you inferred and why.\n' +
    '- "sampleNotes": one short sentence on what the sampled titles revealed about style.\n' +
    'Do not output markdown codeblocks, just raw JSON.';

  const userContent = [
    `Subscribed channels (${cleanChannels.length}):\n${cleanChannels.join(', ')}`,
    liked.length ? `\nChannels the viewer EXPLICITLY said they like (highest-weight evidence of their style):\n${liked.join(', ')}` : '',
    disliked.length ? `\nChannels the viewer EXPLICITLY said they do NOT like (the style to move away from; never name these channels in any rule):\n${disliked.join(', ')}` : '',
    tastePrompt ? `\nThe viewer's own description of what they want:\n${tastePrompt}` : '',
    existingProfile ? `\nWhat was inferred previously (refine it, do not simply repeat it):\n${existingProfile}` : '',
    styleBlock ? `\nStyle evidence from a sample of their channels:\n${styleBlock}` : '\n(No channel pages could be sampled this run — infer from names and say so in sampleNotes.)'
  ].filter(Boolean).join('\n');

  let keywords = [];
  let regex = [];
  let rationale = '';
  let profile = '';
  let styleLikes = [];
  let styleDislikes = [];
  let sampleNotes = '';
  let isFallback = false;

  try {
    const res = await queryLocalLlm({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      format: 'json',
      model: modelChoice,
      customUrl,
      // Must finish inside Chrome's ~30s service-worker lifetime. A cold model
      // load + generation beyond this gets the worker reaped and the popup
      // receives nothing (which used to print "AI may be busy"). The heuristic
      // fallback below is always ready, so a timeout degrades to ⚡ Heuristic
      // instead of a dead end.
      timeoutMs: 22000
    });

    if (res.ok && res.content) {
      const parsed = cleanJsonParse(res.content);
      if (parsed && Array.isArray(parsed.keywords)) {
        // Guardrail: never synthesize a rule that collides with the user's own subscriptions
        const forbidden = new Set();
        cleanChannels.forEach(entry => {
          const [name, handle] = entry.split(' (');
          if (name) forbidden.add(name.trim().toLowerCase());
          if (handle) forbidden.add(handle.replace(/\)$/, '').trim().toLowerCase().replace(/^@/, ''));
        });
        // The channels the user explicitly dislikes are ALSO forbidden as rule text: the
        // point is to learn their STYLE, not to blacklist a channel by name from here
        // (that is what the channel blacklist is for, and it is one click).
        disliked.forEach(d => forbidden.add(String(d).trim().toLowerCase().replace(/^@/, '')));

        keywords = [];
        parsed.keywords.forEach(k => {
          const clean = String(k).trim().toLowerCase();
          if (clean && clean.length > 1 && !forbidden.has(clean)) keywords.push(clean);
        });

        const rawRegex = Array.isArray(parsed.regex) ? parsed.regex : [];
        regex = rawRegex.map(normalizeRegexRule).filter(Boolean);
        rationale = parsed.rationale || 'Synthesized from subscription patterns by local neural model.';
        styleLikes = Array.isArray(parsed.styleLikes) ? parsed.styleLikes.map(s => String(s).trim()).filter(Boolean).slice(0, 6) : [];
        styleDislikes = Array.isArray(parsed.styleDislikes) ? parsed.styleDislikes.map(s => String(s).trim()).filter(Boolean).slice(0, 6) : [];
        sampleNotes = typeof parsed.sampleNotes === 'string' ? parsed.sampleNotes.trim().slice(0, 240) : '';
        profile = typeof parsed.profile === 'string' && parsed.profile.trim()
          ? parsed.profile.trim().slice(0, 60)
          : '';
      }
    }
  } catch (err) {
    // Fallback if LLM fails or times out
  }

  // Empty or failed AI pass → heuristic fallback
  if (!keywords.length) {
    const fallback = heuristicSubscriptionSynthesize(channels);
    keywords = fallback.keywords;
    regex = fallback.regex;
    rationale = fallback.rationale;
    profile = fallback.profile;
    isFallback = true;
  }

  // A model that answered but returned no usable style text still deserves a readable
  // profile: fall back to naming the sampled channels, so the UI never shows a blank.
  if (!styleLikes.length && samples.length) {
    styleLikes = samples.slice(0, 4).map(s => s.name).filter(Boolean);
  }
  if (!profile) {
    profile = samples.length
      ? `Style sample from ${samples.length} channels`
      : 'Subscription Insights';
  }

  // Semantic audit: which of the user's own subscriptions could these rules surface?
  const conflicts = auditKeywordConflicts([...keywords, ...regex], cleanChannels);

  return { ok: true, keywords, regex, rationale, profile, styleLikes, styleDislikes, sampleNotes, sampled: samples.length, conflicts, isFallback };
}

// Evaluate candidate videos in batch.
//
// `userWhitelist` is the user's protected-channel list, `userSubscribed` the channels the
// user is subscribed to. BOTH are HARD constraints: a model that blocks a whitelisted or
// subscribed channel has done more harm than a model that blocks nothing, and the content
// script's own matcher lets the whitelist win over every blacklist rule. Keep that
// invariant here too.
//
// The user's keyword/channel RULES are deliberately NOT part of the model prompt. They are
// enforced exactly and deterministically on both sides (content.js evaluateCard() and the
// offline path below). A model asked to "apply the rules" approximate-matches instead —
// the reported "'10 Prehistoric Blades Made From Metal' matches the 'top 10' rule" block
// hid videos the user wanted while the same list never fired on the promo titles it was
// written for. The model's job is the part a regex cannot do: slop, clickbait, taste.
async function evaluateBatchWithAi(videos, persona, sensitivity, modelChoice, customUrl, userKeywords, userChannels, userWhitelist, userSubscribed) {
  if (!Array.isArray(videos) || !videos.length) return { evaluations: [] };

  const sens = sensitivity || 'balanced';

  const chList = Array.isArray(userChannels) ? userChannels.map(String) : [];
  const kwList = Array.isArray(userKeywords) ? userKeywords.map(String) : [];
  const wlList = Array.isArray(userWhitelist) ? userWhitelist.map(String) : [];
  const subList = Array.isArray(userSubscribed) ? userSubscribed.map(String) : [];

  // Every channel this user has chosen: whitelisted and subscribed. Used as the prompt's
  // never-block list and as a hard filter on the model's answers below.
  const neverBlock = wlList.concat(subList.filter(s => !wlList.some(w => w.toLowerCase() === s.toLowerCase())));

  const systemPrompt =
    'You are an autonomous YouTube content curator for ONE user, filtering their ' +
    'DISCOVERY feed. Decide, per video, whether it is low-value enough to hide. ' +
    'The user\'s keyword and channel rules are enforced separately and EXACTLY by ' +
    'deterministic matchers — do NOT apply, guess at, or impute them, and never block a ' +
    'video because its title merely resembles a topic the user dislikes. ' +
    'Hard constraints, in order: ' +
    '(1) a video from a channel the user is subscribed to, or has whitelisted, is NEVER blocked; ' +
    '(2) otherwise block only clear slop, clickbait, engagement bait or fake/algorithmic ' +
    'content that plainly conflicts with the taste persona below; ' +
    '(3) if you are not confident, answer block=false — a missed block costs the user ' +
    'nothing, a wrong block hides a video they wanted. ' +
    'Respond ONLY with JSON: {"evaluations": [{"id": string, "block": boolean, "rationale": string}]}. ' +
    'Use the exact `id` values given and return one entry per video. ' +
    '`block` must be a real JSON boolean, and each rationale must be one short sentence.';

  try {
    const res = await queryLocalLlm({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            `User Taste Persona: ${persona || 'High signal, thoughtful, educational, anti-clickbait'}`,
            `Sensitivity: ${sens}`,
            `User's subscriptions + whitelist (NEVER block): ${JSON.stringify(neverBlock.slice(0, 200))}`,
            `Videos: ${JSON.stringify(videos)}`
          ].join('\n')
        }
      ],
      format: 'json',
      model: modelChoice,
      customUrl,
      timeoutMs: 25000
    });

    if (res.ok && res.content) {
      const parsed = cleanJsonParse(res.content);
      if (parsed && Array.isArray(parsed.evaluations)) {
        // Validate before trusting. A hallucinated id maps onto no card (so the
        // verdict is silently dropped), and a truthy-but-not-boolean `block` made
        // every string — including "false" — count as a block.
        const known = new Set(videos.map(v => String(v && v.id)));
        const byId = new Map(videos.map(v => [String(v && v.id), v]));
        const evaluations = [];
        for (const raw of parsed.evaluations) {
          if (!raw || typeof raw !== 'object') continue;
          const id = String(raw.id == null ? '' : raw.id);
          if (!known.has(id)) continue;
          if (typeof raw.block !== 'boolean') continue;
          // The whitelist / subscription hard stop applies to the MODEL's answer too:
          // an instruction a model can ignore is not a constraint.
          if (raw.block === true) {
            const vid = byId.get(id) || {};
            if (matchChannelIn(vid.channel, wlList) || matchChannelIn(vid.channel, subList)) continue;
          }
          evaluations.push({
            id,
            block: raw.block,
            rationale: typeof raw.rationale === 'string' ? raw.rationale.slice(0, 200) : ''
          });
        }
        if (evaluations.length) return { evaluations, isFallback: false, modelUsed: res.modelUsed || null };
      }
    }
  } catch (_) {}

  // Fast heuristic evaluation fallback respecting user persona AND the user's own
  // blacklisted keywords + channels, so the interceptor stays useful when the local
  // model is offline (instead of silently ignoring the user's custom rules).
  const personaLower = (persona || '').toLowerCase();
  const isAntiSports = personaLower.includes('sport') || personaLower.includes('ball');
  const isAntiCrypto = personaLower.includes('crypto') || personaLower.includes('money') || personaLower.includes('hustle');
  const isAntiSlop = personaLower.includes('slop') || personaLower.includes('brainrot') || personaLower.includes('clickbait') || !persona;

  const sportsKeywords = SPORTS_KEYWORDS;
  const cryptoKeywords = CRYPTO_KEYWORDS.slice(0, 6); // subset used by interceptor heuristic
  const baitPats = CLICKBAIT_PATTERNS.slice(0, 7); // subset used by the interceptor heuristic

  // kwList / chList / wlList were normalized at the top of this function — the
  // model prompt and this offline path must read the SAME lists, or the fallback
  // silently disagrees with the model about the user's own rules.

  function matchUserKeyword(text) {
    if (!text || !kwList.length) return null;
    for (const kw of kwList) {
      const k = (kw || '').trim();
      if (!k) continue;
      if (k.startsWith('/') && k.lastIndexOf('/') > 0) {
        // User-supplied regex rule — test directly.
        try {
          const lastSlash = k.lastIndexOf('/');
          const pattern = k.slice(1, lastSlash);
          const flags = k.slice(lastSlash + 1) || 'i';
          if (pattern.length <= 200 && !/(?:\([^()]*\[[*+{]|[\|])[^()]*\)\s*[*+{]/.test(pattern)) {
            if (new RegExp(pattern, flags).test(text)) return k;
          }
        } catch (_) {}
      } else {
        // Word-boundary match, mirroring content.js hasWordBoundaryKeyword().
        // Only apply \b where a word char sits — "#music"/"C++" never match \b.
        try {
          const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const first = k[0], last = k[k.length - 1];
          const start = /[a-zA-Z0-9_]/.test(first) ? '\\b' : '';
          const end = /[a-zA-Z0-9_]/.test(last) ? '\\b' : '';
          if (new RegExp(`${start}${escaped}${end}`, 'i').test(text)) return k;
        } catch (_) {
          if (text.toLowerCase().includes(k.toLowerCase())) return k;
        }
      }
    }
    return null;
  }

  function matchChannelIn(channelName, list) {
    if (!channelName || !Array.isArray(list) || !list.length) return null;
    const norm = (channelName || '').toString().trim().toLowerCase().replace(/^@+/, '');
    if (!norm) return null;
    for (const c of list) {
      const raw = (c || '').toString().trim();
      if (!raw) continue;
      const cNorm = raw.toLowerCase().replace(/^@+/, '');
      // Also support channel URLs/IDs the user may have pasted — only compare the
      // non-empty, non-video-ID portion.
      const entityKey = raw.includes('youtu.be/') ? null
        : raw.includes('/channel/') ? raw.split('/channel/')[1].split('?')[0].split('/')[0].toLowerCase()
        : raw.includes('/@') ? raw.split('/@')[1].split('?')[0].split('/')[0].toLowerCase()
        : null;
      if (cNorm === norm || (entityKey && entityKey === norm)) return raw;
      // No substring fallback — prevents false positives where short stored
      // fragments (e.g. "sam") match full channel names (e.g. "Samsung").
      // Channel identity must be exact or via /channel/ or /@ handle extraction.
      //
      // Spelling-insensitive EQUALITY is allowed on top of that: the same creator can be
      // stored as "Graham Hancock" and rendered as "@grahamhancock"/"grahamhancock" (the
      // squashed form the subscription snapshot captures). Short cores never compare.
      const normSq = squashChannelKey(cNorm || entityKey);
      if (normSq && squashChannelKey(norm) === normSq) return raw;
    }
    return null;
  }

  const evaluations = videos.map(v => {
    const title = v.title || '';
    const badge = v.badge || '';
    const channelName = v.channel || '';
    // The same haystacks the content script's matcher evaluates, each tested
    // SEPARATELY (never joined — a joined string lets a rule span the boundary).
    // Matching the title alone missed rules the user had aimed at a channel name
    // or at an "Auto-dubbed" badge.
    const haystacks = [title, badge, channelName].filter(Boolean);
    const combined = `${title} ${channelName}`.toLowerCase();

    // 0. The whitelist is a HARD stop, exactly as in content.js evaluateCard(),
    //    where whitelistChannels is tested before every blacklist rule. A fallback
    //    that blocks a channel the user protected is worse than no fallback at all.
    const wlHit = matchChannelIn(channelName, wlList);
    if (wlHit) {
      return { id: v.id, block: false, rationale: `Your whitelisted channel: “${wlHit}”` };
    }

    // 0b. The user's own SUBSCRIPTIONS are a hard stop too. The Guardian filters the
    //     discovery feed, not the channels the user chose — the offline path exists to
    //     stay useful, not to reproduce the "it blocked my subscriptions" complaint when
    //     the local model is down.
    const subHit = matchChannelIn(channelName, subList);
    if (subHit) {
      return { id: v.id, block: false, rationale: `Your subscription: “${subHit}”` };
    }

    // 1. User's own keyword rules (highest-priority heuristic signal).
    let matchedKw = null;
    for (const h of haystacks) {
      matchedKw = matchUserKeyword(h);
      if (matchedKw) break;
    }
    if (matchedKw) {
      return { id: v.id, block: true, rationale: `Matched your keyword rule: “${matchedKw}”` };
    }

    // 2. User's own channel blacklist.
    const matchedCh = matchChannelIn(channelName, chList);
    if (matchedCh) {
      return { id: v.id, block: true, rationale: `Matched your channel block: “${matchedCh}”` };
    }

    // 3. Persona-specific topic heuristics.
    if (isAntiSports && sportsKeywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(combined))) {
      return { id: v.id, block: true, rationale: 'Matches blocked persona topic: Sports' };
    }
    if (isAntiCrypto && cryptoKeywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(combined))) {
      return { id: v.id, block: true, rationale: 'Matches blocked persona topic: Crypto / Finance' };
    }

    const capsCount = (v.title || '').replace(/[^A-Z]/g, '').length;
    const isAllCaps = v.title && v.title.length > 10 && (capsCount / v.title.length) > 0.45;
    const matchesBait = baitPats.some(p => p.test(v.title || ''));

    const shouldBlock = (isAntiSlop && matchesBait) || (sens === 'ruthless' && isAllCaps);
    return {
      id: v.id,
      block: shouldBlock,
      rationale: matchesBait ? 'High probability clickbait trope detected' : (isAllCaps ? 'Excessive capitalization / sensationalism' : 'Clear')
    };
  });

  return { evaluations };
}

// ------------------------------------------------------------------
// 1) AI TITLE DE-BAITER (Real-Time Title Neutralizer)
// ------------------------------------------------------------------
function looksSensationalist(title) {
  if (!title) return false;
  const t = String(title).trim();
  if (!t) return false;
  const capsCount = (t.match(/[A-Z]/g) || []).length;
  const isAllCaps = t.length > 10 && (capsCount / t.length) > 0.45;
  // CLICKBAIT_PATTERNS is the SHARED table (shared-tables.js): the pre-filter that
  // decides what content.js sends for de-baiting and this evaluator must agree.
  return isAllCaps || CLICKBAIT_PATTERNS.some(p => p.test(t));
}

// Heuristic neutralizer: strip ALL-CAPS, remove sensational hooks, keep facts.
// This body is deliberately IDENTICAL to content.js's copy — the same title must
// neutralize the same way whether the local model answered or the heuristic ran,
// and content.js's side is the pre-filter that decides what gets de-baited at all.
// DEBait_CLEANERS comes from shared-tables.js (the single source of the patterns).
function heuristicDebaitTitle(title) {
  let t = String(title || '').trim();
  if (!t) return t;
  t = t.replace(/\b(?:OMG|LOL|LMAO|ROFL|WTF)\b/gi, '');
  t = t.replace(/\s*!{2,}/g, '.');
  t = t.replace(/\s*[?!]+(\s|$)/g, '. ');
  t = t.replace(/\s*\?\s*\?+/g, '.');
  t = t.replace(/\b(?:that is|is going to|gonna)\b/gi, 'is about to');
  for (const re of DEBait_CLEANERS) t = t.replace(re, '');
  const m = t.match(/^(you won'?t believe\s+)(.+)/i);
  if (m && m[2]) t = m[2];
  t = t.replace(/\s*\.{2,}/g, '.').replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/[.,]+$/, '');
  return t || String(title).trim();
}

// De-bait a single title via local LLM with zero-temperature prompt.
async function deBaitWithAi(titles, modelChoice, customUrl) {
  const systemPrompt =
    'You are the ultra-calm "Title De-Baiter". Rewrite sensationalist YouTube titles into factual, dry, low-key descriptions. ' +
    'Keep the real subject. Strip hype, ALL-CAPS, exclamation marks, outrage hooks, clickbait numbers and drama. ' +
    'Output ONLY valid JSON in this exact structure: {"neutralTitles": [string]}. ' +
    'Each item must correspond 1-to-1 with the input titles array and remain under 12 words. Never editorialize.';

  try {
    const res = await queryLocalLlm({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Titles:\n' + JSON.stringify(titles) }
      ],
      format: 'json',
      model: modelChoice,
      customUrl,
      timeoutMs: 15000
    });

    if (res.ok && res.content) {
      const parsed = cleanJsonParse(res.content);
      if (parsed && Array.isArray(parsed.neutralTitles)) {
        return { ok: true, neutralTitles: parsed.neutralTitles };
      }
    }
  } catch (_) {}

  return { ok: false, neutralTitles: titles.map(heuristicDebaitTitle), isFallback: true };
}

// ------------------------------------------------------------------
// 2) AI FEED ROAST & PSYCHOLOGICAL MANIPULATION AUDIT
// ------------------------------------------------------------------
function roastHeuristic(items) {
  const list = Array.isArray(items) ? items.filter(i => i && (i.title || i.channel)) : [];

  const toks = list
    .map(i => `${i.title || ''} ${i.channel || ''}`)
    .join(' ').toLowerCase();

  const scoreParts = { outrage: 0, parasocial: 0, desperation: 0, baitCount: 0 };

  const outrageWords = OUTRAGE_WORDS;
  const parasocialWords = PARASOCIAL_WORDS;
  const desperationWords = DESPERATION_WORDS;
  const clickbaitPats = CLICKBAIT_PATTERNS.slice(0, 6);

  for (const w of outrageWords) if (toks.includes(w)) scoreParts.outrage++;
  for (const w of parasocialWords) if (toks.includes(w)) scoreParts.parasocial++;
  for (const w of desperationWords) if (toks.includes(w)) scoreParts.desperation++;

  let baitCount = 0;
  for (const i of list) {
    const t = i.title || '';
    if (clickbaitPats.some(p => p.test(t))) baitCount++;
  }
  scoreParts.baitCount = baitCount;

  const rough = list.length
    ? Math.round(Math.min(100, 20 + (baitCount * 5) + (scoreParts.outrage * 4) + (scoreParts.parasocial * 3) + (scoreParts.desperation * 6)))
    : 0;

  const toxicity = Math.min(100, rough);
  const tactics = [];
  if (scoreParts.outrage >= 2) tactics.push('Manufactured Outrage');
  if (scoreParts.parasocial >= 2) tactics.push('Parasocial Dopamine Trap');
  if (scoreParts.desperation >= 2) tactics.push('Algorithmic Desperation');
  if (scoreParts.baitCount >= 2) tactics.push('Clickbait Countdown Lure');
  if (!tactics.length) tactics.push('Surprisingly Straightforward');
  if (list.length && baitCount >= list.length * 0.5) tactics.push('Full-Throttle Engagement Farming');

  const toxic = list.filter(i => (i.title || '') && clickbaitPats.some(p => p.test(i.title || '')));
  const toxicChannels = [...new Set(toxic.map(i => i.channel).filter(Boolean))];

  const diagnosis =
    toxicity > 70
      ? 'Your algorithm has you pinned as a dopamine cash-cow. It is feeding you outrage-bait extremely fast and watching your scroll velocity like a hawk. Break the loop: block, block, block.'
      : toxicity > 40
        ? 'Your feed is flirting with manipulation — a few parasocial traps and hype spikes, but it still respects you enough to mix in real content.'
        : 'Your feed is uncharacteristically dignified. The algorithm has noticed you are paying attention and backed off the desperation playbook.';

  return {
    ok: true,
    toxicity,
    tactics,
    diagnosis,
    toxicChannels,
    items,
    isFallback: true
  };
}

async function roastFeedWithAi(items, modelChoice, customUrl) {
  const systemPrompt =
    'You are the savage but precise "Feed Forensic Psychologist". Analyze the given YouTube feed items for psychological manipulation tactics. ' +
    'Output ONLY valid JSON with this exact structure: ' +
    '{"toxicity": number(0-100), "tactics": string[], "diagnosis": string, "toxicChannels": string[]}. ' +
    'diagnosis must be witty, psychoanalytic, 2-3 sentences, roasting the algorithm. toxicChannels lists only channels whose titles show clear manipulation/clickbait.';

  try {
    const res = await queryLocalLlm({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Current visible feed items:\n' + JSON.stringify(items) }
      ],
      format: 'json',
      model: modelChoice,
      customUrl,
      timeoutMs: 20000
    });

    if (res.ok && res.content) {
      const parsed = cleanJsonParse(res.content);
      if (parsed && typeof parsed.toxicity === 'number') {
        const tactics = Array.isArray(parsed.tactics) ? parsed.tactics : [];
        const toxicChannels = Array.isArray(parsed.toxicChannels) ? parsed.toxicChannels : [];
        return {
          ok: true,
          toxicity: Math.max(0, Math.min(100, Math.round(parsed.toxicity))),
          tactics,
          diagnosis: parsed.diagnosis || 'Audited by local neural model.',
          toxicChannels,
          items,
          isFallback: false
        };
      }
    }
  } catch (_) {}

  return roastHeuristic(items);
}

// ------------------------------------------------------------------
// 3) 1-CLICK TL;DW (Too Long; Didn't Watch) VIDEO INSPECTOR
// ------------------------------------------------------------------
// Extract caption data from YT initial player response (ytInitialPlayerResponse)
function extractCaptionsFromPlayerResponse(playerResponse) {
  try {
    const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks) || !tracks.length) return null;
    return tracks;
  } catch (_) {
    return null;
  }
}

// Summarize a transcript into verdict, takeaways, and time saved.
function summarizeFeedbackFallback(transcript) {
  return {
    clickbaitVerdict: 'Transcript too thin to judge conclusively — captions were limited or disabled for this video.',
    takeaways: ['Craft a stronger video title', 'Show, do not tell', 'Hooks matter less than substance'],
    timeSaved: 0,
    summarySource: 'caption-degraded'
  };
}

async function summarizeTranscriptWithAi(transcript, title, modelChoice, customUrl, opts) {
  const o = opts || {};
  const description = String(o.description || '').trim();
  const tags = Array.isArray(o.tags) ? o.tags.map(String).filter(Boolean) : [];
  const note = String(o.note || '').trim();

  const systemPrompt =
    'You are the strict "TL;DW Inspector" — a forensic media literacy machine. ' +
    'Compare the video transcript against its title and flag clickbait dishonesty. ' +
    'Output ONLY valid JSON with this exact structure: ' +
    '{"clickbaitVerdict": string (end with TRUE CLICKBAIT / PARTIAL TRUTH / NOT CLICKBAIT), "takeaways": string[3], "confidence": string, "keywords": string[]}. ' +
    'takeaways: exactly 3 terse bullet points of actual substance. ' +
    'keywords: 0-4 short (1-4 word) lowercase phrases that a title of similar videos would ' +
    'visibly contain — the rules a feed filter could match on later. Never include a phrase the ' +
    'user already has. ' +
    // The thin-input case the user actually hits: no captions, or captions that say
    // almost nothing. "Too thin to tell" is a non-answer when the description and the
    // creator's own tags are right there.
    'If the transcript is thin or absent, base the verdict on the title, the video description, ' +
    'the creator tags and the user\'s own description of the video instead — never reply that there ' +
    'is nothing to judge when any of those are present.';

  const clip = (transcript || '').slice(0, 14000);
  const userLines = [
    `Video Title: ${title || '(none)'}`,
    tags.length ? `Creator Tags: ${tags.slice(0, 25).join(', ')}` : '',
    note ? `User's Description: ${note.slice(0, 800)}` : '',
    description ? `Video Description: ${description.slice(0, 2000)}` : '',
    clip ? `Transcript:\n${clip}` : 'Transcript: (unavailable)'
  ].filter(Boolean);

  try {
    const res = await queryLocalLlm({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userLines.join('\n\n') }
      ],
      format: 'json',
      model: modelChoice,
      customUrl,
      timeoutMs: 25000
    });

    if (res.ok && res.content) {
      const parsed = cleanJsonParse(res.content);
      if (parsed) {
        const takeaways = Array.isArray(parsed.takeaways) ? parsed.takeaways.slice(0, 3) : [];
        if (parsed.clickbaitVerdict || takeaways.length) {
          const durationSec = o.durationSec || 0;
          const timeSaved = durationSec > 0 ? Math.round(durationSec / 60) : Math.floor((transcript || '').split(/\s+/).length / 150);
          return {
            ok: true,
            clickbaitVerdict: parsed.clickbaitVerdict || 'Inconclusive verdict.',
            takeaways,
            keywords: sanitizeKeywordList(
              parsed.keywords, o.keywords, 4,
              // Same feed-specificity guard as every other extraction path (see
              // sanitizeKeywordList). Omitting the corpus here disabled it silently.
              Array.isArray(o.otherTitles) ? o.otherTitles : []
            ),
            timeSaved,
            isFallback: false
          };
        }
      }
    }
  } catch (_) {}

  return { ok: true, ...summarizeFeedbackFallback(transcript), keywords: [], isFallback: true };
}

// ------------------------------------------------------------------
// KEYWORD SUGGESTION (the keyword blocker's AI layer)
// ------------------------------------------------------------------
// Turns a video's text signals — title, channel, description, creator tags,
// transcript, and the user's own one-line description — into candidate blacklist
// keyword rules.
//
// A candidate is only worth storing if it will MATCH later: keyword rules are
// compared whole-word, case-insensitively, against each feed card's title, badge
// text and channel name (content.js hasWordBoundaryKeyword / keywordRulesHidden).
// So the model is asked for short, title-shaped phrases, and every suggestion is
// normalized and de-duplicated against the rules the user already has — a
// description like "low-effort crypto MLM reaction channel" is useless verbatim,
// because that sentence never appears in a title.
const KW_SUGGEST_LIMIT = 5;
const KW_SUGGEST_MAX_WORDS = 4;

// Normalizes, validates and de-duplicates a candidate rule list. Used by BOTH the
// model path and the offline path so the two can never disagree about what counts
// as a storable rule.
//
// This is the last gate before a rule reaches the user's blacklist, so it is where the
// generic-word discipline is enforced for the model path: a soft model that returns
// "day" or "first day" (the exact junk the heuristic used to produce) gets rejected
// here, and so does any rule that already matches several other cards on screen —
// `otherTitles` is the visible feed, and a rule matching it is a false-positive
// generator no matter which engine proposed it.
function sanitizeKeywordList(raw, existing, limit, otherTitles) {
  const out = [];
  const seen = new Set((Array.isArray(existing) ? existing : [])
    .map(k => String(k == null ? '' : k).trim().toLowerCase())
    .filter(Boolean));
  const cap = Math.max(1, Number(limit) || KW_SUGGEST_LIMIT);
  const corpus = Array.isArray(otherTitles) ? otherTitles : [];
  const hitsLimit = nytKwFeedHitsLimit(corpus);
  for (const item of (Array.isArray(raw) ? raw : [])) {
    if (typeof item !== 'string') continue;
    const kw = item.trim().toLowerCase().replace(/\s+/g, ' ')
      .replace(/^["'`]+/, '').replace(/["'`.,;:!?]+$/, '');
    if (kw.length < 3 || kw.length > 48) continue;
    if (kw.split(' ').length > KW_SUGGEST_MAX_WORDS) continue;
    if (nytKwIsGenericRule(kw)) continue;
    if (nytKwFeedHits(kw, corpus) >= hitsLimit) continue;
    if (seen.has(kw)) continue;
    seen.add(kw);
    out.push(kw);
    if (out.length >= cap) break;
  }
  return out;
}

async function suggestKeywordsWithAi(input) {
  const src = input || {};
  const title = String(src.title || '').trim();
  const channel = String(src.channel || '').trim();
  const description = String(src.description || '').trim();
  const transcript = String(src.transcript || '').trim();
  const note = String(src.note || '').trim();
  const tags = Array.isArray(src.tags) ? src.tags.map(String).filter(Boolean) : [];
  const existing = Array.isArray(src.keywords) ? src.keywords : [];

  // The other cards on screen right now, handed over by the content script. Used to
  // refuse rules that are just common phrases in this feed (see sanitizeKeywordList).
  const otherTitles = Array.isArray(src.otherTitles) ? src.otherTitles.slice(0, 60).map(String) : [];

  // Offline candidates first: the user's own description and the creator's tags
  // are the highest-signal text available, and they need no round trip.
  //
  // The sources stay SEPARATE and are weighted by the ranker. Joining them into one
  // string (as this used to) fuses the title's last words with the tags' first words
  // into phrases no video contains, which is how dead rules got into the blacklist.
  const heuristic = sanitizeKeywordList(
    rankKeywordCandidates({
      title,
      note,
      tags,
      description: description.slice(0, 6000),
      transcript: transcript.slice(0, 6000)
    }, 12, otherTitles),
    existing,
    KW_SUGGEST_LIMIT,
    otherTitles
  );

  const systemPrompt =
    'You extract blacklist KEYWORD RULES for a YouTube feed filter. Without the user\'s two ' +
    'hard rules an extraction is worthless, so obey both: (1) a rule is matched WORD-FOR-WORD ' +
    '(case-insensitive) against the TITLE, the badge text and the CHANNEL NAME of future videos, ' +
    'so it must be a short phrase a real title would visibly contain — never a sentence, never a ' +
    'description of the channel; (2) it must be specific enough not to match unrelated videos. ' +
    'READ THE WHOLE TITLE: the subject is very often not in the first words ("The Day We Got Out ' +
    'Of Prison" is about prison, not about a day). Rank candidates by how much of the topic they ' +
    'carry, never by where they sit in the title. The creator tags are the strongest evidence of ' +
    'what the video is actually about; use them. Given the video and the user\'s description of ' +
    'what they want gone, return 1-5 rules, each 1-4 words, lowercase. Never return a rule the ' +
    'user already has. Never return a word that matches a large share of YouTube — no filler ' +
    '("the", "new", "video", "channel", "content"), no generic nouns or time words ("day", ' +
    '"first", "last", "life", "time", "world", "people", "story", "way"), and no bare topic so ' +
    'broad it would catch unrelated videos ("ai", "music", "news"). Prefer the distinctive ' +
    'subject words the video itself uses. ' +
    'Respond ONLY with JSON: {"keywords": string[], "rationale": string}.';

  const contextLines = [
    `Video title: ${title || '(none)'}`,
    channel ? `Channel: ${channel}` : '',
    tags.length ? `Creator tags: ${tags.slice(0, 25).join(', ')}` : '',
    otherTitles.length
      ? `Other videos on screen RIGHT NOW (never propose a rule that already matches several of these — that would block unrelated videos): ${otherTitles.slice(0, 15).join(' | ')}`
      : '',
    note ? `User's own description of what to block: ${note.slice(0, 600)}` : '',
    description ? `Video description: ${description.slice(0, 1200)}` : '',
    transcript ? `Transcript excerpt: ${transcript.slice(0, 2000)}` : '',
    existing.length ? `Rules the user already has (never repeat): ${existing.slice(0, 100).join(', ')}` : ''
  ].filter(Boolean);

  try {
    const res = await queryLocalLlm({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextLines.join('\n') }
      ],
      format: 'json',
      model: src.modelChoice,
      customUrl: src.customUrl,
      timeoutMs: 25000
    });

    if (res.ok && res.content) {
      const parsed = cleanJsonParse(res.content);
      const keywords = sanitizeKeywordList(parsed && parsed.keywords, existing, KW_SUGGEST_LIMIT, otherTitles);
      // A model that returns nothing usable must not suppress the offline
      // candidates — fall through to them rather than reporting an empty result.
      if (keywords.length) {
        return {
          ok: true,
          keywords,
          rationale: (parsed && typeof parsed.rationale === 'string')
            ? parsed.rationale.slice(0, 300)
            : 'Suggested by the local model.',
          isFallback: false,
          modelUsed: res.modelUsed || null
        };
      }
    }
  } catch (_) { }

  return {
    ok: heuristic.length > 0,
    keywords: heuristic,
    rationale: heuristic.length
      ? 'Derived from the video\'s own title, description and tags (offline).'
      : 'Nothing keyword-worthy in the available text — add a short description of the video.',
    isFallback: true,
    modelUsed: null
  };
}

// Runtime messaging
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'UPDATE_BADGE' && sender?.tab?.id) {
    const count = Number(msg.count) || 0;
    const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    try {
      // Chrome MV3 supports tabId; Firefox/Zen may not. Fall back gracefully.
      // Firefox's setBadgeText returns a Promise that REJECTS (not throws) when
      // the target tab is closing — unguarded, that's an unhandled rejection.
      const set = (cb) => {
        const p = cb();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      };
      if (typeof chrome.action !== 'undefined' && chrome.action.setBadgeText) {
        try {
          set(() => chrome.action.setBadgeText({ text, tabId: sender.tab.id }));
          set(() => chrome.action.setBadgeBackgroundColor({ color: '#d92323', tabId: sender.tab.id }));
        } catch (_) {
          set(() => chrome.action.setBadgeText({ text }));
          set(() => chrome.action.setBadgeBackgroundColor({ color: '#d92323' }));
        }
      }
    } catch (_) {}
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'INCREMENT_BLOCKED') {
    const requested = Number(msg.inc);
    const inc = Number.isFinite(requested) ? Math.trunc(requested) : 1;
    incrementBlockedTotal(inc)
      .then((total) => sendResponse({ ok: total !== null, total }))
      .catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'CHECK_AI_STATUS') {
    checkAiStatus(msg.customUrl)
      .then(res => sendResponse(res))
      .catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  // --- Bundled in-browser AI provider (no Ollama / LM Studio needed) ---

  if (msg.type === 'CHECK_BUNDLED_AI_STATUS') {
    loadBundledAi()
      .then(ai => ai.checkBundledAiStatus())
      .then(res => sendResponse(res))
      .catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'BUNDLED_AI_GET_MODELS') {
    loadBundledAi()
      .then(ai => sendResponse({ ok: true, models: ai.BUNDLED_AI_MODELS }))
      .catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'BUNDLED_AI_GET_MODEL_STATUS') {
    loadBundledAi()
      .then(ai => ai.getBundledModelStatus(msg.modelKey))
      .then(res => sendResponse({ ok: true, ...res }))
      .catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'BUNDLED_AI_DOWNLOAD_MODEL') {
    loadBundledAi()
      .then(ai => ai.downloadBundledModel(msg.modelKey, (p) => {
        // Forward progress to the popup
        try { chrome.runtime.sendMessage({ type: 'BUNDLED_AI_PROGRESS', modelKey: msg.modelKey, ...p }).catch(() => {}); } catch (_) {}
      }))
      .then(res => sendResponse(res))
      .catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'BUNDLED_AI_QUERY') {
    loadBundledAi()
      .then(ai => ai.queryBundledLlm({
        messages: msg.messages,
        format: msg.format,
        model: msg.model,
        timeoutMs: msg.timeoutMs,
      }))
      .then(res => sendResponse(res))
      .catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'BUNDLED_AI_UNLOAD') {
    loadBundledAi()
      .then(ai => ai.unloadBundledModel())
      .then(() => sendResponse({ ok: true }))
      .catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'AI_SYNTHESIZE_RULES') {
    synthesizeRulesWithAi(msg.prompt, msg.modelChoice, msg.customUrl).then(res => sendResponse(res)).catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'AI_SYNTHESIZE_SUBSCRIPTION_RULES') {
    synthesizeSubscriptionRulesWithAi(msg.channels, msg.modelChoice, msg.customUrl, msg.options).then(res => sendResponse(res)).catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'AI_EVALUATE_BATCH') {
    evaluateBatchWithAi(msg.videos, msg.persona, msg.sensitivity, msg.modelChoice, msg.customUrl, msg.keywords, msg.channels, msg.whitelist, msg.subscribed).then(res => sendResponse(res)).catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'AI_DEBAIT_TITLES') {
    deBaitWithAi(msg.titles, msg.modelChoice, msg.customUrl).then(res => sendResponse(res)).catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'AI_ROAST_FEED') {
    roastFeedWithAi(msg.items, msg.modelChoice, msg.customUrl).then(res => sendResponse(res)).catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'AI_SUMMARIZE_TRANSCRIPT') {
    summarizeTranscriptWithAi(msg.transcript, msg.title, msg.modelChoice, msg.customUrl, msg.opts).then(res => sendResponse(res)).catch((err) => { try { sendResponse({ ok: false, error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'AI_SUGGEST_KEYWORDS') {
    suggestKeywordsWithAi(msg).then(res => sendResponse(res)).catch((err) => { try { sendResponse({ ok: false, keywords: [], error: String((err && err.message) || err) }); } catch (_) {} });
    return true;
  }

  if (msg.type === 'INCREMENT_KEYWORD_HIT') {
    const kw = String(msg.keyword || '').trim().toLowerCase();
    if (!kw) { sendResponse({ ok: false, error: 'empty keyword' }); return false; }
    chrome.storage.local.get(['nyt_keywordHits'], (res) => {
      if (chrome.runtime?.lastError) { sendResponse({ ok: false, error: chrome.runtime.lastError.message }); return; }
      const hits = (res && typeof res.nyt_keywordHits === 'object' && res.nyt_keywordHits !== null) ? res.nyt_keywordHits : {};
      hits[kw] = (hits[kw] || 0) + 1;
      chrome.storage.local.set({ nyt_keywordHits: hits }, () => {
        sendResponse({ ok: !chrome.runtime?.lastError, hits: hits[kw] });
      });
    });
    return true;
  }

  if (msg.type === 'GET_KEYWORD_HITS') {
    chrome.storage.local.get(['nyt_keywordHits'], (res) => {
      sendResponse({ ok: !chrome.runtime?.lastError, hits: (res && res.nyt_keywordHits) || {} });
    });
    return true;
  }

  if (msg.type === 'RESET_KEYWORD_HITS') {
    const kw = msg.keyword ? String(msg.keyword).trim().toLowerCase() : null;
    chrome.storage.local.get(['nyt_keywordHits'], (res) => {
      if (chrome.runtime?.lastError) { sendResponse({ ok: false, error: chrome.runtime.lastError.message }); return; }
      const hits = (res && typeof res.nyt_keywordHits === 'object' && res.nyt_keywordHits !== null) ? res.nyt_keywordHits : {};
      if (kw) {
        delete hits[kw];
      } else {
        // reset all
        Object.keys(hits).forEach(k => delete hits[k]);
      }
      chrome.storage.local.set({ nyt_keywordHits: hits }, () => {
        sendResponse({ ok: !chrome.runtime?.lastError });
      });
    });
    return true;
  }

  // Fallback for unhandled/unrecognized message types
  try {
    sendResponse({ ok: false, error: `unrecognized_message_type: ${msg.type}` });
  } catch (_) {}
  return false;
});
