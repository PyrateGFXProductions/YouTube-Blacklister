// Bundled in-browser AI provider for YouTube Blacklister.
// Uses vendored transformers.js + onnxruntime-web (no Ollama, no LM Studio, no other app).
// Models are downloaded from HuggingFace on first use — user picks which one.
//
// This file is loaded by background.js via dynamic import() and exposes:
//   - BUNDLED_AI_MODELS: catalog of available models
//   - checkBundledAiStatus(): returns { ok, provider, models, errors }
//   - queryBundledLlm({ messages, format, model, timeoutMs }): same return shape as queryLocalLlm
//   - downloadBundledModel(modelKey, onProgress): downloads + caches a model
//   - getBundledModelStatus(modelKey): returns { downloaded, downloading, progress }

const BUNDLED_AI_MODELS = [
  {
    key: 'smollm2-360m',
    hfId: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    label: 'SmolLM2 360M',
    size: '~250 MB',
    desc: 'Small, fast, good instruction-following',
    quant: 'q4',
  },
  {
    key: 'qwen2.5-0.5b',
    hfId: 'Qwen/Qwen2.5-0.5B-Instruct',
    label: 'Qwen2.5 0.5B',
    size: '~400 MB',
    desc: 'Stronger reasoning, moderate size',
    quant: 'q4',
  },
  {
    key: 'phi-3.5-mini',
    hfId: 'microsoft/Phi-3.5-mini-instruct',
    label: 'Phi-3.5 mini',
    size: '~2.2 GB',
    desc: 'Matches your other app, very capable',
    quant: 'q4',
  },
];

// Module-level state
let _tf = null;       // transformers.js module namespace
let _ort = null;      // onnxruntime-web module namespace
let _pipeline = null; // active pipeline instance
let _pipelineModelKey = null; // which model the pipeline is loaded for
let _loading = false; // guard against concurrent loads

/**
 * Get the extension-relative URL for a vendored file.
 */
function _vendorUrl(filename) {
  return chrome.runtime.getURL(`vendor/${filename}`);
}

/**
 * Load the vendored engine (transformers.js + ORT) via dynamic import.
 * Sets wasmPaths to point at the vendored WASM files.
 * Returns { tf, ort } or throws.
 */
async function _loadEngine() {
  if (_tf && _ort) return { tf: _tf, ort: _ort };

  if (_loading) {
    // Wait for the in-flight load to complete
    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (_tf && _ort) return { tf: _tf, ort: _ort };
    }
    throw new Error('Engine load timeout');
  }

  _loading = true;
  try {
    // Import ORT first so we can configure it before transformers.js uses it
    const ortMod = await import(_vendorUrl('ort.min.mjs'));
    _ort = ortMod.default || ortMod;

    // Point ORT at the vendored WASM files
    if (_ort.env && _ort.env.wasm) {
      _ort.env.wasm.wasmPaths = {
        wasm: _vendorUrl('ort-wasm-simd-threaded.wasm'),
        mjs: _vendorUrl('ort-wasm-simd-threaded.mjs'),
      };
      // Single-threaded to avoid Web Worker complexity in service worker
      _ort.env.wasm.numThreads = 1;
    }
    if (_ort.env) {
      _ort.env.logLevel = 'error';
    }

    // Import transformers.js
    const tfMod = await import(_vendorUrl('transformers.web.js'));
    _tf = tfMod;

    return { tf: _tf, ort: _ort };
  } finally {
    _loading = false;
  }
}

/**
 * Check bundled AI status. Returns the same shape as checkAiStatus:
 *   { ok, provider, models, errors }
 */
async function checkBundledAiStatus() {
  const errors = [];
  try {
    await _loadEngine();
    // List downloaded models from storage
    const store = await new Promise(r => chrome.storage.local.get(['bundledAiModels'], r));
    const downloaded = (store && store.bundledAiModels) || {};
    const models = BUNDLED_AI_MODELS
      .filter(m => downloaded[m.key])
      .map(m => m.hfId);
    return { ok: true, provider: 'bundled', models, errors };
  } catch (e) {
    errors.push({
      provider: 'bundled',
      error: e && e.message ? e.message : String(e),
    });
    return { ok: false, provider: 'bundled', models: [], errors };
  }
}

/**
 * Get download status for a specific model.
 * Returns { downloaded, downloading, progress }
 */
async function getBundledModelStatus(modelKey) {
  const store = await new Promise(r => chrome.storage.local.get(['bundledAiModels'], r));
  const downloaded = (store && store.bundledAiModels) || {};
  const info = downloaded[modelKey];
  if (!info) return { downloaded: false, downloading: false, progress: 0 };
  return {
    downloaded: Boolean(info.downloaded),
    downloading: Boolean(info.downloading),
    progress: Number(info.progress) || 0,
  };
}

/**
 * Download a model from HuggingFace and cache it.
 * onProgress receives { status, progress, file } where progress is 0-100.
 */
