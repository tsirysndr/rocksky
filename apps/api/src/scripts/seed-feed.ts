import type { Agent } from "@atproto/api";
import chalk from "chalk";
import { ctx } from "context";
import { createAgent } from "lib/agent";
import * as FeedGenerator from "lexicon/types/app/rocksky/feed/generator";
import tables from "schema";
import { InsertFeed } from "schema/feeds";
import { eq } from "drizzle-orm";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Please provide user author identifier (handle or DID).");
  console.log(`Usage: ${chalk.cyan("npm run seed:feed -- <handle|did>")}`);
  process.exit(1);
}

async function getFeeds(agent: Agent, limit: number = 100) {
  const res = await agent.com.atproto.repo.listRecords({
    repo: agent.assertDid,
    collection: "app.rocksky.feed.generator",
    limit,
  });
  return res.data.records.map((record) => ({
    ...record,
    value: FeedGenerator.isRecord(record.value) ? record.value : null,
  }));
}

let userDid = args[0];

if (!userDid.startsWith("did:plc:")) {
  userDid = await ctx.baseIdResolver.handle.resolve(userDid);
}

const agent = await createAgent(ctx.oauthClient, userDid);

const [user] = await ctx.db
  .select()
  .from(tables.users)
  .where(eq(tables.users.did, agent.assertDid))
  .execute();

const feeds = await getFeeds(agent);

for (const feed of feeds) {
  if (!feed.value) continue;

  await ctx.db
    .insert(tables.feeds)
    .values({
      displayName: feed.value.displayName,
      description: feed.value.description,
      did: feed.value.did,
      userId: user.id,
      uri: feed.uri,
    } satisfies InsertFeed)
    .onConflictDoNothing()
    .execute();
  console.log(
    `Feed ${chalk.cyanBright(feed.value.displayName)} seeded successfully.`,
  );
}

process.exit(0);
