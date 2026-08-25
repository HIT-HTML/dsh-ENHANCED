import { type Handler } from "./shared.js";
export declare const SEARCH_ACTIONS: readonly ["list_search", "set_search"];
/** Parsed managed-block config for profile index 0 (engine boot config). */
export declare function readSearchConfig(profile: string): Promise<Record<string, any>>;
/**
 * Live health check for saved SearXNG instances (parallel, ~2.5s cap each).
 * Distinguishes "down" from "reachable but JSON API off" — the classic
 * settings.yml gotcha — so a wrong paste is visible, not silently skipped.
 */
export declare function probeInstances(urls: string[]): Promise<Array<Record<string, string>>>;
export declare const handleSearch: Handler;
/** Thin delegating tool: routes to the active web search provider. */
export declare function registerSearchTool(ctx: any): void;
//# sourceMappingURL=search.d.ts.map