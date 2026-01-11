import { isValidHandle } from "@atproto/syntax";
import { env } from "./env";
import { logger } from "logger";
import { ctx } from "context";
import chalk from "chalk";

export async function getDidAndHandle(): Promise<[string, string]> {
  let handle = env.ROCKSKY_HANDLE || env.ROCKSKY_IDENTIFIER;
  let did = env.ROCKSKY_HANDLE || env.ROCKSKY_IDENTIFIER;

  if (!handle) {
    console.error(
      `❌ No AT Proto handle or DID provided, please provide one in the environment variables ${chalk.bold("ROCKSKY_HANDLE")} or ${chalk.bold("ROCKSKY_IDENTIFIER")}`,
    );
    process.exit(1);
  }

  if (!env.ROCKSKY_PASSWORD) {
    console.error(
      `❌ No app password provided, please provide one in the environment variable ${chalk.bold("ROCKSKY_PASSWORD")}\nYou can create one at ${chalk.blueBright("https://bsky.app/settings/app-passwords")}`,
    );
    process.exit(1);
  }

  if (handle.startsWith("did:plc:") || handle.startsWith("did:web:")) {
    handle = await ctx.resolver.resolveDidToHandle(handle);
  }

  if (!isValidHandle(handle)) {
    logger.error`❌ Invalid handle: ${handle}`;
    process.exit(1);
  }

  if (!did.startsWith("did:plc:") && !did.startsWith("did:web:")) {
    did = await ctx.baseIdResolver.handle.resolve(did);
  }

  return [did, handle];
}
