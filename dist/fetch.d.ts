/**
 * Fetch module: exposes the `web_fetch` model tool through dsh-enhanced.
 * The tool retrieves the content of a specific HTTP(S) URL and returns it
 * rendered as markdown (HTML → turndown with GFM tables/strikethrough); text
 * bodies pass through. Non-2xx status is reported, not an error. The
 * tool-call timeout is a deployment policy (`dsh-tool-call-timeout-policy`),
 * not a model argument.
 *
 * ponytail: this is a thin wrapper around the global Node `fetch` (undici);
 * no new dependencies or external services are introduced. We bypass
 * `ctx.web.fetch` because the running harness has no fetch provider
 * registered in the active profile — `ctx.web.fetch` throws
 * WEB_PROVIDER_UNAVAILABLE for every call. Going through `ctx.web.fetch` is
 * the right design when a provider is mounted; until then, stdlib fetch
 * covers the same surface for HTML/text bodies.
 */
import type { Handler } from "./shared.js";
export declare const FETCH_ACTIONS: readonly ["web_fetch"];
/**
 * Register the `web_fetch` tool unconditionally at plugin boot.
 * Exported so the host apply() can wire it alongside dsh_search.
 */
export declare function registerFetchTool(ctx: any): void;
/**
 * Handler for the `web_fetch` action (no-op; tool registered at boot via registerFetchTool).
 */
export declare const handleFetch: Handler;
//# sourceMappingURL=fetch.d.ts.map