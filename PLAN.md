# PLAN: Fix AI Guardian Mind Reader & Rule Application for Ball Sports and Custom Topics

## Problem Summary
When a user provides a directive like "block all ball sports related videos" in the AI Guardian Mind Reader Taste Profiler:
1. **Ollama / Local LLM Timeout & Thinking Delay**: `background.js` calls Ollama without `"think": false` and with an aggressive 12s timeout. Thinking models (e.g. `gemma4:12b`, `qwen3vl-thinking`) generate ~1100 reasoning tokens over 30-50 seconds, causing the fetch to abort and silently fall back to `heuristicSynthesize`.
2. **Heuristic Synthesizer Blind Spot**: `heuristicSynthesize` only checked for 4 hardcoded themes (`brainrot`, `crypto`, `ai`, `drama`). For any other topic (such as sports, ball sports, gaming, politics, etc.), it defaulted to generic clickbait tokens (`['prank', 'reaction', 'shocking', 'exposed', 'crypto', 'drama']`) and generated zero sports rules.
3. **Regex Format Incompatibility**: `content.js`'s `hasWordBoundaryKeyword` only treats rules as regex if formatted as `/<pattern>/<flags>`. LLM-generated regexes (e.g. `ball\s*sports?`) omitted slashes, causing `content.js` to escape them as literal strings which never matched.
4. **Autonomous Feed Guardian Bypass**: In `evaluateBatchWithAi`, the 7s timeout caused batch evaluations to abort, and the fallback heuristic ignored the user's persona completely.
5. **Provider Disconnect**: LM Studio was detected in `checkAiStatus`, but all LLM endpoints only used Ollama's `/api/chat` format.
6. **Fragile JSON Parsing**: Lack of codeblock/thinking-tag stripping caused `JSON.parse` exceptions on raw model output.

## Architecture & Implementation Steps

### 1. `background.js`
- **Universal Local LLM Client**:
  - Support both Ollama (`/api/chat` with `think: false` and `format: "json"`) and LM Studio / OpenAI-compatible (`/v1/chat/completions`).
  - Increase timeout from 12s to 45s (to allow model load and response), while `think: false` keeps actual execution around 2-3 seconds.
  - Robust JSON extractor helper (`cleanJsonParse`) that strips `<thought>...</thought>`, markdown codeblocks (````json ... ````), and extracts JSON objects.
- **Enhanced Heuristic Synthesizer**:
  - Expand `heuristicSynthesize` with comprehensive topic coverage including:
    - Ball sports & athletics: basketball, football, soccer, baseball, tennis, golf, volleyball, rugby, cricket, hockey, NFL, NBA, MLB, FIFA, etc.
    - Other major domains: politics, celebrity gossip, gaming, finance, beauty/lifestyle, kids/brainrot.
  - Natural Language Intent Extractor: parse verbs and prepositions like "block [X]", "filter [X]", "ban [X]", "no [X]", "remove [X]", extracting the target nouns/topics directly into keywords.
  - Generate properly formatted regexes: `/\b(pattern)\b/i`.
- **Autonomous Feed Guardian (`evaluateBatchWithAi`)**:
  - Add `think: false` and 30s timeout.
  - Enhance the fallback evaluation to check video titles against key negative concepts in the user's persona (such as sports keywords when the persona contains sports exclusion).

### 2. `popup.js`
- **Regex & Keyword Sanitization in `injectRulesIntoBlacklist`**:
  - When regexes are returned, ensure they are formatted as valid `/.../i` patterns.
  - If a regex pattern lacks leading `/`, wrap it properly (e.g., `/pattern/i`) and verify with `new RegExp(...)`.
  - Ensure keywords are normalized and deduplicated.
  - Immediately save, refresh UI list, notify active YouTube tabs via `RULES_UPDATED`.
  - Provide clear user feedback in the result box showing the exact keywords and regexes that were injected.

### 3. `content.js`
- **Regex & Keyword Matching**:
  - Ensure `hasWordBoundaryKeyword` safely and accurately handles both regex tokens (`/.../flags`) and word-boundary keywords.
- **Autonomous Evaluator Resilience**:
  - Do not permanently mark cards as `aiEvaluated = true` if the AI evaluation batch fails; allow retry or fallback.

## Verification Plan
1. Test heuristic synthesis with "block all ball sports related videos" to verify sports keywords and valid regexes are generated.
2. Test Ollama AI synthesis with `gemma4:12b` on local port 11434 to verify fast response (< 4s) with `think: false` and valid JSON extraction.
3. Test that synthesized sports keywords and regexes match titles like "Lakers vs Celtics Full Game Highlights | NBA" in `hasWordBoundaryKeyword`.
4. Test feed evaluation and storage sync.
