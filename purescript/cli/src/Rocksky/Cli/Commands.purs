module Rocksky.Cli.Commands where

type Argument = { flags :: String, description :: String }
type Option = { flags :: String, description :: String, defaultValue :: String }
type CommandSpec = { path :: String, description :: String, arguments :: Array Argument, options :: Array Option }

version :: String
version = "0.11.3"

specs :: Array CommandSpec
specs =
  [ { "path": "login"
    , "description": "login with your AT Proto account and get a session token"
    , "arguments":
        [ { "flags": "<handle>"
          , "description": "your AT Proto handle (e.g., <username>.bsky.social)"
          }
        ]
    , "options": []
    }
  , { "path": "whoami"
    , "description": "get the current logged-in user"
    , "arguments": []
    , "options": []
    }
  , { "path": "nowplaying"
    , "description": "get the currently playing track"
    , "arguments":
        [ { "flags": "[did]"
          , "description": "the DID or handle of the user to get the now playing track for"
          }
        ]
    , "options": []
    }
  , { "path": "scrobbles"
    , "description": "display recently played tracks"
    , "arguments":
        [ { "flags": "[did]"
          , "description": "the DID or handle of the user to get the scrobbles for"
          }
        ]
    , "options":
        [ { "flags": "-s, --skip <number>"
          , "description": "number of scrobbles to skip"
          , "defaultValue": ""
          }
        , { "flags": "-l, --limit <number>"
          , "description": "number of scrobbles to limit"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "search"
    , "description": "search for tracks, albums, or accounts"
    , "arguments":
        [ { "flags": "<query>"
          , "description": "the search query, e.g., artist, album, title or account"
          }
        ]
    , "options":
        [ { "flags": "-a, --albums"
          , "description": "search for albums"
          , "defaultValue": ""
          }
        , { "flags": "-t, --tracks"
          , "description": "search for tracks"
          , "defaultValue": ""
          }
        , { "flags": "-u, --users"
          , "description": "search for users"
          , "defaultValue": ""
          }
        , { "flags": "-l, --limit <number>"
          , "description": "number of results to limit"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "stats"
    , "description": "get the user's listening stats"
    , "arguments":
        [ { "flags": "[did]"
          , "description": "the DID or handle of the user to get stats for"
          }
        ]
    , "options":
        [ { "flags": "-l, --limit <number>"
          , "description": "number of results to limit"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "artists"
    , "description": "get the user's top artists"
    , "arguments":
        [ { "flags": "[did]"
          , "description": "the DID or handle of the user to get artists for"
          }
        ]
    , "options":
        [ { "flags": "-l, --limit <number>"
          , "description": "number of results to limit"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "albums"
    , "description": "get the user's top albums"
    , "arguments":
        [ { "flags": "[did]"
          , "description": "the DID or handle of the user to get albums for"
          }
        ]
    , "options":
        [ { "flags": "-l, --limit <number>"
          , "description": "number of results to limit"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "tracks"
    , "description": "get the user's top tracks"
    , "arguments":
        [ { "flags": "[did]"
          , "description": "the DID or handle of the user to get tracks for"
          }
        ]
    , "options":
        [ { "flags": "-l, --limit <number>"
          , "description": "number of results to limit"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "scrobble"
    , "description": "scrobble a track to your profile"
    , "arguments":
        [ { "flags": "<track>"
          , "description": "the title of the track"
          }
        , { "flags": "<artist>"
          , "description": "the artist of the track"
          }
        ]
    , "options":
        [ { "flags": "-a, --album <album>"
          , "description": "the album of the track — matching prefers this release over remaster/live/single editions"
          , "defaultValue": ""
          }
        , { "flags": "-t, --timestamp <timestamp>"
          , "description": "the timestamp of the scrobble"
          , "defaultValue": ""
          }
        , { "flags": "-d, --dry-run"
          , "description": "simulate the scrobble without actually sending it"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "create"
    , "description": "create a new API key"
    , "arguments": []
    , "options": []
    }
  , { "path": "create apikey"
    , "description": "create a new API key"
    , "arguments":
        [ { "flags": "<name>"
          , "description": "the name of the API key"
          }
        ]
    , "options":
        [ { "flags": "-d, --description <description>"
          , "description": "the description of the API key"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "mcp"
    , "description": "starts an MCP server to use with Claude or other LLMs"
    , "arguments": []
    , "options":
        [ { "flags": "-d, --device <device>"
          , "description": "player the command tools address when a call names none"
          , "defaultValue": ""
          }
        , { "flags": "--api-url <url>"
          , "description": "Rocksky API base URL, for a dev server"
          , "defaultValue": ""
          }
        , { "flags": "--ws-url <url>"
          , "description": "remote-control WebSocket URL, for a dev server"
          , "defaultValue": ""
          }
        , { "flags": "--token-path <path>"
          , "description": "where the access token lives"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "sync"
    , "description": "sync your local Rocksky data from AT Protocol"
    , "arguments": []
    , "options": []
    }
  , { "path": "scrobble-api"
    , "description": "start a local listenbrainz/lastfm compatibility server"
    , "arguments": []
    , "options":
        [ { "flags": "-p, --port <port>"
          , "description": "the port to listen on"
          , "defaultValue": "8778"
          }
        ]
    }
  , { "path": "mpd"
    , "description": "start an MPD-protocol server to control playback and browse your library"
    , "arguments": []
    , "options":
        [ { "flags": "-p, --port <port>"
          , "description": "port to listen on (defaults to settings.toml)"
          , "defaultValue": ""
          }
        , { "flags": "-b, --bind <address>"
          , "description": "address to bind (defaults to settings.toml)"
          , "defaultValue": ""
          }
        , { "flags": "-o, --output <spec>"
          , "description": "audio output backend: default device, or stdout / fifo:<path> / unix:<path> / tcp:<host>:<port> (defaults to settings.toml)"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "nfc"
    , "description": "read and write NFC tags that play a library album, playlist or your favorites"
    , "arguments": []
    , "options": []
    }
  , { "path": "nfc status"
    , "description": "list connected NFC readers"
    , "arguments": []
    , "options": []
    }
  , { "path": "nfc read"
    , "description": "show what the tapped tag points at"
    , "arguments": []
    , "options":
        [ { "flags": "-w, --watch"
          , "description": "keep reading tags until interrupted"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "card"
    , "description": "read and write SLE and ACOS smart cards that play a library album or playlist"
    , "arguments": []
    , "options": []
    }
  , { "path": "card read"
    , "description": "show what the inserted card points at"
    , "arguments": []
    , "options": []
    }
  , { "path": "card write"
    , "description": "write a library album, playlist or your favorites onto the inserted card"
    , "arguments": []
    , "options":
        [ { "flags": "-a, --album <ref>"
          , "description": "album AT-URI or library id to write"
          , "defaultValue": ""
          }
        , { "flags": "-p, --playlist <ref>"
          , "description": "playlist AT-URI or library id to write"
          , "defaultValue": ""
          }
        , { "flags": "-f, --favorites"
          , "description": "write your favorites (needs no ref)"
          , "defaultValue": ""
          }
        , { "flags": "-s, --secret <code>"
          , "description": "the card's PSC (SLE, hex) or PIN (ACOS); defaults to the factory value"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "nfc write"
    , "description": "write a library album, playlist or your favorites onto the tapped tag"
    , "arguments": []
    , "options":
        [ { "flags": "-a, --album <id>"
          , "description": "library album id to write"
          , "defaultValue": ""
          }
        , { "flags": "-p, --playlist <id>"
          , "description": "library playlist id to write"
          , "defaultValue": ""
          }
        , { "flags": "-f, --favorites"
          , "description": "write your favorites (needs no id)"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "import"
    , "description": "import your listening history from a Spotify or Last.fm export"
    , "arguments":
        [ { "flags": "<file>"
          , "description": "a Spotify or Last.fm export (JSON/CSV file, or the Spotify history folder)"
          }
        ]
    , "options":
        [ { "flags": "-f, --format <format>"
          , "description": "force the format: spotify or lastfm (default: autodetect)"
          , "defaultValue": ""
          }
        , { "flags": "-n, --dry-run"
          , "description": "parse and print what would be published, without writing to your PDS"
          , "defaultValue": ""
          }
        , { "flags": "-c, --concurrency <number>"
          , "description": "number of scrobbles to publish in parallel"
          , "defaultValue": "4"
          }
        , { "flags": "-r, --rate <perHour>"
          , "description": "scrobbles published per hour (hard-capped to stay under Bluesky PDS write limits; each scrobble writes up to 4 records)"
          , "defaultValue": ""
          }
        , { "flags": "--no-rate-limit"
          , "description": "disable the client-side write throttle — self-hosted PDSes only; always ignored on *.bsky.network"
          , "defaultValue": ""
          }
        , { "flags": "-l, --limit <number>"
          , "description": "only import the first N scrobbles"
          , "defaultValue": ""
          }
        , { "flags": "--min-seconds <seconds>"
          , "description": "skip Spotify plays shorter than this (default: 30)"
          , "defaultValue": ""
          }
        , { "flags": "--from <date>"
          , "description": "only import scrobbles on or after this date (e.g. 2024-01-01)"
          , "defaultValue": ""
          }
        , { "flags": "--to <date>"
          , "description": "only import scrobbles on or before this date"
          , "defaultValue": ""
          }
        , { "flags": "--restart"
          , "description": "ignore the saved checkpoint and import from the beginning"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "upload"
    , "description": "upload audio files to your Rocksky library"
    , "arguments":
        [ { "flags": "<files...>"
          , "description": "audio files or directories to upload"
          }
        ]
    , "options":
        [ { "flags": "-s, --storage <ref>"
          , "description": "upload into your own connected storage (name, bucket or id) instead of Rocksky's"
          , "defaultValue": ""
          }
        ]
    }
  , { "path": "tui"
    , "description": "launch the interactive terminal UI to browse scrobbles and stream your music"
    , "arguments": []
    , "options":
        [ { "flags": "-o, --output <spec>"
          , "description": "audio output backend: default device, or stdout / fifo:<path> / unix:<path> / tcp:<host>:<port> (defaults to settings.toml)"
          , "defaultValue": ""
          }
        ]
    }
  ]
