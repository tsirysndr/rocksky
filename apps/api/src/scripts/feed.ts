import chalk from "chalk";
import { ctx } from "context";
import * as FeedGenerator from "lexicon/types/app/rocksky/feed/generator";
import { createAgent } from "lib/agent";
import prompts from "prompts";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Please provide user author identifier (handle or DID).");
  console.log(`Usage: ${chalk.cyan("npm run feed -- <handle|did>")}`);
  process.exit(1);
}

const name = await prompts({
  type: "text",
  name: "value",
  message: "What is the feed name?",
});

if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(name.value)) {
  console.error(
    "Invalid feed name. Only alphanumeric characters, underscores, hyphens, and periods are allowed. Length must be between 3 and 30 characters."
  );
  process.exit(1);
}

const description = await prompts({
  type: "text",
  name: "value",
  message: "Please provide a short description of the feed",
});

if (description.value.length > 3000) {
  console.error("Description is too long. Maximum length is 3000 characters.");
  process.exit(1);
}

const did = await prompts({
  type: "text",
  name: "value",
  message: "What is the feed DID?",
});

if (!/^did:web:[a-zA-Z0-9_.-]{3,30}$/.test(did.value)) {
  console.error(
    "Invalid DID format. It should start with 'did:web:' followed by 3 to 30 alphanumeric characters, underscores, hyphens, or periods."
  );
  process.exit(1);
}

const rkey = await prompts({
  type: "text",
  name: "value",
  message: "What is the record key (rkey) for the feed?",
});

if (!/^[a-zA-Z0-9_-]{3,30}$/.test(rkey.value)) {
  console.error(
    "Invalid record key. Only alphanumeric characters, underscores, and hyphens are allowed. Length must be between 3 and 30 characters."
  );
  process.exit(1);
}

console.log("Creating feed with the following details:");

console.log("Feed name:", name.value);
console.log("Description:", description.value);
console.log("DID:", did.value);
console.log("Record key (rkey):", rkey.value);

let confirm = await prompts({
  type: "confirm",
  name: "value",
  message: "Do you want to proceed?",
  initial: true,
});

if (!confirm.value) {
  console.log("Feed creation cancelled.");
  process.exit(0);
}

let userDid = args[0];

if (!userDid.startsWith("did:plc:")) {
  userDid = await ctx.baseIdResolver.handle.resolve(userDid);
}

const agent = await createAgent(ctx.oauthClient, userDid);

console.log(
  `Writing ${chalk.greenBright("app.rocksky.feed.generator")} record...`
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

console.log(chalk.greenBright("Feed created successfully!"));
console.log(`Record created at: ${chalk.cyan(res.data.uri)}`);

process.exit(0);
