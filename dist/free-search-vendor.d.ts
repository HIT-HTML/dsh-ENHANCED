import z from "@deepseek-ai/schemastery";
declare const ALL_ENGINES: string[];
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
    platforms: z<string[], string[]>;
    exaApiKey: z<string, string>;
    tavilyApiKey: z<string, string>;
    keenableApiKey: z<string, string>;
    perplexityApiKey: z<string, string>;
    deepseekApiKey: z<string, string>;
}>>;
declare function apply(ctx: any, config: any): void;
export { apply, Config, ALL_ENGINES, PLATFORMS, makeBridgeRoutes };
//# sourceMappingURL=free-search-vendor.d.ts.map