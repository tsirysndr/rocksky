import { nowplaying } from "cmd/nowplaying";
import { whoami } from "cmd/whoami";
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
  .argument("<handle>", "Your BlueSky handle (e.g., <username>.bsky.social)")
  .description("Login with your BlueSky account and get a session token.")
  .action(login);

program
  .command("whoami")
  .description("Get the current logged-in user.")
  .action(whoami);

program
  .command("nowplaying")
  .argument(
    "[did]",
    "The DID or handle of the user to get the now playing track for."
  )
  .description("Get the currently playing track.")
  .action(nowplaying);

program.parse(process.argv);
