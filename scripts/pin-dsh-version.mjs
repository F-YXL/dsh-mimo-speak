#!/usr/bin/env node
/**
 * pin-dsh-version.mjs — 把本插件重新对准某一个 dsh release。
 *
 * dsh 的版本规则（来自官方 publish 文档与 peerDependencies 实测）：
 *   - 所有 @deepseek-ai/dsh-* 包（含 dsh-scope）共用同一个 release 版本号，
 *     例如 0.2.0-rc.2 的整条 dsh-* 线都标 0.2.0-rc.2；
 *   - @deepseek-ai/cordis 与 @deepseek-ai/schemastery 是独立版本号，不跟随
 *     release，必须按该 release 的 peer/dependency 实测值取（见下方 npm 查询）；
 *   - 与宿主共享实例的包（cordis、dsh-scope）要同时写在 peerDependencies 与
 *     devDependencies 里；其余 dsh-* 只在 devDependencies（仅类型检查用）。
 *
 * 用法：
 *   node scripts/pin-dsh-version.mjs <release> [--self] [--install] [--dry-run]
 *                                         [--cordis=<range>] [--schemastery=<range>]
 *
 *   <release>    目标 dsh 版本，如 0.2.0-rc.2 / 0.1.7-rc.2
 *   --self       顺便把插件自身 version 也改成 <release>（默认不改，插件版本独立）
 *   --install    改完直接跑 npm install（默认只改 package.json 并打印提示）
 *   --dry-run    只打印将要改什么，不写文件
 *   --cordis / --schemastery  手动指定这两个独立包的版本区间，跳过 npm 查询
 *
 * 改完 package.json 后，记得跑 npm install 让 node_modules / lockfile 跟上。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_PATH = join(HERE, '..', 'package.json')

/** 解析 argv：位置参数取第一个非 -- 开头，其余是 --key[=val]。 */
function parseArgs(argv) {
  const opts = { release: null, self: false, install: false, dryRun: false, cordis: null, schemastery: null }
  for (const arg of argv.slice(2)) {
    if (arg === '--self') opts.self = true
    else if (arg === '--install') opts.install = true
    else if (arg === '--dry-run') opts.dryRun = true
    else if (arg.startsWith('--cordis=')) opts.cordis = arg.slice('--cordis='.length)
    else if (arg.startsWith('--schemastery=')) opts.schemastery = arg.slice('--schemastery='.length)
    else if (arg.startsWith('--')) { console.error(`未知参数：${arg}`); process.exit(2) }
    else if (opts.release === null) opts.release = arg
    else { console.error(`多余的位置参数：${arg}`); process.exit(2) }
  }
  return opts
}

/** 由 release 算出 engines.dsh 的上界：minor + 1。0.2.0-rc.2 → <0.3.0。 */
function nextMinorRange(release) {
  const m = /^(\d+)\.(\d+)\./.exec(release)
  if (!m) { console.error(`无法从 "${release}" 推算次版本上界，请用 --engines 手动处理`); process.exit(2) }
  const [, major, minor] = m
  return `>=${release} <${major}.${Number(minor) + 1}.0`
}

/** 查 npm 上该 release 配套的某个 peer/dependency 区间；失败返回 null。 */
function queryRange(pkg, field) {
  try {
    const out = execFileSync('npm', ['view', `${pkg}@${releaseArg}`, field, '--json'], { encoding: 'utf8' })
    const parsed = JSON.parse(out)
    return typeof parsed === 'string' ? parsed : (parsed?.[field] ?? null)
  } catch {
    return null
  }
}

const args = parseArgs(process.argv)
if (!args.release) {
  console.error('用法: node scripts/pin-dsh-version.mjs <release> [--self] [--install] [--dry-run] [--cordis=<range>] [--schemastery=<range>]')
  process.exit(2)
}
const releaseArg = args.release

const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'))
const changes = []

// 1) 其余 @deepseek-ai/dsh-* 包（dsh-scope 单独在 1.5 处理）：peer + dev 两处都对齐到
//    release。dsh 的每个 release 都会全量发布整套 dsh-* 包，所以直接改版本即可，
//    不要按 existsOnNpm 移除——网络抖动会让合法的包被误删（实测 dsh-api-remotes@0.1.7-rc.2 等是存在的）。
for (const bucket of ['peerDependencies', 'devDependencies']) {
  const deps = pkg[bucket]
  if (!deps) continue
  for (const name of Object.keys(deps)) {
    if (name === '@deepseek-ai/cordis' || name === '@deepseek-ai/schemastery') continue
    if (name === '@deepseek-ai/dsh-scope') continue
    if (!name.startsWith('@deepseek-ai/dsh-')) continue
    if (deps[name] !== releaseArg) {
      changes.push(`${bucket} ${name}: ${deps[name]} → ${releaseArg}`)
      deps[name] = releaseArg
    }
  }
}

