<p align="center">
  <img src="icon128.png" width="128" height="128" alt="Always New To You - YouTube Smart Blacklister Logo">
</p>

<h1 align="center">Always New To You</h1>

<p align="center">
  <strong>The intelligent, zero-bloat, local-first curation engine for YouTube.</strong><br>
  Instant DOM-level creator blacklisting · Word-boundary & regex title filtering · "New to You" feed pinning · 100% offline local AI guardian · Zero telemetry
</p>

---

<p align="center">
  <a href="https://github.com/PyrateGFXProductions/YouTube-Blacklister/releases"><img src="https://img.shields.io/github/v/release/PyrateGFXProductions/YouTube-Blacklister?style=for-the-badge&color=blue" alt="Latest Release"></a>
  <a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"><img src="https://img.shields.io/badge/Manifest-V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Manifest V3"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="#privacy--zero-telemetry-architecture"><img src="https://img.shields.io/badge/Privacy-100%25%20Local--First-success?style=for-the-badge&logo=shield" alt="Local-First Privacy"></a>
  <a href="#browser-compatibility-matrix"><img src="https://img.shields.io/badge/Platform-Chromium%20%7C%20Firefox%20%7C%20Zen-orange?style=for-the-badge" alt="Cross-Browser"></a>
  <a href="https://ko-fi.com/pyrategfxproductions"><img src="https://img.shields.io/badge/Ko--fi-Support%20Development-F16061?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support on Ko-fi"></a>
</p>

---

## Table of Contents

