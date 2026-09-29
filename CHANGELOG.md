# Changelog

All notable changes to the **Always New To You - YouTube Smart Blacklister** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.11.1] - 2026-09-28

### Security
- **Added missing `"scripting"` permission** (`manifest.json`, `manifest-firefox.json`): prevents `TypeError: Cannot read properties of undefined (reading 'executeScript')` when `fetchVisibleTitles()` or `refreshFeedHealth()` is executed in `popup.js`.
- **Patched multiple `innerHTML` XSS sinks with `escapeHtml()`** (`popup.js`):
  - `renderCommunityPacks`: `p.name` and `p.url` are safely escaped before injection.
  - `renderTemporalRules`: `r.keyword` and `r.reason` are escaped.
  - `renderKeywordExceptions`: `keyword` and channel list are escaped.
  - `runKeywordTest`: user-input test titles and matching keyword badges are escaped.
  - `loadHitCounters`: keyword text and `data-kw` attributes are escaped.
  - `refreshFeedHealth`: rule names in the dashboard summary are escaped.
- **Added URL scheme enforcement to `addCommunityPack`** (`popup.js`): requires `http:` or `https:`.
- **Added Ollama `<think>...</think>` tag stripping in `cleanJsonParse`** (`background.js`): reasoning blocks from DeepSeek-R1 / Qwen 2.5/3.x are stripped before JSON boundary extraction, preventing parse failures on model output.

### Fixed
- **Uncaught rejection in `INCREMENT_BLOCKED`** (`background.js`): attached `.catch()` handler to `incrementBlockedTotal()` to prevent dropped message channels on storage errors.
- **Exhaustive `onMessage` dispatcher** (`background.js`): added an explicit default handler returning `{ ok: false, error: 'unrecognized_message_type' }` to prevent hanging message ports.
- **Indentation alignment** (`background.js`): fixed dedented `CHECK_AI_STATUS` block and aligned listener closing brace.
- **Malformed HTML attribute quote** (`popup.html`): escaped inner quotes in `aria-label` on `toggleNewToYou`.
- **Full backup & restore coverage** (`backup.js`): added `keywordExceptions`, `temporalRules`, `communityPacks`, and `feedHealthLog` to `data`, `load()`, `buildPayload()`, and `saveToStorage()` so backups capture all collections without loss.
- **Instant tab reaction to rule changes** (`content.js`): added `'keywordExceptions'` and `'temporalRules'` to `RULE_KEYS` so adding/updating exceptions or temporal rules immediately updates active YouTube tabs.
- **In-memory sync in `extractKeywordsFromCard`** (`content.js`): `settings.keywords` is immediately updated on extraction, allowing immediate re-scans to reflect changes without waiting for storage events.
- **Clean community pack unmerging** (`popup.js`): disabling or removing a pack cleanly unmerges its rules from active keywords and channels instead of leaving user lists permanently contaminated.
- **Temporal rule expiry precision & preservation** (`popup.js`): temporal expiry uses end-of-day local time and preserves pre-existing permanent keywords upon rule expiry.

---

## [1.11.0] - 2026-09-27

### Security
- **Removed the port-8080 host permission and the entire ONNX "Local Phi" offering** (`manifest.json`, `background.js`, `popup.js`, `popup.html`, `PRIVACY.md`). The extension no longer declares, probes, or advertises any local server other than the two it actually speaks to (Ollama `11434`, LM Studio `1234`). A permission a reviewer has to be talked into is a permission not worth shipping when nothing uses it: the offering only advertised an unrelated third-party agent framework on a common port and bought the user nothing.
- **Local-AI endpoint validation now pins the PORT, not just the hostname** (`background.js` → `resolveLocalAiBaseUrl()`): a `customUrl` arriving on the message payload is accepted only for `localhost` / `127.0.0.1` / `::1` on ports `11434` or `1234` — the same set the manifest grants. A stale caller can no longer direct the worker at a loopback port the extension does not declare. Locked in by an assertion that `http://localhost:8080` is now rejected.

### Changed
- **One source of truth for the heuristic pattern tables** (`shared-tables.js`, new): `CLICKBAIT_PATTERNS`, `DEBait_CLEANERS`, and the other slop/sport/noise tables are declared once and loaded into both JavaScript contexts that consume them — the service worker via `importScripts()` (Chrome MV3 classic worker) and the content script via the manifest's `content_scripts.js` list. Firefox, which has no `importScripts()` outside a worker, loads the file through `background.scripts`. The content script previously carried a hand-copied subset of two of these tables, and it had already drifted: the same title could be judged sensational by one engine and not the other, and neutralized differently depending on whether the local model answered.
- **One source of truth for the card-thumbnail selector** (`content.js`): it had been copy-pasted into six call sites.
- **Accessibility**: every form control now has a programmatic accessible name (placeholders are not accessible names, and the switch labels contain no text), and the persona chips plus the "Open YouTube" control are keyboard-operable (`role="button"`, `tabindex="0"`, Enter/Space).

