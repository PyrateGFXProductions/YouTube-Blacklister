# Always New To You — YouTube Smart Blacklister

<p align="center">
  <img src="icon128.png" width="112" height="112" alt="Always New To You icon">
</p>

<p align="center">
  <strong>Take your YouTube feed back.</strong><br>
  A fast, local-first Manifest V3 extension that turns “I never want to see this again” into a clean, reversible decision.
</p>

<p align="center">
  <a href="https://github.com/PyrateGFXProductions/YouTube-Blacklister/releases"><img src="https://img.shields.io/github/v/release/PyrateGFXProductions/YouTube-Blacklister?display_name=tag&style=for-the-badge" alt="Latest release"></a>
  <a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"><img src="https://img.shields.io/badge/Manifest-V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Manifest V3"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="MIT license"></a>
  <a href="#privacy--local-first-by-default"><img src="https://img.shields.io/badge/Privacy-Local--first-success?style=for-the-badge&logo=shield" alt="Local-first privacy"></a>
  <a href="https://ko-fi.com/pyrategfxproductions"><img src="https://img.shields.io/badge/Ko--fi-Support%20Development-F16061?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support on Ko-fi"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#what-you-get">Features</a> ·
  <a href="#optional-local-ai">Local AI</a> ·
  <a href="#privacy--local-first-by-default">Privacy</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

---

## Your feed should feel like yours

YouTube is spectacular at finding one more thing to show you. It is less useful when you have already decided that a channel, a recurring clickbait format, or a genre of recommendation is not for you.

Always New To You adds the missing control layer. Block a creator with one click, filter a title pattern, whitelist the people you trust, clear out Shorts or community posts, and keep your entire setup in local browser storage. The result is a feed that gets quieter, more intentional, and much easier to enjoy.

```text
YouTube card appears
        │
        ├── Keep it ──────────────────────────────────────────────► carry on watching
        │
        └── Block it locally
                │
                ├── channel / handle / video rule
                ├── keyword or regex rule
                └── optional local-AI assessment
                         │
                         ▼
                 card disappears from your page
                 without normal local filtering sending feedback to YouTube
```

> [!TIP]
> The default Blacklister action is local and reversible. If you explicitly enable **Server Recommendation Feedback**, the extension can also attempt YouTube's native “Don't recommend channel” action when it is available.

## What you get

| | Feature | Why it matters |
| --- | --- | --- |
| ⚡ | **Instant local blacklisting** | Hide a channel, handle, channel URL, or video ID directly in the page—without waiting for a recommendation model to catch up. |
| 🖱️ | **Three ways to block** | Use the thumbnail control, the injected three-dot menu action, or press <kbd>B</kbd> while hovering a card. |
| 🧠 | **Smart title rules** | Add word-boundary-aware keywords or full `/pattern/flags` regular expressions for recurring tropes and formats. |
| ⭐ | **Whitelist protection** | Keep favorite creators visible even when a broad keyword rule would otherwise match. |
| 🧹 | **Feed decluttering** | Hide Shorts shelves and community posts when you want a calmer browse. |
| ↩️ | **Undo without regret** | Manual blocks show a five-second Undo option, so a misclick is never permanent. |
| 💾 | **Portable setup** | Export or import your rules and settings as JSON. |
| 🎯 | **Hunt Mode** | Turn a quick browsing break into a small local minigame—no blacklist changes, just score, accuracy, and a moving target. |

---

## The Blacklister, in detail

### ⚡ Block now. Decide later.

The core feature is intentionally simple: unwanted cards disappear from the current page as soon as they match one of your local rules. You can add a channel from the thumbnail, a native-looking **Blacklist Channel (Local)** entry in YouTube's three-dot menu, or the <kbd>B</kbd> keyboard shortcut.

The extension recognizes channel names, `@handles`, channel URLs, and direct video links. When YouTube does not expose a reliable channel identity, it falls back to a video-specific rule rather than polluting your channel list with opaque IDs.

Every manual block is followed by an Undo toast. Open the extension popup whenever you want to search, review, or remove a saved rule.

### 🧠 A keyword engine that understands the difference

Not every unwanted recommendation comes from one channel. Use the **Keywords** tab to filter repeat formats, tired buzzwords, or spoilers across your whole feed.

