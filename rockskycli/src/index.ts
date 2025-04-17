#!/usr/bin/env node

import { albums } from "cmd/albums";
import { artists } from "cmd/artists";
import { nowplaying } from "cmd/nowplaying";
import { scrobbles } from "cmd/scrobbles";
import { search } from "cmd/search";
import { stats } from "cmd/stats";
import { tracks } from "cmd/tracks";
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

program
  .command("stats")
  .option("-l, --limit <number>", "Number of results to limit")
  .argument("[did]", "The DID or handle of the user to get stats for.")
  .description("Get the user's listening stats.")
  .action(stats);

program
  .command("artists")
  .option("-l, --limit <number>", "Number of results to limit")
  .argument("[did]", "The DID or handle of the user to get artists for.")
  .description("Get the user's top artists.")
  .action(artists);

program
  .command("albums")
  .option("-l, --limit <number>", "Number of results to limit")
  .argument("[did]", "The DID or handle of the user to get albums for.")
  .description("Get the user's top albums.")
  .action(albums);

program
  .command("tracks")
  .option("-l, --limit <number>", "Number of results to limit")
  .argument("[did]", "The DID or handle of the user to get tracks for.")
  .description("Get the user's top tracks.")
  .action(tracks);

program.parse(process.argv);
