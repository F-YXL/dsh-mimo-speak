# dsh-mimo-speak 维护手册

自建、自维护的 DSH 插件（MiMo TTS 朗读）。本文档回答"这个项目在哪、怎么改、怎么发、别踩哪些坑"。

## 关键位置

| 对象 | 路径 |
|---|---|
| **唯一源码仓库**（canonical） | `/path/to/dsh-mimo-speak` |
| 桌面 profile 引用方式 | 软链：`~/.dsh/profiles/desktop/node_modules/dsh-mimo-speak` → 本仓库 |
| 用户配置层（由应用写入） | `~/.dsh/profiles/desktop/cordis.patch.yml` 中 `- id: mimo-speak` 段 |
| 语音历史数据（不入库） | `~/.dsh/profiles/<profile>/mimo-speak-recordings/` |

因为 desktop profile 用软链指向本仓库，**改完源码即对 desktop 生效**（需重启应用或重载插件才会重新加载入口）。不要把 `.dsh/profiles/.../node_modules/dsh-mimo-speak` 当成源码改——那只是同一个目录的另一条路。

## 常用命令

```bash
cd /path/to/dsh-mimo-speak

pnpm install            # 拉齐 devDependencies（本仓库不提交 node_modules）
pnpm run build          # tsc + tsdown → 重新生成 lib/（lib/ 故意提交，保证免编译安装）
pnpm test               # 41 个单测（node --test）

# recordings 测试会写真实 profile 目录；CI/沙箱里用隔离的 DSH_HOME：
DSH_HOME=$(mktemp -d) sh -c 'mkdir -p "$DSH_HOME/profiles/desktop" && node --test tests/*.test.mjs'
```

## 修改与提交约定

- 遵循仓库根 `AGENTS.md` 的 Conventional Commits 规范：`feat(mimo-speak): ...`、`fix(mimo-speak): ...`。
- **`lib/` 是提交物**（`.gitignore` 刻意不忽略）：`dsh plugin add` 免现场编译。改源码后必须重新 `pnpm run build` 并连同 `lib/` 一起提交。
- 不提交：`node_modules/`、`.env*`、`.credentials.yaml`、`*.tgz`、录音数据。
- 改 `cordis.patch.yml` 前先想清楚 `id: mimo-speak` 是 profile 入口 id，也是浏览器侧配置命名空间，**不要改这个 id**，否则已存配置会丢。

## 发布 / 安装

1. 提交并打 tag（如 `v0.1.1`）。
2. 打包：`pnpm pack`（生成 `dsh-mimo-speak-<version>.tgz`，不入库）。
3. 安装到 profile：`dsh plugin --profile desktop add ./dsh-mimo-speak-<version>.tgz`，或继续用当前软链方式本地联调。

## 硬性约束（改代码前先读）

- `engines.dsh` 锁 `>=0.2.1-rc.2 <0.3.0`，升级宿主前先跑 `scripts/pin-dsh-version.mjs` 对齐版本。
- API Key 只存在于宿主凭据存储，**绝不写进仓库任何文件**（包括 `cordis.patch.yml`、示例、日志）。
- 语音合成走宿主路由 `/api/mimo-speak/synthesize`，入口必须过 `ctx.connection.requestRejection` 信任栅栏。
- 只产出文件、不发消息的工具边界：`mimo-tts-say` 写 `<工作区>/tts/*.wav` 并返回路径，不直接发消息。

## 回滚

- 文件级回滚：`git checkout -- <file>`；整仓库回滚到上次提交：`git reset --hard <tag/commit>`。
- 软链断了重建：
  `ln -s /path/to/dsh-mimo-speak ~/.dsh/profiles/desktop/node_modules/dsh-mimo-speak`
