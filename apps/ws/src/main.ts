import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { JetStreamClient, JetStreamEvent } from "./jetstream.ts";
import getNowPlayings from "./services/getNowPlayings.ts";
import { ctx } from "./context.ts";
import getScrobbles from "./services/getScrobbles.ts";
import getScrobblesChart from "./services/getScrobblesChart.ts";
import getActorAlbums from "./services/getActorAlbums.ts";
import getActorArtists from "./services/getActorArtists.ts";
import getActorScrobbles from "./services/getActorScrobbles.ts";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [{ category: "ws", lowestLevel: "debug", sinks: ["console"] }],
});

const logger = getLogger("ws");

const clients = new Map<WebSocket, Set<string>>();

const getEndpoint = () => {
  const endpoint = Deno.env.get("JETSTREAM_SERVER")
    ? Deno.env.get("JETSTREAM_SERVER")
    : "wss://jetstream1.us-west.bsky.network/subscribe";

  if (endpoint?.endsWith("/subscribe")) {
    return endpoint;
  }

  return `${endpoint}/subscribe`;
};

const client = new JetStreamClient({
  wantedCollections: ["app.rocksky.scrobble"],
  endpoint: getEndpoint(),

  // Optional: filter by specific DIDs
  // wantedDids: ["did:plc:example123"],

  // Reconnection settings
  maxReconnectAttempts: 10,
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  backoffMultiplier: 1.5,

  // Enable debug logging
  debug: true,
});

client.on("open", () => {
  logger.info`✅ Connected to JetStream!`;
});

client.on("message", async (data) => {
  const event = data as JetStreamEvent;

  if (event.kind === "commit" && event.commit) {
    const { operation, collection, record, rkey } = event.commit;

    logger.info`\n📡 New event:`;
    logger.info`  Operation: ${operation}`;
    logger.info`  Collection: ${collection}`;
    logger.info`  DID: ${event.did}`;
    logger.info`  Uri: at://${event.did}/${collection}/${rkey}`;

    if (operation === "create" && record) {
      console.log(JSON.stringify(record, null, 2));
    }

    logger.info`  Cursor: ${event.time_us}`;

    for (const [socket, channels] of clients) {
      if (channels.has(collection) && socket.readyState === WebSocket.OPEN) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          const nowPlayings = await getNowPlayings(ctx);
          const scrobbles = await getScrobbles(ctx);
          const scrobblesChart = await getScrobblesChart(ctx);
          const actorScrobbles = await getActorScrobbles(ctx, event.did);
          const actorAlbums = await getActorAlbums(ctx, event.did);
          const actorArtists = await getActorArtists(ctx, event.did);

          socket.send(
            JSON.stringify({
              nowPlayings,
              scrobbles,
              scrobblesChart,
              actorScrobbles,
              actorAlbums,
              actorArtists,
              uri: `at://${event.did}/${collection}/${rkey}`,
              did: event.did,
            }),
          );
        } catch (error) {
          logger.error`Failed to send data to client: ${error}`;
        }
      }
    }
  }
});

client.on("error", (error) => {
  logger.error`❌ Error:  ${error}`;
});

client.on("reconnect", (data) => {
  const { attempt } = data as { attempt: number };
  logger.info`🔄 Reconnecting... (attempt ${attempt})`;
});

client.connect();

Deno.serve((req) => {
  if (req.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 426 });
  }
  const { socket, response } = Deno.upgradeWebSocket(req);
  socket.addEventListener("open", () => {
    logger.info`a client connected!`;
    clients.set(socket, new Set(["app.rocksky.scrobble"]));
  });
  socket.addEventListener("message", (event) => {
    if (event.data === "ping") {
      socket.send("pong");
    }
  });
  return response;
});
