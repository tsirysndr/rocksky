import { commandNames } from "./commands.js";
export interface MpdServerOptions {
    getToken: () => string | undefined;
    port: number;
    bind?: string;
    portFallbacks?: number;
    log?: (msg: string) => void;
}
export interface MpdServerHandle {
    port: number;
    close: () => void;
}
export declare function startMpdServer(opts: MpdServerOptions): Promise<MpdServerHandle>;
export { commandNames };
