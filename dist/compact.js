/**
 * Auto-compact module: @deepseek-ai/dsh-compaction-basic already auto-compacts
 * (default trigger 0.8 of the context window); this module manages a clamped
 * thresholdRatio override for it in a managed block of each configured
 * profile's `cordis.patch.yml`.
 */
import { writeFile } from "node:fs/promises";
import yaml from "js-yaml";
import { COMPACT_BEGIN, COMPACT_DEFAULT, COMPACT_END, COMPACT_MAX, COMPACT_MIN, patchPath, readPatch, splitBlock, splitInner, } from "./shared.js";
export const COMPACT_ACTIONS = ["compact_status", "set_compact"];
/** The staged thresholdRatio from the managed block, or null when absent. */
function compactOverride(text) {
    const inner = splitInner(text, COMPACT_BEGIN, COMPACT_END);
    if (!inner.trim())
        return null;
    const parsed = yaml.load(inner);
    for (const row of Array.isArray(parsed) ? parsed : []) {
        if (row && row.id === "compaction-basic" && typeof row.config?.thresholdRatio === "number") {
            return row.config.thresholdRatio;
        }
    }
    return null;
}
async function writeCompact(profile, ratio) {
    const text = await readPatch(profile);
    // A non-insert patch entry: overrides the base bundle's compaction-basic row.
    const entry = {
        id: "compaction-basic",
        name: "@deepseek-ai/dsh-compaction-basic",
        config: { thresholdRatio: ratio },
    };
    const block = `${COMPACT_BEGIN}\n${yaml.dump([entry], { lineWidth: 0, noRefs: true })}${COMPACT_END}`;
    const { head, tail } = splitBlock(text, COMPACT_BEGIN, COMPACT_END);
    await writeFile(patchPath(profile), (head + tail).trimEnd() + "\n" + block + "\n", "utf8");
}
export const handleCompact = async function (action, args, env) {
    const { profiles } = env;
    switch (action) {
        case "compact_status": {
            // Profiles should agree; report the first override found.
            // ponytail: one profile exists today — per-profile display only if
            // that ever stops being true.
            let found = null;
            for (const profile of profiles) {
                const v = compactOverride(await readPatch(profile));
                if (found == null && v != null)
                    found = v;
            }
            return { ratio: found ?? COMPACT_DEFAULT, overridden: found != null, min: COMPACT_MIN, max: COMPACT_MAX };
        }
        case "set_compact": {
            const r = Number(args.thresholdRatio);
            if (!Number.isFinite(r))
                return { error: "thresholdRatio must be a number" };
            // Trust boundary: the guard rail lives here too, not just in the slider.
            if (r < COMPACT_MIN || r > COMPACT_MAX) {
                return { error: `thresholdRatio must be between ${COMPACT_MIN} and ${COMPACT_MAX}; remove the managed block to return to the ${COMPACT_DEFAULT} harness default` };
            }
            const targets = env.targets();
            for (const profile of targets)
                await writeCompact(profile, r);
            return { success: true, ratio: r, message: `Auto-compact triggers at ${Math.round(r * 100)}% in profiles: ${targets.join(", ")}. Restart each profile to apply.` };
        }
        default:
            return null;
    }
};
