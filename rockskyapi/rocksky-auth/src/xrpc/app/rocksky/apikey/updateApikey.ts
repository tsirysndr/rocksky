import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { InputSchema } from "lexicon/types/app/rocksky/apikey/updateApikey";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const updateApikey = (input: InputSchema, auth) =>
    pipe(
      input,
      update,
      presentation,
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.apikey.updateApikey({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(updateApikey(input.body, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const withUser = ({
  params,
  ctx,
  did,
}: {
  params: InputSchema;
  ctx: Context;
  did?: string;
}) => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.did, did))
        .execute()
        .then((users) => ({ user: users[0], ctx, params })),
    catch: (error) => new Error(`Failed to retrieve current user: ${error}`),
  });
};

const update = () => {
  // Logic to update the API key
  return {};
};

const presentation = () => {
  // Logic to format the updated API key for presentation
  return Effect.sync(() => ({}));
};
