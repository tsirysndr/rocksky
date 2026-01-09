import { JetStreamClient, JetStreamEvent } from "jetstream";
import chalk from "chalk";
import { logger } from "logger";

const getEndpoint = () => {
  const endpoint = process.env.JETSTREAM_SERVER
    ? process.env.JETSTREAM_SERVER
    : "wss://jetstream1.us-west.bsky.network/subscribe";

  if (endpoint?.endsWith("/subscribe")) {
    return endpoint;
  }

  return `${endpoint}/subscribe`;
};

export function sync() {
  const client = new JetStreamClient({
    wantedCollections: [
      "app.rocksky.scrobble",
      "app.rocksky.artist",
      "app.rocksky.album",
      "app.rocksky.song",
    ],
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
      const uri = `at://${event.did}/${collection}/${rkey}`;

      logger.info`\n📡 New event:`;
      logger.info`  Operation: ${operation}`;
      logger.info`  Collection: ${collection}`;
      logger.info`  DID: ${event.did}`;
      logger.info`  Uri: ${uri}`;

      if (operation === "create" && record) {
        console.log(JSON.stringify(record, null, 2));
      }

      logger.info`  Cursor: ${event.time_us}`;
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
}
