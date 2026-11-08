# Security policy

## Supported versions

| Version | Supported |
|---|---|
| `0.1.x` | Yes |

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Use GitHub's private reporting: **Security → Advisories → Report a vulnerability** on
<https://github.com/F-YXL/dsh-mimo-speak/security/advisories/new>.

Include what you did, what happened, and what you expected. A proof of concept helps
enormously. You can expect an initial reply within a week; this is a single-maintainer
project, so please be patient.

## What counts as a vulnerability here

- A way to make the Host spend the configured MiMo API quota without going through the
  app's own trusted origin — i.e. a bypass of `ctx.connection.requestRejection` on any
  `/api/mimo-speak/*` route.
- The API key becoming readable: in a response body, a log line, a settings snapshot, a
  crash report, or any file the plugin writes.
- A path traversal or arbitrary-write through `voiceSamplePath`, the `tts/` output
  directory, or the Edge-TTS temp directory.
- Remote code execution, or a dependency that brings it in.

## What does not

- The plugin reading text to synthesize. That is its job: the browser sends reply text
  to the Host, and the Host sends it to the MiMo endpoint you configured.
- Anything that requires an attacker to already control the local machine or the dsh
  profile configuration.
- Misuse of your own API key by you.

## Design boundaries worth knowing

- The key lives in the host credential store, referenced by name (`MIMO_API_KEY` by
  default), never in the repository, a profile config file, or the browser.
- Request bodies are capped at 1 MiB.
- Synthesis is host-side only; the browser never sees the key or talks to MiMo directly.
