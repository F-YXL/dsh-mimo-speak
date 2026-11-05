/**
 * Live end-to-end check of the plugin's synthesis engine against the real MiMo
 * platform. Requires a real API key in the environment (it is used for one
 * request and never printed):
 *
 *   MIMO_API_KEY=sk-... node scripts/live-e2e.mjs [output.wav]
 *
 * The engine path exercised here is exactly what the Host's
 * `POST /api/mimo-speak/synthesize` route runs: normalize → request → decode →
 * WAV wrap.
 */

import { writeFile } from 'node:fs/promises'
import { isRiffWav } from '../lib/node/wav.js'
import { resolveEngineConfig, synthesizeSpeech } from '../lib/node/tts.js'

const apiKey = (process.env.MIMO_API_KEY ?? '').trim()
if (apiKey === '') {
  console.error('live-e2e: set MIMO_API_KEY in the environment first.')
  process.exit(1)
}

const outPath = process.argv[2] ?? 'live-e2e.wav'
const config = resolveEngineConfig({ apiKey })
console.log(`live-e2e: POST ${config.baseUrl}/chat/completions (model ${config.model}, voice ${config.voice})`)
const wav = await synthesizeSpeech(config, {
  text: '# 你好\n\n这是 **MiMo 语音合成** 的实机验证。',
  style: '开心',
})
if (!isRiffWav(wav)) {
  console.error('live-e2e: FAILED — payload is not a WAV container.')
  process.exit(2)
}
await writeFile(outPath, wav)
console.log(`live-e2e: ok — ${wav.length} bytes written to ${outPath}`)
