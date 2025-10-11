import prompts from "prompts";

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

console.log("Feed name:", name.value);
console.log("Description:", description.value);
console.log("DID:", did.value);

process.exit(0);
