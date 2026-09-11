# Privacy Policy — Always New To You (YouTube Smart Blacklister)

**Last updated:** 2026-09-10 · Version 1.10.0

This extension is **local-first by design**: the point of it is control over your own YouTube feed without giving anyone — including us — a copy of what you watch, block, or scroll past.

This document is the authoritative data-flow disclosure and is written to answer a Chrome Web Store data-safety review directly. The summary: **nothing you see or block ever leaves your device except, optionally and only if you enable it, to a local AI daemon that you run yourself on `localhost`.**

---

## 1. What the extension collects, and where it goes

| Data | Where it is read | Where it is stored | Where it is sent |
| --- | --- | --- | --- |
| Your blacklist / whitelist rules (channels, handles, channel URLs, video IDs, keywords, regex rules) | Typed or clicked by you in the popup or on the page | `chrome.storage.local` on your device | Never leaves the device |
| Your preferences (feature toggles, local-AI settings, Guardpersona/profile, ranks) | Your own selections | `chrome.storage.local` on your device | Never leaves the device |
| Subscription identity snapshot (channel **names**, **handles**, **channel URLs** from `youtube.com/feed/channels`, and nothing else) | Read from the subscriptions page DOM only when you run the Mirror feature | `chrome.storage.local` on your device | Only to your **local** AI daemon, if and when you run an AI synthesis (see §3) |
| Feed cards that are currently visible (titles, channel names) | Read from the page DOM you are looking at | Not stored (transient) | Only to your **local** AI daemon when you explicitly trigger an AI judgment / roast / diversity comparison (see §3) |
| Closed captions / transcript for the video in the active tab (TL;DR) | Fetched from **YouTube itself** within your existing signed-in session | Not stored (transient) | Only to your **local** AI daemon when you explicitly trigger a TL;DR summary (see §3) |

The extension hosts **no** server, sends **no** analytics, and contains **no** third-party SDKs, trackers, or ad code. The external services reachable from the popup (GitHub, Ko-fi) are opened only when you click a link that you asked to click.

## 2. Permissions, and why each one exists

- **`storage`** — persists your rules and settings in `chrome.storage.local`. This is where your entire configuration lives, and nothing in this data is transmitted.
- **`https://www.youtube.com/*`** (host permission) — lets the content script run on YouTube pages so it can hide cards you chose to block and read the feed elements described in §1. This is the only website the extension can read or modify. It does **not** have permission for any other site, and it does **not** request the `tabs` permission, so it cannot inspect your browsing history.
- **`http://localhost:11434/*`, `http://127.0.0.1:11434/*`, `http://localhost:1234/*`** (host permissions) — optional local-AI servers (Ollama port 11434, LM Studio port 1234). These loopback permissions exist so the extension *can* talk to software you run yourself; they are used **only** when you enable a local-AI feature **and** a compatible server is actually detected on one of these ports. No request is made at install time, and none is made to any non-localhost address.

The user-visible permission description for the store listing:

> Reads and changes your data on www.youtube.com. Also connects to localhost (ports 11434, 1234) only if you choose to use an optional local AI server. Stores your blacklist and settings locally. No browsing history is read; no data is sent to the developer or any third party.

## 3. Local AI — the only connection that leaves the extension itself

Some features (Mind Reader, Autonomous Slop Interceptor, Guardian roast, TL;DR summary, Subscription Rule Synthesizer) can use a large-language model. By design:

1. The model must be **your own** process listening on `localhost:11434` (Ollama) or `localhost:1234` (LM Studio). The extension will not contact a remote AI or any online service for these features.
2. Connectivity is checked each time you use a feature. If no local server is detected, the feature **falls back to built-in heuristics** and sends nothing.
3. The data that would go to the model is only the minimum needed for the task: short channel names and video titles/captions from the page you are viewing. The extension never sends your watch history, your rules, your settings, or your identity.
4. The loopback connection is on your own machine, made by your browser to software you installed. We (the developer) do not see, store, or process any of it.

## 4. What the extension deliberately does NOT do

- **No YouTube Data API** — subscription scanning reads the web page you can already see, not the API.
- **No third-party transcript service** — closed captions are fetched from YouTube in your active session.
- **No cloud AI** — see §3; there is no key, no account, no remote inference.
- **No telemetry, analytics, crash reporting, or remote configuration** — there is no code path that transmits telemetry, a beacon, or an update check.
- **No disguised feedback to YouTube** — ordinary blocking hides cards in the page DOM only. The one deliberate exception is the **Server Recommendation Feedback** toggle, which you must explicitly enable; it attempts YouTube's own native "Don't recommend channel" menu action when that UI is available. Disabled by default.

## 5. Retention and deletion

- Your rules, settings, and subscription snapshot live in `chrome.storage.local` only. Removing the extension from Chrome deletes **all** of it.
- You can export and import a complete backup from the popup (**Export / Import**) and remove individual rules at any time.
- Transient data (visible feed cards, captions) is never stored between sessions.

## 6. Contact

Project and issues: [github.com/PyrateGFXProductions/YouTube-Blacklister](https://github.com/PyrateGFXProductions/YouTube-Blacklister) · Support development: [ko-fi.com/pyrategfxproductions](https://ko-fi.com/pyrategfxproductions)

The authoritative permission list always lives in [`manifest.json`](manifest.json). See also [`README.md`](README.md) and [`CHANGELOG.md`](CHANGELOG.md).