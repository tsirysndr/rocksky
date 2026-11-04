// Minimal real-process transport for testing the PureScript host helpers in Node.
// The guest's ABI is unchanged; integration smoke tests also use the real engine.
import { spawnSync } from "node:child_process";

export function installHost() {
  const memory = new Map();
  let next = 1;
  const allocate = text => {
    const offset = next++;
    memory.set(offset, text);
    return { offset };
  };
  globalThis.Memory = {
    fromString: allocate,
    find: offset => ({ readString: () => memory.get(offset) }),
  };
  let commands = [];
  let environment = { ...process.env };
  let pendingSecret;
  const functions = {
    set_runner() {},
    pipeline() { commands = []; environment = { ...process.env }; return allocate('{"id":"test"}').offset; },
    with_exec(offset) { commands.push(JSON.parse(memory.get(offset)).join(" ")); },
    get_env(offset) { return allocate(process.env[memory.get(offset)] ?? "").offset; },
    set_secret(offset) { pendingSecret = JSON.parse(memory.get(offset)); return allocate(pendingSecret[0]).offset; },
    with_secret_variable(offset) { const [key] = JSON.parse(memory.get(offset)); environment[key] = pendingSecret[1]; },
    set_envs(offset) { Object.assign(environment, Object.fromEntries(JSON.parse(memory.get(offset)))); },
    stdout() {
      const result = spawnSync("/bin/sh", ["-c", commands.join(" && ")], { encoding: "utf8", env: environment });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        const id = commands.join(" ").match(/'exec' '([a-f0-9]{64})'/)?.[1];
        const diagnostic = id ? {
          state: spawnSync("docker", ["inspect", "--format", "{{json .State}}", id], { encoding: "utf8" }).stdout,
          logs: spawnSync("docker", ["logs", "--tail", "20", id], { encoding: "utf8" }).stdout,
        } : undefined;
        throw Error(JSON.stringify({code: result.status, command: commands, stdout: result.stdout, stderr: result.stderr, diagnostic}));
      }
      return allocate(result.stdout).offset;
    },
  };
  globalThis.Host = { getFunctions: () => functions };
}
