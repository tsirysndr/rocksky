import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { MirrorSourceView } from "lexicon/types/app/rocksky/mirror/defs";
import tables from "schema";

const PROVIDERS = ["lastfm", "listenbrainz", "tealfm"] as const;

export default function (server: Server, ctx: Context) {
  const getMirrorSources = (auth: HandlerAuth) =>
    pipe(
      { ctx, did: auth.credentials?.did as string | undefined },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ sources: emptySources() });
      }),
    );

  server.app.rocksky.mirror.getMirrorSources({
    auth: ctx.authVerifier,
    handler: async ({ auth }) => {
      const result = await Effect.runPromise(getMirrorSources(auth));
      return { encoding: "application/json" as const, body: result };
    },
  });
}

const retrieve = ({
  ctx,
  did,
}: {
  ctx: Context;
  did: string | undefined;
}): Effect.Effect<MirrorSourceView[], Error> =>
  Effect.tryPromise({
    try: async () => {
      // Always seed with the three baseline provider cards. We overlay any
      // existing rows on top, so the UI never has to deal with "no data" —
      // it just sees three disabled toggles ready to be flipped.
      const byProvider = new Map<string, typeof tables.mirrorSources.$inferSelect>();

      if (did) {
        const [user] = await ctx.db
          .select({ id: tables.users.id })
          .from(tables.users)
          .where(eq(tables.users.did, did))
          .limit(1);
        if (user) {
          const rows = await ctx.db
            .select()
            .from(tables.mirrorSources)
            .where(eq(tables.mirrorSources.userId, user.id));
          for (const r of rows) byProvider.set(r.provider, r);
        }
      }

      return PROVIDERS.map((provider) => {
        const r = byProvider.get(provider);
        return {
          provider,
          enabled: r?.enabled ?? false,
          externalUsername: r?.externalUsername ?? undefined,
          hasCredentials: !!r?.encryptedApiKey,
          lastPolledAt: r?.lastPolledAt?.toISOString(),
          lastScrobbleSeenAt: r?.lastScrobbleSeenAt?.toISOString(),
        } satisfies MirrorSourceView;
      });
    },
    catch: (error) => new Error(`Failed to retrieve mirror sources: ${error}`),
  });

const presentation = (sources: MirrorSourceView[]) =>
  Effect.sync(() => ({ sources }));

const emptySources = (): MirrorSourceView[] =>
  PROVIDERS.map((provider) => ({
    provider,
    enabled: false,
    hasCredentials: false,
  }));
