# Zen Browser Installation

## Installing the Extension

Zen Browser requires a packaged `.xpi` file.

### Refresh After Source Changes

The packages below are generated from the universal `manifest.json` by `.\package-extension.ps1`. After editing any source file, re-run that script so `blacklist-firefox.xpi`/`.zip`/`.jar` and `zen-unpacked/` reflect your changes, then reinstall.

### Files Ready for Installation

- `blacklist-firefox.xpi` (recommended)
- `blacklist-firefox.zip`
- `blacklist-firefox.jar`

### Step 1: Signature Check (Already Done)

**This has been configured automatically. The following has been applied:**

1. `xpinstall.signatures.required` set to `false` in Zen's profile `prefs.js`
2. `distribution/policies.json` created in Zen Browser's install directory as a fallback

No manual `about:config` changes are needed.

### Step 2: Install the Extension

1. Completely close Zen Browser (all windows)
2. Restart Zen Browser
3. Go to `about:addons` (or press `Ctrl+Shift+A`)
4. Click the **gear/settings icon** in the top-right
5. Select **"Install Add-on From File..."**
6. Select `blacklist-firefox.xpi`
7. Confirm the permission prompt

### Step 3: Pin the Extension Icon (if not visible)

1. Click the puzzle icon in Zen's toolbar
2. Click the pin icon next to "New To You Blacklist Manager"

### Step 4: Verify Installation

1. Visit `https://www.youtube.com`
2. Click the extension icon in the toolbar
3. The popup should appear with the blacklist interface

## Troubleshooting

If the extension still does not install:

- **Verify signature bypass**: Go to `about:config`, search for `xpinstall.signatures.required` — it should be `false`
- **Restart Zen completely** after the config change — the setting only takes effect on startup
- **Try `about:debugging`**: Go to `about:debugging#/runtime/this-browser` → "Load Temporary Add-on" → select `blacklist-firefox.xpi` (this loads temporarily without signature requirements)
- **Try the `.zip` file** instead of `.xpi` via the "Install Add-on From File" dialog
