# Always New To You — YouTube Smart Blacklister

<p align="center">
  <img src="icon128.png" alt="Always New To You Logo" width="100" height="100" />
</p>

<p align="center">
  <strong>Permanently un-break your YouTube feed.</strong><br>
  A high-performance Manifest V3 browser extension with server-invisible channel blacklisting, instant thumbnail quick-blocking, intelligent keyword filtering, and automated feed replenishment.
</p>

<p align="center">
  <a href="https://github.com/PyrateGFXProductions/YouTube-Blacklister/releases"><img src="https://img.shields.io/badge/Release-v1.8.0-brightgreen?style=for-the-badge" alt="Version 1.8.0"></a>
  <a href="https://developer.chrome.com/docs/extensions/mv3/intro/"><img src="https://img.shields.io/badge/Manifest-V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Manifest V3"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="MIT License"></a>
  <a href="#privacy--offline-security"><img src="https://img.shields.io/badge/Privacy-100%25%20Local-success?style=for-the-badge&logo=shield" alt="100% Local Privacy"></a>
  <a href="https://ko-fi.com/pyrategfxproductions"><img src="https://img.shields.io/badge/Ko--fi-Support%20Development-F16061?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support on Ko-fi"></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/pyrategfxproductions">
    <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support me on Ko-fi" width="190">
  </a>
</p>

---

