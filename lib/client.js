window.__ModuleLoader__.load({
	id: "dsh-mimo-speak",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		// src/settings.ts
		/**
		* Settings and route vocabulary shared by the Host and browser halves.
		*
		* Both bundles inline this file, so it must stay pure: constants and types
		* only, no Node or DOM APIs. The namespace is the profile entry id the bundle
		* patch inserts (`cordis.patch.yml`), and the route paths are the seam the two
		* halves meet on.
		* @module dsh-mimo-speak/settings
		*/
		/** Settings namespace: the profile entry id of this plugin's loader row. */
		const MIMOSPEAK_NAMESPACE = "mimo-speak";
		/**
		* Key this plugin's configuration card registers under on the Plugins page's
		* `plugins.bundle.config` keyed slot: the bundle's npm package name, which is
		* the keying convention the Plugins page fixes for bundle-owned configuration
		* (the page dispatches with `entryKey: pkg.name`).
		*/
		const MIMOSPEAK_PACKAGE_KEY = "dsh-mimo-speak";
		/** Route prefix owned by this plugin on `ctx.webServer`. */
		const MIMOSPEAK_API_PREFIX = "/api/mimo-speak";
		/** `GET` route reporting the resolved engine configuration without secrets. */
		const MIMOSPEAK_STATUS_PATH = `${MIMOSPEAK_API_PREFIX}/status`;
		/** `POST` route synthesizing one text into WAV audio. */
		const MIMOSPEAK_SYNTHESIZE_PATH = `${MIMOSPEAK_API_PREFIX}/synthesize`;
		/** `POST` route streaming one text as raw PCM chunks (SSE). */
		const MIMOSPEAK_SYNTHESIZE_STREAM_PATH = `${MIMOSPEAK_API_PREFIX}/synthesize-stream`;
		/** `POST` route running a short round-trip health check against the engine. */
		const MIMOSPEAK_TEST_PATH = `${MIMOSPEAK_API_PREFIX}/test`;
		/** POST text → a short spoken summary (used by the brief read scope). */
		const MIMOSPEAK_SUMMARY_PATH = `${MIMOSPEAK_API_PREFIX}/summary`;
		/** MiMo platform endpoint base; `/chat/completions` is appended. */
		const DEFAULT_BASE_URL = "https://api.xiaomimimo.com/v1";
		/** MiMo TTS model id. */
		const DEFAULT_MODEL = "mimo-v2.5-tts";
		/** Preset voice used when no clone sample is configured. */
		const DEFAULT_VOICE = "mimo_default";
		/** Longest text one synthesis accepts, in characters. */
		const DEFAULT_MAX_CHARS = 2e3;
		const DEFAULT_FALLBACK_ENGINE = "none";
		/** Default Edge-TTS voice (the user's preferred Xiaoxiao). */
		const DEFAULT_EDGE_VOICE = "zh-CN-XiaoxiaoNeural";
		const DEFAULT_READ_SCOPE = "smart";
		/** Sample sentence the settings page's audition button speaks. */
		const AUDITION_TEXT = "你好，这是 MiMo 语音合成的试听效果。";
		/** Route prefix for persisted speech history (list / create / file). */
		const MIMOSPEAK_RECORDINGS_PATH = `${MIMOSPEAK_API_PREFIX}/recordings`;
		/**
		* Response header carrying the new recording identity. Its value is the
		* base64 encoding of `JSON.stringify({ recId, verId })` so it survives the
		* `audio/wav` body that the synthesize route streams back.
		*/
		const MIMOSPEAK_RECORDING_HEADER = "x-mimo-speak-recording";
		// src/client/api.ts
		/**
		* Browser → Host calls for speech synthesis.
		*
		* Both halves share their route vocabulary through `src/settings.ts`; the
		* browser sends text and receives WAV bytes, so the MiMo API key never enters
		* the page. Failures arrive as stable codes the UI maps to localized copy.
		* @module dsh-mimo-speak/client/api
		*/
		/** A synthesize failure carrying the Host's stable code. */
		var TtsClientError = class extends Error {
			code;
			/**
			* @param code - stable failure code; `generic` when the Host gave none.
			* @param message - Host-supplied detail, safe to show.
			*/
			constructor(code, message) {
				super(message);
				this.code = code;
				this.name = "TtsClientError";
			}
		};
		/**
		* Read the answering engine off an audio response.
		*
		* The Host answers MiMo synthesis as `audio/wav` and the Edge fallback as
		* `audio/mpeg`, so the content type is the honest signal: the client can say
		* "the fallback voice is reading this" instead of switching voices silently.
		* @param blob - the audio response body.
		* @returns the engine that produced it.
		*/
		function speechEngineOf(blob) {
			return blob.type.includes("mpeg") ? "edge" : "mimo";
		}
		/**
		* Ask the Host for a short spoken summary of one reply.
		*
		* Used by the brief read scope: summarizing first and speaking the summary is
		* what "简要播报" should mean, instead of mechanically picking sentences.
		* @param text - the reply text to condense.
		* @param signal - aborts the request when the reader stops.
		* @returns the summary text.
		*/
		async function requestSummary(text, signal) {
			let response;
			try {
				response = await fetch(MIMOSPEAK_SUMMARY_PATH, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ text }),
					...signal === void 0 ? {} : { signal }
				});
			} catch (cause) {
				throw new TtsClientError("generic", cause instanceof Error ? cause.message : String(cause));
			}
			if (!response.ok) {
				let code = "generic";
				let message = `summary request failed with HTTP ${response.status}`;
				try {
					const body = await response.json();
					if (typeof body.error?.code === "string") code = body.error.code;
					if (typeof body.error?.message === "string") message = body.error.message;
				} catch {}
				throw new TtsClientError(code, message);
			}
			const body = await response.json();
			if (typeof body.summary !== "string" || body.summary.trim() === "") throw new TtsClientError("generic", "The summary route returned no text.");
			return body.summary.trim();
		}
		async function fetchTtsStatus() {
			const response = await fetch(MIMOSPEAK_STATUS_PATH, {
				method: "GET",
				cache: "no-store"
			});
			if (!response.ok) throw new TtsClientError("generic", `status request failed with HTTP ${response.status}`);
			return await response.json();
		}
		/**
		* Synthesize one text into playable WAV audio.
		* @param request - text and optional style/voice overrides (settings-page
		* audition previews unsaved values through these).
		* @param signal - aborts the request when the reader stops.
		* @returns the WAV payload as a Blob ready for `URL.createObjectURL`.
		* @throws {TtsClientError} when the Host refuses or the transport fails.
		*/
		async function requestSpeech(request, signal) {
			let response;
			try {
				response = await fetch(MIMOSPEAK_SYNTHESIZE_PATH, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(request),
					...signal === void 0 ? {} : { signal }
				});
			} catch (error) {
				throw new TtsClientError("generic", error instanceof Error ? error.message : String(error));
			}
			if (response.ok) return await response.blob();
			let code = "generic";
			let message = `synthesize request failed with HTTP ${response.status}`;
			try {
				const body = await response.json();
				if (typeof body.error?.code === "string") code = body.error.code;
				if (typeof body.error?.message === "string") message = body.error.message;
			} catch {}
			throw new TtsClientError(code, message);
		}
		/**
		* Stream one text as raw PCM chunks and feed each chunk to `onChunk`.
		*
		* The Host answers with `text/event-stream`; every `data:` line carries one
		* JSON object with either a `pcm` base64 payload, a terminal `done`, or an
		* `error`. The browser decodes and schedules each chunk as it arrives, so the
		* first chunk is playable before the rest of the utterance exists.
		* @param request - text and optional style/voice overrides.
		* @param onChunk - invoked once per decoded PCM chunk, in arrival order.
		* @param signal - aborts the request mid-stream when the reader stops.
		* @returns the terminal stats event.
		* @throws {TtsClientError} when the Host refuses or the transport fails.
		*/
		async function requestSpeechStream(request, onChunk, signal) {
			let response;
			try {
				response = await fetch(MIMOSPEAK_SYNTHESIZE_STREAM_PATH, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(request),
					...signal === void 0 ? {} : { signal }
				});
			} catch (error) {
				throw new TtsClientError("generic", error instanceof Error ? error.message : String(error));
			}
			if (!response.ok) {
				let code = "generic";
				let message = `stream request failed with HTTP ${response.status}`;
				try {
					const failure = await response.json();
					if (typeof failure.error?.code === "string") code = failure.error.code;
					if (typeof failure.error?.message === "string") message = failure.error.message;
				} catch {}
				throw new TtsClientError(code, message);
			}
			const body = response.body;
			if (body === null) throw new TtsClientError("generic", "stream request returned no body.");
			const reader = body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			try {
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					let newlineAt = buffer.indexOf("\n");
					while (newlineAt !== -1) {
						const line = buffer.slice(0, newlineAt).trim();
						buffer = buffer.slice(newlineAt + 1);
						newlineAt = buffer.indexOf("\n");
						if (!line.startsWith("data:")) continue;
						const payloadText = line.slice(5).trim();
						if (payloadText === "") continue;
						let payload;
						try {
							payload = JSON.parse(payloadText);
						} catch {
							continue;
						}
						if (payload.error !== void 0) throw new TtsClientError(typeof payload.error.code === "string" ? payload.error.code : "generic", typeof payload.error.message === "string" ? payload.error.message : "stream failed");
						if (typeof payload.pcm === "string" && payload.pcm !== "") {
							const binary = atob(payload.pcm);
							const bytes = new Uint8Array(binary.length);
							for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
							onChunk(bytes);
						}
						if (payload.done === true) return;
					}
				}
			} finally {
				reader.releaseLock();
			}
		}
		/**
		* Run the Host-side round-trip health check.
		* @returns which engine answered, its latency, and its voice.
		* @throws {TtsClientError} when the Host refuses or both engines fail.
		*/
		async function requestSpeechTest() {
			let response;
			try {
				response = await fetch(MIMOSPEAK_TEST_PATH, { method: "POST" });
			} catch (error) {
				throw new TtsClientError("generic", error instanceof Error ? error.message : String(error));
			}
			if (response.ok) return await response.json();
			let code = "generic";
			let message = `test request failed with HTTP ${response.status}`;
			try {
				const body = await response.json();
				if (typeof body.error?.code === "string") code = body.error.code;
				if (typeof body.error?.message === "string") message = body.error.message;
			} catch {}
			throw new TtsClientError(code, message);
		}
		/**
		* List the persisted speech history.
		* @returns the recordings index (empty when none recorded yet).
		*/
		async function fetchRecordings() {
			const response = await fetch(MIMOSPEAK_RECORDINGS_PATH, {
				method: "GET",
				cache: "no-store"
			});
			if (!response.ok) throw new TtsClientError("generic", `recordings request failed with HTTP ${response.status}`);
			return await response.json();
		}
		/**
		* Synthesize and persist one text, returning both the audio and its identity
		* in history. Used by the speak action so every read-aloud is remembered.
		* @param request - text and optional style/voice overrides.
		* @returns the WAV blob and the new recording reference.
		* @throws {TtsClientError} when the Host refuses or the transport fails.
		*/
		async function requestRecording(request) {
			let response;
			try {
				response = await fetch(MIMOSPEAK_RECORDINGS_PATH, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(request)
				});
			} catch (error) {
				throw new TtsClientError("generic", error instanceof Error ? error.message : String(error));
			}
			if (response.ok) {
				const blob = await response.blob();
				const header = response.headers.get(MIMOSPEAK_RECORDING_HEADER);
				let ref = {
					recId: "",
					verId: ""
				};
				if (header !== null) try {
					ref = JSON.parse(atob(header));
				} catch {}
				return {
					blob,
					ref
				};
			}
			let code = "generic";
			let message = `recording request failed with HTTP ${response.status}`;
			try {
				const body = await response.json();
				if (typeof body.error?.code === "string") code = body.error.code;
				if (typeof body.error?.message === "string") message = body.error.message;
			} catch {}
			throw new TtsClientError(code, message);
		}
		/**
		* Re-synthesize a recording's text with the engine's current settings,
		* appending a new version. Earlier versions stay intact for comparison.
		* @param recId - the recording node id.
		* @returns the new version's reference.
		*/
		async function resynthesizeRecording(recId) {
			let response;
			try {
				response = await fetch(`${MIMOSPEAK_RECORDINGS_PATH}/resynth?rec=${encodeURIComponent(recId)}`, { method: "POST" });
			} catch (error) {
				throw new TtsClientError("generic", error instanceof Error ? error.message : String(error));
			}
			if (response.ok) return await response.json();
			let message = `re-synthesis failed with HTTP ${response.status}`;
			try {
				const body = await response.json();
				if (typeof body.error?.message === "string") message = body.error.message;
			} catch {}
			throw new TtsClientError("generic", message);
		}
		/**
		* Delete one version from history.
		* @param recId - the recording node id.
		* @param verId - the version id to remove.
		*/
		async function deleteRecordingVersion(recId, verId) {
			const response = await fetch(`${MIMOSPEAK_RECORDINGS_PATH}/version?rec=${encodeURIComponent(recId)}&ver=${encodeURIComponent(verId)}`, { method: "DELETE" });
			if (!response.ok && response.status !== 204) throw new TtsClientError("generic", `delete failed with HTTP ${response.status}`);
		}
		/**
		* The URL serving one version's WAV file.
		* @param recId - the recording node id.
		* @param verId - the version id.
		* @returns an absolute path under the plugin's recordings route.
		*/
		function recordingFileUrl(recId, verId) {
			return `${MIMOSPEAK_RECORDINGS_PATH}/file?rec=${encodeURIComponent(recId)}&ver=${encodeURIComponent(verId)}`;
		}
		// src/brief.ts
		/**
		* Extractive briefing for long replies.
		*
		* A spoken reply does not need every caveat a written one carries: the point of
		* read-aloud is to know what happened. The rule is deliberately mechanical, so
		* the result is predictable and fits in one sentence:
		*
		* **一段一行，只念每段的第一句；整篇只有一段时念前几句。**
		*
		* Table rows, bare links, code notes and horizontal rules are skipped, because
		* reading them aloud conveys nothing. Nothing is invented and no model is
		* called, so a brief always agrees with the reply it came from.
		* @module dsh-mimo-speak/brief
		*/
		/** Terminators that really end a sentence. */
		const STRONG_TERMINATORS = /* @__PURE__ */ new Set([
			"。",
			"！",
			"？",
			"；",
			"!",
			"?",
			";",
			"…"
		]);
		/** Leading decoration that exists for the screen, not the ear. */
		const DECORATION = /^[\s#>]*[-+*•·]?\s*/u;
		/** Whole lines that carry no speakable meaning in a brief. */
		const SKIPPED_LINE = /^(?:-{3,}|\*{3,}|_{3,}|代码略[。.]?|code omitted[.]?)$/iu;
		/**
		* Split one block into sentences, keeping each terminator.
		* @param block - one non-empty line of speakable text.
		* @returns its sentences, in order.
		*/
		function sentencesOf(block) {
			const out = [];
			let buffer = "";
			for (const character of block) {
				buffer += character;
				if (STRONG_TERMINATORS.has(character)) {
					out.push(buffer.trim());
					buffer = "";
				}
			}
			if (buffer.trim() !== "") out.push(buffer.trim());
			return out.filter((sentence) => sentence !== "");
		}
		/**
		* Condense text into its opening points.
		* @param text - speakable plain text (already markdown-normalized).
		* @param limit - soft character budget for the result.
		* @param maxSentences - hard cap on spoken sentences.
		* @param prefix - optional lead-in spoken before the brief (e.g. 「简要播报」).
		* @returns the briefed text; the input itself when it is already short.
		*/
		function briefText(text, limit = 260, maxSentences = 6, prefix = "") {
			const blocks = text.split("\n").filter((line) => {
				const trimmed = line.trim();
				if (trimmed === "") return false;
				if (trimmed.startsWith("|")) return false;
				if (SKIPPED_LINE.test(trimmed)) return false;
				if (/^https?:\/\/\S+$/u.test(trimmed)) return false;
				return true;
			}).map((line) => line.replace(/(\*\*|__|~~)/gu, "").replace(/[*_]([^*_\n]+)[*_]/gu, "$1").replace(DECORATION, "").trim()).filter((line) => line !== "");
			if (blocks.length === 0) return "";
			const whole = blocks.join("\n");
			if (whole.length <= limit) return whole;
			const picks = [];
			let used = 0;
			/** @returns whether another sentence still fits. */
			const take = (sentence) => {
				if (picks.length > 0 && used + sentence.length > limit) return false;
				picks.push(sentence);
				used += sentence.length;
				return picks.length < maxSentences;
			};
			if (blocks.length === 1) {
				for (const sentence of sentencesOf(blocks[0])) if (!take(sentence)) break;
			} else for (const block of blocks) {
				const first = sentencesOf(block)[0];
				if (first === void 0) continue;
				if (!take(first)) break;
			}
			const body = picks.join("");
			return prefix === "" ? body : `${prefix}${body}`;
		}
		// src/normalize.ts
		/**
		* Markdown → speakable-text normalization applied Host-side before synthesis.
		*
		* The MiMo TTS endpoint speaks whatever it is given; assistant replies are
		* Markdown, and reading decoration, fences, and URLs aloud is noise. The
		* normalization here is deliberately conservative: it removes presentation
		* markup while keeping the words, and it never invents text.
		* @module dsh-mimo-speak/normalize
		*/
		/** Replacement spoken for a fenced code block (reading code aloud is noise). */
		const CODE_FENCE_NOTE = "代码略。";
		/**
		* Convert assistant Markdown into text worth speaking aloud.
		*
		* Removes fenced code (kept as a short spoken note), inline-code markers,
		* heading/list/quote markers, emphasis markers, tables (cells joined with
		* commas), images, HTML tags, and link targets (the anchor text stays).
		* @param markdown - raw assistant reply text.
		* @returns plain text suitable for TTS input.
		*/
		function toSpeakableText(markdown) {
			let text = markdown;
			text = text.replace(/```[\s\S]*?```/g, `\n${CODE_FENCE_NOTE}\n`);
			text = text.replace(/~~~[\s\S]*?~~~/g, `\n${CODE_FENCE_NOTE}\n`);
			text = text.replace(/`([^`\n]*)`/g, "$1");
			text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
			text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
			text = text.replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1");
			text = text.replace(/^\[[^\]]*\]:\s+\S+.*$/gmu, "");
			text = text.replace(/<\/?[a-zA-Z][^>\n]*>/g, "");
			text = text.replace(/^#{1,6}\s+/gmu, "");
			text = text.replace(/^\s*(?:[-*+]|\d+[.)])\s+/gmu, "");
			text = text.replace(/^\s*>\s?/gmu, "");
			text = text.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gmu, "\n");
			text = text.replace(/^\|?[\s:|-]+\|[\s:|-]*$/gmu, "");
			text = text.replace(/\s*\|\s*/g, "，");
			text = text.replace(/(\*\*|__|~~)/g, "");
			text = text.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "$1");
			text = text.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "$1");
			text = text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1");
			text = text.replace(/[ \t]+/g, " ");
			text = text.split("\n").map((line) => line.trim()).filter((line) => line !== "").join("\n");
			return text.trim();
		}
		// src/client/audio-bus.ts
		/**
		* One pause registry for every player this plugin owns.
		*
		* The plugin plays audio through three different engines — the chunk queue
		* (`<audio>` elements), the progressive PCM stream (`AudioContext`), and the
		* settings-page sample player. Each used to keep its own module-local registry,
		* so a stream starting while a queued reply played left both audible. Routing
		* every engine through this one bus means starting audio anywhere pauses
		* everything else, whichever engine produced it.
		* @module dsh-mimo-speak/client/audio-bus
		*/
		/** Pause callbacks keyed by the owning player's identity token. */
		const pausers = /* @__PURE__ */ new Map();
		/**
		* Register one player's pause control.
		* @param token - the player's stable identity (a ref object or Audio element).
		* @param pause - stops that player without toggling its state.
		* @returns a disposer that unregisters the player.
		*/
		function registerAudioPauser(token, pause) {
			pausers.set(token, pause);
			return () => {
				pausers.delete(token);
			};
		}
		/**
		* Pause every registered player except the caller.
		* @param self - the caller's identity token, left untouched.
		*/
		function pauseOtherAudio(self) {
			for (const [token, pause] of pausers) {
				if (token === self) continue;
				try {
					pause();
				} catch {}
			}
		}
		/**
		* Listeners told when page code starts capturing microphone audio.
		*
		* Reading aloud while the microphone is open is self-defeating: the recorder
		* captures the assistant's own voice and the transcript comes back as the
		* reply it just spoke. The official voice-input bundle records through
		* `getUserMedia`, so watching that one call covers any recorder — no coupling
		* to another plugin's internals, and no cooperation needed from it.
		*/
		const captureListeners = /* @__PURE__ */ new Set();
		/** Whether `getUserMedia` is already wrapped in this page. */
		let captureWatchInstalled = false;
		/**
		* Subscribe to microphone capture starts.
		* @param listener - called once per successful audio capture request.
		* @returns the unsubscribe function.
		*/
		function onAudioCaptureStart(listener) {
			captureListeners.add(listener);
			installCaptureWatch();
			return () => {
				captureListeners.delete(listener);
			};
		}
		/** Wrap `getUserMedia` once per page, leaving its behavior untouched. */
		function installCaptureWatch() {
			if (captureWatchInstalled) return;
			const devices = navigator.mediaDevices;
			if (devices === void 0 || typeof devices.getUserMedia !== "function") return;
			captureWatchInstalled = true;
			const original = devices.getUserMedia.bind(devices);
			devices.getUserMedia = async (constraints) => {
				const stream = await original(constraints);
				if (!(constraints?.audio !== void 0 && constraints.audio !== false)) return stream;
				for (const listener of captureListeners) try {
					listener();
				} catch {}
				return stream;
			};
		}
		// src/client/chat-text.ts
		/** Code blocks shorter than this many lines are worth speaking in smart mode. */
		const SMART_CODE_LINE_LIMIT = 24;
		/** Whether a block contributes text under the active read scope. */
		function blockIncluded(block, scope) {
			if (block.kind === "text") return true;
			if (scope === "text" || scope === "brief") return false;
			if (block.kind !== "code") return false;
			if (scope === "all") return true;
			return block.text.split("\n").length <= SMART_CODE_LINE_LIMIT && block.text.length <= 1200;
		}
		/**
		* Extract the speakable text of one finalized assistant message.
		* @param snapshot - current Chat snapshot of the viewed Session.
		* @param messageId - durable identity of the target assistant message.
		* @param scope - which parts of the reply are read aloud.
		* @returns the message's text blocks joined in order, or undefined when the
		* message is not in the loaded window.
		*/
		function speakableTextFor(snapshot, messageId, scope = "text") {
			const matches = [];
			for (const node of snapshot.nodes.values()) {
				if (node.kind !== "assistant-step") continue;
				const candidate = node;
				const data = candidate.data;
				const blocks = data.finalNode?.blocks ?? data.blocks;
				if (data.finalNode?.messageId !== messageId) continue;
				const text = blocks.filter((block) => blockIncluded(block, scope)).map((block) => block.text).join("\n").trim();
				matches.push({
					anchorSeq: candidate.anchorSeq,
					visibility: candidate.visibility,
					text
				});
			}
			if (matches.length === 0) return void 0;
			return (matches.find((match) => match.visibility === "visible") ?? matches[0]).text;
		}
		/**
		* Identify the newest finalized assistant message in the Chat snapshot.
		*
		* Automatic read-aloud only ever speaks this message, so a reply that
		* finished while the user scrolled up, or an older reply re-rendered for any
		* other reason, never steals the speaker.
		* @param snapshot - current Chat snapshot of the viewed Session.
		* @returns the message id of the newest assistant step, or an empty string.
		*/
		function latestAssistantMessageId(snapshot) {
			let latestSeq = -1;
			let latestId = "";
			for (const node of snapshot.nodes.values()) {
				if (node.kind !== "assistant-step") continue;
				const candidate = node;
				const id = candidate.data.finalNode?.messageId;
				if (typeof id !== "string" || id === "") continue;
				if (candidate.anchorSeq > latestSeq) {
					latestSeq = candidate.anchorSeq;
					latestId = id;
				}
			}
			return latestId;
		}
		// src/client/highlight.ts
		/**
		* Sentence highlighting for the speak entry.
		*
		* While a chunk plays, the sentence it came from is tinted inside the message
		* bubble. The highlighter walks the message's text nodes once, indexes their
		* letters/digits (a normalization that survives Markdown and inline styles),
		* and maps each chunk text back to DOM ranges through the CSS Custom
		* Highlight API — so no DOM is mutated and scroll position never jumps.
		*
		* When the API is unavailable the highlighter silently no-ops.
		* @module dsh-mimo-speak/client/highlight
		*/
		const STYLE_ID = "dsh-mimo-speak-highlight-style";
		const HIGHLIGHT_NAME = "dsh-mimo-speak-sentence";
		/**
		* The instance that most recently painted. Every instance writes the same
		* highlight name, so a clear() from a stale instance — an older message
		* finishing while the new one speaks — would otherwise wipe the live paint.
		*/
		let owner = null;
		/** Whether the browser supports the CSS Custom Highlight API. */
		function highlightSupported() {
			return typeof window !== "undefined" && typeof window.CSS !== "undefined" && window.CSS.highlights !== void 0 && typeof window.Highlight === "function";
		}
		function ensureStyle() {
			if (typeof document === "undefined" || document.getElementById(STYLE_ID) !== null) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = `::highlight(${HIGHLIGHT_NAME}){background-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#ffc400) 26%,transparent)}`;
			document.head.appendChild(style);
		}
		/** Keep only letters and digits, case-folded, so matching ignores Markdown. */
		function keyChar(char) {
			const code = char.codePointAt(0);
			if (code === void 0) return "";
			if (code >= 48 && code <= 57 || code >= 97 && code <= 122) return char;
			if (code >= 65 && code <= 90) return char.toLowerCase();
			if (code >= 19968 && code <= 40959) return char;
			if (/\p{L}/u.test(char) || /\p{N}/u.test(char)) return char.normalize("NFC").toLowerCase();
			return "";
		}
		/** Build the folded key plus per-key source offsets for one string. */
		function keyOf(text) {
			let key = "";
			const at = [];
			for (let index = 0; index < text.length; index += 1) {
				const folded = keyChar(text[index]);
				if (folded === "") continue;
				key += folded;
				at.push(index);
			}
			return {
				key,
				at
			};
		}
		/**
		* Locate the message bubble containing the speak button, by walking up from
		* the button until an ancestor's text carries the opening of the spoken text.
		* @param fromEl - the action row element (or any descendant of the bubble).
		* @param probeText - the speakable text whose opening identifies the bubble.
		* @returns the closest matching ancestor, or null.
		*/
		function findMessageContainer(fromEl, probeText) {
			if (fromEl === null || typeof document === "undefined") return null;
			const probe = keyOf(probeText.slice(0, 80)).key.slice(0, 40);
			if (probe === "") return null;
			let element = fromEl.parentElement;
			for (let depth = 0; element !== null && depth < 14; depth += 1, element = element.parentElement) if (keyOf(element.textContent ?? "").key.includes(probe)) return element;
			return null;
		}
		/** Highlight one sentence of one message while it plays. */
		var SentenceHighlighter = class {
			container;
			token = {};
			nodes = [];
			map = [];
			key = "";
			/** Text length the index was built from; a re-render invalidates it. */
			indexedSignature = "";
			constructor(container) {
				this.container = container ?? document.body;
				if (highlightSupported()) ensureStyle();
			}
			/** Whether any highlight can actually be painted. */
			get supported() {
				return highlightSupported();
			}
			/** Index the message's text nodes, rebuilding when the text changed. */
			index() {
				const signature = `${this.container.textContent?.length ?? -1}`;
				if (this.indexedSignature === signature) return;
				this.indexedSignature = signature;
				this.nodes.length = 0;
				this.map.length = 0;
				this.key = "";
				const walker = document.createTreeWalker(this.container, NodeFilter.SHOW_TEXT, { acceptNode: (node) => {
					const parent = node.parentElement;
					if (parent === null) return NodeFilter.FILTER_REJECT;
					const tag = parent.tagName;
					if (tag === "SCRIPT" || tag === "STYLE" || tag === "BUTTON" || tag === "PRE") return NodeFilter.FILTER_REJECT;
					if (parent.closest(".mimo-speak-root") !== null) return NodeFilter.FILTER_REJECT;
					if ((node.nodeValue ?? "").trim() === "") return NodeFilter.FILTER_REJECT;
					return NodeFilter.FILTER_ACCEPT;
				} });
				let node;
				while ((node = walker.nextNode()) !== null) {
					const text = node.nodeValue ?? "";
					const { key, at } = keyOf(text);
					if (key === "") continue;
					this.nodes.push({
						node,
						text,
						keyLength: at.length
					});
					for (let index = 0; index < at.length; index += 1) this.map.push([this.nodes.length - 1, at[index]]);
					this.key += key;
				}
			}
			/**
			* Paint the sentence `text` onto the message, searching from the key offset
			* `from` so repeated phrases highlight their later occurrence.
			* @param text - one chunk (a substring of the message).
			* @param from - key offset to search from.
			* @returns the key offset just past the painted range (feed it back next).
			*/
			show(text, from) {
				if (!highlightSupported()) return from;
				try {
					this.index();
					const { key } = keyOf(text);
					if (key === "" || this.key === "") return from;
					let start = this.key.indexOf(key, Math.max(0, from));
					if (start < 0) start = this.key.indexOf(key);
					if (start < 0) return from;
					const end = start + key.length;
					if (start >= this.map.length || end > this.map.length) return from;
					const first = this.map[start];
					const last = this.map[end - 1];
					const range = new Range();
					range.setStart(this.nodes[first[0]].node, first[1]);
					range.setEnd(this.nodes[last[0]].node, last[1] + 1);
					const highlight = new Highlight(range);
					owner = this.token;
					window.CSS.highlights.set(HIGHLIGHT_NAME, highlight);
					return end;
				} catch {
					return from;
				}
			}
			/** Remove the painted sentence, unless another instance owns it now. */
			clear() {
				if (!highlightSupported()) return;
				if (owner !== null && owner !== this.token) return;
				owner = null;
				try {
					window.CSS.highlights.delete(HIGHLIGHT_NAME);
				} catch {}
			}
		};
		// src/client/PlayerBar.tsx
		/**
		* The compact player bar: play/pause, a draggable progress track, and the
		* position/duration readout.
		*
		* The track is a `role="slider"` surface — pointer drag with capture,
		* click-to-seek, and arrow-key seeking — so the progress bar is operable
		* without a pointer. Dragging seeks continuously: WAV playback from an object
		* URL repositions cheaply, and the thumb follows the pointer instead of
		* lagging behind it.
		* @module dsh-mimo-speak/client/PlayerBar
		*/
		/** Format seconds as `m:ss` (clamped at zero; durations are short). */
		function clock(seconds) {
			const whole = Math.max(0, Math.floor(seconds));
			const minutes = Math.floor(whole / 60);
			const remainder = whole % 60;
			return `${String(minutes)}:${remainder < 10 ? "0" : ""}${String(remainder)}`;
		}
		/**
		* Render one player bar.
		* @param props - playback state, controls, and localized names.
		* @returns the play control, the seekable track, and the time readout.
		*/
		function PlayerBar({ state, onToggle, onSeek, labels, seekable = true, compact = false }) {
			const trackRef = (0, react.useRef)(null);
			const [dragging, setDragging] = (0, react.useState)(false);
			const duration = state.duration > 0 ? state.duration : 0;
			const ratio = duration > 0 ? Math.min(1, state.currentTime / duration) : 0;
			/** @param clientX - pointer x in viewport coordinates. @returns the seek target in seconds. */
			const positionAt = (0, react.useCallback)((clientX) => {
				const track = trackRef.current;
				if (track === null) return 0;
				const bounds = track.getBoundingClientRect();
				return (bounds.width > 0 ? Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)) : 0) * duration;
			}, [duration]);
			const playButton = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "mimo-speak-barButton",
				"aria-label": state.playing ? labels.pause : labels.play,
				onClick: onToggle,
				children: state.playing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPauseOutlineRegular, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlayOutlineRegular, { size: 14 })
			});
			if (compact) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "mimo-speak-bar mimo-speak-barCompact",
				children: playButton
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mimo-speak-bar",
				children: [
					playButton,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: trackRef,
						className: dragging ? "mimo-speak-track mimo-speak-trackDragging" : seekable ? "mimo-speak-track" : "mimo-speak-track mimo-speak-trackStatic",
						role: "slider",
						tabIndex: seekable ? 0 : -1,
						"aria-label": labels.progress,
						"aria-valuemin": 0,
						"aria-valuemax": Math.max(0, Math.round(duration)),
						"aria-valuenow": Math.round(state.currentTime),
						"aria-valuetext": `${clock(state.currentTime)} / ${clock(duration)}`,
						onPointerDown: seekable ? (event) => {
							event.currentTarget.setPointerCapture(event.pointerId);
							setDragging(true);
							onSeek(positionAt(event.clientX));
						} : void 0,
						onPointerMove: seekable ? (event) => {
							if (!dragging) return;
							onSeek(positionAt(event.clientX));
						} : void 0,
						onPointerUp: seekable ? (event) => {
							if (!dragging) return;
							setDragging(false);
							if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
							onSeek(positionAt(event.clientX));
						} : void 0,
						onPointerCancel: seekable ? () => {
							setDragging(false);
						} : void 0,
						onKeyDown: seekable ? (event) => {
							const step = event.shiftKey ? 15 : 5;
							if (event.key === "ArrowRight" || event.key === "ArrowUp") {
								event.preventDefault();
								onSeek(state.currentTime + step);
							} else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
								event.preventDefault();
								onSeek(state.currentTime - step);
							} else if (event.key === "Home") {
								event.preventDefault();
								onSeek(0);
							} else if (event.key === "End" && duration > 0) {
								event.preventDefault();
								onSeek(duration);
							}
						} : void 0,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "mimo-speak-fill",
							style: { width: `${(ratio * 100).toFixed(2)}%` }
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "mimo-speak-thumb",
							style: { left: `${(ratio * 100).toFixed(2)}%` }
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "mimo-speak-time",
						children: [clock(state.currentTime), seekable ? ` / ${clock(duration)}` : ""]
					})
				]
			});
		}
		// src/client/speech-cache.ts
		/** Entries kept before the oldest are revoked. */
		const CACHE_CAP = 60;
		const cache = /* @__PURE__ */ new Map();
		const order = [];
		/**
		* Build the cache key for one chunk.
		* @param signature - how the current configuration sounds.
		* @param text - the chunk text.
		* @returns a key that changes whenever the sound or the words do.
		*/
		function speechCacheKey(signature, text) {
			return [
				signature.voice,
				signature.model,
				signature.style,
				signature.baseUrl,
				signature.edgeVoice,
				String(signature.maxChars),
				text
			].join("\0");
		}
		/**
		* Look one chunk up.
		* @param key - from `speechCacheKey`.
		* @returns the cached audio, when present.
		*/
		function cachedSpeech(key) {
			return cache.get(key);
		}
		/**
		* Store one chunk, dropping the oldest entries past the cap.
		* @param key - from `speechCacheKey`.
		* @param value - the object URL and its engine.
		*/
		function cacheSpeech(key, value) {
			if (cache.has(key)) return;
			cache.set(key, value);
			order.push(key);
			while (order.length > CACHE_CAP) {
				const oldest = order.shift();
				if (oldest === void 0) break;
				const stale = cache.get(oldest);
				cache.delete(oldest);
				if (stale !== void 0) URL.revokeObjectURL(stale.url);
			}
		}
		/**
		* Drop every cached chunk.
		*
		* Called after a settings save: the user just asked for different audio, so
		* replaying anything cached under the previous configuration would quietly
		* ignore the change.
		*/
		function clearSpeechCache() {
			for (const value of cache.values()) URL.revokeObjectURL(value.url);
			cache.clear();
			order.length = 0;
		}
		// src/client/split-speech.ts
		/**
		* Sentence-aligned text splitting for pipelined playback.
		*
		* The browser splits already-normalized speakable text into chunks around a
		* configured size, then synthesizes and plays them back-to-back while the next
		* chunk is still being produced. Splitting at sentence boundaries keeps chunks
		* sounding natural; a sentence longer than the budget is hard-split at a
		* punctuation or whitespace seam.
		* @module dsh-mimo-speak/client/split-speech
		*/
		/** Characters that end a spoken sentence. */
		const SENTENCE_END = "。！？!?；;…\n";
		/** Longest tolerated chunk before a sentence is hard-split. */
		function clampChunkChars(value) {
			if (!Number.isFinite(value)) return 120;
			return Math.min(1e3, Math.max(20, Math.round(value)));
		}
		/**
		* Hard-split one over-long sentence at punctuation seams, preferring the
		* second half of the budget so the tail of each chunk stays natural.
		* @param piece - one sentence that exceeds the chunk budget.
		* @param limit - chunk size in characters.
		* @returns the sentence broken into budget-sized pieces.
		*/
		function hardSplit(piece, limit) {
			const parts = [];
			let rest = piece;
			while (rest.length > limit) {
				let cut = -1;
				const floor = Math.floor(limit * .5);
				for (let index = Math.min(limit, rest.length - 1); index > floor; index -= 1) {
					const char = rest.charAt(index);
					if (char === " " || char === "\n" || char === "," || char === "，" || char === "、") {
						cut = index + 1;
						break;
					}
				}
				if (cut <= 0) cut = limit;
				parts.push(rest.slice(0, cut));
				rest = rest.slice(cut);
			}
			if (rest.length > 0) parts.push(rest);
			return parts;
		}
		/**
		* Split normalized speakable text into ordered chunks at sentence boundaries.
		*
		* @param text - plain text, already stripped of Markdown by the Host's
		* normalizer; this function only partitions it for playback.
		* @param chunkChars - target chunk size in characters.
		* @returns speakable chunks, each non-empty and at most `chunkChars` long
		* except when a single unbroken sentence must be hard-split.
		*/
		function splitForSpeech(text, chunkChars) {
			const trimmed = (text ?? "").trim();
			if (trimmed.length === 0) return [];
			const limit = clampChunkChars(chunkChars);
			const sentences = [];
			let buffer = "";
			for (let index = 0; index < trimmed.length; index += 1) {
				const char = trimmed.charAt(index);
				buffer += char;
				if (SENTENCE_END.indexOf(char) >= 0) {
					sentences.push(buffer);
					buffer = "";
				}
			}
			if (buffer.length > 0) sentences.push(buffer);
			const chunks = [];
			let current = "";
			for (const sentence of sentences) {
				if (sentence.trim().length === 0) continue;
				if (sentence.length > limit) {
					if (current.trim().length > 0) {
						chunks.push(current.trim());
						current = "";
					}
					for (const part of hardSplit(sentence, limit)) if (part.trim().length > 0) chunks.push(part.trim());
					continue;
				}
				if (current.length + sentence.length > limit && current.trim().length > 0) {
					chunks.push(current.trim());
					current = "";
				}
				current += sentence;
			}
			if (current.trim().length > 0) chunks.push(current.trim());
			return chunks.filter((chunk) => chunk.length > 0);
		}
		// src/client/SpeakerIcon.tsx
		const Artwork = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: size,
			height: size,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true",
			focusable: "false",
			className,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M2.5 6h2.1L8 3.2v9.6L4.6 10H2.5a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5z",
					fill: "currentColor"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M10.2 5.6a3.4 3.4 0 0 1 0 4.8",
					stroke: "currentColor",
					strokeWidth: "1.2",
					strokeLinecap: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M12.6 3.6a6.6 6.6 0 0 1 0 8.8",
					stroke: "currentColor",
					strokeWidth: "1.2",
					strokeLinecap: "round",
					opacity: "0.65"
				})
			]
		});
		/** Regular one-pixel volume artwork. */
		const IconVolumeOutlineRegular = (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Artwork, { ...props });
		// src/client/use-audio-queue.ts
		/**
		* The pipelined playback engine behind the speak entry: one hidden
		* `HTMLAudioElement` fed from a queue of chunk object URLs, so the next chunk
		* is already waiting when the current one ends and playback runs back-to-back.
		*
		* Starting this player pauses every other player this plugin owns through the
		* shared audio bus, so a stream and a queued reply never overlap.
		* @module dsh-mimo-speak/client/use-audio-queue
		*/
		const IDLE$2 = {
			playing: false,
			currentTime: 0,
			duration: 0,
			ended: false
		};
		/**
		* Bind one hidden audio element to a queue of chunk URLs.
		* @returns playback state plus enqueue/clear/toggle/seek/pause controls.
		*/
		function useAudioQueue() {
			const [state, setState] = (0, react.useState)(IDLE$2);
			const elementRef = (0, react.useRef)(null);
			const queueRef = (0, react.useRef)([]);
			/** Set once the queue runs dry mid-stream, so a late enqueue resumes play. */
			const waitingRef = (0, react.useRef)(false);
			const publish = (0, react.useCallback)((patch) => {
				setState((previous) => ({
					...previous,
					...patch
				}));
			}, []);
			const loadNext = (0, react.useCallback)(() => {
				const audio = elementRef.current;
				if (audio === null) return;
				const url = queueRef.current.shift();
				if (url === void 0) {
					waitingRef.current = true;
					publish({
						ended: true,
						playing: false,
						currentTime: 0
					});
					return;
				}
				waitingRef.current = false;
				audio.src = url;
				audio.play().catch(() => {
					publish({ playing: false });
				});
			}, [publish]);
			(0, react.useEffect)(() => {
				const audio = new Audio();
				elementRef.current = audio;
				const onTime = () => {
					publish({ currentTime: audio.currentTime });
				};
				const onLoaded = () => {
					publish({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
				};
				const onPlay = () => {
					pauseOtherAudio(audio);
					publish({
						playing: true,
						ended: false
					});
				};
				const onPause = () => {
					publish({ playing: false });
				};
				const onEnded = () => {
					publish({
						playing: false,
						currentTime: 0
					});
					loadNext();
				};
				audio.addEventListener("timeupdate", onTime);
				audio.addEventListener("loadedmetadata", onLoaded);
				audio.addEventListener("durationchange", onLoaded);
				audio.addEventListener("play", onPlay);
				audio.addEventListener("pause", onPause);
				audio.addEventListener("ended", onEnded);
				setState({
					playing: false,
					currentTime: 0,
					duration: 0,
					ended: false
				});
				const unregister = registerAudioPauser(audio, () => {
					audio.pause();
				});
				return () => {
					unregister();
					audio.pause();
					audio.removeAttribute("src");
					audio.load();
					audio.removeEventListener("timeupdate", onTime);
					audio.removeEventListener("loadedmetadata", onLoaded);
					audio.removeEventListener("durationchange", onLoaded);
					audio.removeEventListener("play", onPlay);
					audio.removeEventListener("pause", onPause);
					audio.removeEventListener("ended", onEnded);
					elementRef.current = null;
				};
			}, [loadNext, publish]);
			return {
				state,
				enqueue: (0, react.useCallback)((url) => {
					queueRef.current.push(url);
					const audio = elementRef.current;
					if (audio === null) return;
					if (audio.src === "" || waitingRef.current) loadNext();
				}, [loadNext]),
				clear: (0, react.useCallback)(() => {
					queueRef.current = [];
					waitingRef.current = false;
					const audio = elementRef.current;
					if (audio === null) return;
					audio.pause();
					audio.removeAttribute("src");
					audio.load();
					publish({
						playing: false,
						currentTime: 0,
						duration: 0,
						ended: false
					});
				}, [publish]),
				toggle: (0, react.useCallback)(() => {
					const audio = elementRef.current;
					if (audio === null) return;
					if (audio.paused) {
						pauseOtherAudio(audio);
						if (audio.ended) audio.currentTime = 0;
						audio.play().catch(() => {
							publish({ playing: false });
						});
					} else audio.pause();
				}, [publish]),
				seek: (0, react.useCallback)((seconds) => {
					const audio = elementRef.current;
					if (audio === null) return;
					const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
					const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
					audio.currentTime = target;
					publish({
						currentTime: target,
						ended: false
					});
				}, [publish]),
				pause: (0, react.useCallback)(() => {
					const audio = elementRef.current;
					if (audio !== null) audio.pause();
				}, [])
			};
		}
		// src/client/use-stream-player.ts
		/**
		* Progressive PCM playback behind the speak entry's streaming path.
		*
		* The Host streams one utterance as raw 24 kHz / 16-bit / mono PCM chunks; each
		* chunk is converted to an `AudioBuffer` and scheduled back-to-back on one
		* `AudioContext`, so the first chunk is audible within a second while later
		* chunks keep arriving. Seek is not supported (the stream is transient), so
		* this player exposes the same `AudioPlayerState` surface minus seeking.
		*
		* A module-local registry of pause callbacks mirrors `use-audio-queue.ts`, so
		* starting one player pauses any other audio this plugin owns.
		* @module dsh-mimo-speak/client/use-stream-player
		*/
		/** MiMo streams 24 kHz mono PCM; the context renders at the native rate. */
		const PCM_SAMPLE_RATE = 24e3;
		const IDLE$1 = {
			playing: false,
			currentTime: 0,
			duration: 0,
			ended: false
		};
		/**
		* Bind one `AudioContext` to a stream of PCM chunks.
		* @returns playback state plus feed/finish/clear/toggle/pause controls.
		*/
		function useStreamPlayer() {
			const [state, setState] = (0, react.useState)(IDLE$1);
			const ctxRef = (0, react.useRef)(null);
			const sourcesRef = (0, react.useRef)([]);
			/** Context time the next chunk starts at. */
			const nextAtRef = (0, react.useRef)(0);
			/** Context time the current playback run started. */
			const startedAtRef = (0, react.useRef)(0);
			/** Seconds already played before the last pause. */
			const playedBeforePauseRef = (0, react.useRef)(0);
			const finishedRef = (0, react.useRef)(false);
			const playingRef = (0, react.useRef)(false);
			const tickRef = (0, react.useRef)(null);
			/** Total scheduled audio, in seconds; survives pause/resume. */
			const totalDurationRef = (0, react.useRef)(0);
			const publish = (0, react.useCallback)((patch) => {
				setState((previous) => ({
					...previous,
					...patch
				}));
			}, []);
			/** Identity this player registers with the shared audio bus. */
			const token = (0, react.useMemo)(() => ({}), []);
			const clearTick = (0, react.useCallback)(() => {
				if (tickRef.current !== null) {
					window.clearInterval(tickRef.current);
					tickRef.current = null;
				}
			}, []);
			const syncProgress = (0, react.useCallback)(() => {
				const ctx = ctxRef.current;
				if (ctx === null || !playingRef.current) return;
				const elapsed = Math.max(0, ctx.currentTime - startedAtRef.current);
				publish({ currentTime: playedBeforePauseRef.current + elapsed });
			}, [publish]);
			const startTick = (0, react.useCallback)(() => {
				clearTick();
				tickRef.current = window.setInterval(syncProgress, 200);
			}, [clearTick, syncProgress]);
			const ensureCtx = (0, react.useCallback)(() => {
				if (ctxRef.current === null) ctxRef.current = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
				return ctxRef.current;
			}, []);
			const stopSources = (0, react.useCallback)(() => {
				for (const source of sourcesRef.current) try {
					source.stop();
				} catch {}
				sourcesRef.current = [];
			}, []);
			const maybeEnded = (0, react.useCallback)(() => {
				if (!finishedRef.current || !playingRef.current) return;
				if (sourcesRef.current.length > 0) return;
				const ctx = ctxRef.current;
				const total = totalDurationRef.current;
				if (playedBeforePauseRef.current + (ctx !== null ? Math.max(0, ctx.currentTime - startedAtRef.current) : 0) >= total - .05) {
					playingRef.current = false;
					clearTick();
					publish({
						playing: false,
						ended: true,
						currentTime: 0
					});
				}
			}, [clearTick, publish]);
			const feed = (0, react.useCallback)((pcm) => {
				const ctx = ensureCtx();
				let resumePromise = Promise.resolve();
				if (!playingRef.current) {
					playingRef.current = true;
					finishedRef.current = false;
					playedBeforePauseRef.current = 0;
					totalDurationRef.current = 0;
					startedAtRef.current = ctx.currentTime + .08;
					nextAtRef.current = startedAtRef.current;
					pauseOtherAudio(token);
					resumePromise = ctx.state === "suspended" ? ctx.resume().catch(() => {}) : Promise.resolve();
					startTick();
				}
				const length = Math.floor(pcm.length / 2);
				if (length === 0) return;
				const floats = new Float32Array(length);
				const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
				for (let index = 0; index < length; index += 1) floats[index] = view.getInt16(index * 2, true) / 32768;
				const buffer = ctx.createBuffer(1, length, PCM_SAMPLE_RATE);
				buffer.copyToChannel(floats, 0);
				const source = ctx.createBufferSource();
				source.buffer = buffer;
				source.connect(ctx.destination);
				const when = Math.max(nextAtRef.current, ctx.currentTime + .02);
				source.start(when);
				nextAtRef.current = when + buffer.duration;
				totalDurationRef.current += buffer.duration;
				sourcesRef.current.push(source);
				source.onended = () => {
					sourcesRef.current = sourcesRef.current.filter((item) => item !== source);
					maybeEnded();
				};
				publish({
					playing: ctx.state === "running",
					ended: false,
					duration: totalDurationRef.current
				});
				if (ctx.state !== "running") resumePromise.then(() => {
					if (playingRef.current) publish({ playing: ctx.state === "running" });
				});
			}, [
				ensureCtx,
				maybeEnded,
				publish,
				startTick,
				token
			]);
			const finish = (0, react.useCallback)(() => {
				finishedRef.current = true;
				maybeEnded();
			}, [maybeEnded]);
			const clear = (0, react.useCallback)(() => {
				stopSources();
				playingRef.current = false;
				finishedRef.current = false;
				totalDurationRef.current = 0;
				clearTick();
				publish(IDLE$1);
			}, [
				clearTick,
				publish,
				stopSources
			]);
			const toggle = (0, react.useCallback)(() => {
				const ctx = ensureCtx();
				if (playingRef.current) {
					if (ctx.state === "suspended") {
						ctx.resume().catch(() => {});
						return;
					}
					ctx.suspend().catch(() => {});
					const elapsed = Math.max(0, ctx.currentTime - startedAtRef.current);
					playedBeforePauseRef.current += elapsed;
					clearTick();
					publish({ playing: false });
					return;
				}
				ctx.resume().catch(() => {});
				startedAtRef.current = ctx.currentTime;
				playingRef.current = true;
				finishedRef.current = finishedRef.current && sourcesRef.current.length === 0;
				startTick();
				publish({
					playing: true,
					ended: false
				});
			}, [
				clearTick,
				ensureCtx,
				publish,
				startTick
			]);
			const pause = (0, react.useCallback)(() => {
				const ctx = ctxRef.current;
				if (ctx === null || !playingRef.current) return;
				if (ctx.state === "suspended") {
					clearTick();
					publish({ playing: false });
					return;
				}
				const elapsed = Math.max(0, ctx.currentTime - startedAtRef.current);
				playedBeforePauseRef.current += elapsed;
				ctx.suspend().catch(() => {});
				clearTick();
				publish({ playing: false });
			}, [clearTick, publish]);
			const pauseRef = (0, react.useRef)(pause);
			pauseRef.current = pause;
			(0, react.useEffect)(() => registerAudioPauser(token, () => {
				pauseRef.current();
			}), [token]);
			(0, react.useEffect)(() => () => {
				stopSources();
				clearTick();
				const ctx = ctxRef.current;
				if (ctx !== null) ctx.close().catch(() => {});
				ctxRef.current = null;
			}, [clearTick, stopSources]);
			return {
				state,
				feed,
				finish,
				clear,
				toggle,
				pause,
				scheduled: (0, react.useCallback)(() => totalDurationRef.current, [])
			};
		}
		// src/client/SpeakAction.tsx
		/**
		* The speak entry in the finalized assistant message's action strip: a volume
		* button that synthesizes the message with MiMo TTS, and — once audio exists —
		* a floating mini player with a draggable progress bar.
		*
		* Long replies are synthesized as a pipeline: the text is split at sentence
		* boundaries into small chunks, the first chunk starts playing as soon as it
		* lands, and the remaining chunks synthesize in the background while audio
		* plays, so the first sound arrives in seconds regardless of length.
		*
		* The button lives exactly where the platform keeps per-message actions
		* (between copy and branch). The player floats below the icon row so the row's
		* 28px chrome never reflows; while a player is open the strip stops fading on
		* hover-out (`styles.ts`), so audio stays visible wherever the pointer goes.
		* @module dsh-mimo-speak/client/SpeakAction
		*/
		/**
		* Map a failure onto the dictionary key the entry shows.
		* @param failure - the synthesis failure, or `empty` for a text-less message.
		* @returns the localized copy key.
		*/
		function errorKeyFor(failure) {
			if (failure === "empty") return "emptyText";
			if (failure === "unconfigured") return "error.notConfigured";
			switch (failure.code) {
				case "not-configured": return "error.notConfigured";
				case "bad-request": return "error.badRequest";
				case "text-too-long": return "error.badRequest";
				case "timeout": return "error.timeout";
				case "upstream-error": return "error.upstream";
				case "invalid-audio": return "error.invalidAudio";
				case "voice-sample-unreadable": return "error.voiceSample";
				default: return "error.generic";
			}
		}
		/** Whether a session snapshot is still producing the reply. */
		function sessionRunning(session) {
			try {
				if (session === null || typeof session !== "object") return false;
				const value = session;
				if (value.running === true) return true;
				return value.status === "running" || value.status === "busy";
			} catch {
				return false;
			}
		}
		/**
		* Call one slot-provided selector hook defensively: an absent hook or a
		* throwing selector resolves to the fallback, so automatic reading silently
		* disables itself rather than crashing the action row.
		*/
		function useHostHook(hook, selector, fallback) {
			if (typeof hook !== "function") return fallback;
			try {
				const value = hook(selector);
				return value === void 0 || value === null ? fallback : value;
			} catch {
				return fallback;
			}
		}
		/**
		* Message ids that automatic reading already handled. Client memory only: a
		* page reload may replay the newest reply once, which beats silently never
		* speaking, and re-renders can never start the same reply twice.
		*/
		const autoReadLog = (() => {
			const seen = /* @__PURE__ */ new Set();
			const order = [];
			return {
				has(id) {
					return id !== "" && seen.has(id);
				},
				mark(id) {
					if (id === "" || seen.has(id)) return;
					seen.add(id);
					order.push(id);
					if (order.length > 200) {
						const oldest = order.shift();
						if (oldest !== void 0) seen.delete(oldest);
					}
				}
			};
		})();
		/**
		* Produce (or reuse) the object URL for one chunk.
		* @param text - one speakable chunk.
		* @param record - persist this chunk to the speech history (single-chunk
		* replies only, so history still captures short read-alouds).
		* @param signature - how the current configuration sounds; part of the key, so
		* a voice/style change never replays the previous take.
		* @param signal - aborts the request when the reader stops.
		* @returns the object URL of the audio and the engine that produced it.
		*/
		async function synthesizeChunkUrl(text, record, signature, signal) {
			const key = speechCacheKey(signature, text);
			const hit = cachedSpeech(key);
			if (hit !== void 0) return hit;
			const blob = record ? (await requestRecording({ text })).blob : await requestSpeech({ text }, signal);
			const chunk = {
				url: URL.createObjectURL(blob),
				engine: speechEngineOf(blob)
			};
			cacheSpeech(key, chunk);
			return chunk;
		}
		/** Keep only the chunks that fit inside the configured total budget. */
		function budgetChunks(chunks, maxChars) {
			const selected = [];
			let budget = Number.isFinite(maxChars) ? Math.max(0, Math.round(maxChars)) : 2e3;
			for (const chunk of chunks) {
				if (budget <= 0) break;
				selected.push(chunk);
				budget -= chunk.length;
			}
			return selected;
		}
		/**
		* Render one message's speak control and open player.
		* @param props - the message identity, the injected engine verbs, the Chat
		* selector hook, and localized copy.
		* @returns the volume button with its optional player and failure notice.
		*/
		function SpeakAction(props) {
			const { messageId, useChat, useStatus, ensureStatus, t } = props;
			const useSession = props.useSession;
			const status = useStatus((snapshot) => snapshot);
			/**
			* Fingerprint of the current voice/model/endpoint. It is part of the replay
			* cache key, so a settings change can never replay the previous take.
			*/
			const signatureRef = (0, react.useRef)({
				voice: "",
				model: "",
				style: "",
				baseUrl: "",
				edgeVoice: "",
				maxChars: 0
			});
			signatureRef.current = {
				voice: status.voice,
				model: status.model,
				style: "",
				baseUrl: status.baseUrl,
				edgeVoice: status.edgeVoice,
				maxChars: status.maxChars
			};
			/** The panel only exists to host the progress bar; without it the button is the control. */
			const showProgressBar = status.progressBar === true;
			const rawText = useChat((snapshot) => speakableTextFor(snapshot, messageId, status.readScope));
			const latestId = useHostHook(useChat, (snapshot) => latestAssistantMessageId(snapshot), "");
			const running = useHostHook(useSession, sessionRunning, false);
			const speakable = (0, react.useMemo)(() => rawText === void 0 ? void 0 : toSpeakableText(rawText), [rawText]);
			const [phase, setPhase] = (0, react.useState)("idle");
			const [failure, setFailure] = (0, react.useState)(null);
			/** The reply exceeded the character budget, so only its opening is spoken. */
			const [truncated, setTruncated] = (0, react.useState)(false);
			const { state: playerState, enqueue: playerEnqueue, clear: playerClear, toggle: playerToggle, seek: playerSeek, pause: playerPause } = useAudioQueue();
			const streamPlayer = useStreamPlayer();
			const [mode, setMode] = (0, react.useState)(null);
			/** Engine that actually answered this read; `edge` means MiMo failed. */
			const [engineUsed, setEngineUsed] = (0, react.useState)(null);
			const activeState = mode === "stream" ? streamPlayer.state : playerState;
			const activeToggle = (0, react.useCallback)(() => {
				if (mode === "stream") streamPlayer.toggle();
				else playerToggle();
			}, [
				mode,
				playerToggle,
				streamPlayer
			]);
			const activePause = (0, react.useCallback)(() => {
				if (mode === "stream") streamPlayer.pause();
				else playerPause();
			}, [
				mode,
				playerPause,
				streamPlayer
			]);
			const activeSeek = (0, react.useCallback)((seconds) => {
				if (mode === "stream") return;
				playerSeek(seconds);
			}, [mode, playerSeek]);
			const clearPlayers = (0, react.useCallback)(() => {
				playerClear();
				streamPlayer.clear();
				cuesRef.current = [];
				cueCursorRef.current = 0;
				keyOffsetRef.current = 0;
				setMode(null);
			}, [playerClear, streamPlayer]);
			/**
			* Stop the current read-aloud for good: abort the stream in flight, drop the
			* scheduled audio, and invalidate the run so no further sentence is asked
			* for. This is the control the speaker button offers while it is playing.
			*/
			/**
			* Pause the current read-aloud and stop asking for the rest of the reply.
			* Whatever is already scheduled stays buffered, so resuming plays that much;
			* `finish()` lets the player report the end once the buffer drains instead of
			* waiting forever for sentences that will never arrive.
			*/
			const pauseRun = (0, react.useCallback)(() => {
				abortRef.current?.abort();
				abortRef.current = null;
				if (mode === "stream") streamPlayer.finish();
				activePause();
			}, [
				activePause,
				mode,
				streamPlayer
			]);
			/** The panel's transport: pause also aborts the sentences still to come. */
			const panelToggle = (0, react.useCallback)(() => {
				if (activeState.playing) pauseRun();
				else activeToggle();
			}, [
				activeState.playing,
				pauseRun,
				activeToggle
			]);
			const stopRun = (0, react.useCallback)(() => {
				abortRef.current?.abort();
				abortRef.current = null;
				sessionRef.current += 1;
				clearPlayers();
				highlighterRef.current?.clear();
				highlighterRef.current = null;
				cuesRef.current = [];
				cueCursorRef.current = 0;
				keyOffsetRef.current = 0;
				setTruncated(false);
				setPhase("idle");
				setFailure(null);
				setPanelOpen(false);
			}, [clearPlayers]);
			const highlighterRef = (0, react.useRef)(null);
			/** Sentence cues: the audio second each chunk starts at, plus its text. */
			const cuesRef = (0, react.useRef)([]);
			/** How many cues the paint effect already consumed. */
			const cueCursorRef = (0, react.useRef)(0);
			/** Folded-key offset of the last painted sentence, so repeats pair up. */
			const keyOffsetRef = (0, react.useRef)(0);
			const [panelOpen, setPanelOpen] = (0, react.useState)(false);
			const [panelSide, setPanelSide] = (0, react.useState)("right");
			const rootRef = (0, react.useRef)(null);
			const buttonRef = (0, react.useRef)(null);
			const panelId = (0, react.useId)();
			const sessionRef = (0, react.useRef)(0);
			/**
			* In-flight synthesis of the current run. Aborting it is what actually stops
			* playback: suspending the AudioContext alone leaves the remaining sentences
			* streaming in behind the pause, and they all land on resume.
			*/
			const abortRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (!panelOpen) return;
				const root = rootRef.current;
				if (root === null) return;
				const bounds = root.getBoundingClientRect();
				setPanelSide(bounds.right + 288 > window.innerWidth ? "left" : "right");
			}, [panelOpen]);
			(0, react.useEffect)(() => {
				if (!panelOpen) return;
				const onPointerDown = (event) => {
					const root = rootRef.current;
					if (root !== null && root.contains(event.target)) return;
					setPanelOpen(false);
				};
				document.addEventListener("pointerdown", onPointerDown);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown);
				};
			}, [panelOpen]);
			const muteWhileRecording = status.muteWhileRecording !== false;
			(0, react.useEffect)(() => {
				if (!muteWhileRecording) return;
				return onAudioCaptureStart(() => {
					stopRun();
				});
			}, [muteWhileRecording, stopRun]);
			(0, react.useEffect)(() => {
				if (!activeState.playing && phase !== "loading") return;
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					stopRun();
					buttonRef.current?.focus();
				};
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [
				activeState.playing,
				phase,
				stopRun
			]);
			const chunkedRun = (0, react.useCallback)(async (gen, chunks, signal) => {
				setMode("queue");
				/** @returns whether this run was cancelled by the reader. */
				const cancelled = () => gen !== sessionRef.current || signal !== void 0 && signal.aborted;
				try {
					let first = true;
					for (let index = 0; index < chunks.length; index += 1) {
						if (cancelled()) return;
						const record = chunks.length === 1;
						const chunkAudio = await synthesizeChunkUrl(chunks[index], record, signatureRef.current, signal);
						if (gen !== sessionRef.current) return;
						if (chunkAudio.engine === "edge") setEngineUsed("edge");
						playerEnqueue(chunkAudio.url);
						if (first) {
							first = false;
							setPhase("ready");
						}
					}
				} catch (error) {
					if (cancelled()) return;
					setPhase("error");
					setFailure(error instanceof TtsClientError ? error : new TtsClientError("generic", String(error)));
				}
			}, [playerEnqueue]);
			const streamRun = (0, react.useCallback)(async (gen, chunks, messageText, signal) => {
				setMode("stream");
				highlighterRef.current?.clear();
				highlighterRef.current = status.highlight ? new SentenceHighlighter(findMessageContainer(rootRef.current, messageText)) : null;
				cuesRef.current = [];
				cueCursorRef.current = 0;
				keyOffsetRef.current = 0;
				/** @returns whether this run was cancelled by the reader. */
				const cancelled = () => gen !== sessionRef.current || signal !== void 0 && signal.aborted;
				let gotFirst = false;
				for (let index = 0; index < chunks.length; index += 1) {
					if (cancelled()) return;
					const chunk = chunks[index];
					let chunkStarted = false;
					try {
						await requestSpeechStream({ text: chunk }, (pcm) => {
							if (gen !== sessionRef.current) return;
							if (!chunkStarted) {
								chunkStarted = true;
								if (!gotFirst) {
									gotFirst = true;
									setPhase("ready");
								}
								cuesRef.current.push({
									at: streamPlayer.scheduled(),
									text: chunk
								});
							}
							streamPlayer.feed(pcm);
						}, signal);
						if (gen !== sessionRef.current) return;
					} catch (error) {
						if (cancelled()) return;
						streamPlayer.clear();
						highlighterRef.current?.clear();
						highlighterRef.current = null;
						cuesRef.current = [];
						cueCursorRef.current = 0;
						await chunkedRun(gen, chunks.slice(index), signal);
						return;
					}
				}
				if (gen !== sessionRef.current) return;
				if (!gotFirst) {
					highlighterRef.current?.clear();
					highlighterRef.current = null;
					await chunkedRun(gen, chunks, signal);
					return;
				}
				streamPlayer.finish();
			}, [
				chunkedRun,
				status.highlight,
				streamPlayer
			]);
			(0, react.useEffect)(() => {
				if (mode !== "stream") return;
				const highlighter = highlighterRef.current;
				if (highlighter === null || !highlighter.supported) return;
				const cues = cuesRef.current;
				const now = activeState.currentTime + .08;
				while (cueCursorRef.current < cues.length && cues[cueCursorRef.current].at <= now) {
					const cue = cues[cueCursorRef.current];
					cueCursorRef.current += 1;
					keyOffsetRef.current = highlighter.show(cue.text, keyOffsetRef.current);
				}
			}, [activeState.currentTime, mode]);
			const runSynthesis = (0, react.useCallback)(async (input) => {
				abortRef.current?.abort();
				const controller = new AbortController();
				abortRef.current = controller;
				const gen = ++sessionRef.current;
				setEngineUsed(null);
				clearPlayers();
				highlighterRef.current?.clear();
				highlighterRef.current = null;
				cuesRef.current = [];
				cueCursorRef.current = 0;
				keyOffsetRef.current = 0;
				setPhase("loading");
				setFailure(null);
				if (status.progressBar === true) setPanelOpen(true);
				let spoken = input;
				if (status.readScope === "brief") {
					const summarized = await requestSummary(input, controller.signal).catch(() => void 0);
					if (controller.signal.aborted || gen !== sessionRef.current) return;
					spoken = summarized ?? briefText(input, 260, 6, t("briefPrefix"));
				}
				const all = splitForSpeech(spoken, status.chunkChars);
				const chunks = budgetChunks(all, status.maxChars);
				setTruncated(chunks.length < all.length);
				if (chunks.length === 0) {
					setPhase("idle");
					setFailure("empty");
					return;
				}
				if (status.hasVoiceSample) {
					chunkedRun(gen, chunks, controller.signal);
					return;
				}
				streamRun(gen, chunks, spoken, controller.signal);
			}, [
				chunkedRun,
				clearPlayers,
				status.chunkChars,
				status.hasVoiceSample,
				status.maxChars,
				status.progressBar,
				status.readScope,
				streamRun,
				t
			]);
			/**
			* Start a read-aloud. Kept stable for the effects: cancellation lives inside
			* `runSynthesis`, so callers can fire and forget.
			*/
			const synthesize = (0, react.useCallback)((input) => {
				runSynthesis(input);
			}, [runSynthesis]);
			(0, react.useEffect)(() => {
				if (activeState.ended) {
					highlighterRef.current?.clear();
					highlighterRef.current = null;
				}
			}, [activeState.ended]);
			const hasAudio = phase === "ready";
			const autoplayBlocked = hasAudio && !activeState.playing && !activeState.ended && activeState.currentTime === 0;
			const onClick = (0, react.useCallback)(() => {
				if (phase === "loading") {
					stopRun();
					return;
				}
				if (hasAudio) {
					if (activeState.ended) {
						if (speakable !== void 0 && speakable !== "") synthesize(speakable);
						return;
					}
					if (!showProgressBar) {
						if (activeState.playing) stopRun();
						else activeToggle();
						return;
					}
					if (!panelOpen) setPanelOpen(true);
					panelToggle();
					return;
				}
				if (speakable === void 0 || speakable === "") {
					setFailure("empty");
					return;
				}
				if (!status.configured) {
					setFailure("unconfigured");
					return;
				}
				synthesize(speakable);
			}, [
				phase,
				hasAudio,
				activeState.playing,
				activeState.ended,
				speakable,
				panelOpen,
				panelToggle,
				showProgressBar,
				status.configured,
				synthesize,
				stopRun
			]);
			const autoRead = status.autoRead === true;
			(0, react.useEffect)(() => {
				if (!autoRead) return;
				if (messageId === "" || messageId !== latestId) return;
				if (running) return;
				if (speakable === void 0 || speakable === "") return;
				if (!status.configured) return;
				if (autoReadLog.has(messageId)) return;
				if (phase !== "idle") return;
				const timer = window.setTimeout(() => {
					if (autoReadLog.has(messageId)) return;
					autoReadLog.mark(messageId);
					synthesize(speakable);
				}, 400);
				return () => window.clearTimeout(timer);
			}, [
				autoRead,
				latestId,
				messageId,
				running,
				speakable,
				phase,
				status.configured,
				synthesize
			]);
			const fallbackNote = engineUsed === "edge";
			const panelVisible = showProgressBar ? panelOpen && (hasAudio || phase === "loading") : hasAudio && (failure !== null || autoplayBlocked || truncated || fallbackNote);
			const buttonLabel = phase === "loading" ? t("synthesize") : activeState.playing ? showProgressBar ? t("pause") : t("stop") : hasAudio ? t("play") : t("speak");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				ref: rootRef,
				className: hasAudio ? "mimo-speak-root mimo-speak-open" : "mimo-speak-root",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: buttonLabel,
						side: "bottom",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							ref: buttonRef,
							type: "button",
							className: phase === "loading" ? "mimo-speak-button mimo-speak-buttonBusy" : "mimo-speak-button",
							"aria-label": buttonLabel,
							"aria-busy": phase === "loading",
							"aria-pressed": activeState.playing,
							"aria-expanded": panelVisible,
							"aria-controls": panelId,
							onClick,
							onMouseEnter: ensureStatus,
							onFocus: ensureStatus,
							children: phase === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "mimo-speak-spin",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutlineRegular, { size: 15 })
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconVolumeOutlineRegular, { size: 15 })
						})
					}),
					failure !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: t(errorKeyFor(failure)),
						side: "bottom",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "mimo-speak-failure",
							role: "img",
							tabIndex: 0,
							"aria-label": t(errorKeyFor(failure)),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningTriangleOutlineRegular, { size: 14 })
						})
					}) : null,
					panelVisible ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						id: panelId,
						className: panelSide === "left" ? "mimo-speak-panel mimo-speak-panelLeft" : "mimo-speak-panel",
						children: [
							phase === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "mimo-speak-panelNote",
								role: "status",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TextShimmer, {
									active: true,
									children: t("synthesize")
								})
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlayerBar, {
								state: activeState,
								onToggle: panelToggle,
								onSeek: activeSeek,
								seekable: mode !== "stream",
								compact: showProgressBar !== true,
								labels: {
									play: t("play"),
									pause: t("pause"),
									progress: t("progress")
								}
							}),
							failure !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-panelStatus",
								role: "status",
								children: t(errorKeyFor(failure))
							}) : null,
							failure === null && autoplayBlocked ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-panelNote",
								role: "status",
								children: t("autoplayHint")
							}) : null,
							failure === null && truncated ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-panelNote",
								role: "status",
								children: t("truncated")
							}) : null,
							failure === null && fallbackNote ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-panelNote",
								role: "status",
								children: t("fallbackUsed")
							}) : null
						]
					}) : null
				]
			});
		}
		// src/client/use-audio-player.ts
		/**
		* The playback engine behind every player this plugin renders: one hidden
		* `HTMLAudioElement` per mounted player, mirrored into React state, with a
		* module-local registry so starting one player pauses the other.
		*
		* The registry is deliberately module-local mutable UI state: it coordinates
		* components of this one plugin bundle and lives in the browser only. Business
		* and transport state stay in the settings namespace and the Host routes.
		* @module dsh-mimo-speak/client/use-audio-player
		*/
		const IDLE = {
			playing: false,
			currentTime: 0,
			duration: 0,
			ended: false
		};
		/**
		* Bind one audio source to playback state and controls.
		*
		* A new `source` replaces the element: the old one pauses and detaches, and
		* playback state returns to zero. Passing null keeps the hook idle.
		* @param source - object URL of the WAV to play, or null.
		* @returns playback state plus the toggle and seek controls.
		*/
		function useAudioPlayer(source) {
			const [state, setState] = (0, react.useState)(IDLE);
			const elementRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (source === null) return;
				const audio = new Audio(source);
				elementRef.current = audio;
				const publish = (patch) => {
					setState((previous) => ({
						...previous,
						...patch
					}));
				};
				const onTime = () => {
					publish({ currentTime: audio.currentTime });
				};
				const onLoaded = () => {
					publish({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
				};
				const onPlay = () => {
					pauseOtherAudio(audio);
					publish({
						playing: true,
						ended: false
					});
				};
				const onPause = () => {
					publish({ playing: false });
				};
				const onEnded = () => {
					publish({
						playing: false,
						ended: true,
						currentTime: 0
					});
				};
				audio.addEventListener("timeupdate", onTime);
				audio.addEventListener("loadedmetadata", onLoaded);
				audio.addEventListener("durationchange", onLoaded);
				audio.addEventListener("play", onPlay);
				audio.addEventListener("pause", onPause);
				audio.addEventListener("ended", onEnded);
				setState({
					playing: false,
					currentTime: 0,
					duration: 0,
					ended: false
				});
				const unregister = registerAudioPauser(audio, () => {
					audio.pause();
				});
				return () => {
					unregister();
					audio.pause();
					audio.removeAttribute("src");
					audio.load();
					audio.removeEventListener("timeupdate", onTime);
					audio.removeEventListener("loadedmetadata", onLoaded);
					audio.removeEventListener("durationchange", onLoaded);
					audio.removeEventListener("play", onPlay);
					audio.removeEventListener("pause", onPause);
					audio.removeEventListener("ended", onEnded);
					elementRef.current = null;
				};
			}, [source]);
			return {
				state,
				toggle: (0, react.useCallback)(() => {
					const audio = elementRef.current;
					if (audio === null) return;
					if (audio.paused) {
						pauseOtherAudio(audio);
						if (audio.ended) audio.currentTime = 0;
						audio.play().catch(() => {
							setState((previous) => ({
								...previous,
								playing: false
							}));
						});
					} else audio.pause();
				}, []),
				seek: (0, react.useCallback)((seconds) => {
					const audio = elementRef.current;
					if (audio === null) return;
					const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
					const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
					audio.currentTime = target;
					setState((previous) => ({
						...previous,
						currentTime: target,
						ended: false
					}));
				}, []),
				pause: (0, react.useCallback)(() => {
					const audio = elementRef.current;
					if (audio !== null) audio.pause();
				}, [])
			};
		}
		// src/client/BundleConfigCard.tsx
		/**
		* The plugin's configuration card on the Plugins page: registered into the
		* `plugins.bundle.config` keyed slot (key = the npm package name), it renders
		* inside the bundle's detail page between its description and its rows. The
		* write-only API key (stored through the host credentials store), the MiMo
		* endpoint, model, voice (preset dropdown or clone sample), default style,
		* request budget — plus a sample player that previews the card's current
		* style and voice, including edits not yet saved.
		*
		* The card renders the shared settings form frame, so saving, discarding,
		* override badges, and read-only/unavailable handling follow the platform's
		* configuration-form conventions exactly. The Plugins page dispatches this
		* slot with `view: 'page'` only, but the entry stays honest about it.
		* @module dsh-mimo-speak/client/BundleConfigCard
		*/
		/**
		* Map the staged draft text onto one of the segmented control's values.
		* @param text - current draft of the `readScope` field.
		* @returns the scope to render as selected.
		*/
		function normalizeScope(text) {
			const value = text.trim();
			return value === "all" || value === "smart" || value === "brief" ? value : "text";
		}
		/**
		* The official preset voices of `mimo-v2.5-tts` (Xiaomi MiMo speech-synthesis
		* docs, 预置音色列表). The voice id is what the API's `audio.voice` takes;
		* the display name is the docs' naming.
		*/
		const PRESET_VOICES = [
			{
				id: "mimo_default",
				name: "MiMo-默认"
			},
			{
				id: "冰糖",
				name: "冰糖"
			},
			{
				id: "茉莉",
				name: "茉莉"
			},
			{
				id: "苏打",
				name: "苏打"
			},
			{
				id: "白桦",
				name: "白桦"
			},
			{
				id: "Mia",
				name: "Mia"
			},
			{
				id: "Chloe",
				name: "Chloe"
			},
			{
				id: "Milo",
				name: "Milo"
			},
			{
				id: "Dean",
				name: "Dean"
			}
		];
		/**
		* Common Edge TTS neural voices for Chinese. The voice id is what the
		* `edge-tts --voice` flag takes; the display name is the voice's familiar
		* name. A saved value outside this list stays selectable as a custom option.
		*/
		const EDGE_VOICES = [
			{
				id: "zh-CN-XiaoxiaoNeural",
				name: "晓晓（女·默认）"
			},
			{
				id: "zh-CN-XiaoyiNeural",
				name: "晓伊（女）"
			},
			{
				id: "zh-CN-XiaoshuangNeural",
				name: "晓双（女·儿童）"
			},
			{
				id: "zh-CN-YunxiNeural",
				name: "云希（男）"
			},
			{
				id: "zh-CN-YunjianNeural",
				name: "云健（男）"
			},
			{
				id: "zh-CN-YunyangNeural",
				name: "云扬（男·新闻）"
			},
			{
				id: "zh-CN-YunxiaNeural",
				name: "云夏（男·少年）"
			},
			{
				id: "zh-CN-liaoning-XiaobeiNeural",
				name: "晓北（东北话）"
			},
			{
				id: "zh-CN-shaanxi-XiaoniNeural",
				name: "晓妮（陕西话）"
			},
			{
				id: "zh-TW-HsiaoChenNeural",
				name: "曉臻（台湾）"
			},
			{
				id: "zh-HK-HiuMaanNeural",
				name: "曉曼（香港）"
			}
		];
		/**
		* Render the plugin's configuration card.
		* @param props - localized copy, the staged form snapshot, and its actions.
		* @returns the configuration form with its sample player, or null for a view
		* this slot does not render (bundle configuration is page-only).
		*/
		function BundleConfigCard({ view, useForm, edit, resetField, save, discard, synthesize, test, t }) {
			const state = useForm((snapshot) => snapshot);
			const [sampleUrl, setSampleUrl] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)(null);
			const [testing, setTesting] = (0, react.useState)(false);
			const [testResult, setTestResult] = (0, react.useState)(null);
			const player = useAudioPlayer(sampleUrl);
			const toggle = player.toggle;
			const autoplay = (0, react.useRef)(false);
			const sampleRef = (0, react.useRef)(null);
			sampleRef.current = sampleUrl;
			(0, react.useEffect)(() => () => {
				if (sampleRef.current !== null) URL.revokeObjectURL(sampleRef.current);
			}, []);
			(0, react.useEffect)(() => {
				if (sampleUrl === null || !autoplay.current) return;
				autoplay.current = false;
				toggle();
			}, [sampleUrl, toggle]);
			const audition = (0, react.useCallback)(() => {
				if (busy) return;
				setBusy(true);
				setFailure(null);
				synthesize({
					text: AUDITION_TEXT,
					style: state.style.text.trim() === "" ? void 0 : state.style.text,
					voice: state.voice.text.trim() === "" ? void 0 : state.voice.text
				}).then((blob) => {
					autoplay.current = true;
					setBusy(false);
					setSampleUrl((previous) => {
						if (previous !== null) URL.revokeObjectURL(previous);
						return URL.createObjectURL(blob);
					});
				}).catch((error) => {
					setBusy(false);
					setFailure(error instanceof TtsClientError ? error : new TtsClientError("generic", String(error)));
				});
			}, [
				busy,
				state.style.text,
				state.voice.text,
				synthesize
			]);
			const runTest = (0, react.useCallback)(() => {
				if (testing) return;
				setTesting(true);
				setTestResult(null);
				test().then((result) => {
					setTesting(false);
					const engine = result.engine === "edge" ? t("engineEdge") : t("engineMimo");
					setTestResult(t("testOk").replace("{engine}", engine).replace("{ms}", String(result.latencyMs)));
				}).catch((error) => {
					setTesting(false);
					setTestResult(`${t("testFailed")}: ${error instanceof TtsClientError ? error.message : String(error)}`);
				});
			}, [
				test,
				testing,
				t
			]);
			if (view !== "page") return null;
			const disabled = !state.writable;
			const failureKey = failure === null ? null : errorKeyFor(failure);
			const voiceDraft = state.voice.text.trim() === "" ? DEFAULT_VOICE : state.voice.text;
			const customVoice = PRESET_VOICES.some((voice) => voice.id === voiceDraft) ? null : voiceDraft;
			const edgeVoiceDraft = state.edgeVoice.text.trim() === "" ? DEFAULT_EDGE_VOICE : state.edgeVoice.text;
			const customEdgeVoice = EDGE_VOICES.some((voice) => voice.id === edgeVoiceDraft) ? null : edgeVoiceDraft;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.SettingsForm, {
				labels: {
					unavailable: t("unavailable"),
					readOnly: t("readOnly"),
					saveFailed: t("saveFailed"),
					save: t("save"),
					saving: t("saving")
				},
				state,
				onSave: save,
				onDiscard: discard,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
						className: "mimo-speak-sectionTitle",
						children: t("sectionConnection")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsSecretField, {
						id: "mimo-speak-api-key",
						label: t("apiKey"),
						hint: t("apiKeyHint"),
						text: state.apiKey.text,
						disabled,
						configured: state.apiKeyConfigured,
						stateLabel: state.apiKeyConfigured ? t("apiKeySet") : t("apiKeyUnset"),
						onEdit: (text) => {
							edit("apiKey", text);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "mimo-speak-auditionHint",
						role: "status",
						style: { marginTop: -6 },
						children: state.apiKeyEnv !== void 0 && state.apiKeyEnv.trim() !== "" ? `${t("apiKeyRef")} ${state.apiKeyEnv}` : t("apiKeyRefDefault")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
						id: "mimo-speak-base-url",
						label: t("baseUrl"),
						hint: t("baseUrlHint"),
						overriddenLabel: t("overridden"),
						resetLabel: t("reset"),
						invalidLabel: t("invalidNumber"),
						disabled,
						...state.baseUrl,
						onEdit: (text) => {
							edit("baseUrl", text);
						},
						onReset: () => {
							resetField("baseUrl");
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
						id: "mimo-speak-model",
						label: t("model"),
						hint: t("modelHint"),
						overriddenLabel: t("overridden"),
						resetLabel: t("reset"),
						invalidLabel: t("invalidNumber"),
						disabled,
						...state.model,
						onEdit: (text) => {
							edit("model", text);
						},
						onReset: () => {
							resetField("model");
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
						className: "mimo-speak-sectionTitle",
						children: t("sectionVoice")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mimo-speak-selectField",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: "mimo-speak-selectLabel",
								htmlFor: "mimo-speak-voice-select",
								children: t("voice")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								id: "mimo-speak-voice-select",
								className: "mimo-speak-select",
								disabled: disabled || state.voiceSamplePath.text.trim() !== "",
								title: state.voiceSamplePath.text.trim() !== "" ? t("voiceHint") : void 0,
								value: voiceDraft,
								onChange: (event) => {
									edit("voice", event.target.value);
								},
								children: [PRESET_VOICES.map((voice) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: voice.id,
									children: voice.id === "mimo_default" ? `${voice.name}（默认）` : voice.name
								}, voice.id)), customVoice !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: customVoice,
									children: customVoice
								}) : null]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-auditionHint",
								children: t("voiceHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
						id: "mimo-speak-voice-sample",
						label: t("voiceSamplePath"),
						hint: t("voiceSamplePathHint"),
						overriddenLabel: t("overridden"),
						resetLabel: t("reset"),
						invalidLabel: t("invalidNumber"),
						disabled,
						...state.voiceSamplePath,
						onEdit: (text) => {
							edit("voiceSamplePath", text);
						},
						onReset: () => {
							resetField("voiceSamplePath");
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
						id: "mimo-speak-style",
						label: t("style"),
						hint: t("styleHint"),
						overriddenLabel: t("overridden"),
						resetLabel: t("reset"),
						invalidLabel: t("invalidNumber"),
						disabled,
						...state.style,
						onEdit: (text) => {
							edit("style", text);
						},
						onReset: () => {
							resetField("style");
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
						className: "mimo-speak-sectionTitle",
						children: t("sectionBehavior")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mimo-speak-selectField",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "mimo-speak-selectLabel",
								children: t("autoRead")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
								checked: state.autoRead.text.trim() === "true",
								onChange: (next) => {
									edit("autoRead", String(next));
								},
								label: t("autoRead"),
								disabled
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-auditionHint",
								children: t("autoReadHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mimo-speak-selectField",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "mimo-speak-selectLabel",
								children: t("fallbackEngine")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SegmentedControl, {
								id: "mimo-speak-fallback",
								value: state.fallbackEngine.text.trim() === "edge" ? "edge" : "none",
								options: [{
									value: "none",
									label: t("fallbackEngineNone")
								}, {
									value: "edge",
									label: t("fallbackEngineEdge")
								}],
								onChange: (next) => {
									edit("fallbackEngine", next);
								},
								label: t("fallbackEngine"),
								disabled
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-auditionHint",
								children: t("fallbackEngineHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mimo-speak-selectField",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: "mimo-speak-selectLabel",
								htmlFor: "mimo-speak-edge-voice-select",
								children: t("edgeVoice")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								id: "mimo-speak-edge-voice-select",
								className: "mimo-speak-select",
								disabled: disabled || state.fallbackEngine.text.trim() !== "edge",
								title: state.fallbackEngine.text.trim() !== "edge" ? t("fallbackEngineHint") : void 0,
								value: edgeVoiceDraft,
								onChange: (event) => {
									edit("edgeVoice", event.target.value);
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("optgroup", {
										label: "普通话",
										children: EDGE_VOICES.filter((voice) => voice.id.startsWith("zh-CN-")).map((voice) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: voice.id,
											children: voice.name
										}, voice.id))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("optgroup", {
										label: "台湾",
										children: EDGE_VOICES.filter((voice) => voice.id.startsWith("zh-TW-")).map((voice) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: voice.id,
											children: voice.name
										}, voice.id))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("optgroup", {
										label: "香港",
										children: EDGE_VOICES.filter((voice) => voice.id.startsWith("zh-HK-")).map((voice) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: voice.id,
											children: voice.name
										}, voice.id))
									}),
									customEdgeVoice !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: customEdgeVoice,
										children: customEdgeVoice
									}) : null
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-auditionHint",
								children: t("edgeVoiceHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mimo-speak-selectField",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "mimo-speak-selectLabel",
								children: t("readScope")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SegmentedControl, {
								id: "mimo-speak-scope",
								value: normalizeScope(state.readScope.text),
								options: [
									{
										value: "brief",
										label: t("readScopeBrief")
									},
									{
										value: "text",
										label: t("readScopeText")
									},
									{
										value: "smart",
										label: t("readScopeSmart")
									},
									{
										value: "all",
										label: t("readScopeAll")
									}
								],
								onChange: (next) => {
									edit("readScope", next);
								},
								label: t("readScope"),
								disabled
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-auditionHint",
								children: t("readScopeHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mimo-speak-selectField",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "mimo-speak-selectLabel",
								children: t("highlight")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
								checked: state.highlight.text.trim() !== "false",
								onChange: (next) => {
									edit("highlight", String(next));
								},
								label: t("highlight"),
								disabled
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-auditionHint",
								children: t("highlightHint")
							})
						]
					}),
					state.supportsMuteWhileRecording ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mimo-speak-selectField",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "mimo-speak-selectLabel",
								children: t("muteWhileRecording")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
								checked: state.muteWhileRecording.text.trim() !== "false",
								onChange: (next) => {
									edit("muteWhileRecording", String(next));
								},
								label: t("muteWhileRecording"),
								disabled
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-auditionHint",
								children: t("muteWhileRecordingHint")
							})
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "mimo-speak-auditionHint",
						children: t("voiceInputNote")
					}),
					state.supportsProgressBar ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mimo-speak-selectField",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "mimo-speak-selectLabel",
								children: t("progressBar")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
								checked: state.progressBar.text.trim() === "true",
								onChange: (next) => {
									edit("progressBar", String(next));
								},
								label: t("progressBar"),
								disabled
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-auditionHint",
								children: t("progressBarHint")
							})
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
						id: "mimo-speak-max-chars",
						label: t("maxChars"),
						hint: t("maxCharsHint"),
						overriddenLabel: t("overridden"),
						resetLabel: t("reset"),
						invalidLabel: t("invalidNumber"),
						numeric: true,
						disabled,
						...state.maxChars,
						onEdit: (text) => {
							edit("maxChars", text);
						},
						onReset: () => {
							resetField("maxChars");
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
						id: "mimo-speak-chunk-chars",
						label: t("chunkChars"),
						hint: t("chunkCharsHint"),
						overriddenLabel: t("overridden"),
						resetLabel: t("reset"),
						invalidLabel: t("invalidNumber"),
						numeric: true,
						disabled,
						...state.chunkChars,
						onEdit: (text) => {
							edit("chunkChars", text);
						},
						onReset: () => {
							resetField("chunkChars");
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
						id: "mimo-speak-timeout",
						label: t("timeoutMs"),
						hint: t("timeoutMsHint"),
						overriddenLabel: t("overridden"),
						resetLabel: t("reset"),
						invalidLabel: t("invalidNumber"),
						numeric: true,
						disabled,
						...state.timeoutMs,
						onEdit: (text) => {
							edit("timeoutMs", text);
						},
						onReset: () => {
							resetField("timeoutMs");
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
						className: "mimo-speak-sectionTitle",
						children: t("sectionAudition")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mimo-speak-audition",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-auditionHint",
								children: t("auditionHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "mimo-speak-auditionRow",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "mimo-speak-auditionButton",
										disabled: busy,
										onClick: audition,
										children: busy ? t("auditioning") : t("audition")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "mimo-speak-auditionButton",
										disabled: testing,
										onClick: runTest,
										children: testing ? t("testing") : t("test")
									}),
									sampleUrl !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlayerBar, {
										state: player.state,
										onToggle: player.toggle,
										onSeek: player.seek,
										labels: {
											play: t("play"),
											pause: t("pause"),
											progress: t("progress")
										}
									}) : null
								]
							}),
							failureKey !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-fieldError",
								role: "status",
								children: t(failureKey)
							}) : null,
							testResult !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "mimo-speak-auditionHint",
								role: "status",
								children: testResult
							}) : null
						]
					})
				]
			});
		}
		// src/client/locales.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "settings.mimo-speak";
		/** English copy. */
		const en = {
			nav: "Speech history",
			speak: "Read aloud",
			synthesize: "Synthesizing…",
			play: "Play",
			pause: "Pause",
			stop: "Stop reading",
			progress: "Playback position",
			emptyText: "This message carries no speakable text.",
			truncated: "The reply is long; only the opening is spoken.",
			"error.notConfigured": "Set the MiMo API key on the plugin card on the Plugins page first.",
			"error.badRequest": "The text could not be spoken as-is.",
			"error.timeout": "MiMo TTS did not answer in time.",
			"error.upstream": "MiMo TTS rejected the request.",
			"error.invalidAudio": "MiMo TTS returned audio that could not be played.",
			"error.voiceSample": "The voice-clone sample could not be read on the Host.",
			"error.generic": "Speech synthesis failed.",
			audition: "Play sample",
			auditioning: "Preparing sample…",
			auditionHint: "Speaks a sample sentence with the style and voice currently on this card (saved or not).",
			apiKey: "API Key",
			apiKeyHint: "Paste the MiMo API key here. It is stored in the host credentials store and never rides a page response; clearing the field and saving changes nothing.",
			apiKeyRef: "Credential reference:",
			apiKeyRefDefault: "Credential reference: MIMO_API_KEY (default).",
			apiKeySet: "A key is configured.",
			apiKeyUnset: "No key is configured.",
			baseUrl: "Endpoint base",
			baseUrlHint: "Leave blank to use https://api.xiaomimimo.com/v1; /chat/completions is appended.",
			model: "Model",
			modelHint: "Leave blank to use mimo-v2.5-tts.",
			voice: "Preset voice",
			voiceHint: "Pick a preset voice; ignored while a voice-clone sample is set.",
			voiceSamplePath: "Voice-clone sample (Host path)",
			voiceSamplePathHint: "A 5–15 s WAV (24 kHz / 16-bit / mono) on the Host. Leave blank to speak with the preset voice.",
			style: "Default speaking style",
			styleHint: "A natural-language phrase such as \"开心\", \"语速慢\", or \"东北话\". Leave blank to let the model judge for itself (recommended).",
			maxChars: "Max characters per request",
			maxCharsHint: "Longer replies are spoken from the beginning up to this budget, cut at a sentence boundary.",
			chunkChars: "Characters per playback chunk",
			chunkCharsHint: "Replies are split into chunks around this size and played back-to-back while the next chunk synthesizes, so the first sound starts in seconds. Smaller = faster start, more requests.",
			timeoutMs: "Request timeout (ms)",
			timeoutMsHint: "Upper bound on one synthesis round-trip to MiMo TTS.",
			autoRead: "Automatic read-aloud",
			autoReadHint: "Speak each newly finished assistant reply with the configured voice and style. Keep the conversation open; if the browser blocks autoplay, tap the speaker on the message.",
			fallbackEngine: "Fallback engine",
			fallbackEngineNone: "Off — MiMo only",
			fallbackEngineEdge: "Edge TTS (keyless)",
			fallbackEngineHint: "When MiMo fails or is unreachable, Edge TTS speaks the reply instead. Edge is keyless but uses a different voice.",
			edgeVoice: "Edge voice",
			edgeVoiceHint: "Any Edge neural voice, e.g. zh-CN-XiaoxiaoNeural (recommended) or zh-CN-YunxiNeural.",
			readScope: "Read scope",
			readScopeBrief: "Brief — summarize, then read",
			briefPrefix: "Brief summary. ",
			readScopeText: "Prose only — skip code and tables",
			readScopeAll: "Read everything — including code",
			readScopeSmart: "Smart — prose plus short code snippets",
			readScopeHint: "Which parts of a reply the speaker reads aloud. Brief first asks the model already configured in this conversation to condense the reply into one or two spoken sentences (about 80 characters), then reads only that summary — code and tables never reach it. When no model can answer, it falls back to the offline rule: the first sentence of every block, capped at 6 sentences / 260 characters. Smart skips long code listings but reads short snippets.",
			highlight: "Sentence highlight",
			highlightHint: "Tint the sentence being read inside the message. Streaming read-aloud only.",
			fallbackUsed: "MiMo did not answer — this read uses the Edge fallback voice.",
			muteWhileRecording: "Stop when the microphone opens",
			muteWhileRecordingHint: "Reading stops the moment a recorder starts, so the microphone never captures the assistant reading its own reply. Pairs with the official voice-input bundle.",
			voiceInputNote: "Voice input itself is the official @deepseek-ai/dsh-experimental-voice-input-bundle — install it from Plugins; this plugin only handles playback.",
			test: "Test connection",
			testing: "Testing…",
			testOk: "OK — {engine} answered in {ms} ms",
			testFailed: "Connection failed",
			engineMimo: "MiMo",
			engineEdge: "Edge",
			sectionConnection: "Connection",
			sectionVoice: "Voice",
			sectionBehavior: "Read-aloud behaviour",
			sectionAudition: "Sample and connection test",
			autoplayHint: "Autoplay was blocked — press play to start.",
			progressBar: "Progress bar",
			progressBarHint: "Show the scrub track in the floating player. Off keeps only play/pause.",
			overridden: "Overridden",
			reset: "Reset to default",
			invalidNumber: "Enter a number, or leave blank to use the default.",
			readOnly: "This deployment stores settings read-only.",
			unavailable: "This plugin is not loaded, so it cannot be configured right now.",
			save: "Save",
			saving: "Saving…",
			saveFailed: "The deployment did not accept these values; they were left for you to correct.",
			recordings: "Speech history",
			recordingsEmpty: "No speech recorded yet. Read a message aloud and it is saved here.",
			recordingsHint: "Every read-aloud is saved. Re-synthesize re-reads the text with the current voice and style, keeping the old take so you can compare.",
			reSynthesize: "Re-synthesize",
			reSynthesizing: "Re-synthesizing…",
			deleteVersion: "Delete"
		};
		/** Simplified Chinese copy. */
		const zh = {
			nav: "语音历史",
			speak: "朗读",
			synthesize: "正在合成…",
			play: "播放",
			pause: "暂停",
			stop: "停止朗读",
			progress: "播放进度",
			emptyText: "这条消息没有可朗读的文本。",
			truncated: "回复较长，只朗读开头部分。",
			"error.notConfigured": "请先在「插件」页的本插件卡片里配置 MiMo API Key。",
			"error.badRequest": "这段文本无法直接朗读。",
			"error.timeout": "MiMo TTS 响应超时。",
			"error.upstream": "MiMo TTS 拒绝了这次请求。",
			"error.invalidAudio": "MiMo TTS 返回的音频无法播放。",
			"error.voiceSample": "宿主上的音色克隆样本无法读取。",
			"error.generic": "语音合成失败。",
			audition: "试听",
			auditioning: "正在准备试听…",
			auditionHint: "用卡片当前的风格与音色（含未保存的修改）朗读一句示例。",
			apiKey: "API Key",
			apiKeyHint: "在这里粘贴 MiMo API Key。密钥只存进宿主凭据存储，不会回传到页面；清空后保存不会改动已存的密钥。",
			apiKeyRef: "凭据引用名：",
			apiKeyRefDefault: "凭据引用名：MIMO_API_KEY（默认）。",
			apiKeySet: "已配置密钥。",
			apiKeyUnset: "未配置密钥。",
			baseUrl: "接口地址",
			baseUrlHint: "留空使用 https://api.xiaomimimo.com/v1，自动追加 /chat/completions。",
			model: "模型",
			modelHint: "留空使用 mimo-v2.5-tts。",
			voice: "预置音色",
			voiceHint: "从预置音色中选择；配置了克隆样本时忽略此项。",
			voiceSamplePath: "音色克隆样本（宿主路径）",
			voiceSamplePathHint: "宿主上的 5–15 秒 WAV（24kHz/16bit/单声道）。留空则使用预置音色。",
			style: "默认风格",
			styleHint: "自然语言描述，例如「开心」「语速慢」「东北话」。留空由模型自行判断（推荐）。",
			maxChars: "单次最大字符数",
			maxCharsHint: "超出预算的回复只朗读开头，并在句末截断。",
			chunkChars: "每块字符数",
			chunkCharsHint: "回复按这个大小切成块、块间连续播放，同时后台合成下一块，所以声音几秒内就起。越小起声越快，但请求次数越多。",
			timeoutMs: "请求超时（毫秒）",
			timeoutMsHint: "单次合成请求的最长等待时间。",
			autoRead: "自动朗读",
			autoReadHint: "助手每条新回复完成后，用配置的音色与风格自动朗读。需停留在对话页；若浏览器拦截自动播放，点消息上的喇叭即可。",
			fallbackEngine: "兜底引擎",
			fallbackEngineNone: "关闭 — 仅用 MiMo",
			fallbackEngineEdge: "Edge TTS（免 Key）",
			fallbackEngineHint: "MiMo 失败或不可达时，改用 Edge TTS 朗读。Edge 免 Key，但音色不同（默认晓晓）。",
			edgeVoice: "Edge 音色",
			edgeVoiceHint: "任意 Edge 神经语音，例如 zh-CN-XiaoxiaoNeural（推荐）或 zh-CN-YunxiNeural。",
			readScope: "朗读范围",
			readScopeBrief: "简要播报 — 先摘要再念",
			briefPrefix: "简要播报。",
			readScopeText: "只读正文 — 跳过代码和表格",
			readScopeAll: "全部朗读 — 含代码",
			readScopeSmart: "智能朗读 — 正文 + 短代码",
			readScopeHint: "决定朗读回复的哪些部分。简要播报会先把回复交给当前对话所用的模型，浓缩成一两句口播摘要（约 80 字）再朗读，代码和表格不会进入摘要；模型不可用时退回规则摘要：每段只取第一句，上限 6 句 / 260 字。智能模式跳过长代码列表，只读短片段。",
			highlight: "句子高亮",
			highlightHint: "朗读时在消息正文里高亮当前句子（仅流式朗读路径生效）。",
			fallbackUsed: "MiMo 这次没响应，已改用 Edge 兜底音色朗读。",
			muteWhileRecording: "开麦时停止朗读",
			muteWhileRecordingHint: "麦克风一打开就停止朗读，避免把自己的播报声录进去变成新的输入。配合官方语音输入插件使用。",
			voiceInputNote: "语音输入由官方 @deepseek-ai/dsh-experimental-voice-input-bundle 提供，在插件页安装即可；本插件只管播放。",
			test: "测试连接",
			testing: "测试中…",
			testOk: "正常 — {engine} 用时 {ms} 毫秒",
			testFailed: "连接失败",
			engineMimo: "MiMo",
			engineEdge: "Edge",
			sectionConnection: "连接",
			sectionVoice: "声音",
			sectionBehavior: "朗读行为",
			sectionAudition: "试听与测试",
			autoplayHint: "浏览器拦截了自动播放，点「播放」开始。",
			progressBar: "显示进度条",
			progressBarHint: "在悬浮播放器里显示可拖动的进度条；关闭后只保留播放/暂停按钮。",
			overridden: "已覆盖",
			reset: "恢复默认",
			invalidNumber: "请填数字；留空表示使用默认值。",
			readOnly: "本部署的设置为只读。",
			unavailable: "该插件当前未加载，暂时无法配置。",
			save: "保存",
			saving: "保存中…",
			saveFailed: "本部署没有接受这些值，已保留供你修改。",
			recordings: "语音历史",
			recordingsEmpty: "还没有保存的语音。朗读一条消息就会自动存到这里。",
			recordingsHint: "每次朗读都会保存。「重新合成」用当前音色与风格重读原文，旧版本保留，方便对比。",
			reSynthesize: "重新合成",
			reSynthesizing: "正在重新合成…",
			deleteVersion: "删除"
		};
		// src/client/RecordingsList.tsx
		/**
		* The speech-history browser: every recorded text, each with its versions.
		* Versions play in place, re-synthesize against the current engine settings
		* (appending a fresh take, old ones kept), or get deleted. There is no
		* dedicated comparison view — per the design, each take is played on its own.
		* @module dsh-mimo-speak/client/RecordingsList
		*/
		/** Identity this list registers with the shared audio bus. */
		const LIST_TOKEN = {};
		/**
		* Pause every other `<audio>` on the page.
		* @param current - the element that just started; never paused.
		*/
		function pauseSiblings(current) {
			for (const element of document.querySelectorAll("audio")) {
				if (element === current) continue;
				if (!element.paused) element.pause();
			}
		}
		/**
		* Render the persisted speech history with per-version playback, re-synthesis,
		* and deletion.
		* @param props - localized copy.
		* @returns the history list, or an empty-state note before the first load.
		*/
		function RecordingsList({ t }) {
			const [index, setIndex] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [busyRec, setBusyRec] = (0, react.useState)(null);
			const load = (0, react.useCallback)(() => {
				setError(null);
				fetchRecordings().then(setIndex).catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)));
			}, []);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			(0, react.useEffect)(() => registerAudioPauser(LIST_TOKEN, () => {
				pauseSiblings();
			}), []);
			const onResynth = (0, react.useCallback)((recId) => {
				setBusyRec(recId);
				resynthesizeRecording(recId).then(load).catch((failure) => setError(failure instanceof TtsClientError ? failure.message : String(failure))).finally(() => setBusyRec(null));
			}, [load]);
			const onDelete = (0, react.useCallback)((recId, verId) => {
				deleteRecordingVersion(recId, verId).then(load).catch((failure) => setError(failure instanceof TtsClientError ? failure.message : String(failure)));
			}, [load]);
			if (index === null) return error === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "mimo-speak-recordingsEmpty",
				children: t("recordingsEmpty")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "mimo-speak-fieldError",
				role: "status",
				children: error
			});
			if (index.entries.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "mimo-speak-recordingsEmpty",
				children: t("recordingsEmpty")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mimo-speak-recordings",
				children: [error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "mimo-speak-fieldError",
					role: "status",
					children: error
				}) : null, index.entries.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "mimo-speak-recording",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "mimo-speak-recordingText",
						title: entry.text,
						children: entry.text
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: "mimo-speak-versions",
						children: entry.versions.map((version) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: "mimo-speak-version",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("audio", {
									className: "mimo-speak-versionAudio",
									src: recordingFileUrl(entry.id, version.id),
									controls: true,
									preload: "none",
									onPlay: (event) => {
										pauseOtherAudio(LIST_TOKEN);
										pauseSiblings(event.currentTarget);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "mimo-speak-versionMeta",
									children: [
										new Date(version.createdAt).toLocaleString(),
										version.voice !== null ? ` · ${version.voice}` : "",
										version.style !== null ? ` · ${version.style}` : ""
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "mimo-speak-recButton",
									disabled: busyRec === entry.id,
									onClick: () => {
										onResynth(entry.id);
									},
									children: busyRec === entry.id ? t("reSynthesizing") : t("reSynthesize")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "mimo-speak-recButton",
									onClick: () => {
										onDelete(entry.id, version.id);
									},
									children: t("deleteVersion")
								})
							]
						}, version.id))
					})]
				}, entry.id))]
			});
		}
		// src/client/RecordingsPage.tsx
		/**
		* The `语音历史` settings page: every read-aloud recording, each with its
		* versions for in-place playback, re-synthesis, and deletion. Configuration
		* lives on the Plugins page's bundle card (`plugins.bundle.config`); this
		* page owns the feature surface instead.
		* @module dsh-mimo-speak/client/RecordingsPage
		*/
		/**
		* Render the speech-history settings page.
		* @param props - localized copy.
		* @returns the recordings list with its heading and hint.
		*/
		function RecordingsPage({ t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mimo-speak-recordingsPage",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: "mimo-speak-recordingsTitle",
						children: t("recordings")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "mimo-speak-recordingsHintText",
						children: t("recordingsHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RecordingsList, { t })
				]
			});
		}
		// src/client/status.ts
		/**
		* The engine-status mirror shared by the speak entries and the settings page.
		*
		* One `GET /api/mimo-speak/status` answers every mounted control: entries lazy-
		* load it on first hover/focus, the settings page refreshes it after each
		* write that could change whether a key exists. Failures publish the
		* "unconfigured" view rather than an error state — a missing answer must not
		* claim a key exists.
		* @module dsh-mimo-speak/client/status
		*/
		const store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({
			configured: false,
			model: DEFAULT_MODEL,
			voice: DEFAULT_VOICE,
			hasVoiceSample: false,
			baseUrl: DEFAULT_BASE_URL,
			autoRead: false,
			maxChars: DEFAULT_MAX_CHARS,
			chunkChars: 120,
			fallbackEngine: DEFAULT_FALLBACK_ENGINE,
			edgeVoice: DEFAULT_EDGE_VOICE,
			readScope: DEFAULT_READ_SCOPE,
			highlight: true,
			progressBar: false,
			muteWhileRecording: true
		});
		let inflight = null;
		/**
		* @returns the shared status mirror every control derives from.
		*/
		function ttsStatusStore() {
			return store;
		}
		/**
		* Ensure one status read is under way; concurrent callers share it.
		* @returns the read in flight, which never rejects.
		*/
		function ensureTtsStatus() {
			if (inflight !== null) return inflight;
			inflight = fetchTtsStatus().then((view) => {
				store.set(view);
			}).catch(() => void 0).finally(() => {
				inflight = null;
			});
			return inflight;
		}
		/**
		* Re-read the status even when one is already under way; called after writes
		* that could add or remove the API key.
		* @returns the fresh read, which never rejects.
		*/
		function refreshTtsStatus() {
			inflight = null;
			return ensureTtsStatus();
		}
		// src/client/settings-controller.ts
		/** Form field name of the write-only API key control (not a section field). */
		const API_KEY_CONTROL = "apiKey";
		/**
		* A numeric spec that clamps into the range the Host schema declares
		* (`chunkChars` 20–1000, the others at least 1). The shared
		* `settingsNumberField` accepts any finite number, and one out-of-range value
		* makes the Host reject the whole section — which the UI can only report as
		* 「本部署没有接受这些值」. Clamping here keeps every save valid.
		* @param field - section field name.
		* @param min - smallest value the Host accepts.
		* @param max - largest value the Host accepts, when it has one.
		* @returns the field's conversion spec.
		*/
		function settingsClampedNumberField(field, min, max) {
			return {
				field,
				format: (value) => typeof value === "number" ? String(value) : "",
				parse: (text) => {
					const trimmed = text.trim();
					if (trimmed === "") return { kind: "clear" };
					const parsed = Number(trimmed);
					if (!Number.isFinite(parsed)) return void 0;
					return {
						kind: "set",
						value: Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, Math.round(parsed)))
					};
				}
			};
		}
		/** Section fields the card edits; `apiKeyEnv` stays a read-only ref name. */
		const SECTION_SPECS = [
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)("baseUrl"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)("model"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)("voice"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)("voiceSamplePath"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)("style"),
			settingsClampedNumberField("maxChars", 1),
			settingsClampedNumberField("chunkChars", 20, 1e3),
			settingsClampedNumberField("timeoutMs", 1),
			{
				field: "autoRead",
				format: (value) => value === true ? "true" : "false",
				parse: (text) => text === "true" ? {
					kind: "set",
					value: true
				} : text === "false" ? {
					kind: "set",
					value: false
				} : void 0
			},
			{
				field: "fallbackEngine",
				format: (value) => value === "edge" ? "edge" : "none",
				parse: (text) => text === "edge" || text === "none" ? {
					kind: "set",
					value: text
				} : void 0
			},
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)("edgeVoice"),
			{
				field: "readScope",
				format: (value) => value === "all" || value === "smart" || value === "brief" ? value : "text",
				parse: (text) => text === "text" || text === "all" || text === "smart" || text === "brief" ? {
					kind: "set",
					value: text
				} : void 0
			},
			{
				field: "highlight",
				format: (value) => value === true ? "true" : "false",
				parse: (text) => text === "true" ? {
					kind: "set",
					value: true
				} : text === "false" ? {
					kind: "set",
					value: false
				} : void 0
			},
			{
				field: "muteWhileRecording",
				format: (value) => value === true ? "true" : "false",
				parse: (text) => text === "true" ? {
					kind: "set",
					value: true
				} : text === "false" ? {
					kind: "set",
					value: false
				} : void 0
			},
			{
				field: "progressBar",
				format: (value) => value === true ? "true" : "false",
				parse: (text) => text === "true" ? {
					kind: "set",
					value: true
				} : text === "false" ? {
					kind: "set",
					value: false
				} : void 0
			}
		];
		/**
		* Bridges the `mimo-speak` configuration namespace onto the Plugins-page card.
		* @param scope - the bound settings scope for the `mimo-speak` namespace.
		* @param setCredential - stores a key in the host credentials store.
		*/
		var TtsSettingsController = class {
			scope;
			setCredential;
			form;
			store;
			unsubscribeStatus;
			status = ttsStatusStore();
			constructor(scope, setCredential) {
				this.scope = scope;
				this.setCredential = setCredential;
				this.form = new _deepseek_ai_dsh_client_ui_primitives.SettingsFormModel(scope, SECTION_SPECS, [{
					field: API_KEY_CONTROL,
					write: (text) => this.writeApiKey(text)
				}]);
				this.store = this.form.bind(() => this.projection());
				this.unsubscribeStatus = this.status.subscribe(() => {
					this.store.set(this.projection());
				});
				refreshTtsStatus();
			}
			/**
			* Build the face the card's slot registration injects.
			* @returns the card's snapshot and its form actions.
			*/
			inject() {
				const actions = this.form.actions();
				return {
					hooks: { form: this.store },
					edit: (field, text) => {
						actions.edit(field, text);
					},
					resetField: (field) => {
						actions.resetField(field);
					},
					save: () => {
						clearSpeechCache();
						actions.save();
					},
					discard: () => {
						actions.discard();
					},
					synthesize: (request) => requestSpeech(request),
					test: () => requestSpeechTest()
				};
			}
			/** Release form and status subscriptions. */
			dispose() {
				this.unsubscribeStatus();
				this.form.dispose();
			}
			/**
			* Store one typed key under the section's credential reference. A blank
			* draft never reaches here (the form model writes nothing for it); a
			* successful write refreshes the status mirror, so the configured flag
			* follows immediately.
			* @param text - the literal API key as typed.
			* @returns whether the host accepted the write.
			*/
			async writeApiKey(text) {
				const ref = (this.scope.getSnapshot().value?.apiKeyEnv ?? "").trim();
				if (ref === "") return false;
				const ok = await this.setCredential(ref, text.trim());
				if (ok) refreshTtsStatus();
				return ok;
			}
			/** @returns the card projection rebuilt from the form and the status mirror. */
			projection() {
				return {
					...this.form.shell(),
					apiKey: this.form.field(API_KEY_CONTROL),
					apiKeyConfigured: this.status.getSnapshot().configured,
					apiKeyEnv: this.scope.getSnapshot().value?.apiKeyEnv,
					baseUrl: this.form.field("baseUrl"),
					model: this.form.field("model"),
					voice: this.form.field("voice"),
					voiceSamplePath: this.form.field("voiceSamplePath"),
					style: this.form.field("style"),
					maxChars: this.form.field("maxChars"),
					chunkChars: this.form.field("chunkChars"),
					timeoutMs: this.form.field("timeoutMs"),
					autoRead: this.form.field("autoRead"),
					fallbackEngine: this.form.field("fallbackEngine"),
					edgeVoice: this.form.field("edgeVoice"),
					readScope: this.form.field("readScope"),
					highlight: this.form.field("highlight"),
					progressBar: this.form.field("progressBar"),
					supportsProgressBar: typeof this.status.getSnapshot().progressBar === "boolean",
					muteWhileRecording: this.form.field("muteWhileRecording"),
					supportsMuteWhileRecording: typeof this.status.getSnapshot().muteWhileRecording === "boolean"
				};
			}
		};
		// src/client/styles.ts
		/**
		* Plugin-owned stylesheet.
		*
		* The in-repo client bundles compile CSS Modules through their tsdown preset;
		* this out-of-tree plugin keeps one plain stylesheet and injects it with the
		* same shape the platform's own bundle loader uses (a `data-plugin-css` style
		* tag owned by the plugin's effect lifetime). Class names are namespaced
		* `mimo-speak-`, and colors/radii ride the shared `--dsw-*` design tokens so both
		* themes stay correct without owning theme state.
		* @module dsh-mimo-speak/client/styles
		*/
		/** The plugin's stylesheet text. */
		const CSS = `
.mimo-speak-root { position: relative; display: inline-flex; align-items: center; }

.mimo-speak-button {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 6px;
  border: none; border-radius: var(--dsw-radius-sm);
  background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.mimo-speak-button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.mimo-speak-button:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.mimo-speak-button[aria-pressed="true"] { color: var(--dsw-alias-brand-primary); }

.mimo-speak-failure {
  display: inline-flex; align-items: center; color: var(--dsw-alias-label-error);
  cursor: default;
}

/* Synthesizing: the button itself pulses, so the wait is legible with no panel. */
.mimo-speak-buttonBusy {
  color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-interactive-bg-hover);
  animation: mimo-speak-pulse 1.4s ease-in-out infinite;
}
@keyframes mimo-speak-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

.mimo-speak-spin { display: inline-flex; animation: mimo-speak-spin 1.1s linear infinite; }
@keyframes mimo-speak-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.mimo-speak-panel {
  position: absolute; top: 50%; left: 100%; transform: translateY(-50%); margin-left: 4px; z-index: 40;
  display: block; width: 280px; padding: 8px 10px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
}
.mimo-speak-panelLeft { left: auto; right: 100%; margin-left: 0; margin-right: 4px; }

.mimo-speak-bar { display: flex; align-items: center; gap: 8px; height: 24px; }
/* Transport-only variant: no track and no clock, so the panel stays one control. */
.mimo-speak-barCompact { gap: 0; justify-content: flex-start; }

.mimo-speak-barButton {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0;
  border: none; border-radius: var(--dsw-radius-xs);
  background: transparent; color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.mimo-speak-barButton:hover { background: var(--dsw-alias-interactive-bg-hover); }

.mimo-speak-track {
  position: relative; flex: 1 1 auto; height: 14px; cursor: pointer;
  display: flex; align-items: center; touch-action: none;
}
.mimo-speak-track::before {
  content: ""; position: absolute; left: 0; right: 0; height: 4px;
  background: var(--dsw-alias-border-l3); border-radius: 2px;
}
.mimo-speak-track:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-alias-state-business-primary); outline-offset: 2px; border-radius: var(--dsw-radius-xs); }

/* Streaming playback cannot seek: the track becomes a progress readout with
   no thumb and no pointer affordance. */
.mimo-speak-trackStatic { cursor: default; }
.mimo-speak-trackStatic .mimo-speak-thumb { display: none; }

.mimo-speak-fill {
  position: absolute; left: 0; height: 4px; max-width: 100%;
  background: var(--dsw-alias-brand-primary); border-radius: 2px;
}

.mimo-speak-thumb {
  position: absolute; width: 10px; height: 10px; margin-left: -5px;
  background: var(--dsw-alias-brand-primary); border-radius: 50%;
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-2);
}
.mimo-speak-trackDragging .mimo-speak-thumb { transform: scale(1.2); }

.mimo-speak-time {
  flex: 0 0 auto; font-size: 11px; line-height: 1;
  color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.mimo-speak-audition { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.mimo-speak-auditionHint {
  margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary);
}
.mimo-speak-auditionRow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.mimo-speak-auditionRow .mimo-speak-bar { flex: 1 1 220px; min-width: 180px; }
.mimo-speak-auditionButton {
  height: 28px; padding: 0 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-button-tool-bar-fill);
  color: var(--dsw-alias-label-primary);
  font-size: 12px; cursor: pointer;
}
.mimo-speak-auditionButton:hover:not(:disabled) { background: var(--dsw-alias-button-tool-bar-hover); }
.mimo-speak-auditionButton:disabled { opacity: 0.6; cursor: default; }

.mimo-speak-fieldError { margin: 0; font-size: 12px; color: var(--dsw-alias-label-error); }

/* Preset-voice dropdown, styled to sit inside the shared settings form frame
   like the primitive text fields around it. */
.mimo-speak-selectField { display: flex; flex-direction: column; gap: 6px; }
.mimo-speak-selectLabel { font-size: 13px; font-weight: 500; line-height: 18px; color: var(--dsw-alias-label-primary); }
.mimo-speak-select {
  height: 34px; padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
}
.mimo-speak-select:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.mimo-speak-select:disabled { opacity: 0.6; cursor: default; }

/* Section titles inside the configuration card. */
.mimo-speak-sectionTitle {
  margin: 16px 0 0; padding-top: 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  font-size: 12px; font-weight: 600; letter-spacing: 0.02em;
  color: var(--dsw-alias-label-secondary); text-transform: uppercase;
}
.mimo-speak-sectionTitle:first-child { margin-top: 0; padding-top: 0; border-top: none; }

/* Status lines inside the floating player panel. */
.mimo-speak-panelStatus { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-error); }
.mimo-speak-panelNote { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }

/* While a player is open, the message's action strip stays visible even when
   the pointer leaves the row — audio must not fade out mid-playback. The
   selector reads ui-chat's reveal attribute as a progressive enhancement: with
   the attribute absent the rule simply never matches. */
@media (hover: hover) {
  [data-actions-reveal="hover"]:has(.mimo-speak-open) .actions { opacity: 1; }
}

.mimo-speak-recordingsPage { display: flex; flex-direction: column; }
.mimo-speak-recordingsSection {
  margin-top: 20px; padding-top: 16px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.mimo-speak-recordingsTitle { margin: 0 0 4px; font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.mimo-speak-recordingsHintText { margin: 0 0 12px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.mimo-speak-recordingsEmpty { margin: 4px 0; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.mimo-speak-recording { padding: 10px 0; border-top: 1px solid var(--dsw-alias-border-l3); }
.mimo-speak-recording:first-of-type { border-top: none; }
.mimo-speak-recordingText {
  margin: 0 0 6px; font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-primary);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.mimo-speak-versions { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.mimo-speak-version { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mimo-speak-versionAudio { height: 32px; flex: 1 1 200px; min-width: 160px; }
.mimo-speak-versionMeta { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.mimo-speak-recButton {
  height: 26px; padding: 0 12px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-button-tool-bar-fill); color: var(--dsw-alias-label-primary);
}
.mimo-speak-recButton:hover:not(:disabled) { background: var(--dsw-alias-button-tool-bar-hover); }
.mimo-speak-recButton:disabled { opacity: 0.6; cursor: default; }
`;
		/**
		* Inject the plugin stylesheet into the page.
		* @returns the disposer removing the style tag (HMR-safe: re-injection after a
		* rebuild replaces the tag by its data attribute).
		*/
		function injectStyles() {
			const existing = document.querySelector("style[data-plugin-css=\"dsh-mimo-speak/styles\"]");
			if (existing !== null) return () => {
				existing.remove();
			};
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-mimo-speak";
			tag.dataset.pluginCss = "dsh-mimo-speak/styles";
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return () => {
				tag.remove();
			};
		}
		// src/client/index.ts
		/** Required services (cordis fiber inject); remote.credentials stores the API key. */
		const inject = [
			"slots",
			"locale",
			"configForms",
			"remote",
			"remote.credentials"
		];
		/**
		* Mount the speak entries, the Plugins-page configuration card, and the
		* speech-history settings page.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			ctx.effect(() => injectStyles(), "dsh-mimo-speak: styles");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-mimo-speak: dictionaries");
			const t = ctx.locale.bind(NS);
			const controller = new TtsSettingsController(ctx.configForms.get(MIMOSPEAK_NAMESPACE), async (ref, value) => (await ctx.remote.credentials.set(ref, value)).ok);
			ctx.effect(() => () => {
				controller.dispose();
			}, "dsh-mimo-speak: settings form");
			ctx.effect(() => ctx.configForms.whileServed([MIMOSPEAK_NAMESPACE], () => {
				const offCard = ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
					name: "plugins.bundle.config",
					key: MIMOSPEAK_PACKAGE_KEY,
					locale: NS,
					inject: () => controller.inject()
				}, BundleConfigCard));
				const offPage = ctx.slots.inject("settings.section", () => ctx.slots.register({
					name: "settings.section",
					id: "mimo-speak",
					order: 20,
					label: () => t("nav"),
					locale: NS
				}, RecordingsPage));
				return () => {
					offPage();
					offCard();
				};
			}), "dsh-mimo-speak: plugins-page card and history page");
			ensureTtsStatus();
			ctx.slots.inject("conversation.chat.assistant-actions", () => ctx.slots.register({
				name: "conversation.chat.assistant-actions",
				id: "mimo-speak",
				order: 20,
				locale: NS,
				inject: () => ({
					hooks: { status: ttsStatusStore() },
					ensureStatus: () => {
						ensureTtsStatus();
					},
					synthesize: requestSpeech
				})
			}, SpeakAction));
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map