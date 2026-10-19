import type { Context } from "context";
import { consola } from "consola";
import { eq } from "drizzle-orm";
import lovedTracks from "../schema/loved-tracks";
import shouts from "../schema/shouts";
import users from "../schema/users";
import {
  createNotification,
  createNotifications,
} from "./notifications.service";

export async function songRecipients(
  ctx: Context,
  trackId: string,
  uri: string,
): Promise<string[]> {
  const ownerDid = uri.replace("at://", "").split("/")[0];
  const [lovers, owners] = await Promise.all([
    ctx.db
      .select({ id: users.id })
      .from(lovedTracks)
      .innerJoin(users, eq(lovedTracks.userId, users.id))
      .where(eq(lovedTracks.trackId, trackId))
      .groupBy(users.id),
    ctx.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.did, ownerDid))
      .limit(1),
  ]);
  return [...new Set([...owners, ...lovers].map((row) => row.id))];
}

export async function notifySongLike(
  ctx: Context,
  trackId: string,
  uri: string,
  actorId: string,
) {
  try {
    await createNotifications(ctx, await songRecipients(ctx, trackId, uri), {
      actorId,
      type: "like_scrobble",
      subjectUri: uri,
    });
  } catch (error) {
    consola.error("Failed to fan out song-like notifications", error);
  }
}

export async function notifySongShout(
  ctx: Context,
  trackId: string,
  uri: string,
  actorId: string,
  shoutId: string,
  replyTo?: string,
): Promise<string[]> {
  try {
    const [ids, authors] = await Promise.all([
      songRecipients(ctx, trackId, uri),
      ctx.db
        .select({ id: users.id })
        .from(shouts)
        .innerJoin(users, eq(shouts.authorId, users.id))
        .where(eq(shouts.trackId, trackId))
        .groupBy(users.id),
    ]);
    const recipients = [...new Set([...ids, ...authors.map((row) => row.id)])];
    await createNotifications(
      ctx,
      recipients.filter((id) => id !== replyTo),
      {
        actorId,
        type: "comment_scrobble",
        shoutId,
        subjectUri: uri,
      },
    );
    await createNotification(ctx, {
      userId: replyTo,
      actorId,
      type: "reply",
      shoutId,
      subjectUri: uri,
    });
    return [...new Set([...recipients, ...(replyTo ? [replyTo] : [])])];
  } catch (error) {
    consola.error("Failed to fan out song-shout notifications", error);
    return [];
  }
}