- [The Pitch](#the-pitch)
- [Architecture & Execution Pipeline](#architecture--execution-pipeline)
- [Core Engineering Features](#core-engineering-features)
  - [1. Real-Time DOM Rejection Engine](#1-real-time-dom-rejection-engine)
  - [2. Multi-Tier Keyword & Regex Evaluator](#2-multi-tier-keyword--regex-evaluator)
  - [3. Autonomous "New to You" Algorithmic Pinning](#3-autonomous-new-to-you-algorithmic-pinning)
  - [4. 100% Offline Local AI Guardian](#4-100-offline-local-ai-guardian)
  - [5. Structural Feed Sanitizer & Declutter Suite](#5-structural-feed-sanitizer--declutter-suite)
  - [6. Feed Diversity Meter & Subscription Scanner](#6-feed-diversity-meter--subscription-scanner)
  - [7. Interactive Feed Hunt Mode](#7-interactive-feed-hunt-mode)
  - [8. Atomic Backup, Restore & Migration](#8-atomic-backup-restore--migration)
  - [9. Instant Master Pause Switch](#9-instant-master-pause-switch)
  - [10. Feed Fallback — a Home page YouTube cannot blank](#10-feed-fallback--a-home-page-youtube-cannot-blank)
  - [11. Rule Audit & Consolidation](#11-rule-audit--consolidation)
- [What This Cannot Do](#what-this-cannot-do)
- [Browser Compatibility Matrix](#browser-compatibility-matrix)
- [Installation Guide](#installation-guide)
  - [Chromium Family (Chrome, Edge, Brave, Opera, Vivaldi)](#chromium-family-chrome-edge-brave-opera-vivaldi)
  - [Firefox & Zen Browser Family](#firefox--zen-browser-family)
- [Privacy & Zero-Telemetry Architecture](#privacy--zero-telemetry-architecture)
- [Under the Hood: Technical Architecture](#under-the-hood-technical-architecture)
- [Development, Testing & Release Pipeline](#development-testing--release-pipeline)
- [License & Credits](#license--credits)

---

## The Pitch

YouTube’s recommendation algorithm is engineered for one single metric: **perpetual session duration**. It does not care if a video provokes outrage, exploits sensationalist clickbait, recycles stale content you have seen twenty times, or floods your feed with automated AI-dubbed slop. The native "Not interested" and "Don't recommend channel" buttons are opaque, delayed, routinely ignored by the backend, and completely uninspectable.

YouTube also actively punishes curation. Block enough channels and the recommender quietly narrows: the same handful of cards come back, then fewer, until Home serves you nothing you have not already seen. The native buttons cannot fix this because they are advisory — YouTube's own systems decide whether to honor them, and they usually do not.

**Always New To You takes that decision out of YouTube's hands.** It filters your feed in your browser, before YouTube's cards ever reach you, so a block actually holds. It also pins YouTube's "New to You" surface — the one place built to show channels you have genuinely never encountered — which otherwise drifts back to the default feed on its own.

And it does all of this on your machine. Filtering a feed server-side means telling a third party exactly what you do not want to see: a profile of your politics, your finances, your faith. No service should hold that, and this one is built so it never can.

---

## Architecture & Execution Pipeline

The extension operates across three isolated environments coordinated by Chrome/WebExtension message channels and reactive `chrome.storage.local` listeners:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       YOUTUBE FRONTEND DOM                                      │
│                                                                                                 │
│  [ ytd-rich-grid-renderer ]  ────────►  [ MutationObserver Engine ]                             │
│                                                       │                                         │
│                                             Extract Card Metadata                               │
│                                        (Channel, Title, Video ID, Dub)                          │
│                                                       │                                         │
│                                        ┌──────────────┴──────────────┐                          │
│                                        ▼                             ▼                          │
│                              [ Whitelist Check ]             [ Auto-Dub Guard ]                 │
│                                        │                             │                          │
│                           Matches? ────┴──── No ──────────┐    AI-Voiced Dub?                   │
│                              │                            │          │                          │
│                              ▼                            ▼          ▼                          │
│                         [ PASS ]                [ Blacklist Matcher ] ──► [ Intercept DOM ]     │
│                     (Render Card)                         │               (Zero-Flicker Hidden) │
│                                            ┌──────────────┼──────────────┐                      │
│                                            ▼              ▼              ▼                      │
│                                        [Channel]      [Keywords]     [Local AI]                 │
│                                       (ID/Handle)   (Regex/Boundary) (Guardian)                 │
└────────────────────────────────────────────┬─────────────────────────────┬──────────────────────┘
                                             │                             │
                                  Message Dispatch (Async)      Local Inference (HTTP)
                                             │                             │
┌────────────────────────────────────────────▼──────────────┐ ┌────────────▼──────────────────────┐
│                  BACKGROUND SERVICE WORKER                │ │            LOCAL AI RUNTIME        │
│                                                           │ │         (Ollama / LM Studio)       │
│  - Storage Atomic Coordinator & Hit Counters              │ │                                    │
│  - Native Server Recommendation Feedback Dispatcher       │ │  - DeepSeek-R1 / Qwen / Llama 3    │
│  - Subscribed Identity Mirror Parser (Channel Snapshot)   │ │  - <think> Token Stripping         │
│  - Cross-Tab State & Storage Broadcasts                   │ │  - Structured JSON Output Filter   │
└───────────────────────────────────────────────────────────┘ └────────────────────────────────────┘
```

---

## Core Engineering Features

### 1. Real-Time DOM Rejection Engine
- **Three Zero-Friction Blocking Paths**: Click the injected thumbnail icon, trigger the native YouTube three-dot overflow menu entry (*"Blacklist Channel (Local)"*), or simply hover any card and tap <kbd>B</kbd>.
- **Multi-Identity Resolvers**: Resolves channel names, canonical `@handles`, channel IDs (`UC...`), and URLs. When YouTube renders a feed element with obfuscated metadata, it cleanly falls back to an exact video-level rejection rule.
- **Instant Non-Destructive Concealment**: Cards matching your criteria are wiped immediately from layout flow before images or video previews load, preventing bandwidth waste.
- **Five-Second Undo Pipeline**: Every manual action surfaces a non-intrusive toast notification with an instant Undo hook, preventing accidental rejections without navigating to the settings menu.

### 2. Multi-Tier Keyword & Regex Evaluator
- **Word-Boundary Precision**: Plain-text terms are strictly bounded (`\b`). Adding `cat` intercepts "cute cat video" while safely preserving "category", "education", or "scatter".
- **Relevance-Ranked Keyword Extraction**: The 🔑 key icon proposes rules from the words that *describe* the video — never the first, middle or last three words of the title. Candidates are scored by where they came from (the creator's own tags outrank the description, which outranks the transcript) and by how specific they are to the video you are looking at compared with the rest of the cards on your screen. A **specific phrase always outranks the single words inside it**, so `"America's New Home Market"` yields `new home market` — not `america`, `home`, `market`, each of which would block a huge slice of unrelated YouTube on its own; a coarse rule that is merely part of a higher-ranked phrase is dropped rather than stored alongside it. Possessive modifiers (`america's`, `nation's`) are never treated as the subject. Every proposed phrase is checked to appear verbatim in the source text, filler words (`day`, `first`, `last`) can never become a rule on their own, and anything that already matches several other visible cards is refused as too generic for your feed. The toast tells you what was skipped and why; Undo is one click.
- **Raw Regular Expressions**: Full JavaScript `/pattern/flags` support. Block repetitive serial content like `/(?:ep|episode)\s*\d+/i` or challenge spam like `/(?:in|within)\s*(?:24|48)\s*hours/i`.
- **Pre-Curated Starter Packs**: Built-in, one-click community rulesets for instant protection against:
  - 🧠 **Anti-Brainrot** (Skibidi, Grimace, content-farm syndicates)
  - 💰 **Crypto & Hustle Slop** (Moonshots, passive income, dropshipping gurus)
  - 🤖 **Synthetic AI Spam** (AI-generated Reddit stories, automated narration reels)
  - 🍿 **Drama & Ragebait** (Exposed, cancelled, internet feud commentary)
- **Whitelist Supreme Priority**: Whitelisted channels bypass every keyword and regex filter. Block an annoying topic globally without losing the few high-signal creators who cover it with substance.

### 3. Autonomous "New to You" Algorithmic Pinning
YouTube's default Home feed is trapped in an echo chamber of previously viewed channels and sponsored partners. YouTube created the **"New to you"** topic chip specifically to break this cycle, but buries it behind horizontal scrollbars.
- **Autonomous Synthetic Click Trigger**: When enabled, the extension monitors YouTube’s topic bar (`yt-chip-cloud-renderer`) and clicks the "New to you" chip the moment it mounts.
- **Zero-Reload State Transitions**: Operates entirely within YouTube’s single-page-app router. No page refreshes, no flickering, and an immediate silent fallback if the chip is unavailable in your region.

### 4. 100% Offline Local AI Guardian
Connect your browser directly to your own self-hosted inference engine (**Ollama** or **LM Studio**) running on `localhost`. No API keys, no subscription fees, and not a single token ever leaves your machine.

| Local AI Subsystem | Core Technical Capability |
| :--- | :--- |
| 🔮 **Mind Reader Profiler** | Synthesizes your natural-language feed preferences into structured, regex-validated keyword rules. |
| 🤖 **Autonomous Guardian** | Batches visible feed cards to evaluate subtle clickbait patterns and off-topic recommendations against your taste profile. |
| ✨ **AI Title De-Baiter** | Strips sensationalism, extreme punctuation, and all-caps hype in real time. Hover the ✨ badge to inspect the original title. |
| 🩻 **Forensic Roast Audit** | Analyzes the visible feed, scores algorithmic manipulation, and exposes recurring content farms with one-click bulk blacklisting. |
| ⏱️ **TL;DW Video Inspector** | Fetches client-side closed-captions from YouTube's timed-text stream, generates key takeaways, and calculates time saved. |

> [!NOTE]
> **Reasoning Model Hardened**: The AI parser natively detects and strips `<think>` and `<thought>` reasoning blocks emitted by models such as **DeepSeek-R1** and **Qwen-2.5/3.5**, ensuring structured JSON parsing never breaks.

### 5. Structural Feed Sanitizer & Declutter Suite
- **Shorts Shelves Elimination**: Completely purge `ytd-reel-shelf-renderer` containers from Home, Subscriptions, and Search results.
- **Shorts Subscribed-Only Filter**: Keep the Shorts shelf visible, but filter out all algorithmic recommendations, preserving only creators you actually subscribe to.
- **Community Posts Concealment**: Remove poll spam, text cards, and promotional channel announcements from your video stream.
- **AI-Voiced Auto-Dubbed Triage**: Detects YouTube’s automated multi-language audio track dubs. Choose to hide all dubbed videos, keep only dubs from your subscriptions, or allow all.
- **Topic Chip Rescue**: Watches YouTube's topic filter bar and repairs it when it breaks. When YouTube has merely *hidden* its own bar, the extension un-hides it — the real one, with chips that actually filter the feed. When YouTube serves no chip bar at all, nothing a client can click exists to work with, so instead of faking one the extension quietly re-requests Home the same way your own refreshing would, then keeps watching for the bar to arrive. If it never does, there is a manual refresh offered — and nothing further, because no extension can conjure a working chip bar YouTube did not send.

### 6. Feed Diversity Meter & Subscription Scanner
- **Privacy-Preserving Mirror**: Securely caches your subscribed channel identities (`youtube.com/feed/channels`) entirely in `chrome.storage.local`.
- **Live Viewport Analytics**: A real-time header bar breaks down visible feed cards into:
  - 🔵 **Subscribed Creators** (Channels you actively follow)
  - 🟣 **New-To-You Discoveries** (Fresh channels surfaced by the algorithm)
  - ⚪ **Algorithmic Recommendations** (Standard platform pool)
  - 🔴 **Blocked Cards Intercepted** (Number of cards actively filtered on this view)

### 7. Interactive Feed Hunt Mode
Turn mindless doomscrolling into an active attention exercise. When enabled, a roving ⛔ crosshair target appears over thumbnails.
- Direct hits score **+100 points**; misses deduct **−10 points**.
- Persistent high-score tracking stored locally.
- Fully isolated event handling: gameplay never interferes with standard video navigation or blocking controls.

### 8. Atomic Backup, Restore & Migration
- **Standalone Management View**: Opens a dedicated full-tab portal (`backup.html`) rather than an ephemeral popup that can close mid-transfer.
- **Lossless JSON Schema**: Exports and restores channels, handles, keyword exceptions, temporal rules, community packs, feed health logs, and granular preferences.
- **Replace vs. Merge Strategies**: Safely merge external community files into your existing list without overwriting your personal whitelist or custom rules.

### 9. Instant Master Pause Switch
Some days you want YouTube untouched. **Settings → ⏻ Extension Enabled** is a single master switch that suspends the entire extension without deleting anything.

- **Full teardown, not a hidden filter**: pausing restores every card the rules hid, repairs collapsed grid slots, removes the injected stylesheet (which is what greys out Shorts shelves and community posts), puts AI-rewritten titles back, and clears the per-tab badge. The feed returns to exactly what YouTube served.
- **Fully inert**: no hover quick-block button, no 3-dot menu row, no "B" shortcut, no watch-page redirect, and no AI/debait work while paused — a paused extension does not evaluate a single card.
- **Impossible to miss**: a paused banner appears on every tab in the popup with a one-click "Turn back on" button.
- **Lossless and instant**: every rule, whitelist entry and preference is preserved and re-applied the moment you switch it back on. The switch itself survives backup/restore.

### 10. Feed Fallback — a Home page YouTube cannot blank
YouTube has a confirmed failure class where Home serves an **empty** recommendation grid (sign-in state, history settings and re-login change nothing; the empty response is an HTTP 200 from the recommender itself). No client-side retry, reload or "spoof" can force it to recommend — so the extension stops waiting on the recommender and supplies the cards itself.

- **Local-first cache**: while your feed is healthy, the extension quietly records recent uploads from channels **you** subscribe to (video id, title, channel) into `chrome.storage.local`. That cache is what renders the fallback, so it works even when the recommender — and the subscriptions page — are refusing.
- **Best-effort live top-up**: when the cache is thin or stale, it refreshes from each subscribed channel's own public `/videos` page — a plain content route, never a recommender surface. A hard wall-clock budget means a hanging fetch can never wedge the build, and partial progress is kept.
- **Pure addition, never a takeover**: the panel is extension UI rendered *into* the page. It appears only when YouTube served **zero** cards, disappears the instant real cards arrive or you navigate away, and never hides or rewrites anything YouTube rendered.
- **Honest about freshness**: a cache older than 14 days is labelled as such, so "cached" can never masquerade as "live".
- **One switch, on by default**: **Settings → 🛟 Feed Fallback (empty Home)**. It carries no blacklist data on any request and is exported/imported with your backup.

### 11. Rule Audit & Consolidation

Over time a keyword list grows stale: you add `top 10`, then `top 10 list`, then a rule that never once fired. The list gets long and hard to reason about, and nothing tells you which rules are doing nothing.

**Keywords → Analyze** reads your whole rule list and sorts it into groups.

- **Redundant rules** — one rule's text sits entirely inside a longer one you already have. Because a rule matches any title *containing* its text, the longer rule already catches everything the shorter one does. Removing the shorter one hides nothing new. Each one is listed with the rule that covers it, so you can see the evidence rather than take it on faith.
- **Never matched** — zero recorded hits and not covered by anything else. This is the same idea as the existing *Remove 0-Hit Rules* button, reported alongside the rest so one pass sees everything.
- **Broken regex** — a rule like `/[unclosed(/i` that cannot compile. The matcher can never run it, so it has never hidden anything and never will.
- **Over-broad — flagged, never removed** — single common words like `the`, `review` or `worst` that match a large share of titles. These are the usual reason a feed feels over-blocked, but whether you want one is a taste call only you can make. The audit shows them with their hit counts and **never offers to delete them**.

Tick the groups you want, click **Apply Selected**, confirm. Nothing is removed without your explicit approval.

**The guarantee behind it.** Consolidation never changes which titles get hidden. Every removal is proven before it is offered, by replaying both rules through the extension's own matcher — not guessed from what a rule "probably" covers. Regex rules are never consolidated at all, because whether one regex covers another cannot be decided by comparing text.

The audit runs entirely in your browser (`keyword-audit.js`). No AI, no network, no model.

> [!TIP]
> **Export a backup first** (Settings → Backup & Restore). Consolidation removes rules, and while the redundant ones are provably safe, a backup makes any mistake one click from reversible.

---

## What This Cannot Do

Worth stating plainly, so nothing here reads as a promise it cannot keep.

- **It will not make YouTube show you new things forever.** YouTube's recommender narrows the longer you curate. The extension removes what you have rejected; it cannot force YouTube to serve what you have not seen. Narrowing still happens — it is just no longer silent.

- **It cannot undo a narrowed feed.** Once YouTube has collapsed your recommendations, no client-side filter widens them again. What actually helps, in practice, is engaging with a channel you have never watched before — that can reset things slightly, at least for a while.

- **It cannot fix a feed YouTube served empty.** If YouTube renders no cards at all, there is nothing to filter. The Feed Fallback gives you a usable page instead of a blank one, but it is a substitute for the feed, not a repair of it.

- **Category chips depend on YouTube.** When YouTube's own servers omit the chip bar, a client cannot reconstruct a working one — a topic chip only filters the feed because YouTube's real chip exists to click. The extension re-requests the feed and will keep watching for the bar to arrive; if YouTube never sends it, no extension can make it appear.

- **It cannot block a channel you subscribe to, by keyword.** A keyword rule deliberately never hides a video from a channel you follow. This is by design, not a bug — see §2. To block such a channel, block the channel itself rather than the keyword.

- **Your blacklist protects you, not everyone.** It hides cards in *your* browser. YouTube still recommends those channels to other people, and your subscription data is never affected. Nothing here is a boycott or a takedown — it is a local filter.

- **It is a client-side filter, so it is a moving target.** YouTube can change its markup at any time and break the interception until the extension is updated. That is the cost of not sending your data to anyone.

---

## Browser Compatibility Matrix

Always New To You is built natively against WebExtensions standards and compiled into targeted browser distributions:

| Target Browser | Engine | Distribution Target | Storage Backend | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Google Chrome** | Chromium / Blink | `dist/chromium/` | `chrome.storage.local` | 🟢 Supported |
| **Microsoft Edge** | Chromium / Blink | `dist/chromium/` | `chrome.storage.local` | 🟢 Supported |
| **Brave Browser** | Chromium / Blink | `dist/chromium/` | `chrome.storage.local` | 🟢 Supported |
| **Opera / Vivaldi** | Chromium / Blink | `dist/chromium/` | `chrome.storage.local` | 🟢 Supported |
| **Mozilla Firefox** | Gecko / SpiderMonkey | `dist/firefox/` (`.xpi`) | `browser.storage.local` | 🟢 Supported |
| **Zen Browser** | Gecko (Firefox Fork) | signed `blacklist-firefox.xpi` | `browser.storage.local` | 🟢 Supported (signed XPI) |
| **LibreWolf** | Gecko (Firefox Fork) | `dist/firefox/` (`.xpi`) | `browser.storage.local` | 🟢 Supported |

---

## Installation Guide

### Chromium Family (Chrome, Edge, Brave, Opera, Vivaldi)

#### Quick Windows Automated Install
1. Download the [Latest Release ZIP](https://github.com/PyrateGFXProductions/YouTube-Blacklister/releases) and extract it to your desired permanent folder.
2. Open your browser's extensions page (`chrome://extensions`, `edge://extensions`, or `brave://extensions`).
3. Toggle **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the extracted folder.

> [!NOTE]
> The release ZIP contains the extension only. The project docs ship in the
> [repository](https://github.com/PyrateGFXProductions/YouTube-Blacklister) instead — the
> downloader gets the extension, not a copy of the repository's prose.

#### Manual Load
1. Clone this repository or download the source code:
   ```bash
   git clone https://github.com/PyrateGFXProductions/YouTube-Blacklister.git
   ```
2. Navigate to your browser's extensions page (`chrome://extensions`, `edge://extensions`, or `brave://extensions`).
3. Enable **Developer mode** &rarr; Click **Load unpacked** &rarr; Select the `YouTube-Blacklister` repository folder.

---

### Firefox & Zen Browser Family

> [!IMPORTANT]
> **Zen Browser & Firefox Notice:** Firefox and Zen enforce strict add-on signature verification. Loading the repository directly via `about:debugging` creates a temporary instance whose `chrome.storage.local` is **deleted when the browser closes**. Use the permanent installation methods below to ensure your rules persist forever.
>
> **If loading temporarily for testing:** In `about:debugging` &rarr; **Load Temporary Add-on...**, select **`zen-unpacked/manifest.json`** or the root **`blacklist-firefox.zip`** (do not select the repository root `manifest.json`, which contains Chromium's `service_worker` field and will trigger `background.service_worker is currently disabled`).

#### Method 1: Signed XPI (Recommended — works on every Firefox-family build)
Zen is a **release-branded** Gecko build, so it enforces add-on signing *regardless* of the
`xpinstall.signatures.required` preference — Mozilla permits that override only in Firefox
ESR, Developer Edition, Nightly and unbranded builds, and Zen's maintainers confirm the
preference has no effect there. The reliable route is to have the XPI **signed by AMO as an
unlisted ("self-distributed") add-on**: free, automatic, and *not* published in the store.

1. Run `.\package-extension.ps1` to produce a current `blacklist-firefox.xpi`.
2. Upload it at <https://addons.mozilla.org/developers/addon/submit/distribution> and choose
   **On your own site** (unlisted); AMO returns a signed `.xpi`.
   *CLI equivalent:* `npx web-ext sign --source-dir .\zen-unpacked --artifacts-dir .\signed --channel unlisted` with `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` set.
3. In `about:addons` &rarr; gear ⚙️ &rarr; **Install Add-on From File...** &rarr; select the signed `.xpi`.

It installs permanently, keeps its stable `gecko.id` (so your rules persist), and keeps
working after a Zen update. Full detail: `ZEN-INSTALL.md`.

#### Method 2: Local enterprise policy (experimental — not guaranteed)
Writing `C:\Program Files\Zen Browser\distribution\policies.json` makes Zen's policy engine
install the XPI it names. Whether it **also waives the signature check** is not documented by
Mozilla for `force_installed` and is not verified here — treat it as an experiment. Verify in
`about:policies` (your entry should be listed) and `about:addons`. Note that **Zen's updater
replaces the install directory, deleting this file on every update**, so it needs re-applying.

#### Method 3: Standard Firefox packaged install (requires a signed XPI)
1. Run `.\package-extension.ps1` to produce the clean `blacklist-firefox.xpi` artifact.
2. Navigate to `about:addons` &rarr; Click the gear icon ⚙️ &rarr; **Install Add-on From File...**.
3. Select `blacklist-firefox.xpi` (an unsigned XPI will be refused — sign it via Method 1 first).

---

## Privacy & Zero-Telemetry Architecture

This extension is built on strict data minimization principles. We believe privacy should be mathematically enforced by permissions, not promised in marketing copy:

| Data Class | Local Storage Treatment | Network Destination |
| :--- | :--- | :--- |
| **Blacklist & Rules** | Saved strictly in `chrome.storage.local` on your physical drive. | **Never leaves your machine.** |
| **Subscribed Channels Snapshot** | Cached locally for the Diversity Meter & Subscribed Shorts filters. | **Never leaves your machine.** |
| **AI Inference Payloads** | Dispatched via HTTP POST to `localhost:11434` or `localhost:1234`. | **100% Loopback Only.** No cloud APIs. |
| **Closed Captions (TL;DW)** | Parsed client-side from YouTube's standard timed-text payload. | **Direct session only.** No proxy servers. |
| **Usage Analytics & Telemetry** | No trackers, Google Analytics, Sentry, or third-party beacons exist. | **Zero outbound traffic.** |

### Permissions Justification

```json
"permissions": [
  "storage",     // Persists your blacklist, whitelist, and configuration locally
  "downloads",   // Allows backup.js to export your JSON backup file to your disk
  "scripting"    // Enables title extraction and feed health checks on active tabs
]
```

- **No `tabs` permission**: The extension cannot read your browsing history, tab titles, or URLs outside of YouTube.
- **Strict Host Scoping**: Host permissions are limited strictly to `https://www.youtube.com/*` and local AI loopback addresses (`localhost:11434`, `localhost:1234`).

---

## Under the Hood: Technical Architecture

### Polymer DOM Mutation Resilience
YouTube uses a complex Web Component framework (`ytd-app`, `ytd-rich-grid-renderer`). Elements are continuously recycled and reused across virtual scroll events. Always New To You binds a high-performance `MutationObserver` that monitors feed mutations and verifies card identity dynamically:

```text
DOM Mutation ──► Filter Polymer Containers ──► Extract Canonical Identity ──► Cache Rejection Key
```

1. **Selector Agility**: Selectors target multiple fallback elements (`ytd-rich-item-renderer`, `ytd-video-renderer`, `ytd-compact-video-renderer`, `ytd-grid-video-renderer`) to remain functional across Home, Search, Channel, and Watch pages.
2. **Anti-Flicker Injection**: CSS rules hide candidate elements immediately while evaluation occurs, eliminating visible DOM layout jumps or pop-in.
3. **Player Safety Guards**: All filtering logic strictly excludes `#movie_player`, primary video players, and full-screen containers to guarantee playback is never disrupted.

---

## Development, Testing & Release Pipeline

### Project Structure

```text
YouTube-Blacklister/
├── manifest.json              # Universal MV3 configuration template
├── background.js              # Background service worker & message hub
├── content.js                 # Core DOM mutation observer & filter engine
├── shared-tables.js           # Shared heuristics & default rules
├── popup.html / popup.js      # Main extension control interface
├── backup.html / backup.js    # Dedicated backup & restore dashboard
├── package-extension.ps1      # Multi-target release build script
├── tests/                     # Automated unit and integration test suite
│   ├── test_ai_guardian.js    # AI parser, <think> token & JSON tests
│   ├── test_rules.js          # Word-boundary & regex matching test harness
│   └── backup-harness.js      # Schema validation for export/import
└── dist/                      # Clean generated release packages (gitignored)
```

### Packaging a Release
Run the PowerShell packaging suite from the repository root:

```powershell
.\package-extension.ps1
```

The packager validates manifest versions, executes atomic staging, strips Chromium-only keys for Gecko compliance, and outputs:
- `dist/chromium/` + `dist/chromium.zip` (Chromium stores & unpacked)
- `dist/firefox/` + `dist/firefox.xpi` + `dist/firefox.zip` (Gecko targets)
- `YouTube-Blacklister-v<version>.zip` (Full GitHub Release bundle)

---

## License & Credits

### License
Copyright © 2026 [PyrateGFX Productions](https://github.com/PyrateGFXProductions). Released under the [MIT License](LICENSE).

### Acknowledgments & Ecosystem
- **[Ollama](https://ollama.com)** & **[LM Studio](https://lmstudio.ai)** — Enabling local, private, cloud-free AI inference.
- **[Mozilla WebExtensions](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions)** — Cross-browser extension specifications.
- **[Chrome Extensions Team](https://developer.chrome.com/docs/extensions/)** — Manifest V3 architecture reference.

---

<p align="center">
  <em>Built with uncompromising attention to speed, autonomy, and digital peace of mind.</em>
</p>
