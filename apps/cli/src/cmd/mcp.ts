// `rocksky mcp` — hand stdio to the native MCP server.
//
// The server itself is the `rocksky-mcp` Rust binary (see rocksky-mcp/ in the
// repo): it speaks the remote-control protocol to the listener's players,
// browses the Navidrome library and reads the AppView over XRPC, none of which
// this process needs to know about. All we do is find the binary and get out
// of the way — stdio is inherited, so protocol frames flow straight between
// the MCP client and the server.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type McpOptions = {
  device?: string;
  apiUrl?: string;
  wsUrl?: string;
  tokenPath?: string;
};

// `@rocksky/mcp` ships the binary for this platform (downloading it from the
// matching GitHub release on first use). It is an optional dependency, so a
// `rocksky-mcp` already on PATH is the fallback — which is also how you point
// the CLI at a local `cargo build` during development.
async function resolveBinary(): Promise<string> {
  const override = process.env.ROCKSKY_MCP_BIN?.trim();
  if (override) {
    return override;
  }
  try {
    const { ensureBinary } = require("@rocksky/mcp");
    return await ensureBinary();
  } catch (error) {
    // A require stack is several lines long and none of them help here.
    const reason = String((error as Error).message).split("\n")[0];
    process.stderr.write(
      `rocksky: could not provision the MCP server binary (${reason}); falling back to \`rocksky-mcp\` on PATH\n`,
    );
    return "rocksky-mcp";
  }
}

function argsFor(options: McpOptions): string[] {
  const args: string[] = [];
  const pass = (flag: string, value?: string) => {
    if (value?.trim()) {
      args.push(flag, value.trim());
    }
  };
  // Anything left unset falls through to the server's own defaults: the
  // hosted Rocksky API, its remote-control socket, and ~/.rocksky/token.json.
  pass("--device", options.device);
  pass("--api-url", options.apiUrl);
  pass("--ws-url", options.wsUrl);
  pass("--token-path", options.tokenPath);
  return args;
}

export async function mcp(options: McpOptions = {}) {
  const bin = await resolveBinary();
  const child = spawn(bin, argsFor(options), { stdio: "inherit" });

  child.on("error", (error) => {
    process.stderr.write(
      `rocksky: failed to start the MCP server (${error.message}). ` +
        "Install it with `npm install -g @rocksky/mcp`, or build it from rocksky-mcp/ and set ROCKSKY_MCP_BIN.\n",
    );
    process.exitCode = 1;
  });

  // Forward termination so killing the CLI stops the server too (Ctrl-C
  // already reaches it through the shared process group).
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exitCode = code ?? 1;
    }
  });
}