async function downloadBundledModel(modelKey, onProgress) {
  const model = BUNDLED_AI_MODELS.find(m => m.key === modelKey);
  if (!model) throw new Error(`Unknown model: ${modelKey}`);

  // Mark as downloading
  const store = await new Promise(r => chrome.storage.local.get(['bundledAiModels'], r));
  const downloaded = (store && store.bundledAiModels) || {};
  downloaded[modelKey] = { downloaded: false, downloading: true, progress: 0 };
  await new Promise(r => chrome.storage.local.set({ bundledAiModels: downloaded }, r));

  try {
    const { tf } = await _loadEngine();

    // Use transformers.js pipeline to download + cache the model
    // The progress_callback reports download progress
    const pipe = await tf.pipeline('text-generation', model.hfId, {
      progress_callback: (p) => {
        if (onProgress && typeof onProgress === 'function') {
          const progress = p.status === 'progress' ? Math.round((p.loaded / p.total) * 100) : 0;
          onProgress({ status: p.status, progress, file: p.file || '' });
        }
      },
    });

    // Store the pipeline for reuse
    _pipeline = pipe;
    _pipelineModelKey = modelKey;

    // Mark as downloaded
    const store2 = await new Promise(r => chrome.storage.local.get(['bundledAiModels'], r));
    const downloaded2 = (store2 && store2.bundledAiModels) || {};
    downloaded2[modelKey] = { downloaded: true, downloading: false, progress: 100 };
    await new Promise(r => chrome.storage.local.set({ bundledAiModels: downloaded2 }, r));

    if (onProgress) onProgress({ status: 'done', progress: 100, file: '' });
    return { ok: true, model: model.hfId };
  } catch (e) {
    // Mark as not downloading
    const store3 = await new Promise(r => chrome.storage.local.get(['bundledAiModels'], r));
    const downloaded3 = (store3 && store3.bundledAiModels) || {};
    downloaded3[modelKey] = { downloaded: false, downloading: false, progress: 0 };
    await new Promise(r => chrome.storage.local.set({ bundledAiModels: downloaded3 }, r));

    throw e;
  }
}

/**
 * Query the bundled LLM. Same return shape as queryLocalLlm:
 *   { ok, content, provider, modelUsed, reason }
 */
async function queryBundledLlm({ messages, format = 'json', model, timeoutMs = 35000 }) {
  const timeout = Math.max(5000, Number(timeoutMs) || 35000);

  // Resolve which model to use
  let modelKey = null;
  if (model && typeof model === 'string' && model.trim() && model !== 'heuristic') {
    // model is a key like 'smollm2-360m' or an hfId
    const found = BUNDLED_AI_MODELS.find(m => m.key === model || m.hfId === model);
    if (found) modelKey = found.key;
  }
  if (!modelKey) {
    // Check storage for last-used bundled model
    const store = await new Promise(r => chrome.storage.local.get(['bundledAiModel'], r));
    if (store && store.bundledAiModel) {
      const found = BUNDLED_AI_MODELS.find(m => m.key === store.bundledAiModel);
      if (found) modelKey = found.key;
    }
  }
  if (!modelKey) {
    // Default to first model
    modelKey = BUNDLED_AI_MODELS[0].key;
  }

  const modelInfo = BUNDLED_AI_MODELS.find(m => m.key === modelKey);
  if (!modelInfo) {
    return { ok: false, content: '', provider: 'bundled', modelUsed: null, reason: 'unknown_model' };
  }

  // Check if model is downloaded
  const status = await getBundledModelStatus(modelKey);
  if (!status.downloaded) {
    return { ok: false, content: '', provider: 'bundled', modelUsed: modelInfo.hfId, reason: 'model_not_downloaded' };
  }

  // Load engine if needed
  let pipe = _pipeline;
  if (!pipe || _pipelineModelKey !== modelKey) {
    try {
      const { tf } = await _loadEngine();
      pipe = await tf.pipeline('text-generation', modelInfo.hfId, {
        progress_callback: () => {}, // already downloaded, no progress needed
      });
      _pipeline = pipe;
      _pipelineModelKey = modelKey;
    } catch (e) {
      return { ok: false, content: '', provider: 'bundled', modelUsed: modelInfo.hfId, reason: e.message || 'load_failed' };
    }
  }

  // Build the prompt from messages
  const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');

  // Run inference with timeout
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);

    const result = await pipe(prompt, {
      max_new_tokens: 512,
      temperature: 0.1,
      do_sample: false,
    });

    clearTimeout(timer);

    // Extract generated text
    let content = '';
    if (result && result[0] && result[0].generated_text) {
      content = result[0].generated_text;
      // Remove the prompt from the output if it's included
      if (content.startsWith(prompt)) {
        content = content.slice(prompt.length).trim();
      }
    }

    return { ok: true, content, provider: 'bundled', modelUsed: modelInfo.hfId };
  } catch (e) {
    if (e && e.name === 'AbortError') {
      return { ok: false, content: '', provider: 'bundled', modelUsed: modelInfo.hfId, reason: `timeout (${timeout}ms)` };
    }
    return { ok: false, content: '', provider: 'bundled', modelUsed: modelInfo.hfId, reason: e.message || 'inference_failed' };
  }
}

/**
 * Unload the current pipeline to free memory.
 */
async function unloadBundledModel() {
  _pipeline = null;
  _pipelineModelKey = null;
  // Force garbage collection hint
  if (globalThis.gc) globalThis.gc();
}

// Export for use by background.js
globalThis.BundledAiProvider = {
  BUNDLED_AI_MODELS,
  checkBundledAiStatus,
  queryBundledLlm,
  downloadBundledModel,
  getBundledModelStatus,
  unloadBundledModel,
};
