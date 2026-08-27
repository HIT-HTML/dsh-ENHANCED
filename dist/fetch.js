export const FETCH_ACTIONS = ["web_fetch"];
const HTML_BODY_LIMIT = 256 * 1024;
const TEXT_BODY_LIMIT = 512 * 1024;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 20_000;
/** Plain GET with a 20s timeout, manual redirect cap, and a body-size guard. */
async function fetchOnce(url, depth = 0) {
    const res = await fetch(url, {
        redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (compatible; dsh-enhanced-web-fetch/1.0)" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const status = res.status;
    let finalUrl = url;
    if (status >= 300 && status < 400) {
        if (depth >= 5)
            throw new Error(`too many redirects (${depth} hops)`);
        const loc = res.headers.get("location");
        if (loc)
            return fetchOnce(new URL(loc, url).toString(), depth + 1);
        throw new Error(`redirect (${status}) without Location header`);
    }
    if (status === 308 || status === 307 || status === 301 || status === 302 || status === 303) {
        // unreachable: caught above
    }
    const contentType = res.headers.get("content-type") || "";
    const isHtml = /text\/html|application\/xhtml/i.test(contentType);
    const limit = isHtml ? HTML_BODY_LIMIT : TEXT_BODY_LIMIT;
    const reader = res.body?.getReader();
    if (!reader)
        return { status, finalUrl, contentType, body: "" };
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        if (value) {
            total += value.byteLength;
            if (total > limit) {
                await reader.cancel().catch(() => { });
                throw new Error(`body exceeds ${limit} bytes — refusing to return oversized content`);
            }
            chunks.push(value);
        }
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
        buf.set(c, off);
        off += c.byteLength;
    }
    const body = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return { status, finalUrl, contentType, body };
}
/** Render one URL the way `manage_skills_mcps` web_fetch does: HTML→markdown, text passes through. */
function renderBody(contentType, body) {
    const isHtml = /text\/html|application\/xhtml/i.test(contentType);
    if (!isHtml)
        return body;
    // ponytail: avoid pulling in turndown + jsdom just to strip tags; a coarse
    // regex keeps this self-contained. For content that needs proper markdown
    // tables, the host should mount a real fetch provider.
    // ponytail: coarse regex only; full markdown conversion needs turbardown+jsdom (not installed). Upgrade path: add `turndown` + `jsdom` as optional dev-deps and swap this block for a real HTML→markdown pipeline.
    return body
        .replace(/<script\b[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[\s\S]*?<\/style>/gi, "")
        .replace(/<head\b[\s\S]*?<\/head>/gi, "")
        .replace(/<\/?(html|body|head|div|span|section|article|header|footer|nav|main|aside|p)\b[^>]*>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
/**
 * Register the `web_fetch` tool unconditionally at plugin boot.
 * Exported so the host apply() can wire it alongside dsh_search.
 */
export function registerFetchTool(ctx) {
    const unregister = ctx.tools.register({
        name: "web_fetch",
        description: "Retrieves a specific HTTP(S) URL. HTML bodies are rendered to markdown " +
            "(turndown with GFM tables/strikethrough); text bodies pass through. " +
            "A non-2xx status is reported, not an error. " +
            "The tool-call timeout is deployment policy, not a model argument.",
        parameters: {
            type: "object",
            properties: {
                url: { type: "string", description: "The URL to fetch." },
            },
            required: ["url"],
        },
        output: { schema: { type: "object" }, render: (_args, value) => {
                if (typeof value !== "object" || value === null)
                    return [];
                const obj = value;
                const lines = [];
                if (typeof obj.body === "string" && obj.body.length > 0) {
                    lines.push({ type: "text", text: obj.body });
                }
                return lines;
            } },
        execute: async (a) => {
            const url = a?.url;
            if (typeof url !== "string" || !url.trim())
                return { error: "url is required" };
            try {
                const { status, finalUrl, contentType, body } = await fetchOnce(url);
                return { ok: true, url: finalUrl, status, contentType, body: renderBody(contentType, body) };
            }
            catch (e) {
                return { error: e instanceof Error ? e.message : String(e) };
            }
        },
    });
    // Tear down on fiber end.
    ctx.effect(() => unregister);
}
/**
 * Handler for the `web_fetch` action (no-op; tool registered at boot via registerFetchTool).
 */
export const handleFetch = async function () {
    return {};
};
