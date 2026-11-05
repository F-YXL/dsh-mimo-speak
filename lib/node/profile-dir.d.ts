/**
 * The active profile name, or `''` when the process was not booted under a
 * named profile (legacy global home).
 */
export declare function detectProfileName(options?: {
    moduleUrl?: string;
}): string;
/**
 * The profile-scoped default for one data directory:
 * `<home>/profiles/<profile>/<dir>`, or `undefined` when no profile is active
 * (the caller keeps its legacy default).
 */
export declare function profileScopedDefault(dir: string, options?: {
    moduleUrl?: string;
}): string | undefined;
