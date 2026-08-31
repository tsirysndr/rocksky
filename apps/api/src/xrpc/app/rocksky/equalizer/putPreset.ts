import type { HandlerAuth } from "@atproto/xrpc-server";
import { InvalidRequestError } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import * as EqualizerPreset from "lexicon/types/app/rocksky/equalizer";
import type { PresetView } from "lexicon/types/app/rocksky/equalizer/defs";
import type { InputSchema } from "lexicon/types/app/rocksky/equalizer/putPreset";
import { createAgent } from "lib/agent";
import { presetRkey } from "./slug";

const COLLECTION = "app.rocksky.equalizer";

export default function (server: Server, ctx: Context) {
  const putPreset = (input: InputSchema, auth: HandlerAuth) =>
    pipe(
      { ctx, input, did: auth.credentials?.did as string | undefined },
      upsert,
      Effect.timeout("10 seconds"),
    );

  server.app.rocksky.equalizer.putPreset({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(putPreset(input.body, auth)).catch(
        (err) => {
          consola.error("[putPreset]", err);
          throw err;
        },
      );
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
}): Effect.Effect<PresetView, Error> =>
  Effect.tryPromise({
    try: async () => {
      if (!did) throw new Error("Unauthorized");

      const rkey = presetRkey(input.name);
      if (!rkey) {
        throw new InvalidRequestError(
          `Preset name "${input.name}" produces an empty record key`,
        );
      }

      const agent = await createAgent(ctx.oauthClient, did);
      if (!agent) throw new Error("Could not create agent");

      // Fetch existing record to preserve createdAt and for optimistic
      // concurrency (swapRecord).
      let existing: EqualizerPreset.Record | undefined;
      let swapRecord: string | undefined;
      try {
        const { data } = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: COLLECTION,
          rkey,
        });
        swapRecord = data.cid;
        if (EqualizerPreset.isRecord(data.value)) existing = data.value;
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status !== 400 && status !== 404) throw err;
      }

      const now = new Date().toISOString();
      const record: EqualizerPreset.Record = {
        $type: COLLECTION,
        name: input.name.trim(),
        precut: input.precut ?? existing?.precut,
        bands: input.bands,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      const { data } = await agent.com.atproto.repo.putRecord({
        repo: agent.assertDid,
        collection: COLLECTION,
        rkey,
        record,
        swapRecord,
        validate: false,
      });

      return {
        uri: data.uri,
        rkey,
        name: record.name,
        precut: record.precut,
        bands: record.bands,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      } satisfies PresetView;
    },
    catch: (error) =>
      error instanceof InvalidRequestError
        ? error
        : new Error(`Failed to save equalizer preset: ${error}`),
  });
