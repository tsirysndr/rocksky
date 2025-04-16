#!/usr/bin/env node

import { nowplaying } from "cmd/nowplaying";
import { scrobbles } from "cmd/scrobbles";
import { search } from "cmd/search";
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

program
  .command("scrobbles")
  .option("-s, --skip <number>", "Number of scrobbles to skip")
  .option("-l, --limit <number>", "Number of scrobbles to limit")
  .argument("[did]", "The DID or handle of the user to get the scrobbles for.")
  .description("Display recently played tracks.")
  .action(scrobbles);

program
  .command("search")
  .option("-a, --albums", "Search for albums")
  .option("-t, --tracks", "Search for tracks")
  .option("-u, --users", "Search for users")
  .option("-l, --limit <number>", "Number of results to limit")
  .argument(
    "<query>",
    "The search query, e.g., artist, album, title or account"
  )
  .description("Search for tracks, albums, or accounts.")
  .action(search);

program.parse(process.argv);
