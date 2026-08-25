/**
 * Engine cooldown memory for the vendored Free Search chain: quota/rate-limit
 * failures park an engine for a while so subsequent searches skip it instead
 * of re-paying the same timeout on every call. Idea ported from
 * @liustack/modsearch's state store, simplified to per-engine (their per-key
 * rotation stays out of scope).
 *
 * ponytail: only quota-exhaustion and 429/rate-limit wordings cool an engine
 * down. Generic network errors, captchas-heal-in-minutes aside, and missing
 * keys are config bugs — cooling those would lock users out of working
 * engines. Upgrade path: classify more error shapes here once real-world
 * failure text justifies it.
 */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ENHANCED_STATE_DIR } from "./shared.js";

export const COOLDOWN_STATE_PATH = join(ENHANCED_STATE_DIR, "cooldown-state.json");
export const QUOTA_COOLDOWN_MS = 12 * 60 * 60 * 1000; // monthly quotas: hours, not minutes
export const RATELIMIT_COOLDOWN_MS = 15 * 60 * 1000;

const QUOTA_PATTERNS = [
	/\bquota\b/i,
	/\bpayment required\b/i,
	/\b(?:out of|insufficient|not enough)\s+(?:account\s+)?(?:balance|credits?)\b/i,
	/\b(?:balance|credits?)\s+(?:is\s+)?(?:insufficient|exhausted|depleted|empty|too low|used up)\b/i,
	/\b(?:credit|usage)\s+(?:limit|cap)\s+(?:reached|exceeded)\b/i,
];

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
export function classifyFailure(message: unknown): Classification | null {
	const s = String(message ?? "");
	if (QUOTA_PATTERNS.some((p) => p.test(s))) return { kind: "quota", ttlMs: QUOTA_COOLDOWN_MS };
	if (/\bHTTP\s*429\b/.test(s) || /\brate.?limit/i.test(s))
		return { kind: "ratelimit", ttlMs: RATELIMIT_COOLDOWN_MS };
	return null;
}

export function emptyState(): CooldownState {
	return { engines: {} };
}

function normalize(raw: unknown): CooldownState {
	if (!raw || typeof raw !== "object") return emptyState();
	const engines = (raw as CooldownState).engines;
	return { engines: engines && typeof engines === "object" ? engines : {} };
}

/** Missing OR corrupt file both read as "no cooldowns" — a torn file must never brick search. */
export function loadCooldownState(path = COOLDOWN_STATE_PATH): CooldownState {
	try {
		return normalize(JSON.parse(readFileSync(path, "utf8")));
	} catch {
		return emptyState();
	}
}

/** Atomic temp+rename write, born 0600. Caller owns try/catch: warn, don't throw into search. */
export function saveCooldownState(state: CooldownState, path = COOLDOWN_STATE_PATH): void {
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
	renameSync(tmp, path);
}

export function removeCooldownState(path = COOLDOWN_STATE_PATH): void {
	try {
		unlinkSync(path);
	} catch (error: any) {
		if (error?.code !== "ENOENT") throw error;
	}
}

/** Engines currently cooling: Map<engine, entry>. Expired entries are invisible. */
export function activeCooldowns(state: CooldownState, now = Date.now()): Map<string, CooldownEntry> {
	const out = new Map<string, CooldownEntry>();
	for (const [engine, entry] of Object.entries(state.engines || {})) {
		if (entry && typeof entry.until === "string" && Date.parse(entry.until) > now) out.set(engine, entry);
	}
	return out;
}

/** Record a cooldown iff the message classifies; true when the state changed. */
export function recordCooldown(
	state: CooldownState,
	engine: string,
	failureMessage: string,
	now = Date.now(),
): boolean {
	const c = classifyFailure(failureMessage);
	if (!c) return false;
	state.engines = state.engines && typeof state.engines === "object" ? state.engines : {};
	state.engines[engine] = {
		until: new Date(now + c.ttlMs).toISOString(),
		reason: String(failureMessage).slice(0, 200),
	};
	return true;
}

export function clearCooldown(state: CooldownState, engine: string): boolean {
	if (state.engines && Object.hasOwn(state.engines, engine)) {
		delete state.engines[engine];
		return true;
	}
	return false;
}

/** Drop expired entries in place; true when anything was removed. */
export function pruneCooldowns(state: CooldownState, now = Date.now()): boolean {
	let removed = false;
	for (const [engine, entry] of Object.entries(state.engines || {})) {
		if (!entry || !(typeof entry.until === "string" && Date.parse(entry.until) > now)) {
			delete state.engines[engine];
			removed = true;
		}
	}
	return removed;
}
