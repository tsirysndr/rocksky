import type { AuthOutput } from "@atproto/xrpc-server";
import type express from "express";
import { verifyToken } from "./verifyToken";

type ReqCtx = {
  req: express.Request;
};

export default async function authVerifier(ctx: ReqCtx): Promise<AuthOutput> {
  if (!ctx.req.headers.authorization) {
    return {};
  }

  const bearer = (ctx.req.headers.authorization || "").split(" ")[1]?.trim();

  if (bearer && bearer !== "null") {
    const credentials = await verifyToken(bearer);

    return {
      credentials,
    };
  }

  return {};
}