| What you want to filter | Add this rule |
| --- | --- |
| A whole word | `crypto` |
| A recurring series format | `/vlog\s*#?\d+/i` |
| Hype-filled 24-hour challenges | `in 24 hours` |
| A specific creator | `@creator`, a channel URL, or the creator name |

Plain-text rules are word-boundary aware: blocking `cat` catches “cute cat” without hiding “category.” If you need more control, use a JavaScript-style regular expression with flags.

### ⭐ Your favorites are safe

The whitelist wins. Add a trusted channel to **Whitelist** and it remains visible—even if its title matches one of your broader keyword rules. That means you can block a topic aggressively without losing the creators who cover it thoughtfully.

### 🧹 Clean the feed, not just the channels

The Settings tab includes switches for hiding Shorts shelves and community posts. It also lets you turn the quick-block control, TL;DW inspector, title de-baiter, server feedback, and Hunt Mode on or off independently.

---

## Optional local AI

Want a little more judgment before a card reaches your attention? Open **AI Guardian** in the popup. The extension works with a local Ollama or LM Studio server; no cloud model or API key is required.

| Tool | What it does |
| --- | --- |
| 🔮 **Mind Reader Taste Profiler** | Describe the feed you want—or choose a preset—and generate focused keywords and regex rules. |
| 🤖 **Autonomous Feed Guardian** | Evaluates small batches of visible cards against your saved taste profile and can locally intercept likely clickbait or low-signal recommendations. |
| ✨ **AI Title De-Baiter** | Rewrites sensationalist titles into calmer descriptions. Click the ✨ badge to reveal the original title at any time. |
| 🩻 **Feed Forensic Diagnostic Roast** | Reviews visible feed cards, calls out manipulation patterns, and offers a one-click way to add identified channels to your local blacklist. |
| ⏱️ **TL;DW inspector** | Summarizes available captions, offers a clickbait verdict, surfaces takeaways, and estimates time saved. |

### Local model setup

Run either supported local server, then open the **AI Guardian** tab. The extension detects available models automatically.

| Provider | Default address |
| --- | --- |
| Ollama | `http://localhost:11434` |
| LM Studio | `http://localhost:1234` |

No local model running? Core blacklisting remains fully functional, and AI features fall back to built-in heuristics where applicable.

### TL;DW: know the point before you give it your time

Hover a supported thumbnail to reveal the `⏱️ TL;DW` control. It sits on the left edge above the Blacklister control so it stays out of YouTube's right-side clip and mute controls.

When captions are available, the extension reads them from YouTube's standard client-side timed-text endpoint and produces:

- a plain-language clickbait verdict;
- up to three core takeaways; and
- an estimate of the time you may save.

If captions are unavailable, TL;DW still gives you a clear fallback result rather than leaving a dead button.

---

## 🎯 Hunt Mode: a tiny game in your feed

Hunt Mode is intentionally separate from filtering. Enable it in Settings and a roaming ⛔ target appears on the thumbnail you are hovering.

- Hit the target: **+100 points**.
- Miss anywhere else: **−10 points** (never below zero).
- Your score and best score persist locally.
- Normal Blacklister controls still work exactly as usual.

It is a small, optional way to turn passive scrolling into a moment of attention—without changing your rules or affecting YouTube.

---

## Popup tour

```text
┌───────────────────────────────────────────────────────────────┐
│  YouTube Blacklister                              142 Blocked │
├───────────────────────────────────────────────────────────────┤
│  Channels  ·  Keywords  ·  Whitelist  ·  AI Guardian  ·  Settings │
├───────────────────────────────────────────────────────────────┤
│  Search, add, remove, export, import, tune your feed.         │
│                                                               │
│  🌱 Rank progression  •  estimated time saved  •  purity meter │
└───────────────────────────────────────────────────────────────┘
```

- **Channels** — search, add, and unblock creators or direct video rules. Bulk entry supports commas and new lines.
- **Keywords** — manage ordinary keyword rules and regular expressions; use curated starter packs for anti-brainrot, crypto/hustle, AI-slop, and drama/gossip patterns.
- **Whitelist** — protect channels that should always remain visible.
- **AI Guardian** — choose a local model, build a taste profile, run diagnostics, manage autonomous filtering, and review recent interceptions.
- **Settings** — customize page controls, local decluttering, TL;DW, Hunt Mode, optional server feedback, and JSON import/export.

