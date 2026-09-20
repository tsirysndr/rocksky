import { AuthRequiredError, InvalidRequestError } from "@atp/xrpc-server";
import { Server } from "../lex/index.ts";
import { getAlgo } from "../algos/mod.ts";
import { Context } from "../context.ts";
import { AtUri } from "@atp/syntax";
import {
  feedItemsReturned,
  feedRequestCounter,
  feedRequestDuration,
  recordError,
  tracer,
} from "../telemetry.ts";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.feed.getFeedSkeleton({
    auth: ctx.authVerifier.standardOptional,
    handler: ({ params, auth }) => {
      const feedUri = new AtUri(params.feed);
      const algo = getAlgo(feedUri.hostname, feedUri.rkey);
      if (feedUri.collection !== "app.rocksky.feed.generator" || !algo) {
        feedRequestCounter.add(1, {
          algo: "unknown",
          status: "unsupported_algorithm",
        });
        throw new InvalidRequestError(
          "Unsupported algorithm",
          "UnsupportedAlgorithm",
        );
      }
      const did =
        auth.credentials.type === "standard" ? auth.credentials.iss : null;
      if (algo.needsAuth && !did) {
        feedRequestCounter.add(1, { algo: algo.rkey, status: "unauthorized" });
        throw new AuthRequiredError();
      }

      // The caller's DID identifies a person, so it stays out of telemetry;
      // only whether the request was authenticated is recorded.
      return tracer.startActiveSpan(
        "app.rocksky.feed.getFeedSkeleton",
        {
          attributes: {
            "feed.algo": algo.rkey,
            "feed.publisher": algo.publisherDid,
            "feed.limit": params.limit ?? 50,
            "feed.paginated": Boolean(params.cursor),
            "feed.authenticated": Boolean(did),
          },
        },
        async (span) => {
          const startedAt = performance.now();
          try {
            const body = await algo.handler(ctx, params, did);
            span.setAttribute("feed.items", body.feed.length);
            feedItemsReturned.record(body.feed.length, { algo: algo.rkey });
            feedRequestCounter.add(1, { algo: algo.rkey, status: "ok" });
            return {
              encoding: "application/json" as const,
              body,
            };
          } catch (error) {
            recordError(span, error);
            feedRequestCounter.add(1, { algo: algo.rkey, status: "error" });
            ctx.logger.error("feed {algo} failed: {error}", {
              algo: algo.rkey,
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          } finally {
            feedRequestDuration.record(
              (performance.now() - startedAt) / 1000,
              { algo: algo.rkey },
            );
            span.end();
          }
        },
      );
    },
  });
}
