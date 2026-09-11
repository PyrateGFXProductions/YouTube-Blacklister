// Background service worker for Always New To You - YouTube Blacklister v1.8.0
// Manages badges, statistics, and the Autonomous AI Neural Slop Interceptor

const OLLAMA_DEFAULT_URL = 'http://localhost:11434';
const LMSTUDIO_DEFAULT_URL = 'http://localhost:1234';
let blockedCounterQueue = Promise.resolve();

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

// Check local AI server status
async function checkAiStatus(customUrl) {
  const ollamaUrl = customUrl || OLLAMA_DEFAULT_URL;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models.map(m => m.name || m.model) : [];
      return { ok: true, provider: 'ollama', url: ollamaUrl, models };
    }
  } catch (_) {}

  // Fallback check LM Studio / OpenAI-compatible
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${LMSTUDIO_DEFAULT_URL}/v1/models`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const models = Array.isArray(data.data) ? data.data.map(m => m.id) : [];
      return { ok: true, provider: 'lmstudio', url: LMSTUDIO_DEFAULT_URL, models };
    }
  } catch (_) {}

  return { ok: false, provider: 'none', models: [] };
}

// Fallback heuristic rule synthesizer when no LLM is running
function heuristicSynthesize(prompt) {
  const p = (prompt || '').toLowerCase();
  const keywords = [];
  const regex = [];

  if (p.includes('brainrot') || p.includes('slop') || p.includes('prank') || p.includes('reaction')) {
    keywords.push('prank', 'skibidi', 'in 24 hours', "you won't believe", 'shocking', 'exposed', 'reaction');
  }
  if (p.includes('crypto') || p.includes('hustle') || p.includes('rich') || p.includes('money')) {
    keywords.push('crypto', 'bitcoin', 'memecoin', '100x', 'passive income', 'dropshipping');
  }
  if (p.includes('ai') || p.includes('faceless') || p.includes('voiceover')) {
    keywords.push('ai generated', 'faceless channel', 'text to speech');
  }
  if (p.includes('drama') || p.includes('gossip') || p.includes('cancel')) {
    keywords.push('drama', 'canceled', 'apology video', 'responds to', 'clout');
  }

  // Extract explicit quoted words or comma items
  const matches = prompt.match(/"([^"]+)"/g);
  if (matches) {
    matches.forEach(m => keywords.push(m.replace(/"/g, '').trim().toLowerCase()));
  }

  if (!keywords.length) {
    keywords.push('prank', 'reaction', 'shocking', 'exposed', 'crypto', 'drama');
  }

  return {
    keywords: [...new Set(keywords)],
    regex: ['/\\b(vlog|prank)\\s*#?\\d+/i'],
    rationale: 'Heuristic synthesis: extracted high-entropy bait tokens matching your taste prompt.'
  };
}

// Query local LLM for taste synthesis
async function synthesizeRulesWithAi(prompt, modelChoice, customUrl) {
  const baseUrl = customUrl || OLLAMA_DEFAULT_URL;
  const systemPrompt =
    'You are the YouTube Slop Defense Intelligence. Analyze the user\'s taste description and output ONLY valid JSON in this exact structure: ' +
    '{"keywords": string[], "regex": string[], "rationale": string}. ' +
    'The "keywords" array should contain 6-12 high-impact clickbait/slop words to blacklist based on what they want to avoid. ' +
    'Do not output markdown codeblocks, just raw JSON.';

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelChoice || 'gemma4:12b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `User Taste & Preferences: ${prompt}` }
        ],
        stream: false,
        format: 'json'
      }),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const rawText = data?.message?.content || '';
      const parsed = JSON.parse(rawText);
      if (parsed && Array.isArray(parsed.keywords)) {
        return {
          ok: true,
          keywords: parsed.keywords.map(k => String(k).trim().toLowerCase()),
          regex: Array.isArray(parsed.regex) ? parsed.regex : [],
          rationale: parsed.rationale || 'Synthesized by local neural model.'
        };
      }
    }
  } catch (err) {
    // Fallback if LLM fails or times out
  }

  const fallback = heuristicSynthesize(prompt);
  return { ok: true, ...fallback, isFallback: true };
}

// Evaluate candidate videos in batch
async function evaluateBatchWithAi(videos, persona, sensitivity, modelChoice, customUrl) {
  if (!Array.isArray(videos) || !videos.length) return { evaluations: [] };

  const baseUrl = customUrl || OLLAMA_DEFAULT_URL;
  const sens = sensitivity || 'balanced';

  // System prompt
  const systemPrompt =
    'You are an autonomous YouTube content curator. Evaluate each video against the user\'s taste persona. ' +
    'Decide whether to block it (block: true if it is clickbait, low-effort slop, or clashes with their taste). ' +
    'Respond ONLY with JSON: {"evaluations": [{"id": string, "block": boolean, "rationale": string}]}';

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelChoice || 'gemma4:12b',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `User Taste Persona: ${persona || 'High signal, thoughtful, educational, anti-clickbait'}\nSensitivity: ${sens}\nVideos:\n${JSON.stringify(videos)}`
          }
        ],
        stream: false,
        format: 'json'
      }),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const parsed = JSON.parse(data?.message?.content || '{}');
      if (Array.isArray(parsed.evaluations)) {
        return { evaluations: parsed.evaluations };
      }
    }
  } catch (_) {}

  // Fast heuristic evaluation fallback
  const evaluations = videos.map(v => {
    const t = (v.title || '').toLowerCase();
    const capsCount = (v.title || '').replace(/[^A-Z]/g, '').length;
    const isAllCaps = v.title && v.title.length > 10 && (capsCount / v.title.length) > 0.45;
    const baitPats = [/you won'?t believe/i, /in 24 hours/i, /shocking/i, /exposed/i, /skibidi/i, /100x/i, /!!!/];
    const matchesBait = baitPats.some(p => p.test(v.title || ''));

    const shouldBlock = matchesBait || (sens === 'ruthless' && isAllCaps);
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
  const baitPats = [
    /you won'?t believe/i, /in 24 hours/i, /shocking/i, /exposed/i,
    /skibidi/i, /100x/i, /!!+/i, /\b(?:OMG|LOL|WOW|INSANE|CRAZY|EPIC|HUGE|MASSIVE)\b/i,
    /\bprank\b/i, /\breaction\b/i, /\bchallenge\b/i, /\bvs\b/i, /\?\?\?+/i,
    /\b(?:drama|cancelled|canceled|apology)\b/i, /\b(?:crypto|moon|pump|dump|rich|hustle)\b/i,
    /\b(?:hot|sexy|leaked|banned|gone|died|destroyed|owned|roasted)\b/i,
    /\b(?:nobody|everyone|anyone|somebody) (?:knows?|talks? |says? )\b/i,
    /(?:\d+\s+)?(?:things?|ways?|reasons?|secrets?|hacks?|tricks?) (?:you|to|that)/i
  ];
  return isAllCaps || baitPats.some(p => p.test(t));
}

// Heuristic neutralizer: strip ALL-CAPS, remove sensational hooks, keep facts.
function heuristicDebaitTitle(title) {
  let t = String(title || '').trim();
  if (!t) return t;

  t = t.replace(/\b(?:OMG|LOL|LMAO|ROFL|WTF)\b/gi, '');
  t = t.replace(/\s*!{2,}/g, '.');
  t = t.replace(/\s*[?!]+(\s|$)/g, '. ');
  t = t.replace(/\s*\?\s*\?+/g, '.');
  t = t.replace(/\b(?:that is|is going to|gonna)\b/gi, 'is about to');
  t = t.replace(/\s{2,}/g, ' ').trim();

  const prefixers = [
    /^(you won'?t believe\s+)(.+)/i,
    /^(this is (?:the |what )?)(.*)$/i,
    /^(how (?:to|i)\b.+)[\?!.]+$/i
  ];
  const cleaner = [
    /\b(in 24 hours)\b/gi, /\b(?![\?!\.])(shocking|exposed|insane|epic|crazy|massive|huge|wild)(?![\?!\.])\b/gi
  ];
  for (const re of cleaner) t = t.replace(re, '');
  const m = t.match(prefixers[0]);
  if (m && m[2]) t = m[2];
  t = t.replace(/\s*\.{2,}/g, '.').replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/[.,]+$/, '');
  return t || String(title).trim();
}

// De-bait a single title via local LLM with zero-temperature prompt.
async function deBaitWithAi(titles, modelChoice, customUrl) {
  const baseUrl = customUrl || OLLAMA_DEFAULT_URL;
  const systemPrompt =
    'You are the ultra-calm "Title De-Baiter". Rewrite sensationalist YouTube titles into factual, dry, low-key descriptions. ' +
    'Keep the real subject. Strip hype, ALL-CAPS, exclamation marks, outrage hooks, clickbait numbers and drama. ' +
    'Output ONLY valid JSON in this exact structure: {"neutralTitles": [string]}. ' +
    'Each item must correspond 1-to-1 with the input titles array and remain under 12 words. Never editorialize.';

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelChoice || 'gemma4:12b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Titles:\n' + JSON.stringify(titles) }
        ],
stream: false,
        format: 'json',
        options: { temperature: 0 }
      }),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const rawText = data?.message?.content || '';
      const parsed = JSON.parse(rawText);
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

  const outrageWords = ['drama', 'cancel', 'exposed', 'owned', 'roasted', 'destroyed', 'react', 'sues', 'beef', 'fight', 'controversy', 'leak'];
  const parasocialWords = ['my', 'our', 'we did it', 'community', 'thanks for watching', "here's", 'challenge', 'responding to'];
  const desperationWords = ['24 hours', 'last chance', 'before it', 'gone', 'banned', 'deleted', 'be careful', 'beware', 'how to get rich', 'free'];
  const clickbaitPats = [/you won'?t believe/i, /in 24 hours/i, /shocking/i, /exposed/i, /!!+/i, /\b(?:OMG|LOL|WOW|INSANE|EPIC|CRAZY)\b/i];

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
  const baseUrl = customUrl || OLLAMA_DEFAULT_URL;
  const systemPrompt =
    'You are the savage but precise "Feed Forensic Psychologist". Analyze the given YouTube feed items for psychological manipulation tactics. ' +
    'Output ONLY valid JSON with this exact structure: ' +
    '{"toxicity": number(0-100), "tactics": string[], "diagnosis": string, "toxicChannels": string[]}. ' +
    'diagnosis must be witty, psychoanalytic, 2-3 sentences, roasting the algorithm. toxicChannels lists only channels whose titles show clear manipulation/clickbait.';

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelChoice || 'gemma4:12b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Current visible feed items:\n' + JSON.stringify(items) }
        ],
        stream: false,
        format: 'json'
      }),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const parsed = JSON.parse(data?.message?.content || '{}');
      if (typeof parsed.toxicity === 'number') {
        const tactics = Array.isArray(parsed.tactics) ? parsed.tactics : [];
        const toxicChannels = Array.isArray(parsed.toxicChannels) ? parsed.toxicChannels : [];
        return {
          ok: true,
          toxicity: Math.max(0, Math.min(100, Math.round(parsed.toxicity))),
          tactics,
          diagnosis: parsed.diagnosis || 'No diagnosis provided.',
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
function parseYouTubeDuration(iso) {
  if (!iso) return 0;
  const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

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
  const baseUrl = customUrl || OLLAMA_DEFAULT_URL;
  const systemPrompt =
    'You are the strict "TL;DW Inspector" — a forensic media literacy machine. ' +
    'Compare the video transcript against its title and flag clickbait dishonesty. ' +
    'Output ONLY valid JSON with this exact structure: ' +
    '{"clickbaitVerdict": string (end with TRUE CLICKBAIT / PARTIAL TRUTH / NOT CLICKBAIT), "takeaways": string[3], "confidence": string}. ' +
    'takeaways: exactly 3 terse bullet points of actual substance from the transcript.';

  const clip = (transcript || '').slice(0, 14000);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelChoice || 'gemma4:12b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Video Title: ${title}\n\nTranscript:\n${clip}` }
        ],
        stream: false,
        format: 'json'
      }),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const parsed = JSON.parse(data?.message?.content || '{}');
      const takeaways = Array.isArray(parsed.takeaways) ? parsed.takeaways.slice(0, 3) : [];
      if (parsed.clickbaitVerdict || takeaways.length) {
        const durationSec = opts ? opts.durationSec || 0 : 0;
        const timeSaved = durationSec > 0 ? Math.round(durationSec / 60) : Math.floor((transcript || '').split(/\s+/).length / 150);
        return {
          ok: true,
          clickbaitVerdict: parsed.clickbaitVerdict || 'Inconclusive verdict.',
          takeaways,
          timeSaved,
          isFallback: false
        };
      }
    }
  } catch (_) {}

  return { ok: true, ...summarizeFeedbackFallback(transcript), isFallback: true };
}

