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

**Always New To You transforms your feed into your own private curated sanctuary.**

Built strictly on modern **Manifest V3** with zero third-party tracking scripts, zero cloud dependencies, and zero data leakage, this extension intercepts YouTube's dynamic polymer DOM as it renders. Block creators with zero latency, filter title tropes with precision regex or word-boundary rules, whitelist the creators who earn your attention, pin YouTube's hidden "New to You" discovery surface, and summarize or de-bait sensationalist videos using local AI models running on your own machine.

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
- **Relevance-Ranked Keyword Extraction**: The 🔑 key icon proposes rules from the words that *describe* the video — never the first, middle or last three words of the title. Candidates are scored by where they came from (the creator's own tags outrank the description, which outranks the transcript) and by how specific they are to the video you are looking at compared with the rest of the cards on your screen. Every proposed phrase is checked to appear verbatim in the source text, filler words (`day`, `first`, `last`) can never become a rule on their own, and anything that already matches several other visible cards is refused as too generic for your feed. The toast tells you what was skipped and why; Undo is one click.
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
- **Topic Chip Rescue**: Automatically detects and repairs YouTube client bugs that cause topic filter bars to disappear from the top of the viewport.

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
> The release ZIP contains the extension only. The `install.bat` Windows helper and the
> project docs ship in the [repository](https://github.com/PyrateGFXProductions/YouTube-Blacklister)
> instead — if you want the automated loader, clone the repo and double-click `install.bat`
> there (it opens your browser's extension manager and copies the folder path to your clipboard).

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
├── install.bat                # Windows quick developer loader (repo-only; not in the release ZIP)
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
