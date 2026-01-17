import { ctx } from "./context.ts";
import logger from "./logger.ts";
import connectToTap from "./tap.ts";
import schema from "./schema/mod.ts";
import { asc } from "drizzle-orm";
import { omit } from "@es-toolkit/es-toolkit/compat";
import type { SelectEvent } from "./schema/event.ts";

const PAGE_SIZE = 500;
const PAGE_DELAY_MS = 0;
const YIELD_EVERY_N_PAGES = 5;
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB buffer limit
const BACKPRESSURE_CHECK_INTERVAL = 100; // Check every 100 events

interface ClientState {
  socket: WebSocket;
  isPaginating: boolean;
  queue: SelectEvent[];
}

const connectedClients = new Map<WebSocket, ClientState>();

function safeSend(socket: WebSocket, message: string): boolean {
  try {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
      return true;
    }
  } catch (error) {
    logger.error`Failed to send message: ${error}`;
  }
  return false;
}

async function waitForBackpressure(socket: WebSocket): Promise<void> {
  const bufferedAmount = (socket as any).bufferedAmount;
  if (bufferedAmount && bufferedAmount > MAX_BUFFER_SIZE) {
    logger.info`⏸️  Backpressure detected (${bufferedAmount} bytes buffered), waiting...`;
    // Wait for buffer to drain
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export function broadcastEvent(evt: SelectEvent) {
  const message = JSON.stringify({
    ...omit(evt, "createdAt", "record"),
    ...(evt.record && {
      record: JSON.parse(evt.record),
    }),
  });

  for (const [socket, state] of connectedClients.entries()) {
    if (socket.readyState === WebSocket.OPEN) {
      if (state.isPaginating) {
        state.queue.push(evt);
      } else {
        safeSend(socket, message);
      }
    }
  }
}

connectToTap();

Deno.serve({ port: parseInt(Deno.env.get("WS_PORT") || "2481") }, (req) => {
  if (req.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 426 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.addEventListener("open", () => {
    logger.info`✅ Client connected! Socket state: ${socket.readyState}`;

    connectedClients.set(socket, {
      socket,
      isPaginating: true,
      queue: [],
    });

    safeSend(
      socket,
      JSON.stringify({
        type: "connected",
        message: "Ready to stream events",
      }),
    );
    logger.info`📤 Sent connection confirmation`;

    (async () => {
      try {
        let page = 0;
        let hasMore = true;
        let totalEvents = 0;

        logger.info`📖 Starting pagination...`;

        try {
          const testQuery = await ctx.db
            .select()
            .from(schema.events)
            .limit(1)
            .execute();
          logger.info`✅ Database test query successful, found ${testQuery.length} sample event(s)`;
        } catch (dbError) {
          logger.error`❌ Database test query failed: ${dbError}`;
          throw dbError;
        }

        while (hasMore && socket.readyState === WebSocket.OPEN) {
          const events = await ctx.db
            .select()
            .from(schema.events)
            .orderBy(asc(schema.events.createdAt))
            .offset(page * PAGE_SIZE)
            .limit(PAGE_SIZE)
            .execute();

          if (page % 10 === 0) {
            logger.info`📄 Fetching page ${page}... (${totalEvents} events sent so far)`;
          }

          for (let i = 0; i < events.length; i++) {
            const evt = events[i];

            if (socket.readyState !== WebSocket.OPEN) {
              logger.info`⚠️  Socket closed during pagination at event ${totalEvents}`;
              return;
            }

            const success = safeSend(
              socket,
              JSON.stringify({
                ...omit(evt, "createdAt", "record"),
                ...(evt.record && {
                  record: JSON.parse(evt.record),
                }),
              }),
            );

            if (success) {
              totalEvents++;
            }

            if (totalEvents % BACKPRESSURE_CHECK_INTERVAL === 0) {
              await waitForBackpressure(socket);
            }
          }

          hasMore = events.length === PAGE_SIZE;
          page++;

          if (hasMore && page % YIELD_EVERY_N_PAGES === 0) {
            await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
          }
        }

        logger.info`📤 Sent all historical events: ${totalEvents} total (${page} pages)`;

        const clientState = connectedClients.get(socket);
        if (clientState && socket.readyState === WebSocket.OPEN) {
          const queuedCount = clientState.queue.length;

          if (queuedCount > 0) {
            logger.info`📦 Sending ${queuedCount} queued events...`;

            for (const evt of clientState.queue) {
              if (socket.readyState !== WebSocket.OPEN) break;

              safeSend(
                socket,
                JSON.stringify({
                  ...omit(evt, "createdAt", "record"),
                  ...(evt.record && {
                    record: JSON.parse(evt.record),
                  }),
                }),
              );
            }

            clientState.queue = [];
          }

          clientState.isPaginating = false;
          logger.info`🔄 Now streaming real-time events...`;
        }
      } catch (error) {
        logger.error`Pagination error: ${error}`;
        logger.error`Stack: ${error instanceof Error ? error.stack : ""}`;

        safeSend(
          socket,
          JSON.stringify({
            type: "error",
            message: "Failed to load historical events",
          }),
        );

        const clientState = connectedClients.get(socket);
        if (clientState) {
          clientState.isPaginating = false;
        }
      }
    })();
  });

  socket.addEventListener("message", (event) => {
    try {
      if (event.data === "ping") {
        safeSend(socket, "pong");
      }
    } catch (error) {
      logger.error`Error handling message: ${error}`;
    }
  });

  socket.addEventListener("close", (event) => {
    connectedClients.delete(socket);
    logger.info`❌ Client disconnected. Code: ${event.code}, Reason: ${event.reason || "none"}, Clean: ${event.wasClean}`;
    logger.info`   Active clients: ${connectedClients.size}`;

    if (event.code === 1006) {
      logger.error`⚠️  Abnormal closure (1006) detected - connection dropped unexpectedly`;
      logger.error`   This usually means: backpressure, server crash, or network issue`;
    }
  });

  socket.addEventListener("error", (error) => {
    logger.error`❌ WebSocket error occurred`;
    logger.error`   Error: ${error}`;
    logger.error`   ReadyState: ${socket.readyState}`;
    const clientState = connectedClients.get(socket);
    if (clientState) {
      logger.error`   Was paginating: ${clientState.isPaginating}`;
      logger.error`   Queued events: ${clientState.queue.length}`;
    }
    connectedClients.delete(socket);
  });

  return response;
});

const url = `ws://localhost:${Deno.env.get("WS_PORT") || 2481}`;
logger.info`🚀 Tap WebSocket server is running! ${url}`;
