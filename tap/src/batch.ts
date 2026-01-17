import { ctx } from "./context.ts";
import schema from "./schema/mod.ts";
import _ from "@es-toolkit/es-toolkit/compat";
import { broadcastEvent } from "./main.ts";
import type { InsertEvent } from "./schema/event.ts";
import logger from "./logger.ts";

const BATCH_SIZE = 100;
const BATCH_TIMEOUT_MS = 100;

let eventBatch: InsertEvent[] = [];
let batchTimer: number | null = null;
let flushPromise: Promise<void> | null = null;

export async function flushBatch() {
  if (flushPromise) {
    await flushPromise;
    return;
  }

  if (eventBatch.length === 0) return;

  flushPromise = (async () => {
    const toInsert = [...eventBatch];
    eventBatch = [];

    try {
      logger.info`🔄 Flushing batch of ${toInsert.length} events...`;

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
      // Re-add failed events to the front of the batch for retry
      eventBatch = [...toInsert, ...eventBatch];
    } finally {
      flushPromise = null;
    }
  })();

  await flushPromise;
}

export function addToBatch(event: InsertEvent) {
  eventBatch.push(event);

  if (batchTimer !== null) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  if (eventBatch.length >= BATCH_SIZE) {
    flushBatch().catch((err) => logger.error`Flush error: ${err}`);
  } else {
    batchTimer = setTimeout(() => {
      batchTimer = null;
      flushBatch().catch((err) => logger.error`Flush error: ${err}`);
    }, BATCH_TIMEOUT_MS);
  }
}
