import { consola } from "consola";
import { ctx } from "context";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { verifyToken } from "lib/verifyToken";
import { StringCodec } from "nats";
import {
  getUnreadCount,
  notificationSubject,
} from "notifications/notifications.service";
import users from "schema/users";

const app = new Hono();
const sc = StringCodec();

/**
 * Server-Sent Events stream of a user's live notifications.
 *
 * EventSource cannot set headers, so the JWT is passed as a `token` query
 * param. Each connection subscribes to the user's dedicated NATS subject, so
 * NATS routes a published event only to the API instances actually holding
 * that user's live connections — the fan-out scales horizontally without any
 * websocket or per-instance broadcast filtering.
 */
app.get("/stream", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    c.status(401);
    return c.text("Unauthorized");
  }

  let did: string | undefined;
  try {
    did = (await verifyToken(token)).did;
  } catch {
    c.status(401);
    return c.text("Unauthorized");
  }
  if (!did) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const user = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  return streamSSE(c, async (stream) => {
    const sub = ctx.nc.subscribe(notificationSubject(user.id));
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      try {
        sub.unsubscribe();
      } catch {
        // already torn down
      }
    };
    stream.onAbort(close);

    // Prime the client with the current unread count on connect.
    try {
      const unreadCount = await getUnreadCount(ctx, user.id);
      await stream.writeSSE({
        event: "unread",
        data: JSON.stringify({ unreadCount }),
      });
    } catch (err) {
      consola.error(err);
    }

    // Heartbeat so intermediary proxies don't drop an idle connection.
    const heartbeat = (async () => {
      while (!closed) {
        await stream.sleep(25_000);
        if (closed) break;
        try {
          await stream.writeSSE({ event: "ping", data: "" });
        } catch {
          break;
        }
      }
    })();

    try {
      for await (const msg of sub) {
        if (closed) break;
        await stream.writeSSE({
          event: "notification",
          data: sc.decode(msg.data),
        });
      }
    } catch (err) {
      consola.error(err);
    } finally {
      close();
    }

    await heartbeat;
  });
});

export default app;
