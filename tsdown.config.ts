/**
 * Out-of-tree replication of the repository's `clientBundle` client pass
 * (`packages/client/tsdown.client.ts` in deepseek-harness): the browser half
 * must land at `lib/client.js` as a lazy-CJS factory that registers itself
 * with the page's module loader and resolves externals through the injected
 * `require` (the loader module table — no globals, no import map).
 *
 * Differing from the in-repo preset on purpose:
 * - the Node half ships straight from `tsc` output (`lib/node`), so no lib
 *   bundling config is needed here;
 * - styles are injected by plugin code (`src/client/styles.ts`), so the
 *   preset's lightningcss virtual loaders are not replicated.
 *
 * The purity gate below mirrors the preset's build-time rule: platform module
 * requests stay external, everything else inlines, and any other
 * `@deepseek-ai/*` value import is a build error (cross-plugin collaboration
 * goes through Cordis services; type-only imports are erased before this gate).
 */
import type { UserConfig } from 'tsdown'

/** Plugin id stamped into the `__ModuleLoader__.load` handoff and style tags. */
const ID = 'dsh-mimo-speak'

/**
 * The module table's frozen platform seed plus this package's explicit
 * `dsh.client.external` requests (none today). Mirrors `PLATFORM_MODULES` from
 * `packages/client/web/src/platform.ts` — update together with that table.
 */
const REQUESTED_MODULE_TABLE_SPECIFIERS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

const client: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
  deps: {
    neverBundle: specifier => REQUESTED_MODULE_TABLE_SPECIFIERS.has(specifier),
    alwaysBundle: specifier => !REQUESTED_MODULE_TABLE_SPECIFIERS.has(specifier),
  },
  plugins: [{
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (REQUESTED_MODULE_TABLE_SPECIFIERS.has(source)) return null
      throw new Error(
        `client bundle purity: "${source}" is not a module-table request of ${ID} — `
        + 'cross-plugin value imports are forbidden; collaborate through cordis services '
        + '(type-only imports are erased and never reach this gate)',
      )
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    chunkFileNames: 'client.[name].js',
    sourcemapExcludeSources: true,
    banner: chunk =>
      `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, ${chunk.isEntry ? '' : `chunk: ${JSON.stringify(chunk.fileName)}, `}factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [client]
