/**
 * Shared plumbing for dsh-enhanced feature modules: catalog paths, the
 * marker-delimited managed-block surgery used by every patch-writing feature,
 * and the Env bag index.ts hands each handler.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
export const DSH_HOME = process.env.DSH_HOME || join(homedir(), ".dsh");
export const SKILLS_DIR = join(DSH_HOME, "skills");
export const PROFILES_DIR = join(DSH_HOME, "profiles");
export const MCP_BEGIN = "# >>> dsh-enhanced:mcp >>>";
export const MCP_END = "# <<< dsh-enhanced:mcp <<<";
export const COMPACT_BEGIN = "# >>> dsh-enhanced:compact >>>";
export const COMPACT_END = "# <<< dsh-enhanced:compact <<<";
export const SEARCH_BEGIN = "# >>> dsh-enhanced:search >>>";
export const SEARCH_END = "# <<< dsh-enhanced:search <<<";
// Safe wiggle room around the harness default (0.8): below 50% compaction
// churns away working context; above 75% erodes the headroom whose absence
// once killed a session mid-compaction (413). The default stays reachable by
// removing the managed block, not by dragging past the guard rail.
export const COMPACT_MIN = 0.5;
export const COMPACT_MAX = 0.75;
export const COMPACT_DEFAULT = 0.8;
export function assertName(name, pattern, what) {
    if (typeof name !== "string" || !pattern.test(name)) {
        throw new Error(`Invalid ${what} name: ${JSON.stringify(name)}`);
    }
    return name;
}
export function patchPath(profile) {
    return join(PROFILES_DIR, profile, "cordis.patch.yml");
}
/** Split `text` at the managed block; a torn block (missing end marker) is dropped. */
export function splitBlock(text, begin, end) {
    const b = text.indexOf(begin);
    if (b < 0)
        return { head: text, tail: "" };
    const e = text.indexOf(end, b);
    if (e < 0)
        return { head: text.slice(0, b), tail: "" };
    let tailStart = e + end.length;
    if (text[tailStart] === "\r")
        tailStart++;
    if (text[tailStart] === "\n")
        tailStart++;
    return { head: text.slice(0, b), tail: text.slice(tailStart) };
}
/** Return the managed-block inner text (between begin and end), or "" if absent. */
export function splitInner(text, begin, end) {
    const { head, tail } = splitBlock(text, begin, end);
    return text.slice(head.length, text.length - tail.length);
}
export async function readPatch(profile) {
    try {
        return await readFile(patchPath(profile), "utf8");
    }
    catch {
        return "";
    }
}
