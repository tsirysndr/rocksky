import chalk from "chalk";
import { Context } from "context";
import { eq } from "drizzle-orm";
import _ from "lodash";
import { StringCodec } from "nats";
import tables from "schema";

export function onNewUser(ctx: Context) {
  const sc = StringCodec();
  const sub = ctx.nc.subscribe("rocksky.user");
  (async () => {
    for await (const m of sub) {
      const payload: {
        xata_id: string;
      } = JSON.parse(sc.decode(m.data));
      const results = await ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.id, payload.xata_id))
        .execute();

      console.log(`New user: ${chalk.cyan(_.get(results, "0.handle"))}`);

      await ctx.meilisearch.post(
        `/indexes/users/documents?primaryKey=id`,
        results
      );
    }
  })();
}
