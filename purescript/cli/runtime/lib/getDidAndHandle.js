import { isValidHandle } from "@atproto/syntax";
import { env } from "./env.js";
import { logger } from "../logger.js";
import { ctx } from "../context.js";
import chalk from "chalk";
import { c } from "../theme.js";
async function getDidAndHandle() {
  let handle = env.ROCKSKY_HANDLE || env.ROCKSKY_IDENTIFIER;
  let did = env.ROCKSKY_HANDLE || env.ROCKSKY_IDENTIFIER;
  if (!handle) {
    console.error(
      `\u274C No AT Proto handle or DID provided, please provide one in the environment variables ${chalk.bold("ROCKSKY_HANDLE")} or ${chalk.bold("ROCKSKY_IDENTIFIER")}`
    );
    process.exit(1);
  }
  if (!env.ROCKSKY_PASSWORD) {
    console.error(
      `\u274C No app password provided, please provide one in the environment variable ${chalk.bold("ROCKSKY_PASSWORD")}
You can create one at ${c.link("https://bsky.app/settings/app-passwords")}`
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
export {
  getDidAndHandle
};