### Fixed
- **De-baited titles rendered black text, invisible on dark themes**: De-baiting wipes YouTube's title element and inserts a bare text node — but the theme color (`color: var(--yt-spec-text-primary)`) lives on YouTube's inner title `<a>`, which the wipe destroys. The bare text then falls back to the browser default black in *every* theme. The neutral title (and the "restore original" path) are now wrapped in a `.nyt-debait-title` span styled with `color: var(--yt-spec-text-primary, inherit)` — dark theme gets light text, light theme gets dark text, and any layout missing the variable inherits instead of going black.
- **Full bug-sweep — every verified pre-existing defect, quirk, and crash (content, popup, background, backup, packaging)**:
  - **Stale settings lost**, especially after popup changes in another tab: the content script re-loads all settings on every `visibilitychange` to `visible` and re-applies styles/hunt mode/feed pass (SEV-4). `saveSettings()` also persists every setting it manages (it silently dropped `shortsSubOnly`, AI model/taste/profile, de-bait, TL;DR, and Hunt flags before).
  - **Multi-word channel names corrupted**: `extractChannelNamesFromByline()` split "Mark Rober and 2 more" on raw whitespace into "Mark" + "Rober" (name-fragment leaks, wrong primary channel), and `getChannelName()` returned `decomp[1]` (a *collaborator*) for multi-collab bylines. Now splits on separators only ("Mark Rober" stays intact) and returns the primary (first) channel; collaborators still feed `getCardChannelKeys()` for blocking.
  - **Keyword `\b` could never match `#music` / `C++`**: the boundary was applied unconditionally, so keywords starting/ending with a non-word character could not match at all. `\b` is now applied only where a word character actually sits (content.js, background.js interceptor, and the AI-guardian test mirror all fixed identically).
  - **Channels dropped on every load**: `loadSettings()` rejected entries ≤2 chars or bare digits ("DJ", "AI", "1900") — legitimate channel names. Only clear time-ago/view-count leaks are filtered now (the earlier filter amendment is in the entry below).
  - **Auto-dub false positives**: `isAutoDubBadgeText()` matched bare "Dub", so "Go to channel Dub FM" (a channel *name* in an aria-label) triggered auto-dub hiding. Bare "Dub" is no longer a badge; real badges ("Auto-dubbed", "Dubbed (English)") still are. Badge scanning also de-dupes via a Set.
  - **Shorts shelves never un-hidden**: turning `shortsSubOnly` off left previously-hidden shorts reels/shelves permanently hidden. New `unhideShorts()` restores them on every feed pass when the mode is off.
  - **Stacked watch-page redirects**: `history.back()` scheduled from both the watch-page guard AND a blacklist action could eject the user two pages deep. A single `redirectAwayFromWatchPage()` latch allows only one escape.
  - **TL;DW stale-response race**: a slow AI summary from video A could overwrite the modal opened for video B. The modal host is tagged with its video; stale responses are dropped.
  - **Undo lied on already-blocked channels**: "Blacklist" on a channel already on the list offered Undo, decremented the all-time counter, and toasted "Unblocked: …" without removing anything. Undo only appears when this action actually added a rule.
  - **Blacklist dead branch**: the "block only this video" fallback was unreachable code (the primary-name fallback already handled it) and `vid.toLowerCase()` could throw on a non-string — removed/guarded.
  - **Server-feedback clicked hidden menus**: `requestNativeServerFeedback()` scanned the whole popup container visibility-blind. It now targets only the currently open menu.
  - **Hunt Mode prey spawn explosion**: prey elements live on `document.body`, so `card.querySelector('.nyt-hunt-prey')` never matched and every 550ms roam tick spawned duplicates (unbounded). Per-card reference tracking caps it at one prey per card.
  - **Hunt Mode zeroed stored scores**: start→stop with zero shots persisted `score:0` over the stored high score. `huntPersist()` is gated on actually playing.
  - **Stuck quick-block**: previously-unhidden blocked cards snapped back to hidden via `snapUnhiddenBlockedCards()` after the sticker SPA re-render wiped their inline styles.
  - **Unthrottled mouseover**: `getComputedStyle()` ran on every element transition (once per thumbnail now) and `hoveredVideoCard` was never cleared — stale hover targets could be blacklisted with the "B" key. A `mouseout` handler clears it.
  - **`aiLog` crash**: the AI interception log read `store.aiLog` unguarded (crash on missing key) and ignored `runtime.lastError`.
  - **Broken sign-in marker**: the subscriptions scraper's `aria-label="Sign in to confirm` marker was parsed with a truncated query selector. Replaced with real `[aria-label^="Sign in to confirm"]` selector matching.
  - **Chip Rescue polled forever** on a never-rendering feed (uncapped 4s reschedule). Bounded to 8 polls, then silent.
  - **De-bait reveal was one-way**: clicking ✨ revealed the original title but offered no way back. The original state now shows a ✨ badge to re-apply the neutral title (neutral stored on the card).
  - **AI model resolution probed every call**: with no explicit model, each AI call re-probed Ollama (2.5s) + LM Studio (2s) + ONNX (9s) before falling back. Probe results are cached for 60s.
  - **LLM failures swallowed the reason**: `queryLocalLlm()` returned nothing informative on failure; it now reports the Ollama/LM Studio HTTP or timeout reason so the diagnostics UI can explain the heuristic fallback.
  - **Badge writes rejected unhandled** (Firefox/Zen): `chrome.action.setBadgeText` returns a rejecting Promise when a tab closes; rejections are now caught.
  - **`cleanJsonParse()` missed `<reasoning>` blocks**: `<reasoning>…</reasoning>` (and `<|reasoning|>` variants) are stripped like `<thought>`.
  - **Subscription Synth killed the popup**: `tabs.create({active:true})` closed the MV3 popup instantly. The tab is now created backgrounded (`active:false`), and the scan button is re-armed on every terminal path (it previously never re-enabled on success).
  - **Auto-dub mode pills unstyled**: segmented-control CSS added for the `off`/`smart`/`total` pills.
  - **Popup clobbered `aiModel` on open**: the popup wrote a default model to storage during load even when the user never touched the dropdown. Load only populates the UI; the dropdown writes only on change. Roast and synthesizers now read the live select value (`currentAiModelChoice()`), not a stale render-time attribute.
  - **Conflict-row ✕ removal missed**: rows were keyed one way and removed another (regex-canonicalization mismatch), so removal silently did nothing. A shared `canonicalKeyword()` keys add and remove identically.
  - **Inline-edit blur swallowed clicks**: the blur handler committed and destroyed the row before the Save button's click could land. Save/✕ now decide on `mousedown` (fires before blur) and blur no-ops after a decision. Inline edits also apply the same normalization as the add path (keywords, channels, whitelist — the whitelist had none) and a case-only edit no longer deletes the rule.
  - **Popup never re-rendered AI log**: `chrome.storage.onChanged` now refreshes the AI log section when it changes in another context. The `RULES_UPDATED` tab broadcast was verified working via host permissions (kept).
  - **Export restore clobbered fresh data**: `backup.js` wrote a stale page-load copy of `aiLog` / `nyt_totalBlocked` / `aiSubscriptionProfile` / `subsSnapshot` over newer values. Preserved keys are re-read inside the write path (critical section).
  - **Backup missing keys**: `aiSubscriptionProfile` and `subsSnapshot` were absent from export and restore. Both now round-trip; `subsSnapshot` is replaced wholesale when the file carries it.
  - **Backup import crashed on malformed `settings`**: non-object `json.settings` is ignored instead of throwing.
  - **Backup import never told tabs**: a successful import now broadcasts `RULES_UPDATED` to YouTube tabs so in-memory settings refresh immediately.
  - **Backup sanitizer crashed on numbers**: `sanitizeImportedKeyword()` coerces strings/numbers safely and rejects objects/arrays instead of producing `[object Object]`.
  - **Backup import was re-entrant**: a busy lock wraps the whole import; double-clicks do nothing, and the file picker is now gesture-only (`#import` auto-open removed).
  - **Release zip shipped the universal manifest**: the release zip now carries the stripped Chromium manifest (no `browser_specific_settings`, `service_worker` only — the extension `key` stays in the Chromium build by design to pin the extension ID).
  - **Non-atomic artifact copies**: all xpi/zip/jar swaps are atomic (`Copy-FileAtomic` — temp file + move), and `$OutputDir` defaults to the script's own folder instead of the caller's CWD (relative paths are rooted so `Move` can't land elsewhere).
  - **De-bait state survived element recycling** (`content.js`): the de-baiter marked a card with a flat `dataset.debaitState` boolean and skipped anything carrying it — but YouTube recycles card elements, so a node de-baited once was never de-baited again for the *next* video it displayed. The state is now keyed to the video id (`debaitFor`) and the stale per-video fields are dropped when the element moves on, so a recycled card is re-evaluated for its new title while the ✨ original/neutral toggle keeps working on the card you are looking at. The title could not be used as the key, because de-baiting rewrites the title element itself.
  - **AJAX-evaluated flag survived element recycling** (`content.js`): same class of bug on `dataset.aiEvaluated`, which could leave a recycled card permanently un-evaluated. Now keyed to the card's video identity.
  - **Dead code removed** (`content.js`): `huntVisibleCards()` was never called by anything, and `huntThumbFor()` was unreferenced too — the latter is now `getCardThumbnail()`, the single implementation behind the six duplicated thumbnail lookups.
  - **Spurious `Unchecked runtime.lastError`** whenever the feed-roast worker was asleep (`popup.js`): the `AI_ROAST_FEED` callback now reads `lastError`, like every other `sendMessage` callback in the file.
  - **Feed-diversity percentages could print `NaN%`** on a feed with no visible cards (`popup.js`): message-sourced counters are coerced to numbers and the division is guarded.
  - **Hardcoded version string in the popup footer**: it is now read from the manifest at runtime, which is why every past release left a stale version on screen.
  - **README install steps for Firefox/Zen were wrong** — they pointed at the repository folder, whose universal manifest declares both `background.scripts` and `background.service_worker`. Firefox-family users are now directed to the packaged `blacklist-firefox.xpi` (or `zen-unpacked/`).

### Added
- **Start Home on "New to you"** (`settings.newToYouAuto`, Settings > toggle, opt-in/off by default): YouTube's Home only promotes channels it's "safe to advertise" — everything else stays buried, and after hiding the promoted tier you're left with tier-2 junk, not the long tail. "New to you" is the one surface YouTube built specifically to surface channels you haven't encountered before. When enabled, the extension automatically clicks that chip each time the Home chip bar renders (no reloads, no repeat clicks; absent chip = silent no-op — YouTube makes it unavailable per account/region). Pure decision (`shouldAutoEnterNewToYou`) is covered by the Node harness (now 54 cases).
- **Chip Rescue** (`settings.chipRescue`, Settings > toggle, opt-in/off by default): YouTube's home topic-chip bar (`ytd-feed-filter-chip-bar-renderer` / `#chips-wrapper` — Comedy, Tourism, Gaming, …) is a known YouTube server-side/A-B rendering bug where the bar vanishes and only endless page refreshes bring it back. This extension never touches the chip bar, but when enabled it triages it: chips present-but-hidden are shown again immediately (cheap, no reload), while a completely missing bar gets a small floating **"Restore chips"** button — one click reloads the page (the community-proven fix). It never auto-reloads. Triage logic (`chipRescueState`) is pure and covered by the Node harness.

### Fixed
- **Keyword rules could not block Auto-dubbed videos — ever**: The "Auto-dubbed" label is a BADGE on the thumbnail/metadata/sidebar (`div[aria-label="Auto-dubbed"]`, `ytd-thumbnail-overlay-badge-view-model`, `.ytBadgeShapeText`), not part of the title or channel name — so a keyword/regex rule like `auto-dubbed` scanned title+channel text only and could never match the videos the user's rule targeted. `evaluateCard()` now (a) reads auto-dub badge text off every card via `cardAutoDubBadgeText()`, (b) feeds it into keyword/regex matching through `keywordRulesHidden({ extraText })` so plain keyword rules match the badge exactly like titles, and (c) ships a 3-mode **Auto-Dubbed Videos** control (`settings.autoDubMode`): **Off** (keyword rules only) · **Smart** (hide auto-dubbed recommendations but keep them from subscribed channels) · **Total** (hide everywhere — **even from channels you've watched or subscribed to**, "not even from watched channels"; only the whitelist overrides). Badge detection is case-insensitive on `dub`/`dubbed`/`auto-dub` and cannot false-positive on LIVE/Premieres badges or words like "double". Pure logic (`isAutoDubBadgeText`, `autoDubHideDecision`, extended `keywordRulesHidden`) is covered by the Node harness (now 54 cases).
- **Keyword/regex rules kidnapped the watch page**: Opening `youtube.com/watch?v=…` for a video whose title (or channel name) matched a keyword/regex rule paused the video and navigated away (`history.back()` / YouTube home) — even for channels the user is subscribed to. Opening a watch page is a deliberate act, so keyword rules are now strictly feed-side: `watchPageBlockDecision()` (pure, node-tested) only interrupts playback for an *explicit* video-ID blacklist or an *explicit channel* blacklist. Channels in `subsSnapshot` (genuinely subscribed) or the whitelist are never interrupted — a subscribed channel that is also explicitly blacklisted still plays on watch pages (it remains hidden from feeds). `keywordRulesHidden()` (pure, node-tested) skips keyword/regex matching entirely for subscribed or whitelisted channels on feeds, so subscription feeds stop getting keyword-censored; explicit channel/video blacklists still hide there. Watch-page guard + feed engine both wire through the pure functions and are covered by the Node harness (now 54 cases).
- **Export Backup silently produced no file (Firefox/Zen)**: The popup's export built a detached `<a download>` and called `URL.revokeObjectURL()` immediately, which Firefox-family browsers abort before the download starts — no file was ever written. Export/import now live in a dedicated **Backup & Restore** page (`backup.html`, opened from the popup buttons) that uses `chrome.downloads.download` (new `downloads` permission) with an in-DOM anchor fallback and a 60-second deferred URL revoke. Export status is now honest: it reports actual completion or the real failure reason.
- **Import Backup never replaced rules**: `importBackup(file, replaceExisting)` was wired without the flag, so a restore only *merged* — and a popup-scoped file picker can close the popup before the chosen file is read. The Backup & Restore page defaults to **Replace existing rules** (merge available via checkbox), wipes only *after* the file parses cleanly, coerces non-string entries safely (objects/arrays rejected instead of crashing), restores settings, and reports real counts.
- **Keyword/regex rules never matched channel names — only titles**: AI-synthesized script-range rules (e.g. `/[\u0400-\u04FF]/i` Cyrillic, `/[\u4E00-\u9FFF]/i` CJK) could not block a non-Latin CHANNEL name even when the rule was stored and active. `evaluateCard()` now tests the channel name against the keyword/regex rules as well, so a Cyrillic/Chinese-titled channel is hidden immediately on the feed. (Channel-name rules intentionally do NOT navigate a watch page away — see the watch-page guard fix above.)
- **Subscription Synthesizer results were invisible**: The success box now renders the exact keywords and regex rules the AI created (scrollable chips) plus a "Show rules in Keywords tab" jump button — previously only a count was shown, so users could not tell what was added.
- **Mind Reader results truncated**: Synthesis success now lists ALL created rules (was capped at a 10-keyword sample) with the same jump-to-Keywords action.
- **No way to edit rules**: Every channel / keyword / whitelist row gained an inline ✏️ editor (rename in place, Enter to save, Esc to cancel, de-dupe-aware) — previously the lists were delete-only.
- **Time strings leaking as channel blocks**: `isViewCountOrTimeText()` now recognizes YouTube's abbreviated time formats ("2h ago", "3d ago", "5m ago", "1w ago") and combined view-count+timestamp text ("1.5M views 8d ago") — previously only full unit names ("2 hours ago") were caught, letting "2h ago", "3w ago", "8d ago" etc. leak into channel keys and blocklist.
- **"YouTube and 2 more" overlay text leaking as channel keys**: `extractChannelNamesFromByline()` no longer adds the full "X and N more" overlay text as a channel name — it only extracts the actual channel name (e.g. "YouTube"). Previously "YouTube and 2 more" was added as a card key and could become a channel block entry.
- **`blacklistActiveChannel()` polluting channels list with garbage**: The quick-block-from-menu function no longer pushes ALL card keys into `settings.channels`. Previously, card keys including video IDs, timestamps, view counts, and name fragments from `extractChannelNamesFromByline` splitting were added as channel block entries. Now only the primary channel identity is added.
- **`getCardChannelKeys()` fragment splitting**: `extractChannelNamesFromByline()` no longer splits multi-word channel names on `&` or `and` unless they match the "X and N more" overlay pattern. Channel names like "Sam & Nebula" are no longer decomposed into "Sam" and "Nebula" fragments that leak into card keys.
- **`matchUserChannel()` substring false positives**: Removed the `norm.includes(cNorm)` substring fallback that caused short stored channel entries (e.g. "sam") to match full channel names (e.g. "Samsung"). Channel matching is now exact or via `/channel/` or `/@` entity key extraction only.
- **`loadSettings()` garbage cleanup**: Existing stored channels list is automatically filtered on load — time strings, view counts, and digit+unit patterns are removed and persisted back to storage. (Amended in the bug-sweep above: ≤2-char and bare-digit entries are **kept** — those are legit channel names like "DJ" or "1900".)
- **Metadata row scoping**: `getChannelName()` and `getCardChannelKeys()` now use `:first-child` on `.ytContentMetadataViewModelMetadataRow` selectors to target only the channel name row, not view-count/timestamp rows.
- **Popup tab queries scoped to YouTube**: `chrome.tabs.query({})` changed to `chrome.tabs.query({ url: 'https://www.youtube.com/*' })` in both `save()` and `getActiveYoutubeTab()` — no longer enumerates all tabs, works with host permission alone.

