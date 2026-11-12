# Maintaining dsh-mimo-speak

Everything a maintainer needs: where the source lives, how to change it, how to ship it, and which traps to avoid.

## Where things live

| Thing | Where |
|---|---|
| Source repository | this checkout — the only canonical copy |
| Installed copy in a dsh profile | `<profile>/node_modules/dsh-mimo-speak` |
| User configuration written by the app | `<profile>/cordis.patch.yml`, the `- id: mimo-speak` entry |

The development setup most people use is a **symlink** from the profile into the checkout, so editing the source is live:

```sh
ln -s /path/to/dsh-mimo-speak ~/.dsh/profiles/<profile>/node_modules/dsh-mimo-speak
```

A restart (or a plugin reload) is still needed before the host re-imports the entry. Never edit inside `node_modules/dsh-mimo-speak` when it is a symlink — that is the same directory by another name.

## Everyday commands

```sh
npm install          # devDependencies; node_modules is not committed, package-lock.json is
npm run build        # tsc -> lib/node, tsdown -> lib/client.js
npm test             # 74 unit tests (node --test)
node scripts/stub-e2e.mjs
npm run check:privacy
```

## Commit conventions

- [Conventional Commits](https://www.conventionalcommits.org/), scoped to the plugin: `feat(mimo-speak): ...`, `fix(mimo-speak): ...`, `chore(mimo-speak): ...`.
- **`lib/` is committed on purpose** (`.gitignore` deliberately does not ignore it): `dsh plugin add` then needs no build step on the user's machine. After changing `src/`, run `npm run build` and commit `lib/` in the same commit. CI fails when the committed build output does not match a fresh build.
- Never commit: `node_modules/`, `.env*`, `.credentials.yaml`, `*.tgz`, `voices/`, `tts/`, any `*.wav`.
- Before changing `cordis.patch.yml`, remember `id: mimo-speak` is both the profile entry id and the browser-side settings namespace. Renaming it silently drops everyone's saved configuration.

## Release

1. `node scripts/pin-dsh-version.mjs <release> --self` when the host release moves; otherwise skip.
2. `npm run build && npm test && npm run check:privacy`.
3. Bump `version` in `package.json`, commit, and tag: `git tag v0.1.1 && git push --follow-tags`.
4. `npm pack` produces `dsh-mimo-speak-<version>.tgz` (never committed).
5. Install it somewhere clean and click through the card once: `dsh plugin --profile <profile> add ./dsh-mimo-speak-<version>.tgz`.

## Hard constraints

- `engines.dsh` is pinned to `>=0.2.2-rc.1 <0.3.0`. Before moving the host, run `scripts/pin-dsh-version.mjs`; it aligns `dsh-*`, `cordis`, `schemastery`, `engines.dsh` and the `compatibility` field together.
- The API key lives in the host credential store only. It must never appear in `cordis.patch.yml`, examples, fixtures, logs or tests.
- Synthesis goes through the host route `/api/mimo-speak/synthesize`, and every route passes `ctx.connection.requestRejection` before touching the key.
- The agent tool's boundary is "produce a file, do not send a message": `mimo-tts-say` writes into `<workspace>/tts/` and returns the path.

## Rollback

- One file: `git checkout -- <file>`.
- The whole tree: `git reset --hard <tag-or-commit>`.
- A broken symlink:

  ```sh
  ln -s /path/to/dsh-mimo-speak ~/.dsh/profiles/<profile>/node_modules/dsh-mimo-speak
  ```

Keep your own machine-specific notes in `MAINTAINING.local.md` — it is git-ignored, so private paths never reach the public repository.
