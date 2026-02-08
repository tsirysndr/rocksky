import { getSandbox, Sandbox } from "@cloudflare/sandbox";
import consola from "consola";

export { Sandbox } from "@cloudflare/sandbox";

const HOME = "/root";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Get or create a sandbox instance
    const sandbox = getSandbox(env.Sandbox, "my-sandbox");

    // Execute a shell command
    if (url.pathname === "/run") {
      await setupOpenClaw(sandbox);
      await sandbox.exec("mkdir -p $HOME/.ssh");
      await sandbox.writeFile(`${HOME}/.ssh/id_rsa`, env.SSH_PRIVATE_KEY);
      await sandbox.writeFile(`${HOME}/.ssh/id_rsa.pub`, env.SSH_PUBLIC_KEY);
      await sandbox.exec("chmod 600 $HOME/.ssh/id_rsa");
      await sandbox.exec(
        "ssh-keyscan -t rsa tangled.org >> $HOME/.ssh/known_hosts",
      );
      await sandbox.exec("git config --global user.name 'Cloudflare Sandbox'");
      await sandbox.exec(
        "git config --global user.email 'tsiry.sndr@rocksky.app'",
      );
      consola.info("SSH keys uploaded to sandbox.");

      consola.info("Sandbox environment configured for Git operations.");
      consola.info("Cloning repository...");
      const clone = await sandbox.exec(
        "git clone git@tangled.org:rocksky.app/rocksky rocksky -b main",
      );
      consola.info(clone.stdout);
      const ls = await sandbox.exec("ls -la rocksky");
      consola.info(ls.stdout);

      const node = await sandbox.exec("node -v");
      consola.info(`Node version in sandbox: ${node.stdout.trim()}`);

      const claude = await sandbox.exec("claude --version");
      consola.info(`Claude version in sandbox: ${claude.stdout.trim()}`);

      const openclaw = await sandbox.exec("openclaw --version");
      consola.info(`OpenClaw version in sandbox: ${openclaw.stdout.trim()}`);

      return Response.json({
        output: ls.stdout,
        error: ls.stderr,
        exitCode: ls.exitCode,
        success: ls.success,
      });
    }

    // Work with files
    if (url.pathname === "/file") {
      await sandbox.writeFile("/workspace/hello.txt", "Hello, Sandbox!");
      const file = await sandbox.readFile("/workspace/hello.txt");
      return Response.json({
        content: file.content,
      });
    }

    sandbox.destroy();

    return new Response("Try /run or /file");
  },
};

async function setupOpenClaw(sandbox: Sandbox) {
  consola.info(`Setting up OpenClaw in sandbox...`);
  await sandbox.exec("mkdir -p $HOME/.openclaw/agents/main/agent");
  await sandbox.writeFile(
    `${HOME}/.openclaw/openclaw.json`,
    process.env.OPENCLAW_CONFIG!.replace("OPENCLAW_WORKSPACE", `${HOME}/clawd`),
  );
  await sandbox.writeFile(
    `${HOME}/.openclaw/agents/main/agent/auth-profiles.json`,
    process.env.OPENCLAW_AUTH_PROFILES!,
  );

  consola.info("OpenClaw configuration files written.");

  const start = await sandbox.exec(
    'pm2 start "openclaw gateway" --name "openclaw-gateway"',
  );
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const status = await sandbox.exec("openclaw gateway status");

  consola.info(start.stdout);
  consola.info(start.stderr);
  consola.info(status.stdout);
  consola.info(status.stderr);

  consola.info(`Sandbox setup complete.`);
}
