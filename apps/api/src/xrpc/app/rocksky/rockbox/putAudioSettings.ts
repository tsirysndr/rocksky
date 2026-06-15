import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import { createAgent } from "lib/agent";
import type { Server } from "lexicon";
import type { SettingsView } from "lexicon/types/app/rocksky/rockbox/defs";
import type { InputSchema } from "lexicon/types/app/rocksky/rockbox/putAudioSettings";
import * as AudioSettings from "lexicon/types/app/rocksky/rockbox/audio/settings";

const COLLECTION = "app.rocksky.rockbox.audio.settings";

export default function (server: Server, ctx: Context) {
  const putAudioSettings = (input: InputSchema, auth: HandlerAuth) =>
    pipe(
      { ctx, input, did: auth.credentials?.did as string | undefined },
      upsert,
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error("[putAudioSettings]", err);
        return Effect.succeed(emptyView());
      }),
    );

  server.app.rocksky.rockbox.putAudioSettings({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(
        putAudioSettings(input.body, auth),
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
}): Effect.Effect<SettingsView, Error> =>
  Effect.tryPromise({
    try: async () => {
      if (!did) throw new Error("Unauthorized");

      const agent = await createAgent(ctx.oauthClient, did);
      if (!agent) throw new Error("Could not create agent");

      // Fetch existing record for merge and optimistic concurrency (swapRecord).
      let existing: AudioSettings.Record | undefined;
      let swapRecord: string | undefined;
      try {
        const { data } = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: COLLECTION,
          rkey: "self",
        });
        swapRecord = data.cid;
        if (AudioSettings.isRecord(data.value)) existing = data.value;
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status !== 400 && status !== 404) throw err;
      }

      const now = new Date().toISOString();
      const record: AudioSettings.Record = {
        $type: COLLECTION,
        crossfade: input.crossfade ?? existing?.crossfade,
        equalizer: input.equalizer ?? existing?.equalizer,
        replayGain: input.replayGain ?? existing?.replayGain,
        tone: input.tone ?? existing?.tone,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      await agent.com.atproto.repo.putRecord({
        repo: agent.assertDid,
        collection: COLLECTION,
        rkey: "self",
        record,
        swapRecord,
        validate: false,
      });

      return {
        crossfade: record.crossfade,
        equalizer: record.equalizer,
        replayGain: record.replayGain,
        tone: record.tone,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      } satisfies SettingsView;
    },
    catch: (error) => new Error(`Failed to upsert audio settings: ${error}`),
  });

const emptyView = (): SettingsView => ({
  createdAt: new Date().toISOString(),
});
