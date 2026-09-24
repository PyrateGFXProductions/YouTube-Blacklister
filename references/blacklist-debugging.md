Decisions and recipes that apply sometimes, not on every MV3 extension task.

## AI heuristic fallback must respect user rules

When a popup or service-worker feature uses a local LLM and falls back to a heuristic when the model is offline, the heuristic cannot silently ignore the user's own rules.

**The failure mode:** feature X sends a message to the service worker; the service worker tries the LLM, catches the failure, and falls back to a hardcoded keyword list. The user's custom keywords and channels are not in the message payload, so the heuristic never sees them. The user's rules are silently bypassed whenever the model is down.

**The fix, in order:**
1. Add the user's current `keywords` and `channels` arrays to every AI message payload (e.g. `AI_EVALUATE_BATCH`).
2. In the heuristic fallback, check user keywords first (word-boundary match + regex rules), then user channels, before any persona-based topic heuristics.
3. User rules get highest priority — if a video matches a user keyword or channel, block it regardless of persona.

**Why user rules first:** the heuristic's job is to substitute for the model, not to replace the user's explicit decisions. A heuristic that blocks what the user unblocked, or lets through what the user blocked, is worse than no heuristic at all.

## Shared constants for heuristic tables

When the same keyword/regex table appears in more than one function, lift it to a `const` at module scope. Inline copies drift.

**Decision: when to lift.** Lift when the table appears in 2+ functions AND the concept is the same (clickbait patterns, outrage words, sports keywords, etc.). Do NOT lift when two tables share some entries but differ in purpose (e.g. a "sports" table for the interceptor vs a "sports signals" table for subscription topic classification — those are different concepts that happen to overlap).

**Naming.** Name the constant after the concept, not after the consuming function: `CLICKBAIT_PATTERNS`, not `interceptorBaitPats`. This makes it clear the constant is the source of truth, not an implementation detail of one consumer.

**Scope.** Put shared constants near the top of the file, after imports and utility functions, before the first consumer. Add a one-line comment above the block: "Shared heuristic constants — single source of truth for X used across Y, Z."

**Verification after refactoring.** After moving an inline table to a shared constant and replacing all consumers, grep the file for the old inline array to confirm no copy was missed.

## Refactoring function signatures — update all call sites

When a function gains new parameters, every call site must pass them. A missed call site silently passes `undefined`, and default-handling like `Array.isArray(x) ? x : []` makes it appear to work while silently disabling the new behavior.

**Checklist:**
1. Grep the file for the function name (not just the definition).
2. At each call site, confirm the new arguments are passed.
3. If the function is called from a message handler (e.g. `chrome.runtime.onMessage`), confirm the handler extracts the new fields from the message and passes them.

**Common miss:** the message handler calls `fn(msg.a, msg.b, msg.c)` but the refactored function now expects `fn(a, b, c, d, e)` — the handler is the site most likely to be missed because it's in a different part of the file from the function definition.

## Debugging why a blacklist rule is not taking effect

When a user reports "keyword X or channel Y is not blocking," do not assume the rule is missing or the matcher is broken. Trace the rule through the actual matching pipeline and prove which stage failed.

**First verify the live DOM state on the failing page, not just the stored rules.** The matcher sees what YouTube rendered into each card. Use the content script's own extraction shapes as your probe: the title selector list in `getVideoTitle()`, the channel selection list in `getChannelName()`, and the key-collection in `getCardChannelKeys()`. Console-inspect a visible card that should be blocked and print the exact `title`, `channel`, `videoId`, and the card-key set the matcher would compute. Then compare that against the stored `keywords` and `channels`.

**For keyword rules, the most common silent miss is word-boundary matching, not absence of the keyword.** This extension's title matcher uses `\bkeyword\b` word-boundary regex (case-insensitive). That means:
- `war` will NOT match `warcraft` as a whole word.
- `warcraft` will match `WarCraft` because the match is case-insensitive.
- A keyword whose target appears inside a longer token or attached to punctuation/delimiters the matcher does not treat as a boundary can fail even when the literal word is visibly present.

**For channel rules, the most common silent miss is empty or incomplete card identity extraction, not an absent blacklist entry.** Channel matching only fires if `getCardChannelKeys()` returns a key that equals a normalized stored entry. If YouTube rendered that card in a layout where the channel row is missing, moved, or labeled with a byline format the extractor does not parse, the card can present no channel key at all and the channel rule will not fire — even if the user clearly added that channel.

**Whitelist overrides everything.** Check `whitelistChannels` first. If the channel is whitelisted, a matching keyword or channel rule will not hide the card. This is by design but is a frequent surprise when a channel was auto-added during a subscription scan.

**Storage is only useful if the content script actually re-reads it.** After a popup save, confirm that the content script received and applied the update. The extension broadcasts `RULES_UPDATED` from the popup's `save()` and also listens to `chrome.storage.onChanged` in the content script. If either path is broken (often because `tabs` permission is missing and `chrome.tabs.query`/`sendMessage` fail silently), the popup can appear to save while the open tab keeps using the old rules. Check the popup's `save()` awaits the storage write before broadcasting, and check whether `chrome.tabs.*` calls are guarded for transient drag/resize rejections.

**Cache identity `lastSignature` can hide re-evaluation from non-force passes.** The feed processor skips cards whose signature string has not changed on a non-force pass. A normal `RULES_UPDATED` handler and the storage `onChanged` listener both force a full re-run by clearing `lastSignature` first, so this is usually not the cause — but if some other path triggers `processFeed(false)` while the signature string is unchanged, the card may keep its old visible/hidden state even after rules changed. Force re-scans when investigating.

