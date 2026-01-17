import { Tap, SimpleIndexer } from "@atproto/tap";
import logger from "./logger.ts";
import { ctx } from "./context.ts";
import schema from "./schema/mod.ts";
import _ from "@es-toolkit/es-toolkit/compat";
import { broadcastEvent } from "./main.ts";

export const TAP_WS_URL = Deno.env.get("TAP_URL") || "http://localhost:2480";

export default function connectToTap() {
  const tap = new Tap(TAP_WS_URL);

  const indexer = new SimpleIndexer();

  indexer.identity(async (evt) => {
    const result = await ctx.db
      .insert(schema.events)
      .values({
        id: evt.id,
        type: evt.type,
        did: evt.did,
        handle: evt.handle,
        status: evt.status,
        isActive: evt.isActive,
      })
      .onConflictDoNothing()
      .returning()
      .execute();

    if (result.length > 0) {
      broadcastEvent(result[0]);
    }

    logger.info`${evt.did} updated identity: ${evt.handle} (${evt.status})`;
  });

  indexer.record(async (evt) => {
    logger.info`${evt}`;
    const result = await ctx.db
      .insert(schema.events)
      .values({
        id: evt.id,
        type: evt.type,
        action: evt.action,
        did: evt.did,
        rev: evt.rev,
        collection: evt.collection,
        rkey: evt.rkey,
        record: JSON.stringify(evt.record),
        cid: evt.cid,
        live: evt.live,
      })
      .onConflictDoNothing()
      .returning()
      .execute();

    if (result.length > 0) {
      broadcastEvent(result[0]);
    }

    const uri = `at://${_.get(result, "[0].did")}/${_.get(result, "[0].collection")}/${_.get(result, "[0].rkey")}`;
    logger.info`New record inserted: ${result.length} ${uri}`;
  });

  indexer.error((err) => logger.error`${err}`);

  const channel = tap.channel(indexer);
  channel.start();
}
