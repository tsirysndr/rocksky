import { Command } from "commander";
import version from "../package.json" assert { type: "json" };
import { login } from "./cmd/login";

const program = new Command();

program
  .name("rocksky")
  .description(
    "Command-line interface for Rocksky – scrobble tracks, view stats, and manage your listening history."
  )
  .version(version.version);

program
  .command("login")
  .argument("<handle>", "Your BlueSky handle (e.g., @username.bsky.social)")
  .description("Login with your BlueSky account and get a session token.")
  .action(login);

program.parse(process.argv);
