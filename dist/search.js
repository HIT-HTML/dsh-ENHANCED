/**
 * Search module: manages Free Search's configuration (the `web-search-free`
 * row's `config:` block) in a managed block of each configured profile's
 * cordis.patch.yml, and exposes a thin `dsh_search` tool that delegates to the
 * active web search provider — the engine itself ships vendored in
 * free-search-vendor.ts, and index.ts feeds this row's config to it on boot.
 *
 * ponytail: the override REUSES Free Search's own row id (`web-search-free`) so
 * it wins over the bundle patch instead of inserting a second, colliding row.
 * Secrets are never echoed to the client; a left-blank key field preserves the
 * existing value (clearing a key = use Free Search's own UI).
 */
import { writeFile } from "node:fs/promises";
import yaml from "js-yaml";
import { SEARCH_BEGIN, SEARCH_END, patchPath, readPatch, splitBlock, splitInner, } from "./shared.js";
export const SEARCH_ACTIONS = ["list_search", "set_search"];
const KEY_FIELDS = ["exaApiKey", "tavilyApiKey", "keenableApiKey", "perplexityApiKey", "deepseekApiKey"];
/** Coerce a Bing market code to the canonical lang-COUNTRY shape; passthrough otherwise. */
function normalizeMarket(v) {
    const t = String(v || "zh-CN").trim();
    const m = t.match(/^([a-zA-Z]{2})[-_ ]?([a-zA-Z]{2})$/);
    return m ? `${m[1].toLowerCase()}-${m[2].toUpperCase()}` : t;
}
/** The override row's config block (or null when the managed block is absent). */
function parseConfig(text) {
    const inner = splitInner(text, SEARCH_BEGIN, SEARCH_END);
    if (!inner.trim())
        return null;
    const parsed = yaml.load(inner);
    const arr = Array.isArray(parsed) ? parsed : [];
    const entry = arr.find((r) => r && r.id === "web-search-free");
    return (entry && entry.config) || null;
}
async function writeSearch(profile, cfg) {
    const text = await readPatch(profile);
    const entry = { id: "web-search-free", name: "dsh-free-search", config: cfg };
    const block = `${SEARCH_BEGIN}\n${yaml.dump([entry], { lineWidth: 0, noRefs: true })}${SEARCH_END}`;
    const { head, tail } = splitBlock(text, SEARCH_BEGIN, SEARCH_END);
    await writeFile(patchPath(profile), (head + tail).trimEnd() + "\n" + block + "\n", "utf8");
}
/** Parsed managed-block config for profile index 0 (engine boot config). */
export async function readSearchConfig(profile) {
    return parseConfig(await readPatch(profile)) ?? {};
}
/**
 * Live health check for saved SearXNG instances (parallel, ~2.5s cap each).
 * Distinguishes "down" from "reachable but JSON API off" — the classic
 * settings.yml gotcha — so a wrong paste is visible, not silently skipped.
 */
export async function probeInstances(urls) {
    return Promise.all(urls.map(async (url) => {
        try {
            const res = await fetch(`${url}/search?q=test&format=json`, {
                signal: AbortSignal.timeout(2500),
                headers: { accept: "application/json" },
            });
            const body = await res.json().catch(() => null);
            if (res.ok && body && Array.isArray(body.results))
                return { url, state: "ok", detail: `answering (${body.results.length} results for ping)` };
            if (!res.ok)
                return { url, state: "misconfigured", detail: `HTTP ${res.status} — reachable, but the JSON API is off (settings.yml needs search.formats: json)` };
            return { url, state: "misconfigured", detail: "responded, but not with SearXNG JSON" };
        }
        catch {
            return { url, state: "down", detail: "no answer — nothing reachable at that URL" };
        }
    }));
}
export const handleSearch = async function (action, args, env) {
    const { profiles } = env;
    switch (action) {
        case "list_search": {
            const cfg = parseConfig(await readPatch(profiles[0]));
            const hasKey = {};
            for (const k of KEY_FIELDS)
                hasKey[k] = !!cfg?.[k];
            const instances = Array.isArray(cfg?.searxngInstances) ? cfg.searxngInstances : [];
            return {
                provider: cfg?.provider ?? "bing",
                region: cfg?.region ?? "",
                bingMarket: cfg?.bingMarket ?? "zh-CN",
                searxngInstances: instances.join(", "),
                instanceStatus: instances.length ? await probeInstances(instances) : [],
                hasKey,
            };
        }
        case "set_search": {
            const targets = env.targets();
            for (const profile of targets) {
                const existing = parseConfig(await readPatch(profile)) || {};
                const cfg = {
                    provider: String(args.provider || "bing"),
                    region: String(args.region || "").trim().toLowerCase(),
                    bingMarket: normalizeMarket(String(args.bingMarket || "zh-CN")),
                };
                // SearXNG instance URLs (comma/newline separated); empty clears them.
                const instances = String(args.searxngInstances ?? "")
                    .split(/[\s,]+/)
                    // Tolerate pastes: missing scheme -> http://, trailing slashes stripped
                    // (engine appends /search itself). Bogus hosts are harmless: the
                    // engine skips dead instances and falls down the chain.
                    .map((s) => {
                    s = s.trim();
                    if (s && !/^https?:\/\//i.test(s))
                        s = "http://" + s;
                    return s.replace(/\/+$/, "");
                })
                    .filter((s) => /^https?:\/\//i.test(s));
                if (instances.length)
                    cfg.searxngInstances = instances;
                // Blank key field => keep the current value (never echo secrets).
                for (const k of KEY_FIELDS) {
                    const v = args[k];
                    if (typeof v === "string" && v.trim())
                        cfg[k] = v.trim();
                    else if (existing[k] != null)
                        cfg[k] = existing[k];
                }
                await writeSearch(profile, cfg);
            }
            return { success: true, message: `Search config written to profiles: ${targets.join(", ")}. Restart each profile to apply.` };
        }
        default:
            return null;
    }
};
/** Thin delegating tool: routes to the active web search provider. */
export function registerSearchTool(ctx) {
    const unregister = ctx.tools.register({
        name: "dsh_search",
        description: "Thin web-search passthrough: delegates to the active search provider (e.g. Free Search) registered " +
            "with the harness — dsh-enhanced holds no engine code. Returns {provider, sources, content}. Fails clearly " +
            "when no search provider is loaded.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query." },
                maxResults: { type: "number", description: "Max results (1-10)." },
                timeRange: { type: "string", description: "Optional time filter: day|week|month|year or an ISO date." },
                engine: { type: "string", description: "Optional explicit engine override (ddg, bing, exa, …)." },
            },
            required: ["query"],
        },
        output: { schema: { type: "object" }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
        execute: async (a) => {
            const web = ctx.get("web");
            if (!web || typeof web.search !== "function")
                return { ok: false, error: "no search provider registered (is the Free Search plugin loaded?)" };
            const query = a?.query;
            if (typeof query !== "string" || !query.trim())
                return { ok: false, error: "query is required" };
            const result = await web.search({ query, maxResults: Number(a?.maxResults) || 5, timeRange: a?.timeRange, engine: a?.engine });
            return { ok: true, ...(result || {}) };
        },
    });
    ctx.effect(() => unregister);
}