The rank, “time saved,” and purity indicators are playful motivation—not scientific measurements. They are calculated from local block counts, using an estimate of ten minutes saved per avoided video.

---

## Install

Always New To You is an unpacked Manifest V3 extension for Chromium browsers: Chrome, Edge, Brave, Opera, and Vivaldi.

### Option 1: Windows quick installer

1. Download the [latest release](https://github.com/PyrateGFXProductions/YouTube-Blacklister/releases) and extract it.
2. Double-click [`install.bat`](install.bat). It opens your extensions manager and copies the folder path to your clipboard.
3. Enable **Developer mode**.
4. Choose **Load unpacked**, paste the path, and select the folder.

### Option 2: Load it yourself

1. Clone or download this repository.

   ```bash
   git clone https://github.com/PyrateGFXProductions/YouTube-Blacklister.git
   ```

2. Open your browser's extension page:

   | Browser | Address |
   | --- | --- |
   | Chrome | `chrome://extensions` |
   | Edge | `edge://extensions` |
   | Brave | `brave://extensions` |

3. Enable **Developer mode**, choose **Load unpacked**, and select the repository folder.
4. Pin **Always New To You** from your browser's extensions menu.
5. Open [YouTube](https://www.youtube.com/) and start curating.

---

## Privacy — local first by default

The point of this extension is control without unnecessary data collection.

- **Local rules and settings:** stored in `chrome.storage.local` on your device.
- **Local blacklisting:** standard filtering hides matching cards in the page DOM; it does not send ordinary blacklist actions to YouTube.
- **Optional YouTube feedback:** enabling **Server Recommendation Feedback** makes a deliberate, best-effort attempt to click YouTube's native “Don't recommend channel” option. It depends on YouTube's current UI and language.
- **Local AI only:** AI requests go to your own Ollama or LM Studio server at `localhost`; no cloud AI provider is used.
- **TL;DW captions:** retrieved from YouTube in the active browser session. There is no third-party transcript service or API key.
- **No telemetry:** no analytics SDKs, trackers, or ad networks are included.

The extension requests `storage`, `tabs`, and localhost host permissions for the optional local-AI servers. See [`manifest.json`](manifest.json) for the authoritative permission list.

---

## Under the hood

YouTube continuously replaces and recycles feed elements as you scroll. Always New To You watches for these changes and re-evaluates cards using their current title, channel, and video identity instead of assuming a DOM element always represents the same recommendation.

The extension also:

- keeps whitelist precedence ahead of all blacklist and keyword rules;
- reapplies settings after YouTube navigation and extension storage changes;
- keeps feed-card work scoped away from YouTube's main player containers; and
- serializes block-count updates so fast actions do not lose progress.

YouTube can change its markup at any time. If a menu item, card type, or page layout stops behaving correctly, please [open an issue](https://github.com/PyrateGFXProductions/YouTube-Blacklister/issues) with your browser version, the affected YouTube URL type, and a short description.

## Development and packaging

There is no build step: this is vanilla JavaScript, HTML, and CSS.

1. Load the repository as an unpacked extension.
2. Make your change.
3. Choose **Reload** on the browser's extensions page.
4. Test on YouTube's home, search, subscription, and watch/recommendation surfaces where relevant.

To package a release from the repository root:

```powershell
.\package-extension.ps1
```

The script verifies required assets and creates `YouTube-Blacklister-v1.8.0.zip`.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and see [CHANGELOG.md](CHANGELOG.md) for release history.

## Support the project

YouTube changes constantly. Selector maintenance, browser testing, and feature work keep this project useful. If it has made your feed feel better, consider supporting development on [Ko-fi](https://ko-fi.com/pyrategfxproductions).

<p align="center">
  <a href="https://ko-fi.com/pyrategfxproductions">
    <img src="https://ko-fi.com/img/githubbutton_sm.svg" width="190" alt="Support PyrateGFX Productions on Ko-fi">
  </a>
</p>

## License

Copyright © 2026 [PyrateGFX Productions](https://github.com/PyrateGFXProductions). Released under the [MIT License](LICENSE).
