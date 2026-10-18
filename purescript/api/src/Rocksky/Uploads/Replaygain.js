import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

export const tmpdirImpl = () => tmpdir();

// Resolves { code, stderr }; code is null when the process could not start.
export const runFfmpegImpl = (bin) => (args) => (timeoutMs) => () =>
  new Promise((resolve) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.stderr.on("data", (d) => {
      stderr += d;
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve({ code: null, stderr });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
  });
