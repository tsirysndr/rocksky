import { Sandbox } from "@vercel/sandbox";
import consola from "consola";
import chalk from "chalk";

const OPENCLAW_GATEWAY_PORT = 18789;

const ports = {
  ports: [OPENCLAW_GATEWAY_PORT],
};

const sandbox = await Sandbox.create(
  process.env.SNAPSHOT_ID
    ? {
        source: {
          type: "snapshot",
          snapshotId: process.env.SNAPSHOT_ID,
        },
        ...ports,
      }
    : ports,
);

process.on("SIGINT", async () => {
  consola.info("Received SIGINT, shutting down sandbox...");
  try {
    await sandbox.stop();
  } catch (e) {
    consola.error("Error stopping Vercel Sandbox:", e);
  }
  process.exit(0);
});

consola.info(
  "Vercel Sandbox created with ID:",
  chalk.greenBright(sandbox.sandboxId),
);

const HOME = "/home/vercel-sandbox";

await setupOpenClaw(sandbox);

await sandbox.mkDir(`${HOME}/.ssh`);

await sandbox.writeFiles([
  {
    path: `${HOME}/.ssh/id_rsa`,
    content: Buffer.from(process.env.SSH_PRIVATE_KEY!, "utf-8"),
  },
  {
    path: `${HOME}/.ssh/id_rsa.pub`,
    content: Buffer.from(process.env.SSH_PUBLIC_KEY!, "utf-8"),
  },
]);

consola.info("SSH keys uploaded to sandbox.");

await sandbox.runCommand({
  cmd: "which",
  args: ["openclaw"],
  stdout: process.stdout,
  stderr: process.stderr,
});

await sandbox.runCommand({
  cmd: "which",
  args: ["claude"],
  stdout: process.stdout,
  stderr: process.stderr,
});

consola.info("Configuring SSH and Git...");

await sandbox.runCommand({
  cmd: "chmod",
  args: ["600", `${HOME}/.ssh/id_rsa`],
  stdout: process.stdout,
  stderr: process.stderr,
});

await sandbox.runCommand({
  cmd: "sh",
  args: ["-c", "ssh-keyscan -t rsa tangled.org >> ${HOME}/.ssh/known_hosts"],
  stdout: process.stdout,
  stderr: process.stderr,
});

await sandbox.runCommand({
  cmd: "git",
  args: ["config", "--global", "user.name", "Vercel Sandbox"],
  stdout: process.stdout,
  stderr: process.stderr,
});

await sandbox.runCommand({
  cmd: "git",
  args: ["config", "--global", "user.email", "tsiry.sndr@rocksky.app"],
  stdout: process.stdout,
  stderr: process.stderr,
});

consola.info("Sandbox environment configured for Git operations.");
consola.info("Cloning repository...");

await sandbox.runCommand({
  cmd: "git",
  args: [
    "clone",
    "git@tangled.org:rocksky.app/rocksky",
    "rocksky",
    "-b",
    "main",
  ],
  stdout: process.stdout,
  stderr: process.stderr,
});

await sandbox.runCommand({
  cmd: "ls",
  args: ["-la", "rocksky"],
  stdout: process.stdout,
  stderr: process.stderr,
});

async function setupOpenClaw(sandbox: Sandbox) {
  consola.info("Setting up OpenClaw in sandbox...");
  await sandbox.runCommand({
    cmd: "mkdir",
    args: ["-p", `${HOME}/.openclaw/agents/main/agent`],
    stdout: process.stdout,
    stderr: process.stderr,
  });

  await sandbox.writeFiles([
    {
      path: `${HOME}/.openclaw/openclaw.json`,
      content: Buffer.from(
        process.env.OPENCLAW_CONFIG!.replace(
          "OPENCLAW_WORKSPACE",
          `${HOME}/clawd`,
        ),
        "utf-8",
      ),
    },
    {
      path: `${HOME}/.openclaw/agents/main/agent/auth-profiles.json`,
      content: Buffer.from(process.env.OPENCLAW_AUTH_PROFILES!, "utf-8"),
    },
  ]);

  consola.info("OpenClaw configuration files written.");

  await sandbox.runCommand({
    cmd: "bash",
    args: ["-c", "openclaw gateway"],
    detached: true,
    stdout: process.stdout,
    stderr: process.stderr,
  });

  await sandbox.runCommand({
    cmd: "openclaw",
    args: ["gateway", "status"],
    stdout: process.stdout,
    stderr: process.stderr,
  });

  consola.info(
    `Sandbox setup complete. You can now interact with it using the OpenClaw gateway: ${chalk.greenBright(sandbox.domain(OPENCLAW_GATEWAY_PORT))}`,
  );
}

await new Promise(() => {});
