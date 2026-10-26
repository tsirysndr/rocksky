import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}

pub type OptionSpec {
  OptionSpec(flags: String, description: String, default: String)
}

pub type CommandSpec {
  CommandSpec(
    name: String,
    description: String,
    arguments: List(#(String, String)),
    options: List(OptionSpec),
    children: List(CommandSpec),
  )
}

pub const version = "0.11.3"

pub fn specification() -> CommandSpec {
  CommandSpec(
    "rocksky",
    "\n    ___           __        __          _______   ____\n   / _ \\___  ____/ /__ ___ / /____ __  / ___/ /  /  _/\n  / , _/ _ \\/ __/  '_/(_-</  '_/ // / / /__/ /___/ /\n /_/|_|\\___/\\__/_/\\_\\/___/_/\\_\\\\_, /  \\___/____/___/\n                              /___/\n Command-line interface for Rocksky https://rocksky.app – scrobble tracks, view stats, and manage your listening history.",
    [],
    [],
    [
      CommandSpec(
        "login",
        "login with your AT Proto account and get a session token",
        [#("<handle>", "your AT Proto handle (e.g., <username>.bsky.social)")],
        [],
        [],
      ),
      CommandSpec("whoami", "get the current logged-in user", [], [], []),
      CommandSpec(
        "nowplaying",
        "get the currently playing track",
        [
          #(
            "[did]",
            "the DID or handle of the user to get the now playing track for",
          ),
        ],
        [],
        [],
      ),
      CommandSpec(
        "scrobbles",
        "display recently played tracks",
        [#("[did]", "the DID or handle of the user to get the scrobbles for")],
        [
          OptionSpec("-s, --skip <number>", "number of scrobbles to skip", ""),
          OptionSpec("-l, --limit <number>", "number of scrobbles to limit", ""),
        ],
        [],
      ),
      CommandSpec(
        "search",
        "search for tracks, albums, or accounts",
        [
          #(
            "<query>",
            "the search query, e.g., artist, album, title or account",
          ),
        ],
        [
          OptionSpec("-a, --albums", "search for albums", ""),
          OptionSpec("-t, --tracks", "search for tracks", ""),
          OptionSpec("-u, --users", "search for users", ""),
          OptionSpec("-l, --limit <number>", "number of results to limit", ""),
        ],
        [],
      ),
      CommandSpec(
        "stats",
        "get the user's listening stats",
        [#("[did]", "the DID or handle of the user to get stats for")],
        [OptionSpec("-l, --limit <number>", "number of results to limit", "")],
        [],
      ),
      CommandSpec(
        "artists",
        "get the user's top artists",
        [#("[did]", "the DID or handle of the user to get artists for")],
        [OptionSpec("-l, --limit <number>", "number of results to limit", "")],
        [],
      ),
      CommandSpec(
        "albums",
        "get the user's top albums",
        [#("[did]", "the DID or handle of the user to get albums for")],
        [OptionSpec("-l, --limit <number>", "number of results to limit", "")],
        [],
      ),
      CommandSpec(
        "tracks",
        "get the user's top tracks",
        [#("[did]", "the DID or handle of the user to get tracks for")],
        [OptionSpec("-l, --limit <number>", "number of results to limit", "")],
        [],
      ),
      CommandSpec(
        "scrobble",
        "scrobble a track to your profile",
        [
          #("<track>", "the title of the track"),
          #("<artist>", "the artist of the track"),
        ],
        [
          OptionSpec(
            "-a, --album <album>",
            "the album of the track — matching prefers this release over remaster/live/single editions",
            "",
          ),
          OptionSpec(
            "-t, --timestamp <timestamp>",
            "the timestamp of the scrobble",
            "",
          ),
          OptionSpec(
            "-d, --dry-run",
            "simulate the scrobble without actually sending it",
            "",
          ),
        ],
        [],
      ),
      CommandSpec("create", "create a new API key", [], [], [
        CommandSpec(
          "apikey",
          "create a new API key",
          [#("<name>", "the name of the API key")],
          [
            OptionSpec(
              "-d, --description <description>",
              "the description of the API key",
              "",
            ),
          ],
          [],
        ),
      ]),
      CommandSpec(
        "mcp",
        "starts an MCP server to use with Claude or other LLMs",
        [],
        [
          OptionSpec(
            "-d, --device <device>",
            "player the command tools address when a call names none",
            "",
          ),
          OptionSpec(
            "--api-url <url>",
            "Rocksky API base URL, for a dev server",
            "",
          ),
          OptionSpec(
            "--ws-url <url>",
            "remote-control WebSocket URL, for a dev server",
            "",
          ),
          OptionSpec("--token-path <path>", "where the access token lives", ""),
        ],
        [],
      ),
      CommandSpec(
        "sync",
        "sync your local Rocksky data from AT Protocol",
        [],
        [],
        [],
      ),
      CommandSpec(
        "scrobble-api",
        "start a local listenbrainz/lastfm compatibility server",
        [],
        [OptionSpec("-p, --port <port>", "the port to listen on", "8778")],
        [],
      ),
      CommandSpec(
        "mpd",
        "start an MPD-protocol server to control playback and browse your library",
        [],
        [
          OptionSpec(
            "-p, --port <port>",
            "port to listen on (defaults to settings.toml)",
            "",
          ),
          OptionSpec(
            "-b, --bind <address>",
            "address to bind (defaults to settings.toml)",
            "",
          ),
          OptionSpec(
            "-o, --output <spec>",
            "audio output backend: default device, or stdout / fifo:<path> / unix:<path> / tcp:<host>:<port> (defaults to settings.toml)",
            "",
          ),
        ],
        [],
      ),
      CommandSpec(
        "nfc",
        "read and write NFC tags that play a library album, playlist or your favorites",
        [],
        [],
        [
          CommandSpec("status", "list connected NFC readers", [], [], []),
          CommandSpec(
            "read",
            "show what the tapped tag points at",
            [],
            [
              OptionSpec(
                "-w, --watch",
                "keep reading tags until interrupted",
                "",
              ),
            ],
            [],
          ),
          CommandSpec(
            "write",
            "write a library album, playlist or your favorites onto the tapped tag",
            [],
            [
              OptionSpec("-a, --album <id>", "library album id to write", ""),
              OptionSpec(
                "-p, --playlist <id>",
                "library playlist id to write",
                "",
              ),
              OptionSpec(
                "-f, --favorites",
                "write your favorites (needs no id)",
                "",
              ),
            ],
            [],
          ),
        ],
      ),
      CommandSpec(
        "card",
        "read and write SLE and ACOS smart cards that play a library album or playlist",
        [],
        [],
        [
          CommandSpec(
            "read",
            "show what the inserted card points at",
            [],
            [],
            [],
          ),
          CommandSpec(
            "write",
            "write a library album, playlist or your favorites onto the inserted card",
            [],
            [
              OptionSpec(
                "-a, --album <ref>",
                "album AT-URI or library id to write",
                "",
              ),
              OptionSpec(
                "-p, --playlist <ref>",
                "playlist AT-URI or library id to write",
                "",
              ),
              OptionSpec(
                "-f, --favorites",
                "write your favorites (needs no ref)",
                "",
              ),
              OptionSpec(
                "-s, --secret <code>",
                "the card's PSC (SLE, hex) or PIN (ACOS); defaults to the factory value",
                "",
              ),
            ],
            [],
          ),
        ],
      ),
      CommandSpec(
        "import",
        "import your listening history from a Spotify or Last.fm export",
        [
          #(
            "<file>",
            "a Spotify or Last.fm export (JSON/CSV file, or the Spotify history folder)",
          ),
        ],
        [
          OptionSpec(
            "-f, --format <format>",
            "force the format: spotify or lastfm (default: autodetect)",
            "",
          ),
          OptionSpec(
            "-n, --dry-run",
            "parse and print what would be published, without writing to your PDS",
            "",
          ),
          OptionSpec(
            "-c, --concurrency <number>",
            "number of scrobbles to publish in parallel",
            "4",
          ),
          OptionSpec(
            "-r, --rate <perHour>",
            "scrobbles published per hour (hard-capped to stay under Bluesky PDS write limits; each scrobble writes up to 4 records)",
            "",
          ),
          OptionSpec(
            "--no-rate-limit",
            "disable the client-side write throttle — self-hosted PDSes only; always ignored on *.bsky.network",
            "",
          ),
          OptionSpec(
            "-l, --limit <number>",
            "only import the first N scrobbles",
            "",
          ),
          OptionSpec(
            "--min-seconds <seconds>",
            "skip Spotify plays shorter than this (default: 30)",
            "",
          ),
          OptionSpec(
            "--from <date>",
            "only import scrobbles on or after this date (e.g. 2024-01-01)",
            "",
          ),
          OptionSpec(
            "--to <date>",
            "only import scrobbles on or before this date",
            "",
          ),
          OptionSpec(
            "--restart",
            "ignore the saved checkpoint and import from the beginning",
            "",
          ),
        ],
        [],
      ),
      CommandSpec(
        "upload",
        "upload audio files to your Rocksky library",
        [#("<files...>", "audio files or directories to upload")],
        [
          OptionSpec(
            "-s, --storage <ref>",
            "upload into your own connected storage (name, bucket or id) instead of Rocksky's",
            "",
          ),
        ],
        [],
      ),
      CommandSpec(
        "tui",
        "launch the interactive terminal UI to browse scrobbles and stream your music",
        [],
        [
          OptionSpec(
            "-o, --output <spec>",
            "audio output backend: default device, or stdout / fifo:<path> / unix:<path> / tcp:<host>:<port> (defaults to settings.toml)",
            "",
          ),
        ],
        [],
      ),
    ],
  )
}

@external(javascript, "./cli_ffi.mjs", "parse")
pub fn parse(
  spec: CommandSpec,
  version: String,
  callback: fn(String, List(String), Dynamic) -> Promise(Nil),
) -> Promise(Nil)
