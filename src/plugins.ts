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
import {
  PLUGINS_BEGIN,
  PLUGINS_END,
  PROFILES_DIR,
  assertName,
  patchPath,
  readPatch,
  splitBlock,
  splitInner,
  type Env,
  type Handler,
} from "./shared.js";

export const PLUGIN_ACTIONS = ["list_plugins", "set_plugin_enabled"] as const;

/** Disabling these kills the GUI or this plugin mid-call; never allowed. */
const HARD_REFUSE = new Set(["dsh-base", "dsh-web-app", "dsh-enhanced"]);

interface Manifest {
  bundles: string[];
  dshDeps: string[];
}

async function readManifest(profile: string): Promise<Manifest> {
  const out: Manifest = { bundles: [], dshDeps: [] };
  let raw: string;
  try {
    raw = await readFile(join(PROFILES_DIR, profile, "package.json"), "utf8");
  } catch {
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
        if (depPkg && typeof depPkg === "object" && "dsh" in depPkg) out.dshDeps.push(dep);
      } catch {}
    }
  } catch {}
  return out;
}

/** Disable rows from OUR managed block. */
function ourDisabled(text: string): Map<string, boolean> {
  const map = new Map<string, boolean>();
  const inner = splitInner(text, PLUGINS_BEGIN, PLUGINS_END);
  if (!inner.trim()) return map;
  const parsed = yaml.load(inner);
  for (const row of Array.isArray(parsed) ? (parsed as Record<string, any>[]) : []) {
    if (row && typeof row.id === "string") map.set(row.id, row.disabled === true);
  }
  return map;
}

/** Every id-disabled row anywhere in the patch (ours included). Best effort:
 * a broken user YAML must not kill listing — it just loses that signal. */
function allDisabledIds(text: string): Set<string> {
  const ids = new Set<string>();
  try {
    const parsed = yaml.load(text);
    for (const row of Array.isArray(parsed) ? (parsed as Record<string, any>[]) : []) {
      if (row && typeof row.id === "string" && row.disabled === true) ids.add(row.id);
    }
  } catch {}
  return ids;
}

async function writeOurRows(profile: string, rows: Record<string, unknown>[]): Promise<void> {
  const text = await readPatch(profile);
  const block = rows.length
    ? `${PLUGINS_BEGIN}\n${yaml.dump(rows, { lineWidth: 0, noRefs: true })}${PLUGINS_END}`
    : "";
  const { head, tail } = splitBlock(text, PLUGINS_BEGIN, PLUGINS_END);
  let next = head + tail;
  if (block) next = next.trimEnd() + "\n" + block + "\n";
  else next = next.replace(/\n+$/, "\n");
  await writeFile(patchPath(profile), next, "utf8");
}

export const handlePlugins: Handler = async function (action, args, env: Env) {
  const { profiles } = env;
  switch (action) {
    case "list_plugins": {
      const liveNames = new Set<string>();
      try {
        for (const entry of env.loaderRef?.entries?.() ?? []) {
          if (typeof entry?.name === "string") liveNames.add(entry.name);
        }
      } catch {}
      const plugins = [];
      for (const profile of profiles) {
        const [manifest, patch] = await Promise.all([readManifest(profile), readPatch(profile)]);
        const ours = ourDisabled(patch);
        const anyDisabled = allDisabledIds(patch);
        const seen = new Set<string>();
        for (const id of [...manifest.bundles, ...manifest.dshDeps, ...ours.keys()]) {
          if (seen.has(id)) continue;
          seen.add(id);
          plugins.push({
            profile,
            id,
            bundled: manifest.bundles.includes(id),
            installed: manifest.bundles.includes(id) || manifest.dshDeps.includes(id),
            disabled: anyDisabled.has(id),
            disabledByUs: ours.get(id) === true,
            live: liveNames.has(id),
          });
        }
      }
      return { plugins };
    }
    case "set_plugin_enabled": {
      const id = assertName(args.pluginId, /^[A-Za-z0-9@/._-]{1,64}$/, "plugin");
      const enabled = args.enabled !== false;
      const short = id.includes("/") ? id.split("/").pop()! : id;
      if (!enabled && (HARD_REFUSE.has(id) || HARD_REFUSE.has(short))) {
        return { error: `refusing to disable "${id}": it would kill the GUI or this plugin` };
      }
      if (!enabled && id.startsWith("@deepseek-ai/") && args.confirm !== true) {
        return { error: `disabling an official @deepseek-ai/* plugin can remove core surfaces; pass confirm: true to proceed` };
      }
      const targets = env.targets();
      let touched = 0;
      for (const profile of targets) {
        const [manifest, patch] = await Promise.all([readManifest(profile), readPatch(profile)]);
        const known = new Set([...manifest.bundles, ...manifest.dshDeps, ...ourDisabled(patch).keys(), ...allDisabledIds(patch)]);
        if (!known.has(id)) {
          return { error: `plugin "${id}" is not known in profile "${profile}" (installed, bundled, or already managed)` };
        }
        const rows = [...ourDisabled(patch).entries()]
          .filter(([rowId]) => rowId !== id)
          .map(([rowId, disabled]) => ({ id: rowId, disabled }));
        if (!enabled) rows.push({ id, disabled: true });
        await writeOurRows(profile, rows);
        touched++;
      }
      return {
        success: true,
        enabled,
        message:
          `${enabled ? "Enabled" : "Disabled"} "${id}" in ${touched} profile(s). ` +
          `Profile boots watch cordis.patch.yml and recompose live — no restart needed; refresh browser surfaces to see it.`,
      };
    }
    default:
      return null;
  }
};
