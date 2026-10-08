import type { Agent } from "@atproto/api";
import { TID } from "@atproto/common";
import { AuthRequiredError, InvalidRequestError } from "@atproto/xrpc-server";
import type { Context } from "context";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Server } from "lexicon";
import type {
  InputSchema,
  OutputSchema,
} from "lexicon/types/app/rocksky/event/putRsvp";
import {
  eventGroupIds,
  findEvent,
  RSVP_GOING,
  RSVP_INTERESTED,
  RSVP_NOT_GOING,
  viewerDid,
} from "lib/eventView";
import tables from "schema";

const COLLECTION = "community.lexicon.calendar.rsvp";
const getAgent = async (ctx: Context, did: string) => {
  const { createAgent } = await import("lib/agent");
  return createAgent(ctx.oauthClient, did);
};

export default function (server: Server, ctx: Context) {
  server.app.rocksky.event.putRsvp({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => ({
      encoding: "application/json" as const,
      body: await putRsvp(ctx, input.body, viewerDid(auth)),
    }),
  });
}

export async function putRsvp(
  ctx: Context,
  input: InputSchema,
  did?: string,
  agentFactory: (ctx: Context, did: string) => Promise<Agent | null> = getAgent,
): Promise<OutputSchema> {
  if (!did) throw new AuthRequiredError("Sign in to RSVP.");
  if (![RSVP_GOING, RSVP_INTERESTED, RSVP_NOT_GOING].includes(input.status)) {
    throw new InvalidRequestError("Invalid RSVP status");
  }
  const row = await findEvent(ctx, input.uri);
  if (!row) throw new InvalidRequestError("Event not found", "NotFound");
  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, did))
    .limit(1)
    .then((rows) => rows[0]);
  if (!user) throw new AuthRequiredError("Sign in to RSVP.");
  const agent = await agentFactory(ctx, did);
  if (!agent) throw new AuthRequiredError("Sign in again to RSVP.");

  // Serialize this viewer's writes across API processes, including first RSVP
  // creation. Keep the index unchanged if the PDS rejects the write.
  return ctx.db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${did}:${row.events.id}`}, 0))`,
    );
    const existing = await tx
      .select({ rsvp: tables.eventRsvps, event: tables.events })
      .from(tables.eventRsvps)
      .innerJoin(tables.events, eq(tables.eventRsvps.eventId, tables.events.id))
      .where(
        and(
          eq(tables.eventRsvps.userId, user.id),
          inArray(tables.eventRsvps.eventId, eventGroupIds(row.events.id)),
        ),
      )
      .orderBy(desc(tables.eventRsvps.updatedAt))
      .limit(1)
      .then((rows) => rows[0]);
    // Keep an existing RSVP's subject when the event is a folded duplicate.
    const event = existing?.event ?? row.events;
    const rkey = existing?.rsvp.uri.split("/").pop() ?? TID.nextStr();
    let cid = event.cid;
    if (!cid) {
      const [repo, collection, eventRkey] = event.uri
        .replace("at://", "")
        .split("/");
      cid = (
        await agent.com.atproto.repo.getRecord({
          repo,
          collection,
          rkey: eventRkey,
        })
      ).data.cid;
    }
    if (!cid) throw new InvalidRequestError("Event record is unavailable");
    let result: { uri: string; cid: string };
    try {
      const response = await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: COLLECTION,
        rkey,
        record: {
          $type: COLLECTION,
          subject: { uri: event.uri, cid },
          status: input.status,
        },
        validate: false,
      });
      result = response.data;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403)
        throw new AuthRequiredError("Sign in again to grant RSVP access.");
      throw error;
    }
    await tx
      .insert(tables.eventRsvps)
      .values({
        eventId: event.id,
        userId: user.id,
        uri: result.uri,
        cid: result.cid,
        status: input.status,
      })
      .onConflictDoUpdate({
        target: [tables.eventRsvps.eventId, tables.eventRsvps.userId],
        set: {
          uri: result.uri,
          cid: result.cid,
          status: input.status,
          updatedAt: new Date(),
        },
      });
    return { uri: result.uri, status: input.status };
  });
}
