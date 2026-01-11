import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { eq, or } from "drizzle-orm";
import _ from "lodash";
import users, { type SelectUser } from "schema/users";

const args = process.argv.slice(2);
const BATCH_SIZE = 100; // Process 100 users at a time

async function processUser(user: SelectUser) {
  if (!process.env.SKIP_AVATAR_UPDATE) {
    const plc = await fetch(`https://plc.directory/${user.did}`).then((res) =>
      res.json(),
    );

    const serviceEndpoint = _.get(plc, "service.0.serviceEndpoint");
    if (!serviceEndpoint) {
      consola.info(`Service endpoint not found for ${user.did}`);
      return;
    }

    const profile = await fetch(
      `${serviceEndpoint}/xrpc/com.atproto.repo.getRecord?repo=${user.did}&collection=app.bsky.actor.profile&rkey=self`,
    ).then((res) => res.json());
    const ref = _.get(profile, "value.avatar.ref.$link");
    const type = _.get(profile, "value.avatar.mimeType", "").split("/")[1];
    await ctx.db
      .update(users)
      .set({
        displayName: _.get(profile, "value.displayName"),
        avatar: `https://cdn.bsky.app/img/avatar/plain/${user.did}/${ref}@${type}`,
      })
      .where(eq(users.did, user.did))
      .execute();
  } else {
    consola.info(`Skipping avatar update for ${user.did}`);
  }

  const [u] = await ctx.db
    .select()
    .from(users)
    .where(eq(users.did, user.did))
    .limit(1)
    .execute();

  const userPayload = {
    xata_id: u.id,
    did: u.did,
    handle: u.handle,
    display_name: u.displayName,
    avatar: u.avatar,
    xata_createdat: u.createdAt.toISOString(),
    xata_updatedat: u.updatedAt.toISOString(),
    xata_version: u.xataVersion,
  };

  consola.info(userPayload);
  ctx.nc.publish("rocksky.user", Buffer.from(JSON.stringify(userPayload)));
}

if (args.length > 0) {
  for (const did of args) {
    const [user] = await ctx.db
      .select()
      .from(users)
      .where(or(eq(users.did, did), eq(users.handle, did)))
      .limit(1)
      .execute();
    if (!user) {
      consola.info(`User ${did} not found`);
      continue;
    }

    await processUser(user);
  }
} else {
  let offset = 0;
  let processedCount = 0;

  consola.info("Processing all users...");

  while (true) {
    const batch = await ctx.db
      .select()
      .from(users)
      .limit(BATCH_SIZE)
      .offset(offset)
      .execute();

    if (batch.length === 0) {
      break; // No more users to process
    }

    consola.info(
      `Processing batch ${Math.floor(offset / BATCH_SIZE) + 1}, users ${offset + 1}-${offset + batch.length}`,
    );

    for (const user of batch) {
      try {
        await processUser(user);
        processedCount++;
      } catch (error) {
        consola.error(`Error processing user ${user.did}:`, error);
      }
    }

    offset += BATCH_SIZE;

    // Small delay between batches to avoid overwhelming the API
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  consola.info(`Processed ${chalk.greenBright(processedCount)} users total`);
}

// Ensure all messages are flushed before exiting
await ctx.nc.flush();

consola.info("Done");

process.exit(0);
