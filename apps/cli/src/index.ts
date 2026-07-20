#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import { version } from "../package.json" assert { type: "json" };

// Command modules are imported lazily inside each action so that a bare
// `rocksky` (TUI) launch doesn't pay to load drizzle/better-sqlite3, express,
// hono, the MCP SDK, etc. — only the one command the user actually runs.
const lazy =
  <T extends any[]>(load: () => Promise<(...args: T) => unknown>) =>
  async (...args: T) => {
    await ensureDb();
    return (await load())(...args);
  };

let dbReady: Promise<void> | null = null;
function ensureDb() {
  if (!dbReady) {
    dbReady = import("./drizzle").then(({ initializeDatabase }) =>
      initializeDatabase(),
    );
  }
  return dbReady;
}

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
 Command-line interface for Rocksky ${chalk.magentaBright(
   "https://rocksky.app",
 )} – scrobble tracks, view stats, and manage your listening history.`,
  )
  .version(version);

const violet = chalk.hex("#A855F7");
const cyan = chalk.hex("#22D3EE");

program.configureHelp({
  styleTitle: (str) => chalk.bold.hex("#A855F7")(str),
  styleCommandText: (str) => cyan(str),
  styleDescriptionText: (str) => chalk.white(str),
  styleOptionText: (str) => violet(str),
  styleArgumentText: (str) => cyan(str),
  styleSubcommandText: (str) => violet(str),
});

program.addHelpText(
  "after",
  `
${chalk.bold("\nLearn more about Rocksky:")}               https://docs.rocksky.app
${chalk.bold("Join our Discord community:")}        ${chalk.hex("#00F5D4")("https://discord.gg/EVcBy2fVa3")}
`,
);

program
  .command("login")
  .argument("<handle>", "your AT Proto handle (e.g., <username>.bsky.social)")
  .description("login with your AT Proto account and get a session token")
  .action(lazy(async () => (await import("./cmd/login")).login));

program
  .command("whoami")
  .description("get the current logged-in user")
  .action(lazy(async () => (await import("cmd/whoami")).whoami));

program
  .command("nowplaying")
  .argument(
    "[did]",
    "the DID or handle of the user to get the now playing track for",
  )
  .description("get the currently playing track")
  .action(lazy(async () => (await import("cmd/nowplaying")).nowplaying));

program
  .command("scrobbles")
  .option("-s, --skip <number>", "number of scrobbles to skip")
  .option("-l, --limit <number>", "number of scrobbles to limit")
  .argument("[did]", "the DID or handle of the user to get the scrobbles for")
  .description("display recently played tracks")
  .action(lazy(async () => (await import("cmd/scrobbles")).scrobbles));

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
  .description("search for tracks, albums, or accounts")
  .action(lazy(async () => (await import("cmd/search")).search));

program
  .command("stats")
  .option("-l, --limit <number>", "number of results to limit")
  .argument("[did]", "the DID or handle of the user to get stats for")
  .description("get the user's listening stats")
  .action(lazy(async () => (await import("cmd/stats")).stats));

program
  .command("artists")
  .option("-l, --limit <number>", "number of results to limit")
  .argument("[did]", "the DID or handle of the user to get artists for")
  .description("get the user's top artists")
  .action(lazy(async () => (await import("cmd/artists")).artists));

program
  .command("albums")
  .option("-l, --limit <number>", "number of results to limit")
  .argument("[did]", "the DID or handle of the user to get albums for")
  .description("get the user's top albums")
  .action(lazy(async () => (await import("cmd/albums")).albums));

program
  .command("tracks")
  .option("-l, --limit <number>", "number of results to limit")
  .argument("[did]", "the DID or handle of the user to get tracks for")
  .description("get the user's top tracks")
  .action(lazy(async () => (await import("cmd/tracks")).tracks));

program
  .command("scrobble")
  .argument("<track>", "the title of the track")
  .argument("<artist>", "the artist of the track")
  .option("-t, --timestamp <timestamp>", "the timestamp of the scrobble")
  .option("-d, --dry-run", "simulate the scrobble without actually sending it")
  .description("scrobble a track to your profile")
  .action(lazy(async () => (await import("cmd/scrobble")).scrobble));

program
  .command("create")
  .description("create a new API key")
  .command("apikey")
  .argument("<name>", "the name of the API key")
  .option("-d, --description <description>", "the description of the API key")
  .description("create a new API key")
  .action(lazy(async () => (await import("cmd/create")).createApiKey));

program
  .command("mcp")
  .description("starts an MCP server to use with Claude or other LLMs")
  .action(lazy(async () => (await import("cmd/mcp")).mcp));

program
  .command("sync")
  .description("sync your local Rocksky data from AT Protocol")
  .action(lazy(async () => (await import("cmd/sync")).sync));

program
  .command("scrobble-api")
  .description("start a local listenbrainz/lastfm compatibility server")
  .option("-p, --port <port>", "the port to listen on", "8778")
  .action(lazy(async () => (await import("cmd/scrobble-api")).scrobbleApi));

// Upload needs only the API + token, no local database.
program
  .command("upload")
  .argument("<files...>", "audio files or directories to upload")
  .description("upload audio files to your Rocksky library")
  .action(async (files: string[]) => {
    const { upload } = await import("cmd/upload");
    await upload(files);
  });

// The TUI needs no local database, so it skips `ensureDb()` entirely.
program
  .command("tui")
  .description(
    "launch the interactive terminal UI to browse scrobbles and stream your music",
  )
  .action(async () => {
    const { tui } = await import("cmd/tui");
    await tui();
  });

// No subcommand given → launch the interactive TUI (no DB init, lean startup).
if (process.argv.slice(2).length === 0) {
  const { tui } = await import("cmd/tui");
  await tui();
} else {
  program.parse(process.argv);
}