### Added
- **Backup & Restore page** (`backup.html` / `backup.js`): full-page export (save dialog on demand, auto or manual) and import (pick or drag-drop a `.json`; replace-by-default with a merge option; sanitized channels / keywords / whitelist; settings restored). Not affected by popup lifecycle, so it works identically in Chromium and Firefox/Zen.
- **Update-proof rule persistence**: Chromium builds now ship a manifest `key`, pinning the extension ID so `chrome.storage.local` (keywords, channels, whitelist, settings) survives every reload, reinstall, and folder move. Previously an unpacked extension's ID derived from the *load folder path*, so any path change — a re-extracted zip, a different subfolder — silently created a second, empty storage silo and made rules look "wiped". Firefox was already stable via `gecko.id`; Chromium is now too.
- **Dynamic AI status detail**: The AI Guardian card now shows a live status line (`aiStatusDetail`) reflecting the actual engine — connected provider + model count, ONNX offer, heuristic fallback, or unreachable worker.
- **Rule visibility after synthesis**: `renderRuleChips()` lists every created keyword/regex in the success box (scrollable), and `gotoKeywordsTab()` jumps straight to the Keywords tab.
- **Inline rule editing**: `startInlineEdit()` / `replaceRule()` enable in-place rename of any channel, keyword, or whitelist entry (Enter saves, Esc cancels, duplicates merge).
- **Zen Browser / Firefox support**: Added `manifest-firefox.json` with `browser_specific_settings.gecko` for Firefox-based browser support. All `chrome.*` APIs used are WebExtension-compatible; `chrome.action.setBadgeText` has a Firefox-compatible fallback (no `tabId`) in `background.js`.
- **Full cross-browser support**: Consolidated to one universal `manifest.json` that loads in Chromium (Chrome/Edge/Brave/Opera/Vivaldi) and Firefox-family (Firefox/Zen/LibreWolf) browsers alike — the `background` key declares both `scripts` (Firefox event page) and `service_worker` (Chromium), and host access moved to `host_permissions`. `package-extension.ps1` now derives and packages every target: `dist/chromium/` + `dist/chromium.zip`, `dist/firefox/` + `dist/firefox.xpi` + `dist/firefox.zip`, refreshed `zen-unpacked/` + `blacklist-firefox.jar`/`.xpi`/`.zip`, and the release zip.
- **Zen-INSTALL.md**: Installation instructions for Zen Browser.
- **Debug helpers**: `window.__blkDebug = true` toggles console logging of every card evaluation; `window.__blkInspect()` dumps all visible cards' extraction results and stored settings.