// Runtime messaging
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'UPDATE_BADGE' && sender?.tab?.id) {
    const count = Number(msg.count) || 0;
    const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    try {
      chrome.action.setBadgeText({ text, tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#d92323', tabId: sender.tab.id });
    } catch (_) {}
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'INCREMENT_BLOCKED') {
    const requested = Number(msg.inc);
    const inc = Number.isFinite(requested) ? Math.trunc(requested) : 1;
    incrementBlockedTotal(inc).then((total) => sendResponse({ ok: total !== null, total }));
    return true;
  }

  if (msg.type === 'CHECK_AI_STATUS') {
    checkAiStatus(msg.customUrl).then(res => sendResponse(res));
    return true;
  }

  if (msg.type === 'AI_SYNTHESIZE_RULES') {
    synthesizeRulesWithAi(msg.prompt, msg.modelChoice, msg.customUrl).then(res => sendResponse(res));
    return true;
  }

  if (msg.type === 'AI_EVALUATE_BATCH') {
    evaluateBatchWithAi(msg.videos, msg.persona, msg.sensitivity, msg.modelChoice, msg.customUrl).then(res => sendResponse(res));
    return true;
  }

  if (msg.type === 'AI_DEBAIT_TITLES') {
    deBaitWithAi(msg.titles, msg.modelChoice, msg.customUrl).then(res => sendResponse(res));
    return true;
  }

  if (msg.type === 'AI_ROAST_FEED') {
    roastFeedWithAi(msg.items, msg.modelChoice, msg.customUrl).then(res => sendResponse(res));
    return true;
  }

  if (msg.type === 'AI_SUMMARIZE_TRANSCRIPT') {
    summarizeTranscriptWithAi(msg.transcript, msg.title, msg.modelChoice, msg.customUrl, msg.opts).then(res => sendResponse(res));
    return true;
  }
});
