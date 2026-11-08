# Contributing

Thanks for taking the time to improve dsh-mimo-speak. This is a small plugin; the rules below are what keeps it shippable.

## Before you start

- **Bugs and feature ideas** — open an issue first if the change is not trivial. It is cheaper to agree on the shape than to redo the patch.
- **Security problems** — do **not** open a public issue. See [SECURITY.md](./SECURITY.md).
- **Version scope** — this plugin targets deepseek-harness `0.2.2-rc.1` only. A change that needs a newer host API has to wait for a pin bump (see [MAINTAINING.md](./MAINTAINING.md)).

## Setup

```sh
npm install
npm run build        # tsc -> lib/node, tsdown -> lib/client.js
npm test             # unit tests, including the privacy-scanner self-tests
node scripts/stub-e2e.mjs
```

A real end-to-end run needs a MiMo key and is not required for a pull request:

```sh
MIMO_API_KEY=... node scripts/live-e2e.mjs
```

## What a good pull request contains

1. **A behaviour change with a test that fails without it.** If the fix is a bug, the test must reproduce the bug first. "It builds" is not verification.
2. **`src/` and `lib/` in the same commit.** `lib/` is committed on purpose so users can install without a build step; CI builds and fails on any drift.
3. **No new dependency** unless it is unavoidable. Every dependency is a supply-chain decision the maintainer has to keep alive.
4. **No personal data.** Run `npm run check:privacy` before pushing; CI runs it too. Never commit `voices/`, `tts/`, `.env*`, or anything containing a real API key.
5. **Conventional Commits**, scoped to the plugin:

   ```
   feat(mimo-speak): add progress-bar keyboard seek
   fix(mimo-speak): stop reading when the microphone opens
   chore(mimo-speak): re-pin to dsh 0.2.2-rc.1
   ```

## Code conventions

- TypeScript, ESM, no `any` in exported signatures.
- Comments explain **why** a thing is the way it is, not what the next line does.
- The Host half must not import browser APIs, and the browser half must not import Node APIs — the two halves meet only at the route vocabulary in `src/settings.ts`.
- Keep user-visible strings in `locale/*.json` when they are part of the settings form, or in `src/client/locales.ts` when they are part of the player UI. No hardcoded Chinese or English copy inside components.
- Cross-plugin collaboration goes through Cordis services or `import type` only. The build has a purity gate for this and will reject a value import from another plugin.

## Reviewing your own change

Before you ask for review, answer these honestly:

- What must still be true after this change, and which line guarantees it?
- Did you verify the effect (a number moved, a behaviour changed), or only that the build passed?
- What is the rollback command if this is wrong?

## License

By contributing you agree that your contribution is licensed under the [MIT License](./LICENSE), and that it may be distributed under those terms.