### Changed
- `manifest.json` is now the single universal manifest (previous Chromium & Firefox manifests consolidated; Firefox background switched from unsupported `service_worker` to the `scripts` event page).
- `ZEN-INSTALL.md` with instructions for temporary and persistent Zen Browser installs

### Docs
- **README.md is now a proper storefront**: the flagship “Start on New to you” home, 3-mode Auto-Dubbed triage, Diversity Meter, Backup & Restore page, inline rule editing, and Chip Rescue are featured in the table and sections; the release-packaging instructions are de-duplicated; the permissions paragraph discloses the `downloads` permission (Backup & Restore export).
- **PRIVACY.md**: added the `downloads` permission disclosure (+ store-listing description), renamed the AI feature list to the current feature names (adds AI Title De-Baiter), clarified that “New to you” / auto-dub / de-bait are local-only page interactions, and refreshed the date.
- **CONTRIBUTING.md**: documented the automated Node regression suites and added them to the required pre-PR checklist.
- **Regression harnesses are now versioned** at `tests/watch-block-harness.js` (54 cases) and `tests/backup-harness.js` (15 cases) with relative requires, so contributors can run them from any checkout.

---

## [1.10.1] - 2026-09-17

### Fixed
- **🔮 Mind Reader Taste Profiler & AI Guardian Rule Synthesis**:
  - Added `think: false` to Ollama chat queries and bumped timeout to 35s. Reasoning/thinking models (e.g., Gemma 4, Qwen 2.5/3) previously generated ~1,100 thinking tokens across 40–50 seconds, exceeding the 12s abort timeout and silently dropping into fallback mode. With `think: false`, generation takes ~2–6s.
  - Added resilient `cleanJsonParse` handling `<thought>` tags, markdown code blocks, and trailing annotations to prevent silent JSON parse failures.
  - Added OpenAI / LM Studio fallback API endpoint support (`/v1/chat/completions`) when LM Studio is running.
  - Expanded `heuristicSynthesize` domain coverage to include a comprehensive ball sports and athletics taxonomy (basketball, soccer, football, baseball, tennis, golf, volleyball, cricket, rugby, leagues, tournaments, and scoring terms).
  - Added natural language directive extraction (`block all X`, `ban Y`, `filter out Z`) so arbitrary requested topics are parsed directly into target keywords.
  - Normalized AI and heuristic regex rules with mandatory `/pattern/flags` wrappers and syntax compilation checks before storage.
