/**
 * MiMo TTS speech synthesis, Host half.
 *
 * This plugin answers two questions the browser asks of the Host: what the
 * engine is configured to do (`GET /api/mimo-speak/status`) and what one text
 * sounds like (`POST /api/mimo-speak/synthesize`). The API key never leaves the
 * Host — the browser sends text and receives WAV bytes.
 *
 * Settings are ordinary volatile Config fields, so the settings service
 * projects them into the configuration form the browser half renders on its
 * `语音合成` settings page. The automatic Plugins-page card is turned off:
 * this plugin owns its own settings page instead.
 * @module dsh-mimo-speak
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import {
  DEFAULT_BASE_URL, DEFAULT_CHUNK_CHARS, DEFAULT_CREDENTIAL_REF, DEFAULT_EDGE_VOICE, DEFAULT_FALLBACK_ENGINE, DEFAULT_HIGHLIGHT, DEFAULT_MAX_CHARS, DEFAULT_MODEL, DEFAULT_MUTE_WHILE_RECORDING, DEFAULT_PROGRESS_BAR, DEFAULT_READ_SCOPE, DEFAULT_TIMEOUT_MS, DEFAULT_VOICE,
  MIMOSPEAK_RECORDING_HEADER, MIMOSPEAK_RECORDINGS_PATH, MIMOSPEAK_STATUS_PATH, MIMOSPEAK_SUMMARY_PATH, MIMOSPEAK_SYNTHESIZE_PATH, MIMOSPEAK_SYNTHESIZE_STREAM_PATH, MIMOSPEAK_TEST_PATH,
} from './settings.ts'
import type { FallbackEngine, ReadScope, TtsSummaryResult, TtsErrorBody, TtsRecordingsIndex, TtsStatusView, TtsSynthesizeRequest, TtsTestResult } from './settings.ts'
import { resolveEngineConfig, streamSpeechPcm, synthesizeSpeech, TtsError } from './tts.ts'
import { synthesizeEdge } from './edge-tts.ts'
import { summarizeForSpeech } from './summarize.ts'
import { createSayTool } from './tool.ts'
import {
  addVersion, deleteVersion, hasVersion, listRecordings, resynthesize, versionFilePath,
} from './recordings.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'mimo-speak'

/** Runtime settings projected into the configuration form. */
export interface Config {
  /** Credential reference naming the MiMo API key in the credentials store. */
  apiKeyEnv: Volatile<string | undefined>
  /** Endpoint base; `/chat/completions` is appended. */
  baseUrl: Volatile<string | undefined>
  /** MiMo TTS model id. */
  model: Volatile<string | undefined>
  /** Preset voice name used when no clone sample is configured. */
  voice: Volatile<string | undefined>
  /** Host-local WAV (24 kHz / 16-bit / mono, 5–15 s) used as the voice-clone reference. */
  voiceSamplePath: Volatile<string | undefined>
  /** Default speaking-style phrase (e.g. `开心`, `语速慢`, `东北话`). */
  style: Volatile<string | undefined>
  /** Longest text one synthesis accepts, in characters. */
  maxChars: Volatile<number>
  /** Longest single playback chunk, in characters. */
  chunkChars: Volatile<number>
  /** Upper bound on one upstream round-trip, in milliseconds. */
  timeoutMs: Volatile<number>
  /** Read each newly finalized assistant reply aloud automatically. */
  autoRead: Volatile<boolean>
  /** Fallback engine used when MiMo synthesis fails. */
  fallbackEngine: Volatile<FallbackEngine>
  /** Edge-TTS voice used by the fallback engine. */
  edgeVoice: Volatile<string | undefined>
  /** Which parts of a reply are read aloud. */
  readScope: Volatile<ReadScope>
  /** Highlight the sentence being read inside the message. */
  highlight: Volatile<boolean>
  /** Show the seekable progress bar in the floating player. */
  progressBar: Volatile<boolean>
  muteWhileRecording: Volatile<boolean>
}

