import type { Handler } from "./shared.js";
/** Our port from --port argv (RPC callers carry no Host header). */
export declare function servingPort(argv?: string[]): number | null;
export declare const INSTANCE_ACTIONS: readonly ["shutdown_instance", "restart_instance"];
export declare const handleInstance: Handler;
//# sourceMappingURL=instance.d.ts.map