import { Daytona } from "@daytonaio/sdk";
import chalk from "chalk";
import consola from "consola";

async function main() {
  // Initialize the SDK (uses environment variables by default)
  const daytona = new Daytona({
    organizationId: "4eb692ba-93c6-4326-8c7b-eb31a51d528a",
  });

  // Create a new sandbox
  const sandbox = await daytona.create({
    language: "typescript",
    envVars: { NODE_ENV: "development" },
  });

  const HOME = "/home/daytona";

  consola.info("Sandbox created with ID:", chalk.greenBright(sandbox.id));

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

  await sandbox.stop();
}

main().catch(console.error);
