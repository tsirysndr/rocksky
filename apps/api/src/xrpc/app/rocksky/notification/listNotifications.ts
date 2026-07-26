import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import type { Server } from "lexicon";
import type { NotificationView } from "lexicon/types/app/rocksky/notification/defs";
import {
  getUnreadCount,
  listNotifications,
} from "notifications/notifications.service";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.notification.listNotifications({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      try {
        const did = (auth as HandlerAuth).credentials?.did;
        if (!did) {
          return {
            encoding: "application/json",
            body: { notifications: [], unreadCount: 0 },
          };
        }

        const user = await ctx.db
          .select({ id: tables.users.id })
          .from(tables.users)
          .where(eq(tables.users.did, did))
          .limit(1)
          .then((rows) => rows[0]);

        if (!user) {
          return {
            encoding: "application/json",
            body: { notifications: [], unreadCount: 0 },
          };
        }

        const { notifications, cursor } = await listNotifications(
          ctx,
          user.id,
          { limit: params.limit, cursor: params.cursor },
        );
        const unreadCount = await getUnreadCount(ctx, user.id);

        return {
          encoding: "application/json",
          body: {
            notifications: notifications as NotificationView[],
            unreadCount,
            cursor,
          },
        };
      } catch (err) {
        consola.error(err);
        return {
          encoding: "application/json",
          body: { notifications: [], unreadCount: 0 },
        };
      }
    },
  });
}
