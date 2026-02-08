import { Daytona, Sandbox } from "@daytonaio/sdk";
import chalk from "chalk";
import consola from "consola";

const HOME = "/home/daytona";
const OPENCLAW_GATEWAY_PORT = 18789;

async function main() {
  // Initialize the SDK (uses environment variables by default)
  const daytona = new Daytona({
    organizationId: "4eb692ba-93c6-4326-8c7b-eb31a51d528a",
  });

  // Create a new sandbox
  const sandbox = await daytona.create({
    language: "typescript",
    snapshot: "daytona-openclaw-medium",
  });
  consola.info("Sandbox created with ID:", chalk.greenBright(sandbox.id));

  consola.info("Installing PM2 in sandbox...");
  const pm2 = await sandbox.process.executeCommand("npm install -g pm2");
  consola.log(pm2.result);
  await setupOpenClaw(sandbox);

  process.on("SIGINT", async () => {
    consola.info("Received SIGINT, shutting down sandbox...");
    await sandbox.stop();
    await sandbox.delete();
    process.exit(0);
  });

  await Promise.all([
    sandbox.fs.uploadFile(
      Buffer.from(process.env.SSH_PRIVATE_KEY!, "utf-8"),
      `${HOME}/.ssh/id_rsa`,
    ),
    sandbox.fs.uploadFile(
      Buffer.from(process.env.SSH_PUBLIC_KEY!, "utf-8"),
      `${HOME}/.ssh/id_rsa.pub`,
    ),
  ]);

  consola.info("SSH keys uploaded to sandbox.");

  const openclaw = await sandbox.process.executeCommand("which openclaw");
  consola.log(openclaw.result);

  await sandbox.process.executeCommand("chmod 600 ${HOME}/.ssh/id_rsa");
  await sandbox.process.executeCommand(
    "ssh-keyscan -t rsa tangled.org >> ${HOME}/.ssh/known_hosts",
  );
  await sandbox.process.executeCommand(
    "git config --global user.name 'Daytona'",
  );
  await sandbox.process.executeCommand(
    "git config --global user.email 'tsiry.sndr@rocksky.app'",
  );

  consola.info("Sandbox environment configured for Git operations.");
  consola.info("Cloning repository...");

  const clone = await sandbox.process.executeCommand(
    "git clone git@tangled.org:rocksky.app/rocksky rocksky -b main",
  );
  consola.log(clone.result);

  const response = await sandbox.process.executeCommand("ls -la rocksky");
  consola.log(response.result);
}

async function setupOpenClaw(sandbox: Sandbox) {
  consola.info(`Setting up OpenClaw in sandbox...`);
  await sandbox.process.executeCommand(
    "mkdir -p $HOME/.openclaw/agents/main/agent",
  );
  await sandbox.fs.uploadFile(
    Buffer.from(
      process.env.OPENCLAW_CONFIG!.replace(
        "OPENCLAW_WORKSPACE",
        `${HOME}/clawd`,
      ),
      "utf-8",
    ),
    `${HOME}/.openclaw/openclaw.json`,
  );
  await sandbox.fs.uploadFile(
    Buffer.from(process.env.OPENCLAW_AUTH_PROFILES!, "utf-8"),
    `${HOME}/.openclaw/agents/main/agent/auth-profiles.json`,
  );

  consola.info("OpenClaw configuration files written.");

  const start = await sandbox.process.executeCommand(
    'pm2 start "openclaw gateway" --name openclaw-gateway',
  );
  consola.info(start.result);

  await new Promise((resolve) => setTimeout(resolve, 3000));

  const status = await sandbox.process.executeCommand(
    "openclaw gateway status",
  );
  consola.info(status.result);

  const signedUrl = await sandbox.getSignedPreviewUrl(
    OPENCLAW_GATEWAY_PORT,
    3600,
  );

  consola.info(
    `OpenClaw Gateway is available at: ${chalk.greenBright(signedUrl.url)}`,
  );
}

main().catch(consola.error);

await new Promise(() => {});
