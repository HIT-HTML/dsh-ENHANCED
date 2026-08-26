/**
 * Plugin manager module: the write path the native Plugin Inventory tab
 * deliberately lacks (its own README: "Read-only Loader view — does not add
 * plugin mutation controls"). Per profile, state comes from three disk facts
 * — the manifest's `dsh.profile.bundles`, installed deps carrying a `dsh`
 * field, and disable rows in cordis.patch.yml — cross-checked against the
 * live loader when this process happens to BE that profile.
 *
 * Toggles write ONLY rows inside this plugin's own marker block; rows the
 * user wrote elsewhere in the patch are never touched. Profile boots watch
 * the patch file and recompose live (verified empirically on a lab boot:
 * config overrides, disables, and re-enables all applied without restart),
 * so a toggle lands immediately and the message says so.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";
import { PLUGINS_BEGIN, PLUGINS_END, PROFILES_DIR, assertName, patchPath, readPatch, splitBlock, splitInner, } from "./shared.js";
export const PLUGIN_ACTIONS = ["list_plugins", "set_plugin_enabled"];
/** Disabling these kills the GUI or this plugin mid-call; never allowed. */
const HARD_REFUSE = new Set(["dsh-base", "dsh-web-app", "dsh-enhanced"]);
async function readManifest(profile) {
    const out = { bundles: [], dshDeps: [] };
    let raw;
    try {
        raw = await readFile(join(PROFILES_DIR, profile, "package.json"), "utf8");
    }
    catch {
        return out;
    }
    try {
        const pkg = JSON.parse(raw);
        out.bundles = Array.isArray(pkg?.dsh?.profile?.bundles) ? pkg.dsh.profile.bundles.map(String) : [];
        for (const dep of Object.keys(pkg?.dependencies ?? {})) {
            // A dep is a plugin only if it declares a `dsh` field; plain libraries
            // (js-yaml…) would otherwise be noise in every list.
            try {
                const depPkg = JSON.parse(await readFile(join(PROFILES_DIR, profile, "node_modules", dep, "package.json"), "utf8"));
                if (depPkg && typeof depPkg === "object" && "dsh" in depPkg)
                    out.dshDeps.push(dep);
            }
            catch { }
        }
    }
    catch { }
    return out;
}
/** Disable rows from OUR managed block. Row ids are normalized through
 * configId() so legacy rows written under runtime-id form ("include:x")
 * collapse onto their config id and get cleaned up by the next toggle. */
function ourDisabled(text) {
    const map = new Map();
    const inner = splitInner(text, PLUGINS_BEGIN, PLUGINS_END);
    if (!inner.trim())
        return map;
    const parsed = yaml.load(inner);
    for (const row of Array.isArray(parsed) ? parsed : []) {
        if (row && typeof row.id === "string")
            map.set(configId(row.id), row.disabled === true);
    }
    return map;
}
/** Every id-disabled row anywhere in the patch (ours included). Best effort:
 * a broken user YAML must not kill listing — it just loses that signal. */
function allDisabledIds(text) {
    const ids = new Set();
    try {
        const parsed = yaml.load(text);
        for (const row of Array.isArray(parsed) ? parsed : []) {
            if (row && typeof row.id === "string" && row.disabled === true)
                ids.add(row.id);
        }
    }
    catch { }
    return ids;
}
async function writeOurRows(profile, rows) {
    const text = await readPatch(profile);
    const block = rows.length
        ? `${PLUGINS_BEGIN}\n${yaml.dump(rows, { lineWidth: 0, noRefs: true })}${PLUGINS_END}`
        : "";
    const { head, tail } = splitBlock(text, PLUGINS_BEGIN, PLUGINS_END);
    let next = head + tail;
    if (block)
        next = next.trimEnd() + "\n" + block + "\n";
    else
        next = next.replace(/\n+$/, "\n");
    await writeFile(patchPath(profile), next, "utf8");
}
/** Live loader facts: package name -> composition-row ids mounting it, plus
 * every entry id. Patch semantics (dsh-app-boot applyEntryPatches) match rows
 * by ENTRY ID — a row keyed by package name warns "not found" and is skipped,
 * so disables must target ids like "ui-theme-cyberpunk", not the package.
 * Loader runtime ids are namespaced with the mount source
 * ("include:ui-theme-cyberpunk"); the patch file operates on CONFIG ids, so
 * strip that prefix — verified against --dump-config ground truth. */
