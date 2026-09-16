import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { InputSchema } from "lexicon/types/app/rocksky/apikey/updateApikey";
import { dbQuery } from "lib/dbQuery";
import { transientDbRetry } from "lib/dbRetry";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const updateApikey = (input: InputSchema, auth) =>
    pipe(
      input,
      update,
      presentation,
      Effect.retry(transientDbRetry),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
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
  return dbQuery("Failed to retrieve current user", async (db) =>
    db
      .select()
      .from(tables.users)
      .where(eq(tables.users.did, did))
      .execute()
      .then((users) => ({ user: users[0], ctx, params })),
  );
};

const update = () => {
  // Logic to update the API key
  return {};
};

const presentation = () => {
  // Logic to format the updated API key for presentation
  return Effect.sync(() => ({}));
};
