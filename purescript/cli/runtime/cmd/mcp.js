import {arguments as argsFor} from "../../../output/Rocksky.Cli.Command.Mcp/index.js";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require2 = createRequire(import.meta.url);
async function resolveBinary() {
  const override = process.env.ROCKSKY_MCP_BIN?.trim();
  if (override) {
    return override;
  }
  try {
    const { ensureBinary } = require2("@rocksky/mcp");
    return await ensureBinary();
  } catch (error) {
    const reason = String(error.message).split("\n")[0];
    process.stderr.write(
      `rocksky: could not provision the MCP server binary (${reason}); falling back to \`rocksky-mcp\` on PATH
`
    );
    return "rocksky-mcp";
  }
}
async function mcp(options = {}) {
  const bin = await resolveBinary();
  const child = spawn(bin, argsFor(options), { stdio: "inherit" });
  child.on("error", (error) => {
    process.stderr.write(
      `rocksky: failed to start the MCP server (${error.message}). Install it with \`npm install -g @rocksky/mcp\`, or build it from rocksky-mcp/ and set ROCKSKY_MCP_BIN.
`
    );
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
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
export {
  mcp
};
