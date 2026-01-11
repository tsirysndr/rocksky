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
import { version } from "../package.json" assert { type: "json" };
import { login } from "./cmd/login";
import { sync } from "cmd/sync";
import { initializeDatabase } from "./drizzle";

await initializeDatabase();

const program = new Command();

program
  .name("rocksky")
  .description(
    `
    ___           __        __          _______   ____
   / _ \\___  ____/ /__ ___ / /____ __  / ___/ /  /  _/
  / , _/ _ \\/ __/  '_/(_-</  '_/ // / / /__/ /___/ /
 /_/|_|\\___/\\__/_/\\_\\/___/_/\\_\\\\_, /  \\___/____/___/
                              /___/
 ${chalk.gray("Command-line interface for Rocksky (")}${chalk.gray.underline(
   "https://rocksky.app",
 )}${chalk.gray(")")} ${chalk.gray("– scrobble tracks, view stats, and manage your listening history.")}`,
  )
  .version(version);

program.configureHelp({
  styleTitle: (str) => chalk.bold.cyan(str),
  styleCommandText: (str) => chalk.yellow(str),
  styleDescriptionText: (str) => chalk.white(str),
  styleOptionText: (str) => chalk.green(str),
  styleArgumentText: (str) => chalk.magenta(str),
  styleSubcommandText: (str) => chalk.blue(str),
});

program.addHelpText(
  "after",
  `
${chalk.bold("\nLearn more about Rocksky:")}             ${chalk.underline("https://docs.rocksky.app")}
${chalk.bold("Join our Discord community:")}      ${chalk.underline(chalk.blueBright("https://discord.gg/EVcBy2fVa3"))}
`,
);

program
  .command("login")
  .argument("<handle>", "your AT Proto handle (e.g., <username>.bsky.social)")
  .description("login with your AT Proto account and get a session token.")
  .action(login);

program
  .command("whoami")
  .description("get the current logged-in user.")
  .action(whoami);

program
  .command("nowplaying")
  .argument(
    "[did]",
    "the DID or handle of the user to get the now playing track for.",
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
    "the search query, e.g., artist, album, title or account",
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
  .option("-d, --dry-run", "simulate the scrobble without actually sending it")
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
  .description("starts an MCP server to use with Claude or other LLMs.")
  .action(mcp);

program
  .command("sync")
  .description("sync your local Rocksky data from AT Protocol.")
  .action(sync);

program.parse(process.argv);
