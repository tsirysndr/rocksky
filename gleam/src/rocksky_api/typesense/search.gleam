import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{None}
import gleam/result
import rocksky_api/error
import rocksky_api/lexicon/json_value.{type JsonValue, Object}
import rocksky_api/node/js
import rocksky_api/node/typesense.{type Client}
import rocksky_api/schema/albums
import rocksky_api/schema/artists
import rocksky_api/schema/playlists
import rocksky_api/schema/tracks
import rocksky_api/schema/users
import rocksky_api/task
import rocksky_api/typesense/retry

pub const collections = [
  #("albums", "title,artist"),
  #("artists", "name,biography"),
  #("tracks", "title,artist,albumArtist,album,composer"),
  #("users", "handle,displayName"),
  #("playlists", "name,description"),
]

pub type SearchResults {
  SearchResults(
    hits: List(JsonValue),
    processing_time_ms: Int,
    limit: Int,
    offset: Int,
    estimated_total_hits: Int,
  )
}

pub fn encode(value: SearchResults) {
  json.object([
    #("hits", json.array(value.hits, json_value.encode)),
    #("processingTimeMs", json.int(value.processing_time_ms)),
    #("limit", json.int(value.limit)),
    #("offset", json.int(value.offset)),
    #("estimatedTotalHits", json.int(value.estimated_total_hits)),
  ])
}

fn upsert_many(
  client: Client,
  collection: String,
  rows: List(a),
  encode: fn(a) -> json.Json,
) {
  case rows {
    [] -> task.ok(Nil)
    _ ->
      retry.run(fn() {
        typesense.import_documents(
          client,
          collection,
          json.array(rows, encode),
          "upsert",
        )
        |> task.attempt_result
        |> task.map(fn(_) { Nil })
      })
  }
}

pub fn index_albums(client: Client, rows: List(albums.Album)) {
  upsert_many(client, "albums", rows, albums.to_json)
}

pub fn index_artists(client: Client, rows: List(artists.Artist)) {
  upsert_many(client, "artists", rows, artists.to_json)
}

pub fn index_tracks(client: Client, rows: List(tracks.Track)) {
  upsert_many(client, "tracks", rows, tracks.to_json)
}

pub fn index_users(client: Client, rows: List(users.User)) {
  upsert_many(client, "users", rows, users.to_json)
}

pub fn index_playlists(client: Client, rows: List(playlists.Playlist)) {
  upsert_many(client, "playlists", rows, playlists.to_json)
}

fn result_decoder() {
  use failed <- decode.optional_field(
    "error",
    None,
    decode.optional(decode.string),
  )
  case failed {
    option.Some(s) if s != "" -> decode.success(#(0, []))
    _ -> {
      use found <- decode.optional_field("found", 0, decode.int)
      use hits <- decode.optional_field(
        "hits",
        [],
        decode.list(decode.field(
          "document",
          json_value.decoder(),
          decode.success,
        )),
      )
      decode.success(#(found, hits))
    }
  }
}

pub fn federated_search(
  client: Client,
  query: String,
  per_collection_limit: Int,
) {
  let searches =
    list.map(collections, fn(c) {
      json.object([
        #("collection", json.string(c.0)),
        #("q", json.string(query)),
        #("query_by", json.string(c.1)),
        #("per_page", json.int(per_collection_limit)),
        #("page", json.int(1)),
        #("prioritize_exact_match", json.bool(True)),
      ])
    })
  let started = js.now_ms()
  use raw <- task.then(
    typesense.multi_search(
      client,
      json.object([#("searches", json.array(searches, fn(x) { x }))]),
      json.object([]),
    )
    |> task.attempt_result,
  )
  let elapsed = js.now_ms() - started
  use results <- task.then(
    decode.run(
      raw,
      decode.field("results", decode.list(result_decoder()), decode.success),
    )
    |> result.map_error(error.Decode("Typesense search", _))
    |> task.from_result,
  )
  let totals =
    list.fold(list.zip(collections, results), #(0, []), fn(acc, item) {
      let hits =
        list.map(item.1.1, fn(doc) {
          let fields = case doc {
            Object(fields) ->
              list.filter(fields, fn(p) { p.0 != "_federation" })
            _ -> []
          }
          Object(
            list.append(fields, [
              #(
                "_federation",
                Object([#("indexUid", json_value.String(item.0.0))]),
              ),
            ]),
          )
        })
      #(acc.0 + item.1.0, list.append(acc.1, hits))
    })
  task.ok(SearchResults(
    totals.1,
    elapsed,
    per_collection_limit * list.length(collections),
    0,
    totals.0,
  ))
}
