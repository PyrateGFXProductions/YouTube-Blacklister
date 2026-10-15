# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Report them privately through GitHub's private vulnerability reporting for this
repository (**Security → Report a vulnerability**), or by contacting the
maintainer directly. You should receive an acknowledgement within 72 hours.

If you have not received a reply within that window, please follow up — sometimes
reports get missed, and a resend is never an imposition.

Please include as much of the following as you can:

- A description of the vulnerability and its impact
- Steps to reproduce, or a proof of concept
- Affected browser and version
- Any relevant console output (the content script logs under `[NewToYouExt]`)

## Scope

This is a browser extension. The attack surface is therefore different from a
server application, and the following are all in scope:

- Injection or privilege escalation in the content script's DOM interception
- A way to make the extension send blacklist data, feed data, or AI payloads off
  the machine
- A way to make the local-AI boundary (`localhost` / `127.0.0.1` only) reach a
  remote host
- Backup import parsing a file into code execution or corrupted storage
- Storage of secrets, credentials, or OAuth tokens in plaintext in
  `chrome.storage.local`

**Out of scope** (please do not report these):

- Reports that require the victim to already have compromised the browser or
  machine
- Issues in YouTube's own DOM or API that are not reachable through this
  extension's code
- The fact that blacklisted channels still appear in feeds (a correctness bug,
  not a security one — file those as regular issues)

## The Boundaries That Matter Most

Two properties are security-relevant and worth calling out explicitly, because
the extension is built around them:

**1. The blacklist never leaves the machine.** There is no network call anywhere
in this extension that carries user blacklist data. Filtering happens entirely in
the content script, in your browser. If you find any code path that would violate
this, it is a high-severity finding.

**2. AI features are loopback-only.** Any AI request goes to a local server —
Ollama, LM Studio, or a compatible server you configure. The address is
validated in code, not merely by the manifest's permission list: an address that
is not `localhost`, `127.0.0.1`, or `::1` is ignored and the extension falls back
to automatic detection. The manifest grants `http://localhost/*` and
`http://127.0.0.1/*` so any local port works; those patterns can never match a
remote host. If you find a way to reach a remote host through the AI path, that is
also high-severity.

**3. The permissions are minimal and each one is load-bearing.**
`storage` and `downloads` are used by the backup and restore features; `scripting`
is used by the popup to inspect the active YouTube tab. Host permissions cover
YouTube plus the two loopback patterns only.

## Disclosure

Once a fix is available, the maintainer will credit reporters in the CHANGELOG
unless they prefer to remain anonymous. Coordinated disclosure is appreciated:
please allow a reasonable window for a fix before publishing details.

## Supported Versions

Only the latest released version receives security fixes. This is a
single-maintainer project, so there is no backport window — please update.
