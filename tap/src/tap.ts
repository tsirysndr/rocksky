import { Tap, SimpleIndexer } from "@atproto/tap";
import logger from "./logger.ts";
import { ctx } from "./context.ts";
import schema from "./schema/mod.ts";
import _ from "@es-toolkit/es-toolkit/compat";
import { broadcastEvent } from "./main.ts";
import type { InsertEvent } from "./schema/event.ts";

export const TAP_WS_URL = Deno.env.get("TAP_URL") || "http://localhost:2480";

const BATCH_SIZE = 50;
const BATCH_TIMEOUT_MS = 100;

export default function connectToTap() {
  const tap = new Tap(TAP_WS_URL);
  const indexer = new SimpleIndexer();

  // Batch buffers
  let eventBatch: InsertEvent[] = [];
  let batchTimer: number | null = null;

  async function flushBatch() {
    if (eventBatch.length === 0) return;

    const toInsert = [...eventBatch];
    eventBatch = [];

    try {
      const results = await ctx.db
        .insert(schema.events)
        .values(toInsert)
        .onConflictDoNothing()
        .returning()
        .execute();

      for (const result of results) {
        broadcastEvent(result);
      }

      logger.info`📝 Batch inserted ${results.length} events`;
    } catch (error) {
      logger.error`Failed to insert batch: ${error}`;
    }
  }

  function addToBatch(event: InsertEvent) {
    eventBatch.push(event);

    if (batchTimer !== null) {
      clearTimeout(batchTimer);
    }

    if (eventBatch.length >= BATCH_SIZE) {
      flushBatch();
    } else {
      batchTimer = setTimeout(() => {
        flushBatch();
        batchTimer = null;
      }, BATCH_TIMEOUT_MS);
    }
  }

  indexer.identity(async (evt) => {
    addToBatch({
      id: evt.id,
      type: evt.type,
      did: evt.did,
      handle: evt.handle,
      status: evt.status,
      isActive: evt.isActive,
      action: null,
      rev: null,
      collection: null,
      rkey: null,
      record: null,
      cid: null,
      live: null,
    });

    logger.info`${evt.did} updated identity: ${evt.handle} (${evt.status})`;
  });

  indexer.record(async (evt) => {
    addToBatch({
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
      handle: null,
      status: null,
      isActive: null,
    });

    const uri = `at://${evt.did}/${evt.collection}/${evt.rkey}`;
    logger.info`New record: ${uri}`;
  });

  indexer.error((err) => logger.error`${err}`);

  const channel = tap.channel(indexer);
  channel.start();

  globalThis.addEventListener("beforeunload", () => {
    flushBatch();
  });
}
