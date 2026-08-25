import z from "@deepseek-ai/schemastery";
declare const ALL_ENGINES: string[];
/**
 * Pure fallback-chain builder (exported for the selfcheck): preferred engine
 * first, then paid, then free. With a time filter, time-capable engines sort
 * ahead. Excluded engines (Search settings) and cooling engines (cooldown
 * state) never enter the chain; a blocked preferred engine is reported via
 * preferredSkippedReason instead of being attempted ("excluded" and
 * "cooldown" beat "time-filter" in reporting precedence).
 */
declare function buildChain(preferred: any, cfg: any, timeRange: any, cooling: any): {
    chain: any[];
    preferredSkippedReason: string | null;
};
declare const PLATFORMS: {
    github: {
        name: string;
    };
    v2ex: {
        name: string;
    };
    bilibili: {
        name: string;
    };
    reddit: {
        name: string;
    };
    hn: {
        name: string;
    };
    stackoverflow: {
        name: string;
    };
    wikipedia: {
        name: string;
    };
    npm: {
        name: string;
    };
};
declare function makeBridgeRoutes(settings: any, search: any, testEngine: any): {
    kind: string;
    path: string;
    handler: (req: any, res: any) => Promise<void>;
}[];
declare const Config: z<Schemastery.ObjectS<{
    provider: z<string, string>;
    cache: z<boolean, boolean>;
    cacheTtl: z<number, number>;
    lang: z<string, string>;
    region: z<string, string>;
    bingMarket: z<string, string>;
    searxngInstances: z<string[], string[]>;
    tavilyBaseUrl: z<string, string>;
    exaBaseUrl: z<string, string>;
    keenableBaseUrl: z<string, string>;
    excludedEngines: z<string[], string[]>;
    platforms: z<string[], string[]>;
    exaApiKey: z<string, string>;
    tavilyApiKey: z<string, string>;
    keenableApiKey: z<string, string>;
    perplexityApiKey: z<string, string>;
    deepseekApiKey: z<string, string>;
}>, Schemastery.ObjectT<{
    provider: z<string, string>;
    cache: z<boolean, boolean>;
    cacheTtl: z<number, number>;
    lang: z<string, string>;
    region: z<string, string>;
    bingMarket: z<string, string>;
    searxngInstances: z<string[], string[]>;
    tavilyBaseUrl: z<string, string>;
    exaBaseUrl: z<string, string>;
    keenableBaseUrl: z<string, string>;
    excludedEngines: z<string[], string[]>;
    platforms: z<string[], string[]>;
    exaApiKey: z<string, string>;
    tavilyApiKey: z<string, string>;
    keenableApiKey: z<string, string>;
    perplexityApiKey: z<string, string>;
    deepseekApiKey: z<string, string>;
}>>;
declare function apply(ctx: any, config: any): void;
export { apply, Config, ALL_ENGINES, PLATFORMS, makeBridgeRoutes, buildChain };
//# sourceMappingURL=free-search-vendor.d.ts.map