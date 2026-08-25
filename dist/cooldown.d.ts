export declare const COOLDOWN_STATE_PATH: string;
export declare const QUOTA_COOLDOWN_MS: number;
export declare const RATELIMIT_COOLDOWN_MS: number;
export type FailureKind = "quota" | "ratelimit";
export interface Classification {
    kind: FailureKind;
    ttlMs: number;
}
export interface CooldownEntry {
    until: string;
    reason: string;
}
export interface CooldownState {
    engines: Record<string, CooldownEntry>;
}
/** Which cooldown (if any) an engine failure message earns. */
export declare function classifyFailure(message: unknown): Classification | null;
export declare function emptyState(): CooldownState;
/** Missing OR corrupt file both read as "no cooldowns" — a torn file must never brick search. */
export declare function loadCooldownState(path?: string): CooldownState;
/** Atomic temp+rename write, born 0600. Caller owns try/catch: warn, don't throw into search. */
export declare function saveCooldownState(state: CooldownState, path?: string): void;
export declare function removeCooldownState(path?: string): void;
/** Engines currently cooling: Map<engine, entry>. Expired entries are invisible. */
export declare function activeCooldowns(state: CooldownState, now?: number): Map<string, CooldownEntry>;
/** Record a cooldown iff the message classifies; true when the state changed. */
export declare function recordCooldown(state: CooldownState, engine: string, failureMessage: string, now?: number): boolean;
export declare function clearCooldown(state: CooldownState, engine: string): boolean;
/** Drop expired entries in place; true when anything was removed. */
export declare function pruneCooldowns(state: CooldownState, now?: number): boolean;
//# sourceMappingURL=cooldown.d.ts.map