import { isValidHandle } from "@atproto/syntax";
import { env } from "./env";
import { logger } from "logger";
import { ctx } from "context";

export async function getDidAndHandle(): Promise<[string, string]> {
  let handle = env.ROCKSKY_HANDLE || env.ROCKSKY_IDENTIFIER;
  let did = env.ROCKSKY_HANDLE || env.ROCKSKY_IDENTIFIER;

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
