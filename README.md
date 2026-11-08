# dsh-mimo-speak

[![CI](https://github.com/F-YXL/dsh-mimo-speak/actions/workflows/ci.yml/badge.svg)](https://github.com/F-YXL/dsh-mimo-speak/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![dsh](https://img.shields.io/badge/dsh-0.2.2--rc.1-6e56cf)](https://github.com/deepseek-ai/deepseek-harness)
[![node](https://img.shields.io/badge/node-%3E%3D22.19-339933)](https://nodejs.org)

Read assistant replies aloud inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), powered by Xiaomi MiMo TTS.

A dsh plugin with three surfaces:

1. a **configuration card** on the Plugins page,
2. a **speaker button** in the action row of every finalized assistant reply,
3. an **inline player** with an optional draggable progress bar.

Speech is synthesized by Xiaomi MiMo TTS (`mimo-v2.5-tts`). The API key lives only on the Host; the browser sends text and receives WAV.

## Install

**Desktop**: open **Plugins → Add plugin (添加插件)**, enter `github:F-YXL/dsh-mimo-speak`, then restart. Or from the terminal:

```sh
dsh plugin --profile desktop add github:F-YXL/dsh-mimo-speak
```

**Web**: install into the `web` profile and refresh the page:

```sh
dsh plugin --profile web add github:F-YXL/dsh-mimo-speak
```

Pin a release instead of following `main` (recommended once `v0.1.0` is tagged):

```sh
dsh plugin --profile desktop add 'github:F-YXL/dsh-mimo-speak#v0.1.0'
```

No build permission is needed — the package ships a prebuilt `lib/` and declares no install scripts. It also shows up in the in-app **Plugin Market** (Plugins → Discover) once the repository is public: it carries the `dsh-plugin` topic, which the marketplaces index.

After installing, open **Plugins → dsh-mimo-speak**, paste the MiMo API key and hit **Audition** — a speaker button appears under every finalized reply. Prefer building from source? See [Install from source or tarball](#install-from-source-or-tarball).

Built against **deepseek-harness `0.2.2-rc.1`** (`engines.dsh: ">=0.2.2-rc.1 <0.3.0"`), following the official plugin spec:

| Spec | Where it lands here |
|---|---|
| [Packaging & installing plugins](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/user/develop/basic/publish.zh.md) (bundle) | `package.json` declares `dsh.bundle.patch` + `cordis.patch.yml` inserts the `id: mimo-speak` row; the same package carries the `dsh.client` browser half |
| [Plugin configuration](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/user/develop/basic/config.zh.md) (no hardcoded knobs) | every parameter is a Schemastery Config field with `.volatile()`; the key is `role('secret')` |
| [Instant config forms](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/cookbook/adding-a-settings-card.zh.md) | `ctx.configForms` (`mimo-speak` namespace) + the standard `SettingsFormModel` form |
| [Web client slots](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/slots.zh.md) | two seats: `plugins.bundle.config` and `conversation.chat.assistant-actions` |
| [Web server](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/web-server.zh.md) | five routes under `/api/mimo-speak/*`, each behind `ctx.connection.requestRejection` (Host/Origin + browser auth), so a bare LAN request cannot spend your API quota |
| [Client module system](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/modules/README.zh.md) | `lib/client.js` is a lazy-CJS factory (`window.__ModuleLoader__.load`); the build-time purity gate keeps cross-plugin imports type-only |

## Features

- **Config card on the Plugins page** — API key (write-only; stored in the host credential store, never echoed back), endpoint base, model, preset voice or a voice-clone sample, default style, character budget, timeout, and an **audition** button that speaks a sample with the card's current unsaved edits.
- **Speaker button on every finalized reply** — one click normalizes the Markdown (code blocks, URLs and markers are not read) and plays the result.
- **Progress bar off by default** — turn it on for a draggable, keyboard-seekable track (←/→, Home/End).
- **Stop really stops** — in-flight requests are aborted, queued audio is dropped, and nothing keeps streaming afterwards. `Esc` does the same.
- **Four read scopes** — `brief` (summarize with the current conversation model into 1–2 spoken sentences, falling back to a rule-based summary), `text` (prose only), `smart` (prose plus short code), `all`.
- **Agent tool `mimo-tts-say`** — synthesizes to `<session workspace>/tts/speech-<timestamp>-<random>.wav` and returns the absolute path. It only produces a file; delivering it as a voice message is the chat channel's job.
- **Edge TTS fallback (optional)** — when MiMo fails and the `edge-tts` CLI is installed, synthesis falls back to Microsoft Edge neural voices.
- **Bilingual UI** — Chinese and English strings ship in the box.

## Requirements

- DeepSeek Harness `0.2.2-rc.1`
- Node.js `>= 22.19.0`
- A MiMo API key from <https://api.xiaomimimo.com> (only needed at runtime, never in this repo)

## Install from source or tarball

From a checkout (the `lib/` commit is prebuilt, so the build step is only needed after you edit `src/`):

```sh
git clone https://github.com/F-YXL/dsh-mimo-speak.git
cd dsh-mimo-speak
dsh plugin --profile <profile> add ./dsh-mimo-speak
dsh --profile <profile> --dump-config | grep mimo-speak   # expect a "# == dsh-mimo-speak" layer
```

From a packed tarball:

```sh
npm pack
dsh plugin --profile <profile> add ./dsh-mimo-speak-0.1.0.tgz
```

Then open **Plugins → dsh-mimo-speak**, paste your API key, and hit **Audition** — if you hear speech, the wiring is correct.

## Configure

| Field | Default | Notes |
|---|---|---|
| `apiKeyEnv` | `MIMO_API_KEY` | credential **reference**, not the key itself |
| `baseUrl` | `https://api.xiaomimimo.com/v1` | `/chat/completions` is appended |
| `model` | `mimo-v2.5-tts` | switches to `mimo-v2.5-tts-voiceclone` automatically when a clone sample is set |
| `voice` | `mimo_default` | preset: `mimo_default`, 冰糖, 茉莉, 苏打, 白桦, Mia, Chloe, Milo, Dean |
| `voiceSamplePath` | — | host-local WAV, 24 kHz / 16-bit / mono, 5–15 s |
| `style` | — | e.g. `开心`, `语速慢`, `东北话`; empty lets the model decide |
| `maxChars` | `2000` | longer text is clamped at a sentence boundary |
| `chunkChars` | `120` | size of one playback chunk |
| `timeoutMs` | `60000` | |
| `autoRead` | `false` | read each newly finalized reply automatically |
| `readScope` | `smart` | `brief` / `text` / `smart` / `all` |
| `fallbackEngine` | `none` | `none` or `edge` |
| `edgeVoice` | `zh-CN-XiaoxiaoNeural` (Xiaoxiao) | any `edge-tts` voice id |

To keep the key out of the profile config, override the row in your profile's `cordis.patch.yml` instead of pasting it:

```yaml
- id: mimo-speak
  config:
    apiKey: !!js process.env.MIMO_API_KEY
```

## Security model

- The API key is stored through the host credential store (`credentials/set`) and is never written to a repository file, a log line, or the browser.
- Every `/api/mimo-speak/*` route passes `ctx.connection.requestRejection` first: requests that are not from the app's own trusted origin are rejected before any key is used.
- Request bodies are capped at 1 MiB; over-budget text is truncated at a sentence boundary rather than refused outright.
- `npm run check:privacy` scans every tracked file for credentials, absolute home paths and
  e-mail addresses, plus any personal names or hostnames you list in the git-ignored
  `.privacy-markers`. `npm run check:privacy:history` additionally walks **every blob and
  commit identity in the history** — run it before the first push and before each release,
  because `git log -p` publishes the past too. CI runs the file scan on every push.

Found a vulnerability? See [SECURITY.md](./SECURITY.md) — please do not open a public issue.

## Development

```sh
npm install
npm run build            # tsc -> lib/node, tsdown -> lib/client.js
npm test                 # 62 unit tests (node --test)
node scripts/stub-e2e.mjs        # full HTTP round-trip against a local stub, no key needed
MIMO_API_KEY=... node scripts/live-e2e.mjs   # one real request against the MiMo platform
```

`lib/` **is committed on purpose**: `dsh plugin add` then works without a build step on the user's machine. After changing `src/`, run `npm run build` and commit `lib/` in the same commit — CI fails if the build output is stale.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the commit conventions and the version-pinning workflow, and [MAINTAINING.md](./MAINTAINING.md) for release steps.

## Pinning to a dsh release

Distribution does **not** pick a matching build per host version: the package pins one set of `@deepseek-ai/dsh-*` dependencies, and npm will not "choose a compatible one for you". Two gates do the real work:

- `dsh.compatibility.dshReleases` — the official field listing the releases this build supports (`{ "0.2.2-rc.1": "compatible" }`). The installer/marketplace refuses or warns when the host version is not on the list.
- `engines.dsh` — an npm-style range (`>=0.2.2-rc.1 <0.3.0`).

Two traps worth knowing:

1. Every `@deepseek-ai/dsh-*` package shares one release version (`0.2.2-rc.1`), but `@deepseek-ai/cordis` and `@deepseek-ai/schemastery` are versioned independently (`~4.1.0` / `~3.19.0` at this release). Blanket-bumping everything 404s.
2. Since `0.2.0`, `dsh-scope` is a peer dependency of `dsh-session` / `dsh-api-remotes` and must appear in both `peerDependencies` and `devDependencies`, or `npm install` fails with `ERESOLVE`.

Do not hand-edit version numbers — use the script:

```sh
node scripts/pin-dsh-version.mjs <release>            # rewrite package.json, print next steps
node scripts/pin-dsh-version.mjs <release> --install  # ... and run npm install
node scripts/pin-dsh-version.mjs <release> --self     # ... and bump this plugin's own version
node scripts/pin-dsh-version.mjs <release> --dry-run  # preview only
```

## MiMo wire format

`POST {baseUrl}/chat/completions`, header `api-key: <key>`, body:

```json
{
  "model": "mimo-v2.5-tts",
  "audio": { "format": "wav", "voice": "mimo_default" },
  "messages": [{ "role": "assistant", "content": "<style>开心</style>要说的话" }]
}
```

Voice cloning switches to `mimo-v2.5-tts-voiceclone` and puts the reference audio in `audio.voice` as a data URI:

```json
{
  "model": "mimo-v2.5-tts-voiceclone",
  "audio": { "format": "wav", "voice": "data:audio/wav;base64,<base64 wav>" },
  "messages": [{ "role": "assistant", "content": "要说的话" }]
}
```

The response carries base64 audio in `choices[0].message.audio.data` — either a RIFF container (passed through) or raw PCM (wrapped into a 24 kHz / 16-bit / mono WAV by the plugin).

## Known limits

- Reading is **per message**: the action row belongs to one finalized reply, so reasoning blocks and tool calls are not read. Code blocks become "代码略".
- Text longer than `maxChars` is read from the start and cut at a sentence boundary, with a hint next to the action row.
- Desktop (Electron) goes through the IPC fetch bridge; the route paths are unchanged.
- Voice **input** is the official `@deepseek-ai/dsh-experimental-voice-input-bundle`, not this plugin. This one stops speaking as soon as the microphone opens, so the two do not feed back into each other.

## License

[MIT](./LICENSE) © F-YXL. Commercial use is permitted — that is what MIT means.

---

<details>
<summary>中文说明（完整）</summary>

## 这是什么

把助手回复「读出来」的 DSH 插件：**「插件」页里的配置卡片** + **每条已定稿助手回复动作行里的音量按钮** + **带可拖动进度条的内联播放器**。语音由小米 MiMo TTS（`mimo-v2.5-tts`）合成，API Key 只存在于宿主侧，浏览器只发送文本、收到 WAV。

面向 **deepseek-harness `0.2.2-rc.1`**（`engines.dsh: ">=0.2.2-rc.1 <0.3.0"`）。

## 功能

1. **「插件」页 → dsh-mimo-speak 详情页的配置卡片**
   - API Key（只写输入框：粘贴即经官方 `credentials/set` 通道存入宿主凭据存储，页面不回显；显示「已配置/未配置」，清空保存不改动已存密钥）
   - 接口地址（默认 `https://api.xiaomimimo.com/v1`）、模型（默认 `mimo-v2.5-tts`）
   - 预置音色（官方 9 音色下拉：mimo_default、冰糖、茉莉、苏打、白桦、Mia、Chloe、Milo、Dean）/ 音色克隆样本（宿主本地 WAV 路径，24 kHz / 16 bit / 单声道，5–15 s）
   - 默认风格（如「开心」「语速慢」「东北话」；留空由模型自行判断，推荐）、单次最大字符数、请求超时
   - **试听**：用卡片当前（含未保存修改）的风格/音色合成一句示例，内联播放
   - 标准表单行为：脏值预览、「已覆盖/恢复默认」徽标、保存/放弃、只读部署提示
2. **每条已定稿助手回复底部的音量按钮**
   - 点击 → 宿主合成（Markdown 归一化：不朗读代码块/URL/标记符号）→ 自动播放
   - **进度条可关（默认关）**：关掉只留播放/停止按钮；打开才有可拖动进度条（指针拖拽、单击定位、键盘 ←→/Home/End）
   - **停止是真取消**：中断在途请求、作废本轮、清空已排程音频；`Esc` 同样生效
   - 同时只有一条在播；播放中动作行不再悬停淡出
   - 失败就地提示（未配置/超时/上游拒绝/无文本等稳定错误码 → 本地化文案）
3. **朗读范围四档**：简要播报（先摘要再念：用当前对话模型把回复浓缩成 1–2 句口播摘要，约 80 字；模型不可用时退回规则摘要）/ 只读正文 / 智能（正文+短代码）/ 全部
4. **Agent 工具 `mimo-tts-say`**
   - 参数：`text`（必填）、`voice`、`style`（可选覆盖）
   - 行为：合成 → 写 `<会话工作区>/tts/speech-<时间戳>-<8位随机>.wav` → 返回绝对路径 + 字节数 + 时长
   - **只产出文件，不发消息**：要真的发出去，把返回的 path 交给当前聊天渠道自己的发语音工具
   - 为什么写进工作区：渠道侧的发送工具通常只接受工作区内的路径
5. **安全边界**：密钥只在宿主；`/api/mimo-speak/*` 路由先过 Connection 信任栅栏；请求体 1 MiB 上限；文本超预算在句末截断朗读开头。工具和网页朗读共用同一套 settings/凭据，不额外存密钥。

## 安装

**桌面端**：打开「插件 → 添加插件」，填入 `github:F-YXL/dsh-mimo-speak`，然后重启 DSH；也可以在终端执行：

```sh
dsh plugin --profile desktop add github:F-YXL/dsh-mimo-speak
```

**Web**：装到 `web` profile，重启后刷新页面：

```sh
dsh plugin --profile web add github:F-YXL/dsh-mimo-speak
```

仓库公开后，它也会出现在应用内的「插件市场 / Discover」里（仓库带了 `dsh-plugin` topic，市场会自动收录）。从源码构建请见英文「Install from source or tarball」一节；本包自带预构建的 `lib/` 且没有 install 脚本，无需 pnpm 构建授权。

不想把密钥写进配置文件时，在 profile 的 `cordis.patch.yml` 里覆写该行：

```yaml
- id: mimo-speak
  config:
    apiKey: !!js process.env.MIMO_API_KEY
```

## 与官方语音输入插件配合

语音指令的识别交给官方组合包，本插件只负责播报，两者互补：

```bash
# 版本要与宿主对齐：DSH 0.2.2-rc.1 → 钉到同版本
dsh plugin --profile <profile> add @deepseek-ai/dsh-experimental-voice-input-bundle@0.2.2-rc.1
```

它是本地 SenseVoice 转写（首次使用下载运行时），识别结果插入输入框草稿，不会自动发送。本插件检测到麦克风被打开时会立即停止朗读，所以「说完 → 发送 → 自动朗读回复」这条链路不会把播报录进去。

## 目录

```
dsh-mimo-speak/
├── package.json            # dsh.bundle + dsh.client manifest，engines.dsh 锁 >=0.2.2-rc.1 <0.3.0
├── cordis.patch.yml        # bundle 层：插入 id: mimo-speak 行（两侧共用）
├── tsconfig.json           # tsc → lib/node（Node 半侧 + 类型）
├── tsdown.config.ts        # 官方 clientBundle 的树外复刻 → lib/client.js
├── icon.svg  locale/{zh,en}.json
├── src/
│   ├── index.ts            # Host 插件：Config schema + Web 路由
│   ├── tts.ts              # MiMo TTS 客户端（/chat/completions + audio 输出块）
│   ├── wav.ts  normalize.ts# PCM→WAV 封装；Markdown→可朗读文本
│   ├── settings.ts         # 两侧共享：命名空间/路由/默认值/线格式类型
│   └── client/             # 浏览器半侧：两个 slot 席位、播放器、配置卡片
├── tests/                  # 62 项单测（node --test）
└── scripts/
    ├── stub-e2e.mjs        # 本地桩服务端到端（无需真实密钥）
    ├── live-e2e.mjs        # 真实 MiMo API 端到端（需 MIMO_API_KEY）
    └── check-privacy.mjs   # 推送前的隐私扫描
```

## 构建与测试

```sh
npm install
npm test                          # 62 项单测
npm run build                     # tsc + tsdown → lib/
node scripts/stub-e2e.mjs         # 真实 HTTP 桩端到端（96,044 字节 WAV）
npm run check:privacy             # 隐私扫描，必须 0 命中
```

## 适配版本与「按版本选适配」

**分发不会按宿主版本自动下载对应适配版本。** 本插件打包时把 `@deepseek-ai/dsh-*` 依赖锁死在某一个 release（当前 0.2.2-rc.1），别人拉到的就是同一份 `package.json`。真正的版本闸门是两处兼容性声明：

- `dsh.compatibility.dshReleases`：官方字段，精确列出本包适配的 release。安装器/市场在对方 dsh 版本不在白名单时**拒绝或警告**。
- `engines.dsh`：npm 风格的范围闸门（当前 `>=0.2.2-rc.1 <0.3.0`）。

运行时实际用的 `@deepseek-ai/dsh-*` 实例由**宿主 dsh 自带**，插件代码只是复用宿主环境里的版本。想让旧版 dsh 也能用，得单独发一份 pin 回旧版本的包（`scripts/pin-dsh-version.mjs` 一键生成），即「多版本并行发布」。

三个容易踩的坑：

1. `@deepseek-ai/dsh-*` 整条线共用同一个 release 版本号。
2. `@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 是独立版本号，不跟随 release。
3. `0.2.0` 起 `dsh-scope` 成为 peer 依赖，需同时写在 `peerDependencies` 与 `devDependencies` 里，否则 `npm install` 报 `ERESOLVE`。

## MiMo 线格式

```
POST {baseUrl}/chat/completions
头：api-key: <key>
体：{ "model": "mimo-v2.5-tts",
      "audio": { "format": "wav", "voice": "mimo_default" },
      "messages": [{ "role": "assistant", "content": "<style>开心</style>要说的话" }] }
```

音色克隆时切到 `mimo-v2.5-tts-voiceclone` 模型，参考音频以 Data URI 放进 `audio.voice`。响应 `choices[0].message.audio.data` 为 base64 音频（RIFF 或裸 PCM，裸 PCM 由插件包成 24 kHz / 16 bit / mono WAV）。

## 已知边界

- 按**消息**朗读：动作行属于该条已定稿回复，朗读其正文（不读思考块与工具调用）；代码块以「代码略」代替。
- 文本超过「单次最大字符数」时朗读开头并在句末截断。
- Desktop（Electron）走 IPC 桥接 fetch，路由路径不变。
- 语音输入（麦克风）是官方 `@deepseek-ai/dsh-experimental-voice-input-bundle` 的职责，本插件不重复实现。

## 许可证

[MIT](./LICENSE) © F-YXL。**MIT 允许商用**——这是它和「禁止商用」许可证的关键区别；如果你需要禁止商用，请自行更换为 PolyForm Noncommercial 等非开源许可证。

</details>
