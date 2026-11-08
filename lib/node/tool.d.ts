/**
 * Agent tool: text → speech WAV inside the session workspace.
 *
 * The tool only produces a file. Turning it into an actual voice message is the
 * chat channel's job (each channel ships its own voice-send tool), so this
 * plugin stays free of any IM-specific knowledge.
 *
 * Output goes to `<session cwd>/tts/`: channel-side发送工具通常只接受工作区内的
 * 路径，写到别处（比如本插件的录音目录）会被拒绝。
 * @module dsh-mimo-speak/tool
 */
/** Tool name: `<vendor>-tts-say`, kept distinct from a chat channel's own voice tools. */
export declare const SAY_TOOL = "mimo-tts-say";
/** 合成产物在会话工作区里的子目录。 */
export declare const SPEECH_DIR = "tts";
/** 一个合成请求（与 Web 路由收到的是同一形状）。 */
export interface SayRequest {
    text: string;
    voice?: string;
    style?: string;
}
/** 一次合成产物 + 实际生效的音色/风格。 */
export interface SayOutcome {
    wav: Uint8Array;
    model: string;
    style: string;
    voice: string;
}
export interface SayToolDeps {
    synthesize(request: SayRequest): Promise<SayOutcome>;
    log?(message: string): void;
}
/**
 * 语音文件名：`speech-<YYYYMMDD-HHmmss>-<8位随机>.wav`。
 * 带时间戳是为了让工作区里一眼看出先后，随机段防同秒覆盖。
 */
export declare function speechFileName(now?: number, id?: string): string;
/**
 * 规范 44 字节头 WAV 的时长（毫秒）。不是这个布局就返回 0，
 * 不猜——宁可少给一个数字，也不给模型一个错的时长。
 */
export declare function wavDurationMs(bytes: Uint8Array): number;
/** 工具定义：执行一次「合成 → 落盘」。 */
export declare function createSayTool(deps: SayToolDeps): {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    output: Record<string, unknown>;
    execute(args: unknown, exec: unknown): Promise<{
        path: string;
        bytes: number;
        durationMs: number;
    }>;
};
