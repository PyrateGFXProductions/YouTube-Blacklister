# Changelog

All notable changes to the **Always New To You - YouTube Smart Blacklister** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.10.0] - 2026-09-10

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
