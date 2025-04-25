#!/usr/bin/env node

import chalk from "chalk";
import { albums } from "cmd/albums";
import { artists } from "cmd/artists";
import { createApiKey } from "cmd/create";
import { mcp } from "cmd/mcp";
import { nowplaying } from "cmd/nowplaying";
import { scrobble } from "cmd/scrobble";
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
    `Command-line interface for Rocksky (${chalk.underline(
      "https://rocksky.app"
    )}) – scrobble tracks, view stats, and manage your listening history.`
  )
  .version(version.version);

program
  .command("login")
  .argument("<handle>", "your BlueSky handle (e.g., <username>.bsky.social)")
  .description("login with your BlueSky account and get a session token.")
  .action(login);

program
  .command("whoami")
  .description("get the current logged-in user.")
  .action(whoami);

program
  .command("nowplaying")
  .argument(
    "[did]",
    "the DID or handle of the user to get the now playing track for."
  )
  .description("get the currently playing track.")
  .action(nowplaying);

program
  .command("scrobbles")
  .option("-s, --skip <number>", "number of scrobbles to skip")
  .option("-l, --limit <number>", "number of scrobbles to limit")
  .argument("[did]", "the DID or handle of the user to get the scrobbles for.")
  .description("display recently played tracks.")
  .action(scrobbles);

program
  .command("search")
  .option("-a, --albums", "search for albums")
  .option("-t, --tracks", "search for tracks")
  .option("-u, --users", "search for users")
  .option("-l, --limit <number>", "number of results to limit")
  .argument(
    "<query>",
    "the search query, e.g., artist, album, title or account"
  )
  .description("search for tracks, albums, or accounts.")
  .action(search);

program
  .command("stats")
  .option("-l, --limit <number>", "number of results to limit")
  .argument("[did]", "the DID or handle of the user to get stats for.")
  .description("get the user's listening stats.")
  .action(stats);

program
  .command("artists")
  .option("-l, --limit <number>", "number of results to limit")
  .argument("[did]", "the DID or handle of the user to get artists for.")
  .description("get the user's top artists.")
  .action(artists);

program
  .command("albums")
  .option("-l, --limit <number>", "number of results to limit")
  .argument("[did]", "the DID or handle of the user to get albums for.")
  .description("get the user's top albums.")
  .action(albums);

program
  .command("tracks")
  .option("-l, --limit <number>", "number of results to limit")
  .argument("[did]", "the DID or handle of the user to get tracks for.")
  .description("get the user's top tracks.")
  .action(tracks);

program
  .command("scrobble")
  .argument("<track>", "the title of the track")
  .argument("<artist>", "the artist of the track")
  .option("-t, --timestamp <timestamp>", "the timestamp of the scrobble")
  .description("scrobble a track to your profile.")
  .action(scrobble);

program
  .command("create")
  .description("create a new API key.")
  .command("apikey")
  .argument("<name>", "the name of the API key")
  .option("-d, --description <description>", "the description of the API key")
  .description("create a new API key.")
  .action(createApiKey);

program
  .command("mcp")
  .description("Starts an MCP server to use with Claude or other LLMs.")
  .action(mcp);

program.parse(process.argv);
