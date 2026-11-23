type Tui = (options?: { output?: string }) => Promise<void>;
let implementation: Tui | undefined;
export function registerCompiledTui(tui: Tui) { implementation = tui; }
export function compiledTui() { return implementation; }
