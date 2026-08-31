import { AtpAgent } from "@atproto/api";
import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import * as EqualizerPreset from "lexicon/types/app/rocksky/equalizer";
import type { PresetView } from "lexicon/types/app/rocksky/equalizer/defs";
import type {
  OutputSchema,
  QueryParams,
} from "lexicon/types/app/rocksky/equalizer/listPresets";
import { createAgent } from "lib/agent";
import extractPdsFromDid from "lib/extractPdsFromDid";
import tables from "schema";

const COLLECTION = "app.rocksky.equalizer";

export default function (server: Server, ctx: Context) {
  const listPresets = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      {
        ctx,
        params,
        did: auth.credentials?.did as string | undefined,
      },
      resolveDid,
      Effect.flatMap(retrieve),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error("[listPresets]", err);
        return Effect.succeed({ presets: [] } satisfies OutputSchema);
      }),
    );

  server.app.rocksky.equalizer.listPresets({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      if (!params.did && !auth.credentials?.did) {
        return {
          status: 401,
          error: "AuthRequired",
          message:
            "Provide a `did` param for public access or include an auth token.",
        } as any;
      }
      const result = await Effect.runPromise(listPresets(params, auth));
      return { encoding: "application/json" as const, body: result };
    },
  });
}

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

const retrieve = ({
  ctx,
  did,
}: {
  ctx: Context;
  did: string;
}): Effect.Effect<OutputSchema, Error> =>
  Effect.tryPromise({
    try: async () => {
      let agent: { com: AtpAgent["com"] } | null = await createAgent(
        ctx.oauthClient,
        did,
      );

      if (!agent) {
        const pds = await extractPdsFromDid(did);
        agent = new AtpAgent({ service: new URL(pds) });
      }

      const presets: PresetView[] = [];
      let cursor: string | undefined;
      do {
        const { data } = await (agent as AtpAgent).com.atproto.repo.listRecords(
          {
            repo: did,
            collection: COLLECTION,
            limit: 100,
            cursor,
          },
        );
        for (const rec of data.records) {
          if (!EqualizerPreset.isRecord(rec.value)) continue;
          presets.push({
            uri: rec.uri,
            rkey: rec.uri.split("/").pop() ?? "",
            name: rec.value.name,
            precut: rec.value.precut,
            bands: rec.value.bands,
            createdAt: rec.value.createdAt,
            updatedAt: rec.value.updatedAt,
          });
        }
        cursor = data.cursor;
      } while (cursor && presets.length < 500);

      presets.sort((a, b) => a.name.localeCompare(b.name));
      return { presets } satisfies OutputSchema;
    },
    catch: (error) => new Error(`Failed to list equalizer presets: ${error}`),
  });
