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

interface ClientState {
  socket: WebSocket;
  isPaginating: boolean;
  queue: SelectEvent[];
}

const connectedClients = new Map<WebSocket, ClientState>();

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
        socket.send(message);
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

    try {
      socket.send(
        JSON.stringify({
          type: "connected",
          message: "Ready to stream events",
        }),
      );
      logger.info`📤 Sent connection confirmation`;
    } catch (error) {
      logger.error`Failed to send connection confirmation: ${error}`;
    }

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

          for (const evt of events) {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  ...omit(evt, "createdAt", "record"),
                  ...(evt.record && {
                    record: JSON.parse(evt.record),
                  }),
                }),
              );
              totalEvents++;
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
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(
                  JSON.stringify({
                    ...omit(evt, "createdAt", "record"),
                    ...(evt.record && {
                      record: JSON.parse(evt.record),
                    }),
                  }),
                );
              }
            }

            clientState.queue = [];
          }

          clientState.isPaginating = false;
          logger.info`🔄 Now streaming real-time events...`;
        }
      } catch (error) {
        logger.error`Pagination error: ${error}`;
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "error",
              message: "Failed to load historical events",
            }),
          );
        }

        const clientState = connectedClients.get(socket);
        if (clientState) {
          clientState.isPaginating = false;
        }
      }
    })();
  });

  socket.addEventListener("message", (event) => {
    if (event.data === "ping") {
      socket.send("pong");
    }
  });

  socket.addEventListener("close", () => {
    connectedClients.delete(socket);
    logger.info`❌ Client disconnected. Active clients: ${connectedClients.size}`;
  });

  socket.addEventListener("error", (error) => {
    logger.error`WebSocket error: ${error}`;
    connectedClients.delete(socket);
  });

  return response;
});

const url = `ws://localhost:${Deno.env.get("WS_PORT") || 2481}`;
logger.info`🚀 Tap WebSocket server is running! ${url}`;