// 1.5) 宿主共享包 dsh-scope：实测 0.2.0 起新增（0.1.x 没有这个包，0.2.0 才列为 peer）。
//      用版本规则判断（不依赖网络查询，避免抖动误判）：目标 release 的 major.minor >= 0.2 则确保
//      peer + dev 都有（版本=release），否则从两处移除。这样在 0.1.x ↔ 0.2.0 之间来回 pin 都合法。
const SCOPE = '@deepseek-ai/dsh-scope'
const mm = /^(\d+)\.(\d+)/.exec(releaseArg)
const scopeBorn = mm !== null && (Number(mm[1]) > 0 || Number(mm[2]) >= 2)
if (scopeBorn) {
  for (const bucket of ['peerDependencies', 'devDependencies']) {
    pkg[bucket] = pkg[bucket] ?? {}
    if (pkg[bucket][SCOPE] !== releaseArg) {
      changes.push(`${bucket} ${SCOPE}: ${pkg[bucket][SCOPE] ?? '(无)'} → ${releaseArg}`)
      pkg[bucket][SCOPE] = releaseArg
    }
  }
} else {
  for (const bucket of ['peerDependencies', 'devDependencies']) {
    if (pkg[bucket]?.[SCOPE] !== undefined) {
      changes.push(`${bucket} ${SCOPE}: 移除（目标 release ${releaseArg} 早于 0.2.0，无此包）`)
      delete pkg[bucket][SCOPE]
    }
  }
}

// 2) cordis / schemastery：独立版本号，优先手动覆盖，否则查 npm 取该 release 的配套区间。
const cordisRange = args.cordis
  ?? queryRange('@deepseek-ai/dsh-session', 'peerDependencies.cordis')
  ?? pkg.peerDependencies?.['@deepseek-ai/cordis']
  ?? pkg.devDependencies?.['@deepseek-ai/cordis']
if (cordisRange) {
  for (const bucket of ['peerDependencies', 'devDependencies']) {
    if (pkg[bucket]?.['@deepseek-ai/cordis'] !== undefined && pkg[bucket]['@deepseek-ai/cordis'] !== cordisRange) {
      changes.push(`${bucket} @deepseek-ai/cordis: ${pkg[bucket]['@deepseek-ai/cordis']} → ${cordisRange}`)
      pkg[bucket]['@deepseek-ai/cordis'] = cordisRange
    }
  }
}
const schemRange = args.schemastery
  ?? queryRange('@deepseek-ai/dsh-host-webserver', 'dependencies.schemastery')
  ?? pkg.devDependencies?.['@deepseek-ai/schemastery']
if (schemRange) {
  if (pkg.devDependencies?.['@deepseek-ai/schemastery'] !== undefined && pkg.devDependencies['@deepseek-ai/schemastery'] !== schemRange) {
    changes.push(`devDependencies @deepseek-ai/schemastery: ${pkg.devDependencies['@deepseek-ai/schemastery']} → ${schemRange}`)
    pkg.devDependencies['@deepseek-ai/schemastery'] = schemRange
  }
}

// 3) engines.dsh 上界随 release 推进。
const enginesDsh = nextMinorRange(releaseArg)
if (pkg.engines?.dsh !== enginesDsh) {
  changes.push(`engines.dsh: ${pkg.engines?.dsh ?? '(无)'} → ${enginesDsh}`)
  pkg.engines = pkg.engines ?? {}
  pkg.engines.dsh = enginesDsh
}

// 3.5) dsh.compatibility.dshReleases：官方兼容性声明字段，列明本包适配的 release。
// 与 engines.dsh（范围）互补，这是 dsh 安装器/市场用来判定"能否装"的精确白名单。
pkg.dsh = pkg.dsh ?? {}
pkg.dsh.compatibility = pkg.dsh.compatibility ?? {}
const newReleases = { [releaseArg]: 'compatible' }
const prevReleases = pkg.dsh.compatibility.dshReleases ?? {}
if (JSON.stringify(prevReleases) !== JSON.stringify(newReleases)) {
  changes.push(`dsh.compatibility.dshReleases: ${JSON.stringify(prevReleases)} → ${JSON.stringify(newReleases)}`)
  pkg.dsh.compatibility.dshReleases = newReleases
}

// 4) 插件自身 version（可选）。
if (args.self && pkg.version !== releaseArg) {
  changes.push(`version: ${pkg.version} → ${releaseArg}`)
  pkg.version = releaseArg
}

if (changes.length === 0) {
  console.log(`已经对准 ${releaseArg}，无需改动。`)
  process.exit(0)
}

console.log(`将要对准 dsh ${releaseArg}：`)
for (const c of changes) console.log(`  - ${c}`)

if (args.dryRun) {
  console.log('（--dry-run，未写文件）')
  process.exit(0)
}

writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n')
console.log(`已写入 ${PKG_PATH}`)
if (args.install) {
  console.log('正在跑 npm install …')
  execFileSync('npm', ['install'], { cwd: join(HERE, '..'), stdio: 'inherit' })
} else {
  console.log('下一步: 跑 npm install 让 node_modules / package-lock.json 跟上，然后 npm run build && npm test。')
}