**AI features are separate from the core matcher.** The title de-baiter rewrites titles; it does not block. The autonomous interceptor is a second layer that only runs when `aiAutonomous` is on, and it still receives `settings.keywords` and `settings.channels` in its payload — but it does not make the base keyword/channel matcher more aggressive. Do not treat "AI mode" as a fix for a keyword that the core matcher fails to match.

**Verification steps, in order:**
1. Print the stored `keywords` and `channels` from storage on the failing page/context.
2. For one failing card, print the exact extraction results the matcher would use: title string, channel string, video ID, card-key set.
3. Manually test the failing rule against that printed title/identity using the same semantics the matcher uses (case-insensitive whole-word for keywords; normalized-equality for channels).
4. If the manual test matches but the card is still visible, check whitelist, cache skip, or missing re-broadcast rather than the matcher logic.

**Pitfall — debugging from the popup only.** The popup shows what is stored. It does not show what the content script extracted from the DOM or what the matcher actually returned for a specific card. Jumping to "remove and re-add the keyword" before checking the live card extraction usually wastes time.

**Pitfall — assuming case or substring matching.** If the user added a keyword expecting substring or case-sensitive behavior, the mismatch is conceptual, not a bug. Match the documented semantics: keywords are whole-word and case-insensitive; channels are normalized identity matches.

## YouTube DOM component class name migration (2026)

YouTube migrated from kebab-case `-wiz` suffixed class names (e.g. `yt-lockup-metadata-view-model-wiz__heading-reset`, `yt-content-metadata-view-model-wiz__metadata-row`) to camelCase class names without the `-wiz` suffix (e.g. `ytLockupMetadataViewModelHeadingReset`, `ytContentMetadataViewModelMetadataRow`, `ytLockupMetadataViewModelTitle`). This affects all selector-based extraction in `getVideoTitle()`, `getChannelName()`, `getCardChannelKeys()`, `getVideoTitleElement()`, and `collectVisibleFeedItems()`.

**The failure mode:** when the old `-wiz` selectors don't match, `getVideoTitle()` returns empty, `getChannelName()` returns empty, `getCardChannelKeys()` returns empty (only video ID survives via anchor href extraction). In `evaluateCard()`, `resolved = Boolean(title || cardKeys.length || channel || vid)` is still `true` because `vid` is non-empty, but the keyword check at `if (title && settings.keywords.some(...))` fails because `title` is empty. The card is never hidden.

**The fix:** add the new camelCase selectors BEFORE the legacy `-wiz` selectors in every selector list. Keep the legacy selectors too — older YouTube DOM versions (and `ytd-video-renderer`, `ytd-compact-video-renderer` in search results) still use `#video-title`, `ytd-channel-name`, etc. The `evaluateCard()` function and its `window.__blkDebug` / `window.__blkInspect` debug helpers let you verify extraction on a live tab: open youtube.com, run `window.__blkInspect()` in the console, and confirm `title` and `channel` are populated for cards that should be blocked.

**Selectors that changed (new -> old):**
|- Title: `.ytLockupMetadataViewModelHeadingReset a` / `.ytLockupMetadataViewModelTitle` / `h3.ytLockupMetadataViewModelHeadingReset` -> `.yt-lockup-metadata-view-model-wiz__heading-reset a` / `.yt-lockup-metadata-view-model-wiz__title` / `h3.yt-lockup-metadata-view-model-wiz__heading-reset`
|- Channel metadata: `.ytContentMetadataViewModelMetadataRow` / `.ytContentMetadataViewModelMetadataText` -> `.yt-content-metadata-view-model-wiz__metadata-row` / `.yt-content-metadata-view-model-wiz__metadata-text`
|- Menu host: `.ytLockupMetadataViewModelMenu` -> `.yt-lockup-metadata-view-model-wiz__menu`

**Scoped metadata rows to `:first-child`:** The `.ytContentMetadataViewModelMetadataRow` selector matches all metadata rows (channel name + view count + badge rows). Use `:first-child` to target only the channel name row. Without this, view-count and timestamp rows leak into `getCardChannelKeys()` as bogus channel keys.

**Filter time-ago and view-count text before using it as a channel identity.** YouTube abbreviates time units in metadata spans ("2h ago", "3d ago", "5m ago", "1w ago", "2.1M"). The `isViewCountOrTimeText()` guard must recognize BOTH full unit names ("2 hours ago") and abbreviated forms ("2h ago"). It must ALSO catch COMBINED text like "2h ago 1.5M views" that appears in a single metadata row span. If the guard only matches full unit names or only standalone forms, the abbreviated forms slip through as channel keys — the user sees "2h ago", "2d ago" pollute the card-key set and believes the blacklister is treating timestamps as blocked channels. Always test the regex against YouTube's actual abbreviated output before declaring channel extraction correct.

**Never add card keys to the channels blocklist.** The `blacklistActiveChannel()` (quick-block from menu) function previously pushed EVERY entry from `getCardChannelKeys()` into `settings.channels`. Card keys include video IDs, time strings, view counts, and fragments produced by `extractChannelNamesFromByline()` splitting multi-word channel names on `&`/`and` (e.g. "Sam & Nebula" -> "Sam", "Nebula"). Only the PRIMARY channel identity from `getChannelName()` should be added to the channels list. Adding card keys directly causes garbage like "3w ago", "sam", "nebula" to become permanent channel blocks.

**No substring matching in `matchUserChannel()`.** The background heuristic previously had `norm.includes(cNorm)` as a fallback — this means a short channel key like "sam" (if accidentally added to the list) would match "Samsung", "Samuel", or any video whose channel contains those letters. Channel matching must be exact or via extracted `/channel/` or `/@` entity keys only.
