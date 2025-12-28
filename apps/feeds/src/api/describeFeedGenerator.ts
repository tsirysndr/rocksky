import { Server } from "../lex/index.ts";
import { Context } from "../context.ts";
import algos from "../algos/mod.ts";
import { AtUri } from "@atp/syntax";
import { Algorithm } from "../algos/types.ts";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.feed.describeFeedGenerator(() => {
    const feeds = algos.map((algo: Algorithm) => ({
      uri: AtUri.make(
        algo.publisherDid,
        "app.rocksky.feed.generator",
        algo.rkey,
      ).toString(),
    }));
    return {
      encoding: "application/json",
      body: {
        did: ctx.ownDid,
        feeds,
      },
    };
  });
}
