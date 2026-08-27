/**
 * dsh-enhanced — persistent skill + MCP server management for DeepSeek Harness.
 *
 * Host composition root. This file owns ONLY the surfaces (model tool, browser
 * RPC, settings-card namespace) and dispatches every action to a feature
 * module; each module owns its actions end to end:
 *
 *   skills.ts  — managed SKILL.md catalog under <DSH_HOME>/skills
 *   mcp.ts     — @deepseek-ai/dsh-mcp-client rows in profile cordis.patch.yml
 *   compact.ts — clamped thresholdRatio override for dsh-compaction-basic
 *
 * Adding a feature = new src/<feature>.ts exporting ACTIONS + a Handler and
 * one line in HANDLERS below.
 */
import { handleSkills, SKILL_ACTIONS } from "./skills.js";
import { handleMcp, MCP_ACTIONS } from "./mcp.js";
import { handleCompact, COMPACT_ACTIONS } from "./compact.js";
import { handleFetch, FETCH_ACTIONS, registerFetchTool } from "./fetch.js";
import { handleInstance, INSTANCE_ACTIONS } from "./instance.js";
import { handlePlugins, PLUGIN_ACTIONS } from "./plugins.js";
import { handleSessions, SESSIONS_ACTIONS } from "./sessions.js";
import { handleSearch, SEARCH_ACTIONS, registerSearchTool, readSearchConfig } from "./search.js";
import * as freeSearch from "./free-search-vendor.js";
import { scrubSecrets } from "./shared.js";
// Disk-format helper embedders may reuse (test suite included).
export { parseSkillDoc } from "./skills.js";
const ACTIONS = [...SKILL_ACTIONS, ...MCP_ACTIONS, ...COMPACT_ACTIONS, ...INSTANCE_ACTIONS, ...PLUGIN_ACTIONS, ...SESSIONS_ACTIONS, ...SEARCH_ACTIONS, ...FETCH_ACTIONS];
/** Feature modules in dispatch order. */
const HANDLERS = [handleSkills, handleMcp, handleCompact, handleInstance, handlePlugins, handleSessions, handleSearch, handleFetch];
export const name = "dsh-enhanced";
export const inject = ["tools", "skills", "connection"];
export function apply(ctx, config) {
    // Profiles whose cordis.patch.yml receives managed rows.
    const profiles = config?.mcpProfiles ?? ["default", "web"];
    // Live MCP state reads the cordis loader (fiber liveness). It is optional:
    // a host without it just reports coarser states.
    let loaderRef;
    if (typeof ctx.inject === "function") {
        ctx.inject(["loader"], (scope) => {
            loaderRef = scope.loader;
        });
    }
    // Shared action core: the model tool AND the browser RPC channel both call
    // this, so the GUI and the agent can never drift apart.
    async function performAction(raw) {
        const args = raw && typeof raw === "object" ? raw : {};
        try {
            const env = {
                ctx,
                profiles,
                loaderRef,
                allowRestart: config?.allowRestart === true,
                targets() {
                    const requested = args.profiles;
                    // Per-op profile targeting: unknown names are rejected so typos
                    // surface instead of silently no-opping.
                    const t = requested ? requested.map(String).filter((p) => profiles.includes(p)) : profiles;
                    if (!t.length || (requested && t.length !== requested.length))
                        throw new Error(`profiles must be a non-empty subset of: ${profiles.join(", ")}`);
                    return t;
                },
            };
            for (const handler of HANDLERS) {
                const res = await handler(String(args.action), args, env);
                if (res)
                    return res;
            }
            return { error: `Unknown action: ${args.action}` };
        }
        catch (error) {
            // Single chokepoint for ALL module action errors: scrub credential shapes
            // before any engine/gateway text reaches the model or the settings card.
            return { error: scrubSecrets(error instanceof Error ? error.message : String(error)) };
        }
    }
    const unregister = ctx.tools.register({
        name: "manage_skills_mcps",
        description: "Manage agent skills and MCP servers persistently. Skills are written as " +
            "<dsh-home>/skills/<name>/SKILL.md and hot-reload. MCP servers become " +
            "@deepseek-ai/dsh-mcp-client rows in the profile patch composition; they " +
            "take effect when the affected profile restarts. list_plugins / " +
            "set_plugin_enabled toggle any mounted plugin per profile via the patch " +
            "layer — profile boots watch the file and recompose live, no restart. " +
            "set_compact re-tunes the harness auto-compaction trigger within a safe " +
            "0.5–0.75 range. set_search manages Free Search's provider/region/market/" +
            "API-key config. shutdown_instance / restart_instance end or relaunch the " +
            "GUI process the plugin runs in. list_sessions / delete_sessions scan " +
            "~/.dsh/sessions and move whole session directories into a crash-safe " +
            "trash (open or recently-active sessions are refused); deletion is " +
            "dry-run first and needs confirm plus the returned token.",
        parameters: {
            type: "object",
            properties: {
                action: { type: "string", enum: [...ACTIONS], description: "Action to perform." },
                skillName: { type: "string", description: "Skill name (kebab-case) for skill actions." },
                description: { type: "string", description: "Skill description for add/edit_skill." },
                whenToUse: { type: "string", description: "Optional whenToUse guidance for add/edit_skill." },
                skillBody: { type: "string", description: "Markdown body (below the frontmatter) for add/edit_skill." },
                sourcePath: { type: "string", description: "Absolute folder containing SKILL.md for install_skill (scripts and subfolders come along)." },
                overwrite: { type: "boolean", description: "Replace an existing skill on install_skill." },
                files: {
                    type: "array",
                    description: "For install_skill_files: [{path, data}] — relative paths (including the top folder name) and base64 file contents picked in the browser.",
                    items: {
                        type: "object",
                        properties: { path: { type: "string" }, data: { type: "string" } },
                        required: ["path", "data"],
                    },
                },
                mcpName: { type: "string", description: "MCP serverName for mcp actions." },
                pluginId: { type: "string", description: "Plugin package id for list_plugins/set_plugin_enabled (e.g. @liustack/modlens)." },
                enabled: { type: "boolean", description: "Target state for set_plugin_enabled; defaults to true." },
                sessionIds: { type: "array", items: { type: "string" }, description: "delete_sessions: \"workspace/sessionId\" keys from list_sessions." },
                confirmToken: { type: "string", description: "delete_sessions: token returned by the dry run; required with confirm to execute." },
                confirm: {
                    type: "boolean",
                    description: "Must be true to disable an official @deepseek-ai/* plugin via set_plugin_enabled.",
                },
                mcpConfig: {
                    type: "object",
                    description: "Connection config for add_mcp: stdio needs {command, args?, env?}; " +
                        "streamable-http needs {url, headers?}. transport defaults to stdio.",
                },
                profiles: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional target profiles for MCP add/remove/enable/disable; defaults to all configured profiles.",
                },
                thresholdRatio: {
                    type: "number",
                    description: "Auto-compaction trigger as a share of the context window for set_compact; must be 0.5–0.75.",
                },
                provider: { type: "string", description: "Free Search provider engine for set_search (ddg, bing, exa, …)." },
                region: { type: "string", description: "DDG region for set_search (e.g. cn-zh)." },
                bingMarket: { type: "string", description: "Bing market for set_search (e.g. zh-CN)." },
                exaApiKey: { type: "string", description: "Exa API key (secret) for set_search; blank preserves the existing value." },
                tavilyApiKey: { type: "string", description: "Tavily API key (secret) for set_search; blank preserves the existing value." },
                keenableApiKey: { type: "string", description: "Keenable API key (secret) for set_search; blank preserves the existing value." },
                perplexityApiKey: { type: "string", description: "Perplexity API key (secret) for set_search; blank preserves the existing value." },
                deepseekApiKey: { type: "string", description: "DeepSeek API key (secret) for set_search; blank preserves the existing value." },
                tavilyBaseUrl: { type: "string", description: "Optional full Tavily endpoint override for set_search (self-hosted/proxy gateway); blank clears." },
                exaBaseUrl: { type: "string", description: "Optional full Exa endpoint override for set_search; blank clears." },
                keenableBaseUrl: { type: "string", description: "Optional full Keenable endpoint override for set_search; blank clears." },
                excludedEngines: { type: "string", description: "CSV or array of engines to drop from the fallback chain for set_search (e.g. \"ddg, perplexity\"); empty clears." },
            },
            required: ["action"],
        },
        output: {
            schema: { type: "object" },
            render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
        },
        execute: (args) => performAction(args),
    });
    ctx.effect(() => unregister);
    // Thin search tool: delegates to the active web search provider (Free Search).
    registerSearchTool(ctx);
    // web_fetch tool: retrieves HTTP(S) URLs via harness's ctx.web.fetch.
    registerFetchTool(ctx);
    // Built-in Free Search engine (vendored): registers the search provider, its
    // agent tools and a loopback test bridge whenever the harness `web` service
    // is present. Config comes from this plugin's own managed search row, so the
    // Settings → Search tab controls the engine with no second plugin installed.
    const searchConfig = { provider: "bing" };
    void readSearchConfig(profiles[0])
        .then((cfg) => Object.assign(searchConfig, cfg))
        .catch(() => { });
    if (typeof ctx.inject === "function") {
        ctx.inject(["web"], (scope) => {
            try {
                freeSearch.apply(scope, searchConfig);
            }
            catch (error) {
                console.error(`[dsh-enhanced] built-in Free Search skipped: ${String(error)}`);
            }
        });
    }
    // Browser surface: Settings → Plugins → "Skills & MCPs" tab talks to the same
    // action core over a package-private RPC channel. The returned disposer is
    // fiber-owned, so stop/update tears the HTTP route down automatically.
    const connection = ctx.get("connection");
    if (connection?.rpc?.handle) {
        connection.rpc.handle("/dsh-enhanced", async (_endpoint, payload) => ({ ok: true, value: await performAction(payload) }), { authority: "trusted-host" });
    }
    // Settings → Plugins → "Plugin Configuration" card anchor (the modsearch
    // pattern): that tab dispatches plugin cards by served settings namespace,
    // so an empty pass-through namespace makes our browser card renderable. Real
    // state stays in skills/ + cordis.patch.yml; nothing is stored here.
    if (typeof ctx.inject === "function") {
        ctx.inject(["settings"], (scope) => {
            try {
                const passThrough = (value) => ({ ...(value ?? {}) });
                passThrough.toJSON = () => ({ uid: 0, refs: { 0: { type: "object", meta: { default: {} }, dict: {} } } });
                scope.settings.register("dsh-enhanced", passThrough, { base: {} });
            }
            catch (error) {
                console.error(`[dsh-enhanced] settings namespace skipped: ${String(error)}`);
            }
        });
    }
}
