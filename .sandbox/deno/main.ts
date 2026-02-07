import { Sandbox } from "@deno/sandbox";
import consola from "consola";
import chalk from "chalk";

export async function main() {
  const HOME = "/home/app";

  await using sandbox = await Sandbox.create();
  consola.info("Sandbox created with ID:", chalk.greenBright(sandbox.id));

  await sandbox.sh`mkdir -p $HOME/.ssh`;

  await sandbox.fs.writeTextFile(
    `${HOME}/.ssh/id_rsa`,
    Deno.env.get("SSH_PRIVATE_KEY")!,
  );
  await sandbox.fs.writeTextFile(
    `${HOME}/.ssh/id_rsa.pub`,
    Deno.env.get("SSH_PUBLIC_KEY")!,
  );

  consola.info("SSH keys uploaded to sandbox.");

  await sandbox.sh`chmod 600 $HOME/.ssh/id_rsa`;
  await sandbox.sh`ssh-keyscan -t rsa tangled.org >> $HOME/.ssh/known_hosts`;
  await sandbox.sh`git config --global user.name "Deno Sandbox"`;
  await sandbox.sh`git config --global user.email "tsiry.sndr@rocksky.app"`;

  consola.info("Sandbox environment configured for Git operations.");
  consola.info("Cloning repository...");

  await sandbox.sh`git clone git@tangled.org:rocksky.app/rocksky rocksky -b main`;
  await sandbox.sh`ls -la rocksky`;

  await sandbox.close();
}

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
  main();
}