export const Config = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_CREDENTIAL_REF).volatile(),
  baseUrl: z.string().default(DEFAULT_BASE_URL).volatile(),
  model: z.string().default(DEFAULT_MODEL).volatile(),
  voice: z.string().default(DEFAULT_VOICE).volatile(),
  voiceSamplePath: z.string().volatile(),
  style: z.string().volatile(),
  maxChars: z.number().step(1).min(1).default(DEFAULT_MAX_CHARS).volatile(),
  chunkChars: z.number().step(1).min(20).max(1000).default(DEFAULT_CHUNK_CHARS).volatile(),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS).volatile(),
  autoRead: z.boolean().default(false).volatile(),
  fallbackEngine: z.union([z.const('none'), z.const('edge')]).default(DEFAULT_FALLBACK_ENGINE).volatile(),
  edgeVoice: z.string().default(DEFAULT_EDGE_VOICE).volatile(),
  readScope: z.union([z.const('text'), z.const('all'), z.const('smart'), z.const('brief')]).default(DEFAULT_READ_SCOPE).volatile(),
  highlight: z.boolean().default(DEFAULT_HIGHLIGHT).volatile(),
  progressBar: z.boolean().default(DEFAULT_PROGRESS_BAR).volatile(),
  muteWhileRecording: z.boolean().default(DEFAULT_MUTE_WHILE_RECORDING).volatile(),
})

/** Narrow shape of the host credentials service used to resolve the key. */
interface CredentialsService {
  resolve(ref: unknown): Promise<{ value?: string } | undefined>
}

/**
 * Read the whole config as one consistent snapshot at operation start. The
 * credential reference resolves through the host credentials service, so the
 * literal key never lives in a configuration file; an absent service, an
 * unknown reference, or a missing value all resolve to an empty key, which
 * the engine reports as `not-configured`.
 */
async function resolveEngineSnapshot(ctx: Context, config: Config): Promise<ReturnType<typeof resolveEngineConfig>> {
  const credentials = (ctx as unknown as { get?(name: string): unknown }).get?.('credentials') as
    | CredentialsService
    | undefined
  const ref = (config.apiKeyEnv.get() ?? '').trim()
  let apiKey = ''
  if (credentials !== undefined && ref !== '') {
    try {
      const resolved = await credentials.resolve(credentialRef(ref))
      apiKey = (resolved?.value ?? '').trim()
    } catch {
      apiKey = ''
    }
  }
  return resolveEngineConfig({
    apiKey,
    baseUrl: config.baseUrl.get(),
    model: config.model.get(),
    voice: config.voice.get(),
    voiceSamplePath: config.voiceSamplePath.get(),
    style: config.style.get(),
    maxChars: config.maxChars.get(),
    timeoutMs: config.timeoutMs.get(),
  })
}

/**
 * Host registration: the settings presentation policy and the two Web routes.
 * @param ctx - plugin context; the routes appear when `webServer` and
 * `connection` exist (Web and Desktop GUI compositions).
 * @param config - live volatile settings.
 */
