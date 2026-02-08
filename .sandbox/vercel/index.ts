import { Sandbox } from "@vercel/sandbox";
import consola from "consola";
import chalk from "chalk";

const sandbox = await Sandbox.create(
  process.env.SNAPSHOT_ID
    ? {
        source: {
          type: "snapshot",
          snapshotId: process.env.SNAPSHOT_ID,
        },
      }
    : undefined,
);

consola.info(
  "Vercel Sandbox created with ID:",
  chalk.greenBright(sandbox.sandboxId),
);

const HOME = "/home/vercel-sandbox";

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

try {
  await sandbox.stop();
} catch (e) {
  consola.error("Error stopping Vercel Sandbox:", e);
}
