import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import { inArray } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/player/addItemsToQueue";
import * as R from "ramda";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const addItemsToQueue = (params, auth: HandlerAuth) =>
    pipe(
      {
        params,
        ctx,
        did: auth.credentials?.did,
      },
      handleAddItemsToQueue,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.player.addItemsToQueue({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(addItemsToQueue(params, auth));
    },
  });
}

const handleAddItemsToQueue = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      if (!did) {
        throw new Error("Authentication required");
      }

      await ctx.db.transaction(async (tx) => {
        // await tx.select().from(tables.queueTracks).execute();
        // Logic to add items to the queue would go here
        // verify items exist in googleDrivePaths
        // items can starts with "gdrive://", "dropbox://"
        // group items by prefix and query separately
        const items = R.groupBy((item: string) => {
          if (item.startsWith("gdrive://")) return "gdrive";
          if (item.startsWith("dropbox://")) return "dropbox";
          return "other";
        }, params.items);

        await Promise.all([
          tx
            .select()
            .from(tables.googleDrivePaths)
            .where(inArray(tables.googleDrivePaths, items.gdrive || []))
            .execute(),
          tx
            .select()
            .from(tables.dropboxPaths)
            .where(inArray(tables.dropboxPaths, items.dropbox || []))
            .execute(),
        ]);
        const track_ids = [];
        await ctx.tracklist.post("/tracklist.addTracks", {
          did,
          track_ids: params.items,
        });
      });
    },
    catch: (err) => {
      console.error(err);
      return {};
    },
  });

const presentation = (): Effect.Effect<{}, never> => {
  return Effect.sync(() => ({}));
};
