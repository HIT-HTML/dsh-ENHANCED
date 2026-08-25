export declare const DSH_HOME: string;
export declare const SKILLS_DIR: string;
export declare const PROFILES_DIR: string;
/** Plugin-owned runtime state (engine cooldowns); follows the SKILLS_DIR pattern. */
export declare const ENHANCED_STATE_DIR: string;
export declare const MCP_BEGIN = "# >>> dsh-enhanced:mcp >>>";
export declare const MCP_END = "# <<< dsh-enhanced:mcp <<<";
export declare const COMPACT_BEGIN = "# >>> dsh-enhanced:compact >>>";
export declare const COMPACT_END = "# <<< dsh-enhanced:compact <<<";
export declare const SEARCH_BEGIN = "# >>> dsh-enhanced:search >>>";
export declare const SEARCH_END = "# <<< dsh-enhanced:search <<<";
export declare const COMPACT_MIN = 0.5;
export declare const COMPACT_MAX = 0.75;
export declare const COMPACT_DEFAULT = 0.8;
export interface McpRow {
    id: string;
    name: string;
    disabled?: boolean;
    config: Record<string, unknown>;
}
/** What a feature module may touch: ctx, configured profiles, target picker. */
export interface Env {
    ctx: any;
    profiles: string[];
    targets(): string[];
    /** Live cordis loader ref, when the host exposed one (mcp_status). */
    loaderRef?: {
        entries?: () => Iterable<{
            id?: unknown;
            name?: unknown;
            fiber?: unknown;
        }>;
    };
    /** Explicit opt-in to restart under a detected process supervisor. */
    allowRestart?: boolean;
}
/** Every module returns null for actions it does not own. */
export type Handler = (action: string, args: Record<string, any>, env: Env) => Promise<Record<string, unknown> | null>;
export declare function assertName(name: unknown, pattern: RegExp, what: string): string;
export declare function patchPath(profile: string): string;
/** Split `text` at the managed block; a torn block (missing end marker) is dropped. */
export declare function splitBlock(text: string, begin: string, end: string): {
    head: string;
    tail: string;
};
/** Return the managed-block inner text (between begin and end), or "" if absent.
 * A torn block (missing end marker) reads as absent, matching splitBlock's
 * drop-on-write: readers must never show rows the next write would delete. */
export declare function splitInner(text: string, begin: string, end: string): string;
export declare function readPatch(profile: string): Promise<string>;
export declare function scrubSecrets(text: unknown): string;
//# sourceMappingURL=shared.d.ts.map