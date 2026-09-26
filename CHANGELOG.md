# Changelog

All notable changes to the **Always New To You - YouTube Smart Blacklister** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Start Home on "New to you"** (`settings.newToYouAuto`, Settings > toggle, opt-in/off by default): YouTube's Home only promotes channels it's "safe to advertise" — everything else stays buried, and after hiding the promoted tier you're left with tier-2 junk, not the long tail. "New to you" is the one surface YouTube built specifically to surface channels you haven't encountered before. When enabled, the extension automatically clicks that chip each time the Home chip bar renders (no reloads, no repeat clicks; absent chip = silent no-op — YouTube makes it unavailable per account/region). Pure decision (`shouldAutoEnterNewToYou`) is covered by the Node harness (now 40 cases).
- **Chip Rescue** (`settings.chipRescue`, Settings > toggle, opt-in/off by default): YouTube's home topic-chip bar (`ytd-feed-filter-chip-bar-renderer` / `#chips-wrapper` — Comedy, Tourism, Gaming, …) is a known YouTube server-side/A-B rendering bug where the bar vanishes and only endless page refreshes bring it back. This extension never touches the chip bar, but when enabled it triages it: chips present-but-hidden are shown again immediately (cheap, no reload), while a completely missing bar gets a small floating **"Restore chips"** button — one click reloads the page (the community-proven fix). It never auto-reloads. Triage logic (`chipRescueState`) is pure and covered by the Node harness.

### Fixed
- **Keyword rules could not block Auto-dubbed videos — ever**: The "Auto-dubbed" label is a BADGE on the thumbnail/metadata/sidebar (`div[aria-label="Auto-dubbed"]`, `ytd-thumbnail-overlay-badge-view-model`, `.ytBadgeShapeText`), not part of the title or channel name — so a keyword/regex rule like `auto-dubbed` scanned title+channel text only and could never match the videos the user's rule targeted. `evaluateCard()` now (a) reads auto-dub badge text off every card via `cardAutoDubBadgeText()`, (b) feeds it into keyword/regex matching through `keywordRulesHidden({ extraText })` so plain keyword rules match the badge exactly like titles, and (c) ships a 3-mode **Auto-Dubbed Videos** control (`settings.autoDubMode`): **Off** (keyword rules only) · **Smart** (hide auto-dubbed recommendations but keep them from subscribed channels) · **Total** (hide everywhere — **even from channels you've watched or subscribed to**, "not even from watched channels"; only the whitelist overrides). Badge detection is case-insensitive on `dub`/`dubbed`/`auto-dub` and cannot false-positive on LIVE/Premieres badges or words like "double". Pure logic (`isAutoDubBadgeText`, `autoDubHideDecision`, extended `keywordRulesHidden`) is covered by the Node harness (now 40 cases).
- **Keyword/regex rules kidnapped the watch page**: Opening `youtube.com/watch?v=…` for a video whose title (or channel name) matched a keyword/regex rule paused the video and navigated away (`history.back()` / YouTube home) — even for channels the user is subscribed to. Opening a watch page is a deliberate act, so keyword rules are now strictly feed-side: `watchPageBlockDecision()` (pure, node-tested) only interrupts playback for an *explicit* video-ID blacklist or an *explicit channel* blacklist. Channels in `subsSnapshot` (genuinely subscribed) or the whitelist are never interrupted — a subscribed channel that is also explicitly blacklisted still plays on watch pages (it remains hidden from feeds). `keywordRulesHidden()` (pure, node-tested) skips keyword/regex matching entirely for subscribed or whitelisted channels on feeds, so subscription feeds stop getting keyword-censored; explicit channel/video blacklists still hide there. Watch-page guard + feed engine both wire through the pure functions and are covered by the Node harness (now 40 cases).
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
- **`loadSettings()` garbage cleanup**: Existing stored channels list is now automatically filtered on load — time strings, view counts, fragments (≤2 chars), and digit+unit patterns are removed and persisted back to storage.
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
