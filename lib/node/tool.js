/**
 * Agent tool: text → speech WAV inside the session workspace.
 *
 * The tool only produces a file. Turning it into an actual voice message is the
 * channel's job (on QQ that is `the channel's voice-send tool`), so this plugin stays
 * free of any IM-specific knowledge.
 *
 * Output goes to `<session cwd>/tts/`: channel-side发送工具通常只接受工作区内的
 * 路径，写到别处（比如本插件的录音目录）会被拒绝。
 * @module dsh-mimo-speak/tool
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
/** Tool name: mimo-tts-say.
export const SAY_TOOL = 'mimo-tts-say';
/** 合成产物在会话工作区里的子目录。 */
export const SPEECH_DIR = 'tts';
/**
 * 语音文件名：`speech-<YYYYMMDD-HHmmss>-<8位随机>.wav`。
 * 带时间戳是为了让工作区里一眼看出先后，随机段防同秒覆盖。
 */
export function speechFileName(now = Date.now(), id = randomUUID()) {
    const stamp = new Date(now).toISOString().replace(/\.\d{3}Z$/, '').replace(/[-:]/g, '').replace('T', '-');
    return `speech-${stamp}-${id.replace(/-/g, '').slice(0, 8)}.wav`;
}
/**
 * 规范 44 字节头 WAV 的时长（毫秒）。不是这个布局就返回 0，
 * 不猜——宁可少给一个数字，也不给模型一个错的时长。
 */
export function wavDurationMs(bytes) {
    if (bytes.length < 44)
        return 0;
    const ascii = (offset, text) => {
        for (let index = 0; index < text.length; index += 1) {
            if (bytes[offset + index] !== text.charCodeAt(index))
                return false;
        }
        return true;
    };
    if (!ascii(0, 'RIFF') || !ascii(8, 'WAVE') || !ascii(36, 'data'))
        return 0;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const channels = view.getUint16(22, true);
    const sampleRate = view.getUint32(24, true);
    const bitsPerSample = view.getUint16(34, true);
    const dataSize = view.getUint32(40, true);
    if (channels === 0 || sampleRate === 0 || bitsPerSample === 0 || dataSize === 0)
        return 0;
    const frames = dataSize / ((bitsPerSample / 8) * channels);
    return Math.round((frames / sampleRate) * 1000);
}
/** 工具定义：执行一次「合成 → 落盘」。 */
export function createSayTool(deps) {
    return {
        name: SAY_TOOL,
        description: '把一段文字合成语音，写到当前会话工作区的 tts/ 目录，返回 wav 的绝对路径。'
            + '用户要求「用语音回我 / 念出来」，或这段内容本身适合朗读时用它；平时的回复还是用文字，不要每条都合成。'
            + '它只产出文件——要让用户真的听到，得把返回的 path 交给当前聊天渠道的发语音工具'
            + '（QQ 通道上是 the channel's voice-send tool）。',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                text: {
                    type: 'string',
                    description: '要念出来的文字。支持多段，但会被截到设置的 maxChars；代码块与 markdown 会被清理成可朗读文本。',
                },
                voice: {
                    type: 'string',
                    description: '可选：临时换一个预置音色。不传就用插件页配置卡片里的默认音色（或克隆音色）。',
                },
                style: {
                    type: 'string',
                    description: '可选：说话风格，比如「开心」「语速慢」「东北话」。不传就用插件页配置卡片里的默认风格。',
                },
            },
            required: ['text'],
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    path: { type: 'string' },
                    bytes: { type: 'number' },
                    durationMs: { type: 'number' },
                },
                required: ['path', 'bytes', 'durationMs'],
            },
            render: (_args, value) => [
                {
                    type: 'text',
                    text: `已合成语音：${value.path}（${value.bytes} 字节，约 ${(value.durationMs / 1000).toFixed(1)} 秒）。`
                        + '文件已写进工作区，还没发出去——要发就把它交给发语音的工具。',
                },
            ],
        },
        async execute(args, exec) {
            const shape = (exec ?? {});
            const cwd = shape.agent?.session?.header?.cwd;
            if (typeof cwd !== 'string' || cwd === '') {
                throw new Error('拿不到当前会话的工作区，语音文件没地方写。');
            }
            const input = (args ?? {});
            const text = typeof input.text === 'string' ? input.text.trim() : '';
            if (text === '')
                throw new Error('缺少要念的文本（text）。');
            const voice = typeof input.voice === 'string' && input.voice.trim() !== '' ? input.voice.trim() : undefined;
            const style = typeof input.style === 'string' && input.style.trim() !== '' ? input.style.trim() : undefined;
            shape.signal?.throwIfAborted?.();
            const request = { text, ...(voice === undefined ? {} : { voice }), ...(style === undefined ? {} : { style }) };
            const outcome = await deps.synthesize(request);
            shape.signal?.throwIfAborted?.();
            const dir = join(cwd, SPEECH_DIR);
            await mkdir(dir, { recursive: true });
            const path = join(dir, speechFileName());
            await writeFile(path, outcome.wav);
            deps.log?.(`[mimo-speak] 合成语音 ${path}（${outcome.wav.length} 字节）`);
            return { path, bytes: outcome.wav.length, durationMs: wavDurationMs(outcome.wav) };
        },
    };
}
//# sourceMappingURL=tool.js.map