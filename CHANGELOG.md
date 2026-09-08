# Changelog

All notable changes to the **Always New To You - YouTube Smart Blacklister** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