function configId(runtimeId) {
    return runtimeId.replace(/^(include:)+/, "");
}
function liveIndex(loaderRef) {
    const byPkg = new Map();
    const ids = new Set();
    try {
        for (const entry of loaderRef?.entries?.() ?? []) {
            const e = entry;
            const name = typeof e?.options?.name === "string" ? e.options.name : typeof e?.name === "string" ? e.name : undefined;
            if (typeof e?.id !== "string")
                continue;
            const id = configId(e.id);
            ids.add(id);
            if (name) {
                const list = byPkg.get(name) ?? [];
                if (!list.includes(id))
                    list.push(id);
                byPkg.set(name, list);
            }
        }
    }
    catch { }
    return { byPkg, ids };
}
export const handlePlugins = async function (action, args, env) {
    const { profiles } = env;
    switch (action) {
        case "list_plugins": {
            const { byPkg, ids } = liveIndex(env.loaderRef);
            const plugins = [];
            for (const profile of profiles) {
                const [manifest, patch] = await Promise.all([readManifest(profile), readPatch(profile)]);
                const ours = ourDisabled(patch);
                const anyDisabled = allDisabledIds(patch);
                const seen = new Set();
                for (const id of [...manifest.bundles, ...manifest.dshDeps, ...ours.keys()]) {
                    if (seen.has(id))
                        continue;
                    seen.add(id);
                    // A bundle's disable row carries its composition id(s), so check
                    // those too: "- id: ui-theme-cyberpunk / disabled" disables the
                    // dsh-theme-cyberpunk2077 package.
                    const mounts = [id, ...(byPkg.get(id) ?? [])];
                    plugins.push({
                        profile,
                        id,
                        bundled: manifest.bundles.includes(id),
                        installed: manifest.bundles.includes(id) || manifest.dshDeps.includes(id),
                        disabled: mounts.some((m) => anyDisabled.has(m)),
                        disabledByUs: mounts.some((m) => ours.get(m) === true),
                        live: ids.has(id) || byPkg.has(id),
                    });
                }
            }
            return { plugins };
        }
        case "set_plugin_enabled": {
            const id = assertName(args.pluginId, /^[A-Za-z0-9@/._-]{1,64}$/, "plugin");
            const enabled = args.enabled !== false;
            const short = id.includes("/") ? id.split("/").pop() : id;
            if (!enabled && (HARD_REFUSE.has(id) || HARD_REFUSE.has(short))) {
                return { error: `refusing to disable "${id}": it would kill the GUI or this plugin` };
            }
            if (!enabled && id.startsWith("@deepseek-ai/") && args.confirm !== true) {
                return { error: `disabling an official @deepseek-ai/* plugin can remove core surfaces; pass confirm: true to proceed` };
            }
            const targets = env.targets();
            const { byPkg } = liveIndex(env.loaderRef);
            // Rows this toggle owns: the package name AND every composition id that
            // mounts it (enable removes all forms; disable replaces stale ones).
            const mounts = [...new Set([id, ...(byPkg.get(id) ?? [])])];
            let touched = 0;
            let unresolved = false;
            for (const profile of targets) {
                const [manifest, patch] = await Promise.all([readManifest(profile), readPatch(profile)]);
                const known = new Set([...manifest.bundles, ...manifest.dshDeps, ...ourDisabled(patch).keys(), ...allDisabledIds(patch)]);
                if (!known.has(id)) {
                    return { error: `plugin "${id}" is not known in profile "${profile}" (installed, bundled, or already managed)` };
                }
                const rows = [...ourDisabled(patch).entries()]
                    .filter(([rowId]) => !mounts.includes(rowId))
                    .map(([rowId, disabled]) => ({ id: rowId, disabled }));
                if (!enabled) {
                    if (byPkg.get(id)?.length)
                        for (const entryId of byPkg.get(id))
                            rows.push({ id: entryId, disabled: true });
                    else {
                        // No live loader here to resolve the composition id (other-profile
                        // targeting): fall back to the package name, which the loader only
                        // honors if an entry actually carries that id.
                        rows.push({ id, disabled: true });
                        unresolved = true;
                    }
                }
                await writeOurRows(profile, rows);
                touched++;
            }
            return {
                success: true,
                enabled,
                ...(unresolved ? { warning: `no live composition entry found for "${id}" — wrote a package-name row that may not match; verify in the dump` } : {}),
                message: `${enabled ? "Enabled" : "Disabled"} "${id}" in ${touched} profile(s). ` +
                    `Profile boots watch cordis.patch.yml and recompose live — no restart needed; refresh browser surfaces to see it.`,
            };
        }
        default:
            return null;
    }
};