export function apply(ctx: Context, config: Config): void {
  // This plugin owns its settings page (the browser half's `settings.section`
  // entry), so it opts out of the automatic Plugins-page config card.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })

  // Agent tool: text → WAV in the session workspace. Only compositions that
  // expose a `tools` service (chat / agent sessions) get it; the browser half
  // and pure web compositions simply never enter this callback.
  ctx.inject(['tools'], (child) => {
    child.effect(() => {
      const tools = (child as unknown as { tools?: { register?(tool: unknown): unknown } }).tools
      // 没有 tools 服务（纯 Web 组合）时什么都不注册，但 effect 仍要返回一个清理函数
      if (typeof tools?.register !== 'function') return () => {}
      const dispose = tools.register(createSayTool({
        synthesize: async (request) => {
          const engine = await resolveEngineSnapshot(ctx, config)
          const wav = await synthesizeSpeech(engine, request)
          const style = (request.style ?? '').trim() || engine.style
          const voice = (request.voice ?? '').trim() || engine.voice
          return { wav, model: engine.model, style, voice }
        },
        // 同一份音频再进一次录音历史，设置页里可以回放对比
        persist: async (request, outcome) => {
          await addVersion(
            request.text,
            outcome.style === '' ? undefined : outcome.style,
            outcome.voice === '' ? undefined : outcome.voice,
            outcome.model,
            outcome.wav,
          )
        },
        log: message => console.info(message),
      }))
      return () => {
        if (typeof dispose === 'function') (dispose as () => void)()
      }
    }, 'dsh-mimo-speak: say tool')
  })

  ctx.inject(['webServer', 'connection'], (child) => {
    const fence = (req: IncomingMessage, res: ServerResponse): boolean => {
      // The configured Host/Origin fence plus browser authentication: an
      // unauthenticated LAN request must not spend the operator's API credits.
      const rejection = child.connection.requestRejection(req)
      if (rejection === undefined) return false
      res.statusCode = rejection
      res.end()
      return true
    }
    const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
      const bytes = Buffer.from(JSON.stringify(body), 'utf8')
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(bytes)
    }
    const sendError = (res: ServerResponse, status: number, body: TtsErrorBody): void => {
      sendJson(res, status, body)
    }
    const errorStatusOf = (failure: TtsError): number => failure.code === 'not-configured' ? 503
      : failure.code === 'bad-request' || failure.code === 'text-too-long' ? 400
        : failure.code === 'timeout' ? 504
          : 502
    const errorBodyOf = (failure: TtsError): TtsErrorBody => ({
      error: {
        code: failure.code,
        message: failure.message,
        ...(failure.upstreamStatus === undefined ? {} : { upstreamStatus: failure.upstreamStatus }),
        ...(failure.upstreamParam === undefined ? {} : { param: failure.upstreamParam }),
      },
    })
    const toFailure = (error: unknown): TtsError => error instanceof TtsError
      ? error
      : new TtsError('upstream-error', error instanceof Error ? error.message : String(error))
    const readRequest = (parsed: Record<string, unknown>): TtsSynthesizeRequest | undefined => {
      const request = parsed as Partial<TtsSynthesizeRequest>
      if (typeof request.text !== 'string' || request.text.trim() === '') return undefined
      return {
        text: request.text,
        style: typeof request.style === 'string' ? request.style : undefined,
        voice: typeof request.voice === 'string' ? request.voice : undefined,
      }
    }
    /** Try Edge TTS once, when configured, and stream the result as MP3. */
    const tryEdgeFallback = async (res: ServerResponse, request: TtsSynthesizeRequest, engine: ReturnType<typeof resolveEngineConfig>, primaryFailure: TtsError): Promise<boolean> => {
      if (config.fallbackEngine.get() !== 'edge') return false
      if (primaryFailure.code === 'bad-request' || primaryFailure.code === 'text-too-long') return false
      try {
        const mp3 = await synthesizeEdge(request.text, config.edgeVoice.get(), engine.timeoutMs)
        res.statusCode = 200
        res.setHeader('content-type', 'audio/mpeg')
        res.setHeader('cache-control', 'no-store')
        res.end(Buffer.from(mp3))
        return true
      } catch (edgeError) {
        const edgeFailure = toFailure(edgeError)
        sendError(res, errorStatusOf(edgeFailure), errorBodyOf(new TtsError(
          edgeFailure.code,
          `MiMo failed (${primaryFailure.message}); Edge fallback also failed (${edgeFailure.message}).`,
        )))
        return true
      }
    }

    child.effect(() => child.webServer.register({
      kind: 'exact',
      path: MIMOSPEAK_STATUS_PATH,
      handler: (req, res) => {
        if (fence(req, res)) return
        if (req.method !== 'GET') {
          sendError(res, 405, { error: { code: 'bad-request', message: 'GET only.' } })
          return
        }
        void (async () => {
          const engine = await resolveEngineSnapshot(ctx, config)
          const hasVoiceSample = engine.voiceSamplePath !== ''
            ? await stat(engine.voiceSamplePath).then(value => value.isFile(), () => false)
            : false
          const status: TtsStatusView = {
            configured: engine.apiKey !== '',
            model: engine.model,
            voice: engine.voice,
            hasVoiceSample,
            baseUrl: engine.baseUrl,
            autoRead: config.autoRead.get() === true,
            maxChars: config.maxChars.get(),
            chunkChars: config.chunkChars.get(),
            fallbackEngine: config.fallbackEngine.get(),
            edgeVoice: config.edgeVoice.get() ?? DEFAULT_EDGE_VOICE,
            readScope: config.readScope.get(),
            highlight: config.highlight.get() !== false,
            progressBar: config.progressBar.get() === true,
            muteWhileRecording: config.muteWhileRecording.get() === true,
          }
          sendJson(res, 200, status)
        })()
      },
    }), `dsh-mimo-speak: GET ${MIMOSPEAK_STATUS_PATH}`)

    child.effect(() => child.webServer.register({
      kind: 'exact',
      path: MIMOSPEAK_SYNTHESIZE_PATH,
      handler: (req, res) => {
        if (fence(req, res)) return
        if (req.method !== 'POST') {
          sendError(res, 405, { error: { code: 'bad-request', message: 'POST only.' } })
          return
        }
        void (async () => {
          const parsed = await readJsonBody(req)
          if (parsed === undefined) {
            sendError(res, 400, { error: { code: 'bad-request', message: 'Request body is not a JSON object.' } })
            return
          }
          const request = readRequest(parsed)
          if (request === undefined) {
            sendError(res, 400, { error: { code: 'bad-request', message: 'A non-empty `text` string is required.' } })
            return
          }
          const engine = await resolveEngineSnapshot(ctx, config)
          try {
            const wav = await synthesizeSpeech(engine, request)
            res.statusCode = 200
            res.setHeader('content-type', 'audio/wav')
            res.setHeader('cache-control', 'no-store')
            res.end(Buffer.from(wav))
          } catch (error) {
            const failure = toFailure(error)
            if (await tryEdgeFallback(res, request, engine, failure)) return
            sendError(res, errorStatusOf(failure), errorBodyOf(failure))
          }
        })()
      },
    }), `dsh-mimo-speak: POST ${MIMOSPEAK_SYNTHESIZE_PATH}`)

    // Stream one text as raw PCM chunks (SSE). The browser plays the first
    // chunk as soon as it arrives instead of waiting for the whole utterance.
    child.effect(() => child.webServer.register({
      kind: 'exact',
      path: MIMOSPEAK_SYNTHESIZE_STREAM_PATH,
      handler: (req, res) => {
        if (fence(req, res)) return
        if (req.method !== 'POST') {
          sendError(res, 405, { error: { code: 'bad-request', message: 'POST only.' } })
          return
        }
        void (async () => {
          const parsed = await readJsonBody(req)
          if (parsed === undefined) {
            sendError(res, 400, { error: { code: 'bad-request', message: 'Request body is not a JSON object.' } })
            return
          }
          const request = readRequest(parsed)
          if (request === undefined) {
            sendError(res, 400, { error: { code: 'bad-request', message: 'A non-empty `text` string is required.' } })
            return
          }
          const engine = await resolveEngineSnapshot(ctx, config)
          res.statusCode = 200
          res.setHeader('content-type', 'text/event-stream; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.setHeader('connection', 'keep-alive')
          res.flushHeaders?.()
          const emit = (payload: unknown): void => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`)
          }
          try {
            const stats = await streamSpeechPcm(engine, request, undefined, (pcm) => {
              emit({ pcm: Buffer.from(pcm).toString('base64') })
            })
            emit({ done: true, firstChunkMs: stats.firstChunkMs, chunks: stats.chunks })
            res.end()
          } catch (error) {
            const failure = toFailure(error)
            emit({ error: errorBodyOf(failure).error })
            res.end()
          }
        })()
      },
    }), `dsh-mimo-speak: POST ${MIMOSPEAK_SYNTHESIZE_STREAM_PATH}`)

    // Spoken summary for the brief read scope: one short model-written
    // sentence-group instead of a mechanical sentence pick. Best effort — the
    // client keeps its offline extractive fallback when this route says no.
    child.effect(() => child.webServer.register({
      kind: 'exact',
      path: MIMOSPEAK_SUMMARY_PATH,
      handler: (req, res) => {
        if (fence(req, res)) return
        if (req.method !== 'POST') {
          sendError(res, 405, { error: { code: 'bad-request', message: 'POST only.' } })
          return
        }
        void (async () => {
          const parsed = await readJsonBody(req)
          if (parsed === undefined) {
            sendError(res, 400, { error: { code: 'bad-request', message: 'Request body is not a JSON object.' } })
            return
          }
          const text = typeof (parsed as { text?: unknown }).text === 'string'
            ? (parsed as { text: string }).text
            : ''
          if (text.trim() === '') {
            sendError(res, 400, { error: { code: 'bad-request', message: 'A non-empty `text` string is required.' } })
            return
          }
          const summary = await summarizeForSpeech(ctx, text)
          if (summary === undefined) {
            sendError(res, 503, errorBodyOf(new TtsError('not-configured', 'No model is available to summarize; the client falls back to the offline brief.')))
            return
          }
          const body: TtsSummaryResult = { summary }
          sendJson(res, 200, body)
        })()
      },
    }), `dsh-mimo-speak: POST ${MIMOSPEAK_SUMMARY_PATH}`)

    // Health check: speak a fixed sentence with the live configuration and
    // report which engine answered and how long the first audio took.
    child.effect(() => child.webServer.register({
      kind: 'exact',
      path: MIMOSPEAK_TEST_PATH,
      handler: (req, res) => {
        if (fence(req, res)) return
        if (req.method !== 'POST') {
          sendError(res, 405, { error: { code: 'bad-request', message: 'POST only.' } })
          return
        }
        void (async () => {
          const engine = await resolveEngineSnapshot(ctx, config)
          const probe: TtsSynthesizeRequest = { text: '你好，这是连接测试。' }
          const startedAt = Date.now()
          try {
            const wav = await synthesizeSpeech(engine, probe)
            const result: TtsTestResult = {
              ok: true,
              engine: 'mimo',
              latencyMs: Date.now() - startedAt,
              audioBytes: wav.length,
              voice: engine.voice,
              model: engine.model,
            }
            sendJson(res, 200, result)
          } catch (error) {
            const failure = toFailure(error)
            if (config.fallbackEngine.get() === 'edge') {
              try {
                const mp3 = await synthesizeEdge(probe.text, config.edgeVoice.get(), engine.timeoutMs)
                const result: TtsTestResult = {
                  ok: true,
                  engine: 'edge',
                  latencyMs: Date.now() - startedAt,
                  audioBytes: mp3.length,
                  voice: config.edgeVoice.get() ?? DEFAULT_EDGE_VOICE,
                }
                sendJson(res, 200, result)
                return
              } catch (edgeError) {
                const edgeFailure = toFailure(edgeError)
                sendError(res, errorStatusOf(edgeFailure), errorBodyOf(new TtsError(
                  edgeFailure.code,
                  `MiMo failed (${failure.message}); Edge fallback also failed (${edgeFailure.message}).`,
                )))
                return
              }
            }
            sendError(res, errorStatusOf(failure), errorBodyOf(failure))
          }
        })()
      },
    }), `dsh-mimo-speak: POST ${MIMOSPEAK_TEST_PATH}`)

    // Parse a request's query string without trusting Node's URL parsing of a
    // possibly-relative req.url; a dummy base makes it absolute.
    const readQuery = (req: IncomingMessage): URLSearchParams => {
      const url = new URL(req.url ?? '', 'http://localhost')
      return url.searchParams
    }

    // GET lists the history; POST synthesizes and persists a new version.
    child.effect(() => child.webServer.register({
      kind: 'exact',
      path: MIMOSPEAK_RECORDINGS_PATH,
      handler: (req, res) => {
        if (fence(req, res)) return
        if (req.method === 'GET') {
          void listRecordings().then((index: TtsRecordingsIndex) => sendJson(res, 200, index))
          return
        }
        if (req.method !== 'POST') {
          sendError(res, 405, { error: { code: 'bad-request', message: 'GET or POST only.' } })
          return
        }
        void (async () => {
          const parsed = await readJsonBody(req)
          if (parsed === undefined) {
            sendError(res, 400, { error: { code: 'bad-request', message: 'Request body is not a JSON object.' } })
            return
          }
          const request = parsed as Partial<TtsSynthesizeRequest>
          if (typeof request.text !== 'string' || request.text.trim() === '') {
            sendError(res, 400, { error: { code: 'bad-request', message: 'A non-empty `text` string is required.' } })
            return
          }
          const engine = await resolveEngineSnapshot(ctx, config)
          try {
            const wav = await synthesizeSpeech(engine, {
              text: request.text,
              style: typeof request.style === 'string' ? request.style : undefined,
              voice: typeof request.voice === 'string' ? request.voice : undefined,
            })
            const style = (typeof request.style === 'string' ? request.style : '').trim() || engine.style
            const voice = (typeof request.voice === 'string' ? request.voice : '').trim() || engine.voice
            const { recording, version } = await addVersion(
              request.text, style || undefined, voice || undefined, engine.model, wav,
            )
            res.statusCode = 200
            res.setHeader('content-type', 'audio/wav')
            res.setHeader('cache-control', 'no-store')
            res.setHeader(MIMOSPEAK_RECORDING_HEADER, Buffer.from(JSON.stringify({ recId: recording.id, verId: version.id })).toString('base64'))
            res.end(Buffer.from(wav))
          } catch (error) {
            const failure = error instanceof TtsError
              ? error
              : new TtsError('upstream-error', error instanceof Error ? error.message : String(error))
            const status = failure.code === 'not-configured' ? 503
              : failure.code === 'bad-request' || failure.code === 'text-too-long' ? 400
                : failure.code === 'timeout' ? 504
                  : 502
            sendError(res, status, { error: { code: failure.code, message: failure.message } })
          }
        })()
      },
    }), `dsh-mimo-speak: ${MIMOSPEAK_RECORDINGS_PATH}`)

    // Re-synthesize a recording's text with the engine's current settings and
    // append a new version; older takes are preserved for comparison.
    child.effect(() => child.webServer.register({
      kind: 'exact',
      path: `${MIMOSPEAK_RECORDINGS_PATH}/resynth`,
      handler: (req, res) => {
        if (fence(req, res)) return
        if (req.method !== 'POST') {
          sendError(res, 405, { error: { code: 'bad-request', message: 'POST only.' } })
          return
        }
        const recId = readQuery(req).get('rec')
        if (recId === null) {
          sendError(res, 400, { error: { code: 'bad-request', message: 'The `rec` query is required.' } })
          return
        }
        void (async () => {
          const index = await listRecordings()
          const recording = index.entries.find(entry => entry.id === recId)
          if (recording === undefined) {
            sendError(res, 404, { error: { code: 'bad-request', message: 'Unknown recording.' } })
            return
          }
          const engine = await resolveEngineSnapshot(ctx, config)
          try {
            const wav = await synthesizeSpeech(engine, { text: recording.text })
            const added = await resynthesize(
              recId, engine.style || undefined, engine.voice || undefined, engine.model, wav,
            )
            if (added === undefined) {
              sendError(res, 404, { error: { code: 'bad-request', message: 'Recording vanished.' } })
              return
            }
            sendJson(res, 200, { recId: added.recording.id, verId: added.version.id })
          } catch (error) {
            const failure = error instanceof TtsError
              ? error
              : new TtsError('upstream-error', error instanceof Error ? error.message : String(error))
            const status = failure.code === 'not-configured' ? 503
              : failure.code === 'timeout' ? 504
                : 502
            sendError(res, status, { error: { code: failure.code, message: failure.message } })
          }
        })()
      },
    }), `dsh-mimo-speak: ${MIMOSPEAK_RECORDINGS_PATH}/resynth`)

    // Delete one version (file + index entry).
    child.effect(() => child.webServer.register({
      kind: 'exact',
      path: `${MIMOSPEAK_RECORDINGS_PATH}/version`,
      handler: (req, res) => {
        if (fence(req, res)) return
        if (req.method !== 'DELETE') {
          sendError(res, 405, { error: { code: 'bad-request', message: 'DELETE only.' } })
          return
        }
        const recId = readQuery(req).get('rec')
        const verId = readQuery(req).get('ver')
        if (recId === null || verId === null) {
          sendError(res, 400, { error: { code: 'bad-request', message: 'The `rec` and `ver` queries are required.' } })
          return
        }
        void deleteVersion(recId, verId).then((ok: boolean) => {
          if (!ok) {
            sendError(res, 404, { error: { code: 'bad-request', message: 'Unknown recording or version.' } })
            return
          }
          res.statusCode = 204
          res.end()
        })
      },
    }), `dsh-mimo-speak: ${MIMOSPEAK_RECORDINGS_PATH}/version`)

    // Serve one version's WAV. Authorization is the index, not the path, so a
    // request can only reach a version that actually exists.
    child.effect(() => child.webServer.register({
      kind: 'exact',
      path: `${MIMOSPEAK_RECORDINGS_PATH}/file`,
      handler: (req, res) => {
        if (fence(req, res)) return
        if (req.method !== 'GET') {
          sendError(res, 405, { error: { code: 'bad-request', message: 'GET only.' } })
          return
        }
        const recId = readQuery(req).get('rec')
        const verId = readQuery(req).get('ver')
        if (recId === null || verId === null) {
          sendError(res, 400, { error: { code: 'bad-request', message: 'The `rec` and `ver` queries are required.' } })
          return
        }
        void (async () => {
          if (!(await hasVersion(recId, verId))) {
            sendError(res, 404, { error: { code: 'bad-request', message: 'Unknown recording or version.' } })
            return
          }
          try {
            const data = await readFile(versionFilePath(recId, verId))
            res.statusCode = 200
            res.setHeader('content-type', 'audio/wav')
            res.setHeader('cache-control', 'no-store')
            res.end(data)
          } catch {
            sendError(res, 404, { error: { code: 'bad-request', message: 'File missing on disk.' } })
          }
        })()
      },
    }), `dsh-mimo-speak: ${MIMOSPEAK_RECORDINGS_PATH}/file`)
  })
}

/** JSON body size limit; settings and one speak request are small. */
const MAX_BODY_BYTES = 1024 * 1024

/**
 * Read one JSON object request body under the size limit.
 * @param req - inbound request.
 * @returns the parsed object, or undefined when the body is absent, oversized,
 * malformed, or not a JSON object.
 */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  if (chunks.length === 0) return undefined
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}
