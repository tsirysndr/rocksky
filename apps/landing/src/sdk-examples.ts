export type SdkExample = {
  id: string;
  language: string;
  file: string;
  title: string;
  description: string;
  setup: string;
  note?: string;
  code: string;
};

export const sdkExamples: SdkExample[] = [
  {
    id: "python",
    language: "Python",
    file: "weekly_discovery.py",
    title: "Take your discoveries with you.",
    description:
      "Export the community’s top 20 tracks from the last seven days to a CSV for your next listening session.",
    setup: "pip install rocksky",
    code: `import csv
from rocksky import AppView, DateInterval

tracks = AppView().top_tracks_interval(
    20, 0, DateInterval.LAST_DAYS(days=7)
)
with open("weekly-discoveries.csv", "w", newline="") as file:
    writer = csv.writer(file)
    writer.writerow(["Title", "Artist", "Album"])
    writer.writerows((t.title, t.artist, t.album) for t in tracks)

print("Your next listening session is ready.")`,
  },
  {
    id: "typescript",
    language: "TypeScript",
    file: "dj-shortlist.ts",
    title: "Find the next track for your set.",
    description:
      "Shortlist house and electro tracks under six minutes with a composable catalog filter.",
    setup: "npm install @rocksky/sdk",
    code: `import { Filter, RockskyClient, SongFields } from "@rocksky/sdk";

const rocksky = new RockskyClient();
const filter = Filter.in(SongFields.genre, ["house", "electro"])
  .and(Filter.lt(SongFields.duration, 360_000));

const tracks = await rocksky.catalogSongs(20, 0, undefined, filter);
console.table(tracks.map(track => ({
  title: track.title,
  artist: track.artist,
  minutes: ((track.duration ?? 0) / 60_000).toFixed(1),
})));`,
  },
  {
    id: "gleam",
    language: "Gleam",
    file: "extended_remixes.gleam",
    title: "Dig a little deeper.",
    description:
      "Find extended remixes for a longer mix, using the typed HTTP client and a catalog filter.",
    setup: "gleam add rocksky",
    code: `import gleam/option.{Some}
import rocksky/api
import rocksky/models
import rocksky/xrpc

pub fn main() {
  let params = models.GetSongsParams(
    ..models.new_get_songs_params(),
    limit: Some(12),
    filter: Some("title==*Remix*;duration=ge=360000"),
  )
  echo api.song_get_songs(xrpc.new(), params)
}`,
  },
  {
    id: "rust",
    language: "Rust",
    file: "search_to_json.rs",
    title: "Turn music search into a tool.",
    description:
      "Stream search results as JSON lines. Pipe the output to jq, a local index, or another tool in your workflow.",
    setup:
      "cargo add rocksky serde_json\ncargo add tokio --features macros,rt-multi-thread",
    code: `use rocksky::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let query = std::env::args().skip(1).collect::<Vec<_>>().join(" ");
    let results = Client::new().feed().search(&query).await?;

    for hit in results.hits {
        println!("{}", serde_json::to_string(&hit)?);
    }
    Ok(())
}`,
  },
  {
    id: "clojure",
    language: "Clojure",
    file: "recent_obsessions.clj",
    title: "Find your current obsessions.",
    description:
      "Count artists across an account’s last 100 scrobbles and print its five most-played artists in that slice.",
    setup: 'app.rocksky/sdk {:mvn/version "0.10.0-SNAPSHOT"}',
    note: "Add to deps.edn. Run with JDK 22+ and --enable-native-access=ALL-UNNAMED.",
    code: `(require '[rocksky.core :as rocksky])

(->> (rocksky/scrobbles "tsiry-sandratraina.com" 100)
     (map #(get % "artist"))
     (remove nil?)
     frequencies
     (sort-by val >)
     (take 5)
     (run! (fn [[artist plays]]
             (println artist "—" plays "plays"))))`,
  },
  {
    id: "elixir",
    language: "Elixir",
    file: "weekly_digest.exs",
    title: "Publish a weekly listening digest.",
    description:
      "Generate a Markdown list of the community’s top ten tracks over the last seven days, ready for a blog or newsletter.",
    setup: '{:rocksky_ex, "~> 0.16.0"}',
    note: "Add to your mix.exs dependencies, then run mix deps.get.",
    code: `{:ok, tracks} = Rocksky.top_tracks_interval(10, 0, {:days, 7})

lines =
  tracks
  |> Enum.with_index(1)
  |> Enum.map(fn {track, rank} ->
    "#{rank}. #{track["artist"]} — #{track["title"]}"
  end)

File.write!("weekly-mix.md", "# This week’s discoveries\\n\\n" <>
  Enum.join(lines, "\\n"))`,
  },
  {
    id: "ruby",
    language: "Ruby",
    file: "favorites.rb",
    title: "Give your favorites a home.",
    description:
      "Save an account’s first 50 loved tracks as a Markdown list for a personal site or music journal.",
    setup: "gem install rocksky",
    code: `require "rocksky"

profile = Rocksky.profile("tsiry-sandratraina.com")
page = Rocksky.get("app.rocksky.actor.getActorLovedSongs", {
  "did" => profile.fetch("did"), "limit" => 50
})
lines = page.fetch("tracks", []).map do |track|
  "- #{track["artist"]} — #{track["title"]}"
end

File.write("favorites.md", "# My favorites\\n\\n" + lines.join("\\n"))`,
  },
  {
    id: "kotlin",
    language: "Kotlin",
    file: "PlaybackScrobbler.kt",
    title: "Connect the player you’re building.",
    description:
      "Resolve a track’s metadata and scrobble it from your player’s qualifying-play callback.",
    setup: 'implementation("app.rocksky:rocksky-kotlin:0.15.0")',
    note: "Gradle dependency. Reuse a signed-in Agent and call this from a background worker.",
    code: `import app.rocksky.Agent
import app.rocksky.ScrobbleMatchInput

fun recordPlayedTrack(agent: Agent, title: String, artist: String) {
    val result = agent.scrobbleMatch(
        ScrobbleMatchInput(title = title, artist = artist)
    )
    println("Saved to your PDS: "+ result.scrobbleUri)
}`,
  },
  {
    id: "purescript",
    language: "PureScript",
    file: "Favorites.purs",
    title: "Bring favorites into your frontend.",
    description:
      "Load loved tracks into a typed browser application, with transport and API errors returned explicitly.",
    setup:
      "workspace:\n  extraPackages:\n    rocksky-sdk:\n      path: /path/to/rocksky/sdk/purescript",
    note: "Not yet on the registry. Clone the repository, add this to spago.yaml, and add rocksky-sdk to package.dependencies.",
    code: `module Favorites where

import Data.Either (Either)
import Effect.Aff (Aff)
import Rocksky (defaultConfig, newClient)
import Rocksky.Client (RockskyError)
import Rocksky.API.Actor.GetActorLovedSongs as Loved

loadFavorites :: String -> Aff (Either RockskyError Loved.Output)
loadFavorites did =
  Loved.call (newClient defaultConfig)
    (Loved.defaultParams { did })`,
  },
  {
    id: "go",
    language: "Go",
    file: "weekly_picks.go",
    title: "Serve discovery from your own app.",
    description:
      "Expose a small JSON endpoint with the community’s weekly picks, using the incoming request’s cancellation context.",
    setup: "go get github.com/tsirysndr/rocksky/sdk/go",
    code: `package main

import (
    "encoding/json"
    "log"
    "net/http"
    "github.com/tsirysndr/rocksky/sdk/go/rocksky"
)

func main() {
    client := rocksky.NewClient("")
    http.HandleFunc("/weekly-picks", func(w http.ResponseWriter, r *http.Request) {
        tracks, err := client.TopTracksInterval(r.Context(), 10, 0, rocksky.LastDays(7))
        if err != nil {
            http.Error(w, "Chart unavailable", http.StatusBadGateway)
            return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(tracks)
    })
    log.Fatal(http.ListenAndServe("127.0.0.1:8080", nil))
}`,
  },
];
