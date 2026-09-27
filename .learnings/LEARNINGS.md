# Learnings

## [LRN-20260910-001] correction

**Logged**: 2026-09-10T00:00:00-07:00
**Priority**: high
**Status**: resolved
**Area**: docs

### Summary
README modernization removed the product storytelling and feature detail the user explicitly valued.

### Details
The first rewrite prioritized brevity and conservative documentation. Although accurate, it reduced the README from a persuasive, feature-rich project page to a generic overview. The correct approach is to retain the detailed feature showcase, emotional product value, and project voice while tightening unsupported claims and making navigation clearer.

### Suggested Action
For user-facing README rewrites, preserve the project's intended sales and community-facing role unless the user asks specifically for concise documentation. Improve accuracy and structure without flattening personality or feature depth.

### Metadata
- Source: user_feedback
- Related Files: README.md
- Tags: docs, product-voice, readme, correction
- Recurrence-Count: 1

### Resolution
- **Resolved**: 2026-09-10T00:00:00-07:00
- **Notes**: Restored a detailed, persuasive, accurate long-form README with feature stories, installation, privacy, development, and support sections.

---

## [LRN-20260926-001] docs-audit-method

**Logged**: 2026-09-26T00:00:00Z
**Priority**: medium
**Status**: open
**Area**: docs, process

### Summary
"Have the docs been updated?" can only be answered by diffing the docs against the code — README had drifted from the feature set (missing the namesake New-to-You feature, auto-dub, Backup page, Diversity) and PRIVACY.md was missing a real manifest permission (`downloads`).

### Details
The bug-sweep updated CHANGELOG exhaustively but README/PRIVACY lagged, and PRIVACY.md omitted the `downloads` permission added for Backup & Restore export — a Chrome Web Store review gap. The release zip ships `README.md` + `LICENSE` (`$essentialFiles`), so doc changes require re-running `package-extension.ps1` to keep the artifact honest. The Node regression harnesses lived in `%TEMP%` and had absolute `require()` paths to the repo — they are regression assets and belong in `tests/` with relative requires.

### Suggested Action
When finishing any feature sweep, run a docs-diff pass: (1) grep PRIVACY.md permission list against `manifest.json` permissions; (2) grep README for every settings toggle / storage key added in the changelog; (3) verify artifact-embedded docs by re-running the packaging script; (4) keep pure-function harnesses versioned in `tests/` with relative requires so CONTRIBUTING can cite real commands.

### Metadata
- Source: user_request ("Has all of the docs been updated…?")
- Related Files: README.md, PRIVACY.md, CONTRIBUTING.md, package-extension.ps1, tests/watch-block-harness.js, tests/backup-harness.js
- Tags: docs, privacy, packaging, tests, process
- Recurrence-Count: 1

---
