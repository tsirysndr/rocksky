import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { createAgent } from "lib/agent";
import extractPdsFromDid from "lib/extractPdsFromDid";
import type { Server } from "lexicon";
import type { SettingsView } from "lexicon/types/app/rocksky/rockbox/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/rockbox/getAudioSettings";
import * as AudioSettings from "lexicon/types/app/rocksky/rockbox/audio/settings";
import { AtpAgent } from "@atproto/api";
import tables from "schema";

const COLLECTION = "app.rocksky.rockbox.audio.settings";

export default function (server: Server, ctx: Context) {
  const getAudioSettings = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      {
        ctx,
        params,
        did: (auth as any).credentials?.did as string | undefined,
      },
      resolveDid,
      Effect.flatMap(retrieve),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error("[getAudioSettings]", err);
        return Effect.succeed(emptyView());
      }),
    );

  server.app.rocksky.rockbox.getAudioSettings({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      // Unauthenticated with no `did` → 401
      if (!params.did && !(auth as any).credentials?.did) {
        return {
          status: 401,
          error: "AuthRequired",
          message:
            "Provide a `did` param for public access or include an auth token.",
        } as any;
      }
      const result = await Effect.runPromise(getAudioSettings(params, auth));
      return { encoding: "application/json" as const, body: result };
    },
  });
}

// ── Resolve which DID to use ──────────────────────────────────────────────────
// - `params.did` takes precedence (public lookup)
// - falls back to the authenticated caller's DID

const resolveDid = ({
  ctx,
  params,
  did: callerDid,
}: {
  ctx: Context;
  params: QueryParams;
  did: string | undefined;
}): Effect.Effect<{ ctx: Context; did: string }, Error> =>
  Effect.tryPromise({
    try: async () => {
      const did = params.did ?? callerDid;
      if (!did) throw new Error("No DID");

      // Resolve a handle to a DID if needed
      if (!did.startsWith("did:")) {
        const [user] = await ctx.db
          .select({ did: tables.users.did })
          .from(tables.users)
          .where(eq(tables.users.handle, did))
          .limit(1);
        if (!user) throw new Error(`Handle not found: ${did}`);
        return { ctx, did: user.did };
      }

      return { ctx, did };
    },
    catch: (error) => new Error(`Failed to resolve DID: ${error}`),
  });

// ── Fetch the ATProto record ──────────────────────────────────────────────────
// For the authenticated caller we use their OAuth agent (needed to read private
// repos). For public lookups we create an anonymous AtpAgent pointed at the
// target's PDS.

const retrieve = ({
  ctx,
  did,
}: {
  ctx: Context;
  did: string;
}): Effect.Effect<SettingsView, Error> =>
  Effect.tryPromise({
    try: async () => {
      let agent: { com: AtpAgent["com"] } | null = null;

      // Try the authenticated agent first (works for the caller's own repo and
      // for any repo reachable via the stored OAuth session).
      agent = await createAgent(ctx.oauthClient, did);

      if (!agent) {
        // Fall back to an anonymous agent pointed at the target's PDS.
        const pds = await extractPdsFromDid(did);
        agent = new AtpAgent({ service: new URL(pds) });
      }

      try {
        const { data } = await (agent as AtpAgent).com.atproto.repo.getRecord({
          repo: did,
          collection: COLLECTION,
          rkey: "self",
        });

        if (!AudioSettings.isRecord(data.value)) return emptyView();

        const rec = data.value;
        return {
          crossfade: rec.crossfade,
          equalizer: rec.equalizer,
          replayGain: rec.replayGain,
          tone: rec.tone,
          createdAt: rec.createdAt,
          updatedAt: rec.updatedAt,
        } satisfies SettingsView;
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 400 || status === 404) return emptyView();
        throw err;
      }
    },
    catch: (error) => new Error(`Failed to retrieve audio settings: ${error}`),
  });

const emptyView = (): SettingsView => ({
  createdAt: new Date().toISOString(),
});
