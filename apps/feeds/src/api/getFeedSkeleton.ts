import { AuthRequiredError, InvalidRequestError } from "@atp/xrpc-server";
import { Server } from "../lex/index.ts";
import { getAlgo } from "../algos/mod.ts";
import { Context } from "../context.ts";
import { AtUri } from "@atp/syntax";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.feed.getFeedSkeleton({
    auth: ctx.authVerifier.standardOptional,
    handler: async ({ params, auth }) => {
      const feedUri = new AtUri(params.feed);
      const algo = getAlgo(feedUri.hostname, feedUri.rkey);
      if (feedUri.collection !== "app.rocksky.feed.generator" || !algo) {
        throw new InvalidRequestError(
          "Unsupported algorithm",
          "UnsupportedAlgorithm",
        );
      }
      const did =
        auth.credentials.type === "standard" ? auth.credentials.iss : null;
      if (algo.needsAuth && !did) {
        throw new AuthRequiredError();
      }

      const body = await algo.handler(ctx, params, did);
      return {
        encoding: "application/json",
        body: body,
      };
    },
  });
}
