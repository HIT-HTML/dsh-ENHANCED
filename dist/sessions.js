/**
 * Session housekeeping module: the deletion control the native sidebar
 * deliberately lacks (its own docs: "No Session deletion"). Facts this builds
 * on, from @deepseek-ai/dsh-session-persistence-jsonl:
 *  - one self-contained directory per session: <root>/<workspace>/session-<id>/
 *    holding session.jsonl.zstd (+ reserved room for future artifacts);
 *  - "Nothing deletes session files … the seam has no deletion API" — external
 *    removal is the intended mechanism, and the projection cache follows the
 *    log (deleted ids are discarded on next read);
 *  - "Another backend instance or process must not write the same session"
 *    mid-life — so we refuse sessions live in THIS process and any log touched
 *    within the idle guard window (another instance may still hold it).
 *
 * Deletion is a two-step move into our own trash dir (same DSH_HOME volume, so
 * rename is atomic): dry-run returns a plan + token; executing re-scans,
 * re-derives the token, and refuses on mismatch — a stale plan can never fire.
 */
import { readdir, stat, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DSH_HOME, ENHANCED_STATE_DIR } from "./shared.js";
export const SESSIONS_ACTIONS = ["list_sessions", "delete_sessions"];
const SESSIONS_ROOT = join(DSH_HOME, "sessions");
const TRASH_DIR = join(ENHANCED_STATE_DIR, "trash");
/** ponytail: no cross-process lock exists on disk, so "open elsewhere" is
 * approximated by recency; raise/retry later if this misfires in practice. */
const IDLE_GUARD_MS = 15 * 60_000;
async function scanSessions() {
    const rows = [];
    let workspaces;
    try {
        workspaces = await readdir(SESSIONS_ROOT);
    }
    catch {
        return rows;
    }
    for (const workspace of workspaces) {
        let dirs;
        try {
            dirs = await readdir(join(SESSIONS_ROOT, workspace));
        }
        catch {
            continue;
        }
        for (const dir of dirs.filter((d) => d.startsWith("session-"))) {
            const full = join(SESSIONS_ROOT, workspace, dir);
            const st = await stat(full).catch(() => null);
            if (!st?.isDirectory())
                continue;
            // Size = one-level sum (README: discovery reads only the transcript, but
            // the dir is "reserved" for more artifacts, so count what's actually there).
            let bytes = 0;
            let modifiedMs = st.mtimeMs;
            for (const f of await readdir(full).catch(() => [])) {
                const fst = await stat(join(full, f)).catch(() => null);
                if (fst?.isFile()) {
                    bytes += fst.size;
                    if (fst.mtimeMs > modifiedMs)
                        modifiedMs = fst.mtimeMs;
                }
            }
            rows.push({ workspace, sessionId: dir.slice("session-".length), bytes, modifiedMs });
        }
    }
    return rows;
}
function tokenFor(rows) {
    return createHash("sha1").update(rows.map((r) => `${r.workspace}/${r.sessionId}:${r.bytes}`).sort().join("\n")).digest("hex").slice(0, 12);
}
/** Session ids live in this process's in-memory store, when exposed.
 * Store keys carry the full "session-<id>" form used on disk. */
function liveIds(env) {
    const out = new Set();
    try {
        const store = env.ctx?.sessions?.store;
        if (store instanceof Map)
            for (const id of store.keys())
                out.add(String(id));
    }
    catch { }
    return out;
}
async function planDelete(args, env) {
    const wanted = Array.isArray(args.sessionIds) ? args.sessionIds : [];
    const rows = await scanSessions();
    const live = liveIds(env);
    const byKey = new Map(rows.map((r) => [`${r.workspace}/${r.sessionId}`, r]));
    // Bare ids (the sidebar's session rows carry no workspace) also resolve;
    // uuid collisions across workspaces are not a real case, last one wins.
    const byBare = new Map(rows.map((r) => [r.sessionId, r]));
    const picked = [];
    const errors = [];
    for (const key of wanted) {
        const row = byKey.get(String(key)) ?? byBare.get(String(key).replace(/^session-/, ""));
        if (!row) {
            errors.push(`"${key}" is not a known session directory (re-scan with list_sessions)`);
            continue;
        }
        if (live.has(`session-${row.sessionId}`)) {
            errors.push(`"${key}" is open in this process right now — refused`);
            continue;
        }
        if (Date.now() - row.modifiedMs < IDLE_GUARD_MS) {
            errors.push(`"${key}" was active ${Math.round((Date.now() - row.modifiedMs) / 60000)} min ago — possibly open in another window; retry once it has been idle 15+ minutes`);
            continue;
        }
        picked.push(row);
    }
    return { rows: picked, errors };
}
export const handleSessions = async function (action, args, env) {
    switch (action) {
        case "list_sessions": {
            const rows = await scanSessions();
            const live = liveIds(env);
            return {
                sessions: rows.map((r) => ({
                    workspace: r.workspace,
                    sessionId: r.sessionId,
                    bytes: r.bytes,
                    modifiedIso: new Date(r.modifiedMs).toISOString(),
                    ageDays: Math.floor((Date.now() - r.modifiedMs) / 86_400_000),
                    minutesIdle: Math.round((Date.now() - r.modifiedMs) / 60_000),
                    liveHere: live.has(`session-${r.sessionId}`),
                })).sort((a, b) => b.minutesIdle - a.minutesIdle),
                totalBytes: rows.reduce((n, r) => n + r.bytes, 0),
                trashDir: TRASH_DIR,
            };
        }
        case "delete_sessions": {
            const { rows, errors } = await planDelete(args, env);
            if (errors.length && !rows.length)
                return { error: errors.join("; ") };
            const totalBytes = rows.reduce((n, r) => n + r.bytes, 0);
            if (args.confirm !== true) {
                return {
                    plan: rows.map((r) => ({ key: `${r.workspace}/${r.sessionId}`, bytes: r.bytes })),
                    totalBytes,
                    confirmToken: tokenFor(rows),
                    warnings: errors,
                    message: `Dry run: ${rows.length} session(s), ${totalBytes} bytes would move to ${TRASH_DIR}. ` +
                        `Re-run delete_sessions with sessionIds, confirm: true AND this exact confirmToken to execute.`,
                };
            }
            if (args.confirmToken !== tokenFor(rows)) {
                return { error: `confirmToken mismatch — sessions changed since the dry run; start over without confirm` };
            }
            await mkdir(TRASH_DIR, { recursive: true });
            const moved = [];
            for (const r of rows) {
                const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                const dest = join(TRASH_DIR, `${stamp}-${r.sessionId}`);
                await rename(join(SESSIONS_ROOT, r.workspace, `session-${r.sessionId}`), dest);
                moved.push(`${r.workspace}/${r.sessionId}`);
            }
            return {
                success: true,
                moved,
                freedBytes: totalBytes,
                warnings: errors,
                trashDir: TRASH_DIR,
                message: `Moved ${moved.length} session(s) (${totalBytes} bytes) to trash. Restore = move the directory back; purge = delete inside trash.`,
            };
        }
        default:
            return null;
    }
};
