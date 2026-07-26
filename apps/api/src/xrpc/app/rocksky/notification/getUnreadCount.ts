import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import type { Server } from "lexicon";
import { getUnreadCount } from "notifications/notifications.service";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.notification.getUnreadCount({
    auth: ctx.authVerifier,
    handler: async ({ auth }) => {
      let count = 0;
      try {
        const did = (auth as HandlerAuth).credentials?.did;
        if (did) {
          const user = await ctx.db
            .select({ id: tables.users.id })
            .from(tables.users)
            .where(eq(tables.users.did, did))
            .limit(1)
            .then((rows) => rows[0]);
          if (user) {
            count = await getUnreadCount(ctx, user.id);
          }
        }
      } catch (err) {
        consola.error(err);
      }
      return {
        encoding: "application/json",
        body: { count },
      };
    },
  });
}
