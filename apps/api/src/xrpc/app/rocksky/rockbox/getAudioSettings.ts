import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import { createAgent } from "lib/agent";
import type { Server } from "lexicon";
import type { SettingsView } from "lexicon/types/app/rocksky/rockbox/defs";
import * as AudioSettings from "lexicon/types/app/rocksky/rockbox/audioSettings";

const COLLECTION = "app.rocksky.rockbox.audioSettings";

export default function (server: Server, ctx: Context) {
  const getAudioSettings = (auth: HandlerAuth) =>
    pipe(
      { ctx, did: auth.credentials?.did as string | undefined },
      retrieve,
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error("[getAudioSettings]", err);
        return Effect.succeed(emptyView());
      }),
    );

  server.app.rocksky.rockbox.getAudioSettings({
    auth: ctx.authVerifier,
    handler: async ({ auth }) => {
      const result = await Effect.runPromise(getAudioSettings(auth));
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
}): Effect.Effect<SettingsView, Error> =>
  Effect.tryPromise({
    try: async () => {
      if (!did) return emptyView();

      const agent = await createAgent(ctx.oauthClient, did);
      if (!agent) return emptyView();

      try {
        const { data } = await agent.com.atproto.repo.getRecord({
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
