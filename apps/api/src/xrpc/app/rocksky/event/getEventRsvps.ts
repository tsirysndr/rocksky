import { InvalidRequestError } from "@atproto/xrpc-server";
import type { Context } from "context";
import { and, desc, eq } from "drizzle-orm";
import type { Server } from "lexicon";
import type { OutputSchema } from "lexicon/types/app/rocksky/event/getEventRsvps";
import { findEvent, toRsvpView } from "lib/eventView";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.event.getEventRsvps({
    handler: async ({ params }) => {
      const row = await findEvent(ctx, params.uri);
      if (!row) {
        throw new InvalidRequestError("Event not found", "NotFound");
      }
      const rows = await ctx.db
        .select({ rsvp: tables.eventRsvps, user: tables.users })
        .from(tables.eventRsvps)
        .innerJoin(tables.users, eq(tables.eventRsvps.userId, tables.users.id))
        .where(
          and(
            eq(tables.eventRsvps.eventId, row.events.id),
            params.status
              ? eq(tables.eventRsvps.status, params.status)
              : undefined,
          ),
        )
        .orderBy(desc(tables.eventRsvps.updatedAt), desc(tables.eventRsvps.id))
        .limit(params.limit)
        .offset(params.offset)
        .execute();
      return {
        encoding: "application/json" as const,
        body: {
          rsvps: rows.map(({ rsvp, user }) => toRsvpView(rsvp, user)),
        } satisfies OutputSchema,
      };
    },
  });
}
