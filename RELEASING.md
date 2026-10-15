# Release Procedure

How to cut a release of this extension. Follow it in order — the steps are
ordered so that a broken build is caught before anything is shipped.

## Before you start

- Working tree clean: `git status` shows nothing to commit.
- On `master`, and `git pull` so you are not releasing from behind.
- The suite green locally: `npm test` → exit 0, zero failures.

## 1. Move any pending CHANGELOG entries into the release

The `[Unreleased]` section must not carry work that is about to ship.

- Re-file each pending `###` block under the version being cut, with a date:
  `## [1.13.4] - YYYY-MM-DD`.
- Reset `[Unreleased]` to "Nothing pending."
- Keep-a-Changelog order inside a release: `Added`, `Changed`, `Deprecated`,
  `Removed`, `Fixed`, `Security`.
- Cross-check against git, not memory: `git log --oneline <last-release>..HEAD`
  and `git diff --stat <last-release>..HEAD`. Every user-visible change in that
  range belongs in the changelog. If a commit fixes something reported by a user,
  the entry should say what the user saw, not just what the code did.

> The version in the changelog must match the version you are about to stamp.
> A changelog that says 1.13.4 over a manifest that says 1.13.3 is the bug this
> procedure exists to prevent.

## 2. Bump the version

Two files, and they must agree:

- `manifest.json` → `"version"`
- `package.json` → `"version"`

Follow semantic versioning:

| Change | Bump |
| --- | --- |
| Fixes, no behavior change for a caller | patch (`1.13.3` → `1.13.4`) |
| New feature, backwards compatible | minor (`1.13.3` → `1.14.0`) |
| Breaking change to stored data or behavior | major |
| A feature is **removed** | major is the honest choice — mark it `feat!` in the commit |

Commit the bump with the changelog in the same commit:

```
chore: version 1.13.4 (<one-line summary>)
```

## 3. Build

```
npm run package
```

This is PowerShell-only and must be run on Windows (or under `pwsh`). It writes:

| Artifact | What it is |
| --- | --- |
| `YouTube-Blacklister-v<version>.zip` | the release zip — the file attached to a GitHub Release |
| `blacklist-firefox.xpi` | the Firefox/Zen install file |
| `blacklist-firefox.zip` | same content, `.zip` extension for browsers that want it |
| `blacklist-firefox.jar` | a copy of the Firefox zip, for older install paths |
| `dist/chromium.zip`, `dist/firefox.zip` | the per-family distributions |
| `zen-unpacked/` | the unpacked tree Zen loads |
| `manifest-firefox.json` | the Firefox-shaped manifest |

## 4. Verify the build is not stale

This is the step that catches the most common release mistake: shipping an
artifact built from an older tree.

- Confirm the built package's version matches the source manifest:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path 'blacklist-firefox.xpi'))
$e = $zip.Entries | Where-Object FullName -eq 'manifest.json'
$r = New-Object System.IO.StreamReader($e.Open()); $v = ($r.ReadToEnd() | ConvertFrom-Json).version; $r.Close(); $zip.Dispose()
"built=$v source=" + (Get-Content -Raw manifest.json | ConvertFrom-Json).version
```

Both numbers must match.

- If you changed `content.js` since the last package run, the XPI **must** have
  been rebuilt. A stale XPI is invisible until a user reports that a fix did not
  work.

## 5. Delete superseded artifacts

Only one release zip should sit in the repo root. Before committing:

```
git status --short
```

Any `YouTube-Blacklister-v<older>.zip` still present is a build a user can
download by accident. Delete it.

## 6. Test the actual artifact, not the source

The source being green does not mean the package is. Install the built XPI in a
clean profile and confirm, on live YouTube:

- A blacklisted channel does not appear
- A keyword rule hides a matching video
- The popup opens, shows the right version, and the AI panel reports correctly
- Backup export and import round-trips

## 7. Commit and tag

```
git add -A
git commit -m "chore: release 1.13.4"
git tag -a v1.13.4 -m "Release 1.13.4"
git push origin master --follow-tags
```

Tag the release, not just the bump — tags are how the next release's
`git log <tag>..HEAD` range is computed in step 1.

## 8. Publish

- **GitHub Releases**: attach `YouTube-Blacklister-v<version>.zip`. CI already
  uploads the built artifacts to every run, so a CI-green run's artifact is
  usually the thing to attach.
- **AMO (Firefox add-ons)**: requires `web-ext sign` with AMO API keys. Those
  keys are created by the maintainer in their AMO developer account and are never
  committed to this repository. If the keys are present in the environment:

```powershell
npx web-ext sign --source-dir dist/firefox --channel listed --api-key $env:AMO_KEY --api-secret $env:AMO_SECRET
```

See `ZEN-INSTALL.md` for the install-side consequences of signing (a signed XPI
survives browser updates; an unsigned one is wiped).

## Never do these

- **Never invent or guess an AMO API key.** They are created by the maintainer.
- **Never ship without running the suite.** `npm test` is the only gate.
- **Never leave two release zips in the root.**
- **Never bump the version without moving the changelog entries**, or the
  changelog stops matching the shipped version.
- **Never run `npm run test:live` as a release gate** — it needs a live Ollama,
  and a missing local server is not a release blocker.
