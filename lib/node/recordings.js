/**
 * Host-side persistence for synthesized speech.
 *
 * Every spoken text becomes one recording node; each synthesis — first pass
 * or a later re-synthesis — appends a version with its own WAV file on disk.
 * A single `index.json` records the tree so the browser can list history
 * without scanning directories. The store lives under the active profile's
 * data root (`~/.dsh/profiles/<profile>/mimo-speak-recordings`; the legacy global
 * `~/.dsh` when no profile is active), outside the plugin and any repository,
 * so no recording leaks into version control.
 *
 * Re-synthesis never overwrites: it adds a new version, leaving earlier
 * takes intact so the user can compare voices side by side.
 * @module dsh-mimo-speak/recordings
 */
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { profileScopedDefault } from './profile-dir.js';
/** The legacy home-level store, used when no DSH profile is active. */
const LEGACY_RECORDINGS_DIR = join(homedir(), '.dsh', 'mimo-speak-recordings');
// Resolved lazily on first use and cached: the profile signals (env, argv,
// install location) only settle once the harness process is up, and the store
// must stay in one place for the process lifetime.
let cachedDir;
function recordingsDir() {
    if (cachedDir === undefined) {
        // `import.meta.url` enables the install-location signal: a link: checkout
        // resolves outside `profiles/` and correctly keeps the legacy home store,
        // while an installed copy finds its own profile without needing env or argv.
        cachedDir = profileScopedDefault('mimo-speak-recordings', { moduleUrl: import.meta.url })
            ?? LEGACY_RECORDINGS_DIR;
    }
    return cachedDir;
}
/** The single index file mapping texts to their version trees. */
function indexFile() {
    return join(recordingsDir(), 'index.json');
}
/** A recordings store with no entries yet. */
const EMPTY_INDEX = { entries: [] };
// `mkdir` is idempotent but we still memoize the in-flight promise so
// concurrent first writes don't race the directory creation.
let ensurePromise;
function ensureDir() {
    if (ensurePromise === undefined) {
        ensurePromise = mkdir(recordingsDir(), { recursive: true })
            .then(() => undefined)
            .catch((error) => {
            ensurePromise = undefined;
            throw error;
        });
    }
    return ensurePromise;
}
/**
 * Read the index, tolerating a missing or corrupt file.
 * @returns the parsed index, or an empty one when unreadable.
 */
async function readIndex() {
    try {
        const raw = await readFile(indexFile(), 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.entries) ? parsed : EMPTY_INDEX;
    }
    catch {
        return EMPTY_INDEX;
    }
}
/**
 * Persist the index, creating the directory first.
 *
 * Written to a sibling temp file and renamed into place: a crash halfway
 * through a plain write leaves truncated JSON, which `readIndex` can only
 * treat as "no history at all".
 */
async function writeIndex(index) {
    await ensureDir();
    const target = indexFile();
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(index), 'utf8');
    try {
        await rename(temp, target);
    }
    catch (error) {
        await unlink(temp).catch(() => { });
        throw error;
    }
}
/**
 * Serialize index mutations.
 *
 * Every mutation is read-modify-write over one JSON file. Without a queue two
 * concurrent appends (a chunked reply persisting while the settings page
 * re-synthesizes) read the same snapshot and the second write erases the
 * first entry, leaving an orphan WAV on disk and a hole in the history.
 */
let indexQueue = Promise.resolve();
function withIndexLock(task) {
    const run = indexQueue.then(task, task);
    indexQueue = run.then(() => undefined, () => undefined);
    return run;
}
/** The on-disk file name for one version; ids are uuids, so no path tricks. */
function versionFileName(recId, verId) {
    return `${recId}-${verId}.wav`;
}
/** Absolute path of one version's WAV file. */
export function versionFilePath(recId, verId) {
    return join(recordingsDir(), versionFileName(recId, verId));
}
/**
 * Append a synthesized version to a text's recording history.
 *
 * Texts are de-duplicated: speaking the same text twice groups both takes
 * under one node. The new version is prepended so the list reads newest-first.
 * @param text - the spoken text (grouping key).
 * @param style - style phrase used, or undefined for neutral.
 * @param voice - preset voice used, or undefined for default.
 * @param model - model id used.
 * @param wav - the WAV bytes to persist.
 * @returns the recording node and the new version.
 */
export async function addVersion(text, style, voice, model, wav) {
    return withIndexLock(async () => {
        await ensureDir();
        const index = await readIndex();
        const version = {
            id: randomUUID(),
            createdAt: new Date().toISOString(),
            style: style ?? null,
            voice: voice ?? null,
            model,
        };
        let recording = index.entries.find(entry => entry.text === text);
        if (recording === undefined) {
            recording = { id: randomUUID(), text, createdAt: version.createdAt, versions: [] };
            index.entries.unshift(recording);
        }
        recording.versions.unshift(version);
        await writeFile(versionFilePath(recording.id, version.id), Buffer.from(wav));
        await writeIndex(index);
        return { recording, version };
    });
}
/** Return the current index (empty when none yet). */
export async function listRecordings() {
    return readIndex();
}
/**
 * Re-synthesize an existing recording's text with the engine's current
 * settings and append the result as a new version. Earlier versions stay
 * intact so the user can compare takes.
 * @param recId - the recording node id.
 * @param style - style phrase used, or undefined for neutral.
 * @param voice - preset voice used, or undefined for default.
 * @param model - model id used.
 * @param wav - the freshly synthesized WAV bytes.
 * @returns the recording and new version, or undefined when `recId` is unknown.
 */
export async function resynthesize(recId, style, voice, model, wav) {
    return withIndexLock(async () => {
        await ensureDir();
        const index = await readIndex();
        const recording = index.entries.find(entry => entry.id === recId);
        if (recording === undefined)
            return undefined;
        const version = {
            id: randomUUID(),
            createdAt: new Date().toISOString(),
            style: style ?? null,
            voice: voice ?? null,
            model,
        };
        recording.versions.unshift(version);
        await writeFile(versionFilePath(recording.id, version.id), Buffer.from(wav));
        await writeIndex(index);
        return { recording, version };
    });
}
/**
 * Delete one version's file and index entry. When a recording loses its last
 * version it is removed entirely.
 * @returns true when the version existed and was removed.
 */
export async function deleteVersion(recId, verId) {
    return withIndexLock(async () => {
        const index = await readIndex();
        const recording = index.entries.find(entry => entry.id === recId);
        if (recording === undefined)
            return false;
        const at = recording.versions.findIndex(version => version.id === verId);
        if (at === -1)
            return false;
        recording.versions.splice(at, 1);
        await unlink(versionFilePath(recId, verId)).catch(() => { });
        if (recording.versions.length === 0) {
            index.entries = index.entries.filter(entry => entry.id !== recId);
        }
        await writeIndex(index);
        return true;
    });
}
/** Whether a recording/version pair exists (used to authorize file serving). */
export async function hasVersion(recId, verId) {
    const index = await readIndex();
    const recording = index.entries.find(entry => entry.id === recId);
    return recording !== undefined && recording.versions.some(version => version.id === verId);
}
//# sourceMappingURL=recordings.js.map