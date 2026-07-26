import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq, or } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { InputSchema } from "lexicon/types/app/rocksky/shout/createShout";
import { createAgent } from "lib/agent";
import tables from "schema";
import { createShout as createShoutService } from "shouts/shouts.service";
import { shoutSchema } from "types/shout";

/**
 * The subject of a shout is carried in the request body alongside `message`.
 * The lexicon only formally declares `message`, but the input schema is open
 * (`[k: string]: unknown`), so the subject `uri` (a scrobble/song/album/artist
 * at-uri, or a bare user DID for a profile shout) travels through untouched.
 */
type CreateShoutInput = InputSchema & { uri?: string };

export default function (server: Server, ctx: Context) {
  const createShout = (input: CreateShoutInput, auth: HandlerAuth) =>
    pipe(
      handleCreate({ input, ctx, did: auth.credentials?.did }),
      Effect.flatMap(presentation),
      Effect.timeout("15 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.shout.createShout({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(
        createShout(input.body as CreateShoutInput, auth),
      );
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const handleCreate = ({
  input,
  ctx,
  did,
}: {
  input: CreateShoutInput;
  ctx: Context;
  did?: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      if (!did) {
        throw new Error("User is not authenticated");
      }
      if (!input.uri) {
        throw new Error("Missing shout subject uri");
      }

      const parsed = shoutSchema.safeParse(input);
      if (!parsed.success) {
        throw new Error(`Invalid shout data: ${parsed.error.message}`);
      }

      const user = await ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.did, did))
        .limit(1)
        .then((rows) => rows[0]);
      if (!user) {
        throw new Error("User not found");
      }

      const agent = await createAgent(ctx.oauthClient, did);
      if (!agent) {
        throw new Error("Unauthorized");
      }

      // A bare `at://<did>` (or handle) targets a user profile; the shout
      // service resolves it to the profile owner and writes a profile_shout.
      let subjectUri = input.uri;
      if (!subjectUri.includes("/app.rocksky.")) {
        const target = subjectUri.replace("at://", "");
        const profile = await ctx.db
          .select()
          .from(tables.users)
          .where(
            or(eq(tables.users.did, target), eq(tables.users.handle, target)),
          )
          .limit(1)
          .then((rows) => rows[0]);
        if (!profile) {
          throw new Error("Profile not found");
        }
        subjectUri = `at://${profile.did}`;
      }

      await createShoutService(ctx, parsed.data, subjectUri, user, agent);
      return {};
    },
    catch: (error) => new Error(`Failed to create shout: ${error}`),
  });

const presentation = () => Effect.sync(() => ({}));
