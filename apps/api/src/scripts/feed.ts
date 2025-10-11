import chalk from "chalk";
import { ctx } from "context";
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

console.log("Feed name:", name.value);
console.log("Description:", description.value);
console.log("DID:", did.value);

let userDid = args[0];

if (!userDid.startsWith("did:plc:")) {
  userDid = await ctx.baseIdResolver.handle.resolve(userDid);
}

const agent = await createAgent(ctx.oauthClient, userDid);

console.log("Creating feed...");

process.exit(0);
