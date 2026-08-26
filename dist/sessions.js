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
 * Deletion is a two-step move into the SYSTEM trash (macOS ~/.Trash, Linux
 * FreeDesktop Trash with .trashinfo sidecar, Windows Recycle Bin via
 * PowerShell): dry-run returns a plan + token; executing re-scans,
 * re-derives the token, and refuses on mismatch — a stale plan can never fire.
 * A failed move is reported to the user, never silently rerouted; TRASH_DIR
 * below remains only as the legacy location of pre-native deletions.
 */
import { readdir, stat, mkdir, rename, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DSH_HOME, ENHANCED_STATE_DIR } from "./shared.js";
export const SESSIONS_ACTIONS = ["list_sessions", "delete_sessions"];
const SESSIONS_ROOT = join(DSH_HOME, "sessions");
const TRASH_DIR = join(ENHANCED_STATE_DIR, "trash");
/** Destination for NEW deletions: the OS-native trash. DSH_ENHANCED_TRASH_DIR
 * overrides it (tests, exotic setups). Failures are reported, not rerouted. */
function nativeTrashDir() {
    if (process.env.DSH_ENHANCED_TRASH_DIR)
        return process.env.DSH_ENHANCED_TRASH_DIR;
    if (process.platform === "darwin")
        return join(homedir(), ".Trash");
    const data = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
    return join(data, "Trash", "files"); // FreeDesktop spec: files/ + info/
}
/** FreeDesktop .trashinfo sidecar so Linux desktops can offer "Restore". */
async function writeTrashInfo(filesDir, name, origin) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const body = `[Trash Info]\nPath=${encodeURI(origin).replace(/#/g, "%23").replace(/\?/g, "%3F")}` +
        `\nDeletionDate=${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}\n`;
    const infoDir = join(filesDir, "..", "info");
    await mkdir(infoDir, { recursive: true });
    await writeFile(join(infoDir, `${name}.trashinfo`), body);
}
/** Windows has no scriptable Recycle Bin API reachable from Node; the
 * VisualBasic FileSystem shell route ('SendToRecycleBin') is the proven one. */
async function recycleOnWindows(src) {
    const script = `Add-Type -AssemblyName Microsoft.VisualBasic; ` +
        `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${src.replace(/'/g, "''")}', 'OnlyErrorDialogs', 'SendToRecycleBin')`;
    await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
}
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
                nativeTrashDir: nativeTrashDir(),
                legacyTrashDir: TRASH_DIR,
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
                    message: `Dry run: ${rows.length} session(s), ${totalBytes} bytes would move to the system trash (${nativeTrashDir()}). ` +
                        `Re-run delete_sessions with sessionIds, confirm: true AND this exact confirmToken to execute.`,
                };
            }
            if (args.confirmToken !== tokenFor(rows)) {
                return { error: `confirmToken mismatch — sessions changed since the dry run; start over without confirm` };
            }
            const trashDir = nativeTrashDir();
            await mkdir(trashDir, { recursive: true });
            const moved = [];
            const failed = [];
            let freedBytes = 0;
            for (const r of rows) {
                const src = join(SESSIONS_ROOT, r.workspace, `session-${r.sessionId}`);
                try {
                    if (process.platform === "win32") {
                        await recycleOnWindows(src);
                    }
                    else {
                        const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${r.sessionId}`;
                        await rename(src, join(trashDir, name));
                        if (process.platform !== "darwin")
                            // ponytail: sidecar failure is non-fatal — the session is already
                            // safely trashed; only the desktop's Restore metadata is missing.
                            await writeTrashInfo(trashDir, name, src).catch(() => { });
                    }
                    moved.push(`${r.workspace}/${r.sessionId}`);
                    freedBytes += r.bytes;
                }
                catch (e) {
                    failed.push(`${r.workspace}/${r.sessionId}: ${e?.message?.split("\n")[0] ?? String(e)}`);
                }
            }
            if (!moved.length)
                return { error: `Move to system trash (${trashDir}) failed — nothing was deleted. ${failed.join("; ")}` };
            return {
                success: true,
                moved,
                failed,
                freedBytes,
                warnings: [...(errors.length ? [errors.join("; ")] : []), ...failed.map((f) => `NOT moved — ${f}`)],
                trashDir,
                legacyTrashDir: TRASH_DIR,
                message: failed.length
                    ? `Moved ${moved.length} session(s); ${failed.length} FAILED and remain in place — see warnings.`
                    : `Moved ${moved.length} session(s) (${freedBytes} bytes) to the system trash (${trashDir}). Restore via the OS trash, or by moving the folder back under ${SESSIONS_ROOT}.`,
            };
        }
        default:
            return null;
    }
};
