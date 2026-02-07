import { getSandbox } from "@cloudflare/sandbox";
import consola from "consola";

export { Sandbox } from "@cloudflare/sandbox";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Get or create a sandbox instance
    const sandbox = getSandbox(env.Sandbox, "my-sandbox");

    // Execute a shell command
    if (url.pathname === "/run") {
      const HOME = "/root";
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
      consola.log(clone.stdout);
      const ls = await sandbox.exec("ls -la rocksky");
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
