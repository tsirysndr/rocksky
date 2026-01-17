import { ctx } from "./context.ts";
import logger from "./logger.ts";
import connectToTap from "./tap.ts";
import schema from "./schema/mod.ts";
import { asc } from "drizzle-orm";
import { omit } from "@es-toolkit/es-toolkit/compat";
import type { SelectEvent } from "./schema/event.ts";

const PAGE_SIZE = 500;

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

  socket.addEventListener("open", async () => {
    logger.info`✅ Connected to Tap!`;

    connectedClients.set(socket, {
      socket,
      isPaginating: true,
      queue: [],
    });

    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const events = await ctx.db
        .select()
        .from(schema.events)
        .orderBy(asc(schema.events.createdAt))
        .offset(page * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .execute();

      for (const evt of events) {
        socket.send(
          JSON.stringify({
            ...omit(evt, "createdAt", "record"),
            ...(evt.record && {
              record: JSON.parse(evt.record),
            }),
          }),
        );
      }

      hasMore = events.length === PAGE_SIZE;
      page++;
    }

    logger.info`📤 Sent all historical events (${page} pages)`;

    const clientState = connectedClients.get(socket);
    if (clientState) {
      const queuedCount = clientState.queue.length;

      if (queuedCount > 0) {
        logger.info`📦 Sending ${queuedCount} queued events...`;

        for (const evt of clientState.queue) {
          socket.send(
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
    }

    logger.info`🔄 Now streaming real-time events...`;
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