- **🤖 Autonomous Feed Guardian (`evaluateBatchWithAi`)**:
  - Batch evaluation queries now pass `think: false` and use `cleanJsonParse`.
  - Fallback evaluation now respects the user's negative persona restrictions (including ball sports) instead of ignoring persona.
  - When candidate card batches fail or time out, `content.js` clears candidate `aiEvaluated` markers to prevent false-negative retention.

### Added
- **📊 Feed Diversity Meter** (uses the Mirror's subscription snapshot — everything stays local):
  - Measures your *visible* feed on any YouTube tab: what share comes from channels you actually subscribe to vs. the algorithm's New-to-You pool.
  - Renders a 🔵 subscribed / 🟣 New-to-You ratio bar plus how many cards your own rules already hid on that page.
  - Auto-measures once right after a successful subscription scan; re-measure anytime from the meter's own button.
- **Shorts: Subscribed Only** (`shortsSubOnly`):
  - Hybrid of the all-or-nothing "Hide YouTube Shorts" toggle: keeps Shorts from channels in your subscription snapshot, hides everyone else's, per-reel.
  - Reel shelves with zero surviving Shorts collapse entirely. Global `blockShorts` still wins when both are on.
  - Identity matching reuses the extension's own normalized name / handle / channel-URL semantics — video URLs never match.
- **Subscription scan now persists the identity snapshot** (`subsSnapshot`): the Mirror stores every scanned channel (`name`, `handle`, `url`) so the Diversity Meter and Subscribed-Only Shorts keep working after the popup closes, without a re-scan.

### Changed
- Mirror scan auto-triggers a feed diversity measurement once synthesis succeeds.
- Bumped version to `1.10.0` in `manifest.json`, popup UI, backup export payloads (includes the new `shortsSubOnly` setting on import), and script headers.

### Security
- **Fixed XSS: the Mind Reader's rationale output is now HTML-escaped before injection into the popup result box** (`popup.js`). LLM prose is untrusted input; previously it was interpolated into `innerHTML` verbatim, which put extension-storage access and message-passing reachable from a crafted LLM response or a crafted rule that seeded it.
- **`escapeHtml` now also escapes single quotes** (defense in depth against future single-quoted attribute sinks) in both `popup.js` and `content.js`.
- **Backup import hardening** (`sanitizeImportedKeyword`): imported keywords are length-capped at 200 chars; regex-form keywords (`/…/flags`) keep their case and flags — previously backup restore lowercased them, silently corrupting regex rules — must actually compile, and must not carry catastrophic-backtracking signatures or they are dropped.
- **Runtime ReDoS guard** (`isReDoSSuspect` + size caps): keyword regex patterns longer than 200 chars, or containing nested-quantifier / quantified-alternation signatures (`(a+)+`, `(a|aa)+$`, …), are refused before they ever run — an imported or edited hostile pattern can no longer freeze every YouTube tab during the title scan.
- **Permission minimization:** dropped the `tabs` permission entirely. YouTube access now comes from a scoped `https://www.youtube.com/*` host permission, so the extension's read reach is exactly one site — it can never inspect browsing history outside YouTube. (All `chrome.tabs` uses were audited: every `tab.url` read is YouTube-only and null-guarded; message passing and tab creation need no `tabs` permission under MV3.)
- **New [`PRIVACY.md`](PRIVACY.md):** a complete data-flow disclosure (what is read, stored, and sent; Local-AI loopback only; retention/deletion; store-listing permission narrative) grounded in a line-level audit of the shipped code. README privacy section updated to match the new permission set.

---

### Added
- **🔭 Subscription Mirror Synthesizer** (companion to the Mind Reader):
  - Scans your actual YouTube subscriptions (`youtube.com/feed/channels`) entirely locally — no API keys, no data leaves the browser.
  - Automatically opens the subscriptions page in a background tab (or reuses the one you already have open — your tab is never navigated or closed).
  - Your local LLM (Ollama / LM Studio) infers your dominant taste profile from subscribed channel names and synthesizes 6-12 precision blacklist keywords + regex rules targeting the parasitic clickbait clusters that ride those topics' coattails (fake "top 10" lists beside science subs, crypto hype beside hardware subs, …).
  - **Self-subscription guardrail**: any keyword colliding with your own subscribed channel names or handles is filtered out before injection — the feature can never blacklist the creators you chose.
  - **Subscription ↔ Rule Conflict Audit**: every new rule is checked against your scanned channel names with the extension's *own* word-boundary matcher semantics; genuine collisions surface as amber warnings with a one-click ✕ remove per keyword.
  - **🛡️ Opt-in "Protect my subscriptions" whitelist action**: one click whitelists every scanned subscription. Deliberately opt-in, never automatic — the whitelist wins over the blacklist in the matcher, and channels you explicitly blacklisted are always skipped (your blacklist stays authoritative).
  - **Autonomous Guardian persona seeding**: the inferred taste profile is stored and fed into `AI_EVALUATE_BATCH`, so the Autonomous Slop Interceptor judges videos against your *actual subscribed topics*, not just the generic default persona.
  - Instant offline heuristic fallback: topic-classifies channel names and injects the matching slop-cluster rules.
  - 1-click injection with the same dedupe/save/confetti pipeline as the Mind Reader; the shared injection helper now powers both synthesizers.

### Changed
- Bumped version to `1.9.0` in `manifest.json`, popup UI, backup export payloads, and content script header.

---

## [1.8.0] - 2026-09-07

### Added
- **✨ AI Title De-Baiter (Real-Time Title Neutralizer)**:
  - Detects sensationalist titles on the feed and rewrites them into factual, dry descriptions.
  - Batched, zero-temperature local LLM calls (Ollama / LM Studio) with an instant offline heuristic fallback.
  - Subtle clickable `✨` badge prepended to every de-baited title — click it to smoothly toggle between the calm AI title and the raw clickbait original (`dataset.originalTitle` preserves the original).
  - Dedicated toggle in **Settings & Tools** and the **AI Guardian** tab.
- **🩻 AI Feed Forensic Diagnostic Roast**:
  - Glowing "Run Feed Diagnostic Roast" action in the AI Guardian tab that pulls up to 15 visible titles/channels from the active YouTube tab.
  - Local LLM psychological audit returning a **Toxicity Score (0–100%)**, **Manipulation Tactics** (e.g. Manufactured Outrage, Parasocial Dopamine Trap, Algorithmic Desperation), and a **Savage Psychological Diagnosis**.
  - **1-Click "⚡ Purge All Identified Manipulators"** button that immediately blacklists every offending channel.
- **⏱️ 1-Click TL;DW (Too Long; Didn't Watch) Video Inspector**:
  - Sleek dark glassmorphism modal with an animated neural-scan effect, opened from a `⏱️ TL;DW` pill on video thumbnail hover (alongside Quick-Block).
  - Captions fetched via YouTube's standard client-side `/timedtext` endpoint (zero API keys), parsed from JSON3 or XML, with graceful metadata fallback when captions are disabled.
  - Summarizes the video into a **Clickbait Truth Verdict** (TRUE CLICKBAIT / PARTIAL TRUTH / NOT CLICKBAIT), **3 Core Takeaways**, and **⏱️ Time Saved**.
  - Quick **"Blacklist Channel"** action directly inside the TL;DW modal.
- **⏱️ TL;DW Inspect Button toggle** in Settings & Tools.

### Changed
- Bumped version to `1.8.0` in `manifest.json`, popup UI, and backup export payloads.

---

## [1.7.0] - 2026-09-07

### Added
- **Autonomous AI Guardian & Mind Reader Mode**:
  - Local AI daemon auto-detection for Ollama (`http://localhost:11434`) and LM Studio (`http://localhost:1234`).
  - Model discovery dropdown supporting local LLMs (Gemma, Qwen, Phi, LLaMA).
  - **Mind Reader Taste Synthesizer**: Converts natural-language user taste descriptions or pre-configured personas (Zen Scholar, Tech & Hardware, Anti-Dopamine, Art & Cinema) into precision regex and keyword rules.
  - **Predictive Autonomous Slop Interception**: Real-time batch evaluation of incoming feed videos with customizable sensitivity (Conservative, Balanced, Ruthless Purge).
  - Autonomous interception audit log in popup manager.
  - Distinctive in-page AI purge toast notifications (`🤖 AI Intercepted: ...`) with 1-click Undo.
  - Built-in heuristic neural fallback ensuring full offline functionality when local LLM daemons are closed.

---

## [1.6.0] - 2026-09-07

### Added
- **Gamified Level System**: Rank milestones with emojis (from 🌱 Novice Scroller to 🌌 Cosmic Mind) and interactive celebration badges.
- **"Life Saved" Impact Metric**: Real-time counter of hours/minutes saved from clickbait (calculated at 10 minutes per blocked video avoided).
- **Algorithm Purity Meter**: Visual percentage rating and level progress bar.
- **1-Click Starter Packs**: Curated rule presets in Keywords tab (Anti-Brainrot, Crypto/Hustle, AI Slop, Drama/Gossip).
- **Floating "Undo" Toast Notification**: Sleek YouTube-styled dark bottom-left toast with 5-second recovery window and instant restoration.
- **Keyboard Shortcut (`B`) Quick-Block**: Hover over any video card and press `B` to block the channel without reaching for the mouse.
- **Algorithm Defense Wisdom**: Rotating deck of inspiring algorithm defense quotes in the popup header.
- **Milestone Confetti Particle Burst**: Celebratory particle animation for rank milestones.

---

## [1.5.2] - 2026-09-07

### Added
- Direct Ko-fi sponsor integration in popup UI and GitHub metadata.
- Automated release packaging script (`package-extension.ps1`).
- GitHub community templates (`FUNDING.yml`, bug reports, feature requests, PR template).
- Full MIT open-source license under PyrateGFX Productions.

### Improved
- Synchronized version numbering across manifest, content script, and popup UI.
- Hardened click listeners and tabs API routing for external links.

---

## [1.5.1] - 2026-09-06

### Fixed
- Fixed critical watch-page isolation to ensure `ytd-watch-flexy` containers and video playback are never disrupted.
- Fixed virtual scroller signature recycling so dynamically re-rendered elements receive updated blacklist state immediately.

### Improved
- Enhanced thumbnail quick-block positioning and hover transition smoothness.

---

## [1.5.0] - 2026-09-05

### Added
- **1-Click Quick-Block Button**: Hover over any video thumbnail to block the channel instantly with a single click.
- **Feed Decluttering Toggles**:
  - Optional toggle to eliminate YouTube Shorts shelves and lockups.
  - Optional toggle to block YouTube Community posts and polls from home feed.
- **Full JSON Backup Import & Export**: Effortlessly backup, restore, or migrate blacklist rules, keywords, whitelists, and preferences between browsers.
- **Badging & All-Time Stats**: Real-time extension icon badge showing blocked items on the current page, and lifetime counter in the popup.
- **Regex Keyword Support**: Advanced keyword rules supporting `/regex/flags` format alongside word-boundary title keywords.

### Changed
- Complete modern popup UI redesign with 4 dedicated tabs: Channels, Keywords, Whitelist, and Settings & Tools.

---

## [1.2.0] - 2026-08-20

### Added
- Real-time channel search filter in popup manager.
- Whitelist protection system allowing favored channels to bypass broad title keyword rules.
- Gentle feed replenishment engine that quietly scrolls to pull fresh videos when local blocks deplete visible rows.

---

## [1.1.4] - 2026-08-10

### Fixed
- Injected sheet menu row enabled state fix: constructed full native `rendererContext` feedbackEndpoint structure to prevent YouTube rendering the custom row as disabled/greyed out.
- Handled network promise rejections in fetch hook to prevent Chrome from flagging fatal unhandled extension errors.

---

## [1.1.0] - 2026-07-28

### Added
- Data-layer innertube hook intercepting `/youtubei/v1/browse` and `/search` to inject menu items natively alongside legacy DOM fallback.
- Support for modern `yt-lockup-view-model` cards.

---

## [1.0.0] - 2026-07-15

### Added
- Initial release of Always New To You.
- Auto-pinning for YouTube's "New to You" chip.
- Client-side DOM-level channel hiding to prevent server recommendation cooldown lockout.
- Basic popup UI for managing hidden channels.
