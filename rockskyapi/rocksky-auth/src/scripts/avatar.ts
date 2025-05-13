import { equals } from "@xata.io/client";
import { ctx } from "context";
import { eq } from "drizzle-orm";
import _ from "lodash";
import users from "schema/users";

const args = process.argv.slice(2);

for (const did of args) {
  const user = await ctx.client.db.users
    .filter({
      $any: [{ did }, { handle: did }],
    })
    .getFirst();
  if (!user) {
    console.log(`User ${did} not found`);
    continue;
  }

  const plc = await fetch(`https://plc.directory/${user.did}`).then((res) =>
    res.json()
  );

  const serviceEndpoint = _.get(plc, "service.0.serviceEndpoint");
  if (!serviceEndpoint) {
    console.log(`Service endpoint not found for ${did}`);
    continue;
  }

  const profile = await fetch(
    `${serviceEndpoint}/xrpc/com.atproto.repo.getRecord?repo=${user.did}&collection=app.bsky.actor.profile&rkey=self`
  ).then((res) => res.json());
  const ref = _.get(profile, "value.avatar.ref.$link");
  const type = _.get(profile, "value.avatar.mimeType").split("/")[1];
  await ctx.db
    .update(users)
    .set({
      displayName: _.get(profile, "value.displayName"),
      avatar: `https://cdn.bsky.app/img/avatar/plain/${user.did}/${ref}@${type}`,
    })
    .where(eq(users.did, user.did))
    .execute();

  const u = await ctx.client.db.users
    .select(["*"])
    .filter("did", equals(user.did))
    .getFirst();
  ctx.nc.publish("rocksky.user", Buffer.from(JSON.stringify(u)));
}

console.log("Done");

process.exit(0);
