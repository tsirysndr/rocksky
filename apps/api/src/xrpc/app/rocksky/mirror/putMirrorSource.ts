import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { and, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { MirrorSourceView } from "lexicon/types/app/rocksky/mirror/defs";
import type { InputSchema } from "lexicon/types/app/rocksky/mirror/putMirrorSource";
import { encryptCredential } from "lib/storage-crypto";
import tables from "schema";

const PROVIDERS = new Set(["lastfm", "listenbrainz", "tealfm"]);
const MIRROR_TOPIC = "rocksky.mirror.user";
// Seed the watermark this far in the past on (re-)enable so the very first
// poll backfills a window of recent scrobbles instead of starting from "now"
// and missing everything the user listened to in the minutes/hours before
// they flipped the toggle.
const BACKFILL_WINDOW_MS = 24 * 60 * 60 * 1000;

export default function (server: Server, ctx: Context) {
  const putMirrorSource = (input: InputSchema, auth: HandlerAuth) =>
    pipe(
      { ctx, input, did: auth.credentials?.did as string | undefined },
      upsert,
      Effect.flatMap(presentation),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({
          provider: input.provider,
          enabled: false,
          hasCredentials: false,
        } satisfies MirrorSourceView);
      }),
    );

  server.app.rocksky.mirror.putMirrorSource({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(putMirrorSource(input.body, auth));
      return { encoding: "application/json" as const, body: result };
    },
  });
}

const upsert = ({
  ctx,
  input,
  did,
}: {
  ctx: Context;
  input: InputSchema;
  did: string | undefined;
}): Effect.Effect<MirrorSourceView, Error> =>
  Effect.tryPromise({
    try: async () => {
      if (!did) throw new Error("Unauthorized");
      if (!PROVIDERS.has(input.provider)) {
        throw new Error(`Unknown provider: ${input.provider}`);
      }

      const [user] = await ctx.db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(eq(tables.users.did, did))
        .limit(1);
      if (!user) throw new Error("User not found");

      const [existing] = await ctx.db
        .select()
        .from(tables.mirrorSources)
        .where(
          and(
            eq(tables.mirrorSources.userId, user.id),
            eq(tables.mirrorSources.provider, input.provider),
          ),
        )
        .limit(1);

      // Last.fm / ListenBrainz require an external username before enabling.
      if (
        input.enabled === true &&
        (input.provider === "lastfm" || input.provider === "listenbrainz") &&
        !(input.externalUsername ?? existing?.externalUsername)
      ) {
        throw new Error("externalUsername is required");
      }

      const encryptedApiKey =
        input.apiKey === undefined
          ? undefined
          : input.apiKey === ""
            ? null
            : await encryptCredential(input.apiKey);

      // Seed the watermark to (now - backfill window) on (re-)enable so the
      // first poll catches recent scrobbles instead of only "from now on".
      const enableTransition =
        input.enabled === true && existing?.enabled !== true;
      const now = new Date();
      const watermarkSeed = new Date(now.getTime() - BACKFILL_WINDOW_MS);

      let row: typeof tables.mirrorSources.$inferSelect;
      if (existing) {
        const updates: Record<string, unknown> = { updatedAt: now };
        if (input.enabled !== undefined) updates.enabled = input.enabled;
        if (input.externalUsername !== undefined)
          updates.externalUsername = input.externalUsername;
        if (encryptedApiKey !== undefined)
          updates.encryptedApiKey = encryptedApiKey;
        if (enableTransition) updates.lastScrobbleSeenAt = watermarkSeed;

        const [updated] = await ctx.db
          .update(tables.mirrorSources)
          .set(updates)
          .where(eq(tables.mirrorSources.id, existing.id))
          .returning();
        row = updated;
      } else {
        const [inserted] = await ctx.db
          .insert(tables.mirrorSources)
          .values({
            userId: user.id,
            provider: input.provider,
            enabled: input.enabled ?? false,
            externalUsername: input.externalUsername ?? null,
            encryptedApiKey: encryptedApiKey ?? null,
            lastScrobbleSeenAt: input.enabled ? watermarkSeed : null,
          })
          .returning();
        row = inserted;
      }

      // Best-effort notify the mirror process to start/stop the per-user task.
      try {
        ctx.nc.publish(
          MIRROR_TOPIC,
          Buffer.from(`${input.provider}:${user.id}`),
        );
      } catch (e) {
        consola.warn("[putMirrorSource] NATS publish failed:", e);
      }

      return {
        provider: row.provider,
        enabled: row.enabled,
        externalUsername: row.externalUsername ?? undefined,
        hasCredentials: !!row.encryptedApiKey,
        lastPolledAt: row.lastPolledAt?.toISOString(),
        lastScrobbleSeenAt: row.lastScrobbleSeenAt?.toISOString(),
      } satisfies MirrorSourceView;
    },
    catch: (error) => new Error(`Failed to upsert mirror source: ${error}`),
  });

const presentation = (view: MirrorSourceView) => Effect.sync(() => view);