## Table of Contents
- [The Problem: The YouTube Server Cache Trap](#the-problem-the-youtube-server-cache-trap)
- [How Always New To You Solves It](#how-always-new-to-you-solves-it)
- [Key Features](#key-features)
- [🧠 Autonomous AI Guardian & Mind Reader Mode](#-autonomous-ai-guardian--mind-reader-mode)
- [Gamified Level System & Impact Metrics](#gamified-level-system--impact-metrics)
- [Extension Popup Tour](#extension-popup-tour)
- [Installation Guide](#installation-guide)
- [Usage & Quick Start](#usage--quick-start)
- [Technical Architecture & Under the Hood](#technical-architecture--under-the-hood)
- [Support the Project & Donations](#support-the-project--donations)
- [Changelog & Versioning](#changelog--versioning)
- [Contributing](#contributing)
- [License & Credits](#license--credits)

---

## The Problem: The YouTube Server Cache Trap

Have you ever used YouTube's native **"Not Interested"** or **"Don't recommend channel"** buttons on the **"New to You"** discovery feed, only to have your homepage run completely dry?

```
Native YouTube Behavior (The Depletion Trap):
┌─────────────────────────┐
│ YouTube Server Cache    │
│ [Batch of ~24 videos]   │
└────────────┬────────────┘
             │
             ├─ User clicks "Don't recommend channel" (Sends POST to YouTube)
             ├─ YouTube marks video as consumed on the server
             ├─ YouTube DOES NOT replenish the batch!
             ▼
┌─────────────────────────┐
│ The Result: DEAD FEED   │
│ Refreshing page? Same!  │
│ 1-2 hour cooldown lock! │
└─────────────────────────┘
```

When you click YouTube's native dismissal buttons, YouTube's server immediately marks those slots as consumed without fetching a replacement batch. Your client is trapped with a depleted server-side recommendation queue for **1 to 2 hours**. Refreshing the page, toggling "All", or cache-busting does nothing because the server simply re-serves the depleted cached batch.

---

## How Always New To You Solves It

**Always New To You** operates entirely on the client side inside the browser's DOM:

1. **100% Server-Invisible Filtering**: Videos and channels are filtered instantly in the DOM. YouTube's recommendation servers are **never** notified, meaning your server recommendation queue remains intact and your feed never enters a cooldown lockout.
2. **Auto-Pinning "New to You"**: Automatically selects and maintains YouTube's "New to You" discovery chip as you browse, ensuring you are constantly exposed to fresh creators.
3. **Automated Feed Replenishment**: When multiple hidden videos deplete visible rows below an optimal threshold, a gentle, non-disruptive scroll trigger prompts YouTube to pull the next chunk down the pipe.
4. **Watch-Page Isolation**: Filtering strictly targets feed lockups and search grids (`ytd-rich-item-renderer`, `yt-lockup-view-model`). Player wrappers (`ytd-watch-flexy`, metadata panels) are strictly isolated so video playback is never disrupted.

---

## Key Features

### 🧠 Autonomous AI Guardian & Mind Reader Mode
- **Local AI Daemon Link**: Auto-detects local Ollama (`http://localhost:11434`) and LM Studio (`http://localhost:1234`), letting you select any local model (Phi, Gemma, Qwen, LLaMA).
- **Mind Reader Taste Synthesizer**: Type what content you love or hate in plain English (or pick from curated personas like *Zen Scholar*, *Tech & Hardware*, or *Anti-Dopamine*), and the AI automatically synthesizes precision keyword and regex rules into your active blacklist.
- **Predictive Autonomous Slop Interceptor**: Analyzes incoming YouTube home feed videos in real time, purging clickbait and ragebait before you even have to see it.
- **100% Local & Private**: All inference runs locally on your own machine. Zero data or video titles are sent to external cloud APIs.
- **Built-In Heuristic Fallback**: Runs intelligent neural heuristic scoring even when local LLM daemons are offline.

### ✨ AI Title De-Baiter (Real-Time Title Neutralizer)
- Detects sensationalist titles on the feed and rewrites them into factual, dry, low-key descriptions via batched, zero-temperature local LLM calls.
- Prepends a subtle clickable `✨` badge to every de-baited title — click it any time to **smoothly toggle** between the calm AI title and the raw clickbait original.
- Original titles are preserved in `dataset.originalTitle` and a per-video cache, so toggling is instant and offline.
- Instant heuristic neutralizer fallback strips ALL-CAPS, exclamation spam, and hype hooks when the local daemon is closed.
- Toggle in **Settings & Tools** or the **AI Guardian** tab.

### 🩻 AI Feed Forensic Diagnostic Roast
- Glowing **"Run Feed Diagnostic Roast"** action in the AI Guardian tab pulls up to 15 visible titles/channels from the active YouTube tab.
- Local LLM returns a **Toxicity Score (0–100%)**, named **Manipulation Tactics** (e.g. *Manufactured Outrage*, *Parasocial Dopamine Trap*, *Algorithmic Desperation*), and a **Savage Psychological Diagnosis** of your current algorithm.
- 1-Click **"⚡ Purge All Identified Manipulators"** button immediately blacklists every offending channel.

### ⏱️ 1-Click TL;DW (Too Long; Didn't Watch) Video Inspector
- Hover any video thumbnail to reveal a sleek `⏱️ TL;DW` pill alongside Quick-Block.
- Opens a dark glassmorphism modal with an animated neural-scan effect and summarizes the video into:
  - 🔍 **Clickbait Truth Verdict** — exposes whether the title was false or exaggerated.
  - 📝 **Core Takeaways** — three bullet points of actual substance.
  - ⏱️ **Time Saved** — calculated minutes saved.
- Captions are fetched with YouTube's standard client-side `/timedtext` endpoint (zero API keys), parsed from JSON3/XML, with a metadata fallback when captions are disabled.
- Quick **"Blacklist Channel"** action directly inside the modal.
- Toggle in **Settings & Tools**.

### ⚡ Zero-Latency Local Blacklist
- Hide channels instantly with zero network delay.
- Cleanly matches channel names, `@handles`, and video link formats.
- Persistent offline storage via `chrome.storage.local`.

### 🎯 1-Click Thumbnail Quick-Block & Keyboard Shortcut (`B`)
- Hover over any video thumbnail on YouTube to reveal a dedicated quick-block button.
- Tap **`B`** on your keyboard while hovering over any video card to block it instantly without clicking.
- Can be toggled on/off in Settings.

### ↩️ Floating "Undo" Toast Notification
- Misclick or change your mind? A floating YouTube-native dark pill toast in the bottom-left corner gives you a **5-second Undo window** to instantly unhide the video and restore the channel.

### 🎮 Gamified Level System & Milestones
- Earn rank promotions as you clean your digital space, from 🌱 **Novice Scroller** up to 🌌 **Cosmic Mind**, complete with milestone confetti celebrations!
- Track **Hours of Life Reclaimed** and your real-time **Algorithm Purity Score**.

### 📦 1-Click Curated "Starter Packs"
- Pre-loaded anti-slop keyword filters in the Keywords tab:
  - 🧠 **Anti-Brainrot**: `prank`, `skibidi`, `in 24 hours`, `you won't believe`, `exposed`, `reaction`
  - 🪙 **Crypto / Hustle**: `crypto`, `bitcoin`, `memecoin`, `100x`, `passive income`, `dropshipping`
  - 🤖 **AI Slop**: `ai generated`, `faceless channel`, `text to speech`, `midjourney`
  - 🎭 **Drama / Gossip**: `drama`, `canceled`, `apology video`, `responds to`, `clout`

### 💡 Algorithm Defense Wisdom
- Interactive header quote bar cycling daily philosophical and witty reminders on digital autonomy and algorithmic intentionality.

### 📋 Seamless 3-Dot Menu Integration
- Injects a native-styled **"Blacklist Channel (Local)"** action directly into YouTube's 3-dot context menu.
- Deep-clones native renderer contexts to guarantee the action renders enabled, clickable, and responsive across YouTube redesigns.

### 🔄 Virtual Scroller & DOM Recycling Resilient
- YouTube recycles DOM containers as you scroll through infinite feeds.
- The extension tracks unique video signatures rather than simple static tags, ensuring recycled elements are re-evaluated accurately on the fly.

### 🛡️ Smart Word-Boundary & Regex Keyword Engine
- Block annoying video tropes, clickbait buzzwords, or spoilers.
- **Word-boundary aware**: Blocking `"cat"` will hide `"cute cat"` but **will not** hide `"category"` or `"catastrophe"`.
- **Regex support**: Full support for regular expressions with flags (e.g. `/vlog\s*#?\d+/i`, `/unboxing/i`).

### ⭐ Whitelist Channel Safeguards
- Whitelist favorite channels so they are **never blocked**, even if their video title matches an active keyword rule (e.g., allow your favorite tech reviewer even if you blocked the word `"crypto"`).

### 🚫 Feed Decluttering Toggles
- **Hide YouTube Shorts**: Completely remove Shorts shelves and compact Shorts reels from your home and subscription feeds.
- **Hide Community Posts**: Eliminate text posts, polls, and image promotions from your feed.

### 💾 Complete Data Portability (JSON Backup)
- Export your entire rule set, keywords, whitelist, and settings to a JSON file with one click.
- Import backups effortlessly to sync rules across multiple computers or browsers.

---

## Gamified Level System & Impact Metrics

| Rank Level | Emoji | Title | Videos Blocked |
|:---:|:---:|:---|:---:|
| **Level 1** | 🌱 | Novice Scroller | 0 – 9 |
| **Level 2** | 🛡️ | Feed Defender | 10 – 49 |
| **Level 3** | ⚔️ | Slop Slayer | 50 – 99 |
| **Level 4** | 🧙 | Algorithm Whisperer | 100 – 249 |
| **Level 5** | 👑 | Zen Master | 250 – 499 |
| **Level 6** | 🚀 | Feed Ascendant | 500 – 999 |
| **Level 7** | 🌌 | Cosmic Mind | 1,000+ |

* **Hours Saved Formula**: Calculated at ~10 minutes saved per blocked clickbait video avoided (`totalBlocked * 10 / 60`).
* **Purity Meter**: Real-time algorithm cleanliness score with dynamic gradient progress fill.

---

## Extension Popup Tour

The extension features a responsive, dark-themed management popup designed to feel right at home alongside YouTube's native styling:

```
┌─────────────────────────────────────────────────────┐
│ 📺 YouTube Blacklister             [ 142 Blocked ] │
├──────────────┬──────────────┬─────────────┬─────────┤
│ Channels (8) │ Keywords (3) │ Whitelist(2)│ Settings│
├──────────────┴──────────────┴─────────────┴─────────┤
│ 🔍 Search blacklisted channels...                   │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Clickbait Channel Name               [ Unblock ]│ │
│ │ @spam_creator                        [ Unblock ]│ │
│ │ AI Reactions HD                      [ Unblock ]│ │
│ └─────────────────────────────────────────────────┘ │
│ [ Enter channel name, @handle, or URL...  ] [ Add ] │
├─────────────────────────────────────────────────────┤
│ Ready • v1.5.2                 [ ☕ Support on Ko-fi ]│
└─────────────────────────────────────────────────────┘
```

- **Channels Tab**: View, search, and unblock blacklisted channels. Add channels by name, `@handle`, or direct video URL. Bulk entry supported (comma or newline separated).
- **Keywords Tab**: Add and search word-boundary keywords or `/pattern/flags` regular expressions.
- **Whitelist Tab**: Safeguard trusted channels against broad keyword rules.
- **Settings & Tools Tab**: Toggle the hover quick-block button, Shorts blocker, Community posts blocker, AI Title De-Baiter, and the TL;DW inspect button. Export and import JSON backups.
- **AI Guardian Tab**: Local model connection status, Mind Reader taste profiler, Autonomous Guardian sensitivity, the **🩻 Feed Forensic Diagnostic Roast**, the AI Title De-Baiter toggle, and the live interception audit log.

---

## Installation Guide

### Option 1: One-Click Quick Installer (Windows)

1. Download the [Latest Release ZIP](https://github.com/PyrateGFXProductions/YouTube-Blacklister/releases) and extract it anywhere.
2. Double-click **`install.bat`**:
   - It automatically copies the folder path to your clipboard.
   - It automatically launches your browser's extensions manager.
3. Turn on **Developer mode** (top-right switch) and click **Load unpacked** (top-left).
4. Paste (`Ctrl+V`) the copied folder path and click **Select Folder**. Done!

---

### Option 2: Manual Load Unpacked (Chrome, Edge, Brave, Opera, Vivaldi)

1. **Download or Clone the Repository**:
   ```bash
   git clone https://github.com/PyrateGFXProductions/YouTube-Blacklister.git
   ```
   *(Or download the ZIP from [Releases](https://github.com/PyrateGFXProductions/YouTube-Blacklister/releases) and extract it).*

2. **Open your browser's Extension Manager**:
   - **Google Chrome**: Navigate to `chrome://extensions`
   - **Microsoft Edge**: Navigate to `edge://extensions`
   - **Brave**: Navigate to `brave://extensions`
   - **Opera / Vivaldi**: Open Settings → Extensions

3. **Enable Developer Mode**:
   - Toggle the **Developer mode** switch in the top-right corner.

4. **Load the Extension**:
   - Click the **Load unpacked** button in the top-left corner.
   - Select the extracted `YouTube-Blacklister` directory.

5. **Pin the Extension**:
   - Click the puzzle piece icon in your browser toolbar and pin **Always New To You**.

---

### Option 3: Chrome Web Store / Edge Add-ons (Coming Soon)
*We have pre-packaged the store-compliant bundle (`YouTube-Blacklister-v1.8.0.zip`). Once published, users will be able to install directly with one click from the official web stores.*

---

## Usage & Quick Start

1. Navigate to [https://www.youtube.com](https://www.youtube.com).
2. Notice the **"New to You"** chip is automatically selected and held active.
3. When an unwanted channel appears:
   - **Method A (1-Click Hover)**: Hover your mouse over the video thumbnail and click the red **"✕ Block Channel"** badge in the upper corner.
   - **Method B (3-Dot Menu)**: Click the **3 dots (⋮)** on the video card and select **"Blacklist Channel (Local)"** at the very top.
4. The channel's videos disappear from your feed instantly with a confirmation toast.
5. Click the extension toolbar icon at any time to review your list, adjust keywords, or export your configuration.

---

## Technical Architecture & Under the Hood

Modern YouTube does not use static HTML tables or standard server-rendered feeds. Instead, it employs:
- **Polymer / Web Components** (`ytd-rich-grid-renderer`, `ytd-rich-item-renderer`, `yt-lockup-view-model`)
- **Innertube JSON Endpoint APIs** (`/youtubei/v1/browse`, `/youtubei/v1/search`)
- **DOM Virtualization and Recycle Pools** (reusing existing DOM nodes as the viewport scrolls)

### How We Overcame YouTube's Modern Architecture:

1. **Renderer Context Deep-Cloning**:
   In modern YouTube UI releases, injecting a standard HTML `<button>` or a bare `yt-list-item-view-model` results in an inert, disabled row. YouTube requires an active `rendererContext` carrying a recognized command endpoint. We deep-clone the native row's context and supply an inert `feedbackEndpoint` with `sendPost: false`, rendering the item active and styled correctly while **guaranteeing zero network requests** are dispatched to YouTube.

2. **Innertube Hook & DOM Fallback Dual Pipeline**:
   The extension hooks into the `window.fetch` pipeline for innertube JSON responses to inject the menu option at the data layer, while simultaneously running a robust DOM mutation observer fallback to handle legacy lockups and delayed rendering.

3. **Virtual DOM Element Recycling**:
   Unlike basic content scripts that stamp a `data-processed="true"` attribute on elements and forget them, Always New To You checks a computed content fingerprint (`title + channel + href`). When YouTube recycles an existing DOM wrapper for a completely different video, the extension re-evaluates the card instantaneously.

4. **Exception-Shielded Async Architecture**:
   Chrome disables extensions if an unhandled promise rejection occurs during network hooks. Every async operation, fetch interceptor, and mutation callback in this extension is wrapped in defensive exception guards.

---

## Privacy & Offline Security

- **Zero External Connections**: The extension communicates only with `chrome.storage.local` on your device — plus your own **local** AI daemon (`localhost:11434` / `localhost:1234`) when AI features are enabled.
- **AI stays on your machine**: All title de-baiting, feed roasting, taste synthesis, and transcript summarizing run against your local Ollama / LM Studio model. Nothing is sent to any cloud API.
- **Captions fetched client-side**: TL;DW transcripts use YouTube's standard `/timedtext` endpoint, retrieved in-page the same way YouTube's own player does — no API keys, no third-party transcript services.
- **No Analytics or Telemetry**: No trackers, no logging services, no third-party libraries.
- **Minimal Permissions**: Requests only `"storage"` (to remember your blocked rules), `"tabs"` (to notify open YouTube tabs when rules change), and `localhost` host permissions for your local AI server.
- **Inspectable Source**: Every line of code is human-readable Vanilla JavaScript and CSS.

---

## Support the Project & Donations

This extension is 100% free and open-source under the MIT license. 

YouTube updates its web frontend and internal class selectors multiple times each month. Keeping this extension perfectly resilient, updated, and feature-rich requires constant testing and development.

If this extension has saved your YouTube experience from algorithm fatigue and endless clickbait, please consider supporting development:

<p align="center">
  <a href="https://ko-fi.com/pyrategfxproductions">
    <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support me on Ko-fi" width="220">
  </a>
</p>

- ☕ **Ko-fi**: [https://ko-fi.com/pyrategfxproductions](https://ko-fi.com/pyrategfxproductions)
- ⭐ **GitHub Star**: Star this repository to help others discover the project!
- 🐛 **Feedback**: Open an issue if you encounter a new YouTube layout variation or have a feature idea.

Every coffee and contribution directly fuels ongoing updates, selector maintenance, and new features!

---

## Packaging for Release

To create a clean, distributable ZIP archive for GitHub Releases or Chrome Web Store:

```powershell
.\package-extension.ps1
```

This PowerShell script validates your manifest, confirms that all icons and required assets exist, and builds `YouTube-Blacklister-v1.8.0.zip`.

---

## Changelog & Versioning

See [CHANGELOG.md](CHANGELOG.md) for full release history and version notes.

---

## Contributing

Contributions, bug reports, and suggestions are warmly welcomed! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) guide before submitting pull requests.

---

## License & Credits

Created and maintained by **[PyrateGFX Productions](https://github.com/PyrateGFXProductions)**.

Released under the **[MIT License](LICENSE)**.
Feel free to use, modify, and distribute this project freely.
