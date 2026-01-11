import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import type * as FeedGenerator from "lexicon/types/app/rocksky/feed/generator";
import { createAgent } from "lib/agent";
import prompts from "prompts";

const args = process.argv.slice(2);

if (args.length === 0) {
  consola.error("Please provide user author identifier (handle or DID).");
  console.log(`Usage: ${chalk.cyan("npm run feed -- <handle|did>")}`);
  process.exit(1);
}

const name = await prompts({
  type: "text",
  name: "value",
  message: "What is the feed name?",
});

if (name.value.length < 3 || name.value.length > 240) {
  consola.error("Feed name must be between 3 and 240 characters.");
  process.exit(1);
}

const description = await prompts({
  type: "text",
  name: "value",
  message: "Please provide a short description of the feed",
});

if (description.value.length > 3000) {
  consola.error("Description is too long. Maximum length is 3000 characters.");
  process.exit(1);
}

const did = await prompts({
  type: "text",
  name: "value",
  message: "What is the feed DID?",
});

if (!/^did:web:[a-zA-Z0-9_.-]{3,30}$/.test(did.value)) {
  consola.error(
    "Invalid DID format. It should start with 'did:web:' followed by 3 to 30 alphanumeric characters, underscores, hyphens, or periods.",
  );
  process.exit(1);
}

const rkey = await prompts({
  type: "text",
  name: "value",
  message: "What is the record key (rkey) for the feed?",
});

if (!/^[a-zA-Z0-9_-]{3,30}$/.test(rkey.value)) {
  consola.error(
    "Invalid record key. Only alphanumeric characters, underscores, and hyphens are allowed. Length must be between 3 and 30 characters.",
  );
  process.exit(1);
}

consola.info("Creating feed with the following details:");
consola.info("---");
consola.info("Feed name:", name.value);
consola.info("Description:", description.value);
consola.info("DID:", did.value);
consola.info("Record key (rkey):", rkey.value);

const confirm = await prompts({
  type: "confirm",
  name: "value",
  message: "Do you want to proceed?",
  initial: true,
});

if (!confirm.value) {
  consola.info("Feed creation cancelled.");
  process.exit(0);
}

let userDid = args[0];

if (!userDid.startsWith("did:plc:")) {
  userDid = await ctx.baseIdResolver.handle.resolve(userDid);
}

const agent = await createAgent(ctx.oauthClient, userDid);

consola.info(
  `Writing ${chalk.greenBright("app.rocksky.feed.generator")} record...`,
);

const record: FeedGenerator.Record = {
  $type: "app.rocksky.feed.generator",
  displayName: name.value,
  description: description.value,
  did: did.value,
  createdAt: new Date().toISOString(),
};

const res = await agent.com.atproto.repo.createRecord({
  repo: agent.assertDid,
  collection: "app.rocksky.feed.generator",
  record,
  rkey: rkey.value,
});

consola.info(chalk.greenBright("Feed created successfully!"));
consola.info(`Record created at: ${chalk.cyan(res.data.uri)}`);

process.exit(0);
