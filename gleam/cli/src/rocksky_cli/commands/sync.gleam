import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/result
import gleam/string
import rocksky_cli/commands/import_history
import rocksky_cli/commands/reads
import rocksky_cli/database as db
import rocksky_cli/node
import rocksky_cli/sdk
import rocksky_cli/value

fn text(value: String) -> Dynamic {
  json.string(value) |> json.to_string |> value.from_json
}

fn number(value: Int) -> Dynamic {
  json.int(value) |> json.to_string |> value.from_json
}

fn fields(
  record: Dynamic,
  names: List(#(String, String)),
) -> List(#(String, Dynamic)) {
  list.map(names, fn(p) { #(p.0, value.field(record, p.1)) })
}

fn id(uri: String) -> Dynamic {
  text(string.slice(node.hash(uri, "sha256"), 0, 24))
}

fn lookup(
  database: db.Database,
  table: String,
  column: String,
  needle: String,
) -> Dynamic {
  db.query(
    database,
    "SELECT * FROM " <> table <> " WHERE " <> column <> " = ? LIMIT 1",
    [text(needle)],
  )
  |> list.first
  |> result.unwrap(value.null())
}

pub fn run() -> promise.Promise(Nil) {
  use result <- promise.await(import_history.authenticate())
  case result {
    Error(e) -> {
      reads.fail(e)
      promise.resolve(Nil)
    }
    Ok(agent) -> {
      use opened <- promise.await(sdk.open_index(
        agent,
        node.state_path("import-index"),
        sdk.play_key,
      ))
      case opened {
        Error(e) -> {
          reads.fail(e)
          promise.resolve(Nil)
        }
        Ok(index) -> {
          use synced <- promise.await(sdk.sync(agent))
          case synced {
            Error(e) -> {
              reads.fail(e)
              sdk.close(index)
            }
            Ok(stats) -> {
              use database <- promise.await(db.open())
              let records = sdk.records(index)
              db.transaction(database, fn() {
                materialize(database, sdk.did(agent), records)
              })
              node.print("Synced repository: " <> value.stringify(stats))
              let unwatch =
                sdk.watch_index(index, fn(event) {
                  db.transaction(database, fn() {
                    apply_commit(database, sdk.did(agent), event)
                  })
                })
              let subscription = sdk.hydrate(agent)
              node.print("Watching repository updates. Press Ctrl-C to stop.")
              use _ <- promise.await(sdk.until_signal())
              unwatch()
              use _ <- promise.await(sdk.stop(subscription))
              db.close(database)
              sdk.close(index)
            }
          }
        }
      }
    }
  }
}

pub fn materialize(
  database: db.Database,
  did: String,
  records: List(Dynamic),
) -> Nil {
  let profile =
    records
    |> list.find(fn(row) {
      value.string(row, "collection") == "app.bsky.actor.profile"
    })
    |> result.map(fn(row) { value.field(row, "record") })
    |> result.unwrap(value.null())
  let handle = case node.env("ROCKSKY_IDENTIFIER") {
    "" -> did
    value -> value
  }
  let user =
    db.insert(
      database,
      "users",
      [
        #("id", id(did)),
        #("did", text(did)),
        #("handle", text(handle)),
        #("display_name", value.field(profile, "displayName")),
        #("avatar", text("")),
      ],
      "did",
    )
  list.each(["artist", "album", "song", "scrobble"], fn(kind) {
    records
    |> list.filter(fn(row) {
      value.string(row, "collection") == "app.rocksky." <> kind
    })
    |> list.each(fn(row) { materialize_record(database, user, kind, row) })
  })
}

fn relation(
  database: db.Database,
  table: String,
  user: Dynamic,
  column: String,
  record: Dynamic,
) -> Nil {
  let uid = value.string(user, "id")
  let rid = value.string(record, "id")
  let _ =
    db.insert(
      database,
      table,
      [
        #("id", id(uid <> ":" <> rid <> ":" <> table)),
        #("user_id", text(uid)),
        #(column, text(rid)),
        #("uri", value.field(record, "uri")),
      ],
      "",
    )
  Nil
}

fn materialize_record(
  database: db.Database,
  user: Dynamic,
  kind: String,
  row: Dynamic,
) -> Nil {
  let record = value.field(row, "record")
  let uri = value.string(row, "uri")
  let common = [
    #("id", id(uri)),
    #("uri", text(uri)),
    #("cid", case value.string(row, "cid") {
      "" -> text(node.hash(value.stringify(record), "sha256"))
      cid -> text(cid)
    }),
  ]
  case kind {
    "artist" -> {
      let artist =
        db.insert(
          database,
          "artists",
          list.append(
            common,
            fields(record, [
              #("name", "name"),
              #("biography", "bio"),
              #("born_in", "bornIn"),
              #("picture", "pictureUrl"),
            ]),
          ),
          "uri",
        )
      relation(database, "user_artists", user, "artist_id", artist)
      value.field(record, "tags")
      |> value.items
      |> list.each(fn(tag) {
        let name = value.text(tag)
        let _ =
          db.insert(
            database,
            "genres",
            [#("id", id("genre:" <> name)), #("name", text(name))],
            "",
          )
        let genre = lookup(database, "genres", "name", name)
        let _ =
          db.insert(
            database,
            "artist_genres ",
            [
              #("id", id(uri <> name)),
              #("artist_id", value.field(artist, "id")),
              #("genre_id", value.field(genre, "id")),
            ],
            "",
          )
        Nil
      })
    }
    "album" -> {
      let artist =
        lookup(database, "artists", "name", value.string(record, "artist"))
      let album =
        db.insert(
          database,
          "albums",
          list.append(
            [#("artist_uri", value.field(artist, "uri")), ..common],
            fields(record, [
              #("title", "title"),
              #("artist", "artist"),
              #("album_art", "albumArtUrl"),
              #("release_date", "releaseDate"),
              #("year", "year"),
              #("apple_music_link", "appleMusicLink"),
              #("spotify_link", "spotifyLink"),
              #("tidal_link", "tidalLink"),
              #("youtube_link", "youtubeLink"),
            ]),
          ),
          "uri",
        )
      relation(database, "user_albums", user, "album_id", album)
    }
    "song" -> {
      let artist =
        lookup(database, "artists", "name", value.string(record, "albumArtist"))
      let album =
        db.query(
          database,
          "SELECT * FROM albums WHERE title = ? AND artist = ? LIMIT 1",
          [value.field(record, "album"), value.field(record, "albumArtist")],
        )
        |> list.first
        |> result.unwrap(value.null())
      let track =
        db.insert(
          database,
          "tracks",
          list.append(
            [
              #("artist_uri", value.field(artist, "uri")),
              #("album_uri", value.field(album, "uri")),
              ..common
            ],
            fields(record, [
              #("title", "title"),
              #("artist", "artist"),
              #("album", "album"),
              #("album_artist", "albumArtist"),
              #("album_art", "albumArtUrl"),
              #("duration", "duration"),
              #("track_number", "trackNumber"),
              #("disc_number", "discNumber"),
              #("mb_id", "mbid"),
              #("youtube_link", "youtubeLink"),
              #("spotify_link", "spotifyLink"),
              #("apple_music_link", "appleMusicLink"),
              #("tidal_link", "tidalLink"),
              #("lyrics", "lyrics"),
              #("composer", "composer"),
              #("genre", "genre"),
              #("label", "label"),
              #("copyright_message", "copyrightMessage"),
            ]),
          ),
          "uri",
        )
      relation(database, "user_tracks", user, "track_id", track)
      case value.is_null(album) {
        True -> Nil
        False -> {
          let _ =
            db.insert(
              database,
              "album_tracks",
              [
                #("id", id(uri <> ":album")),
                #("album_id", value.field(album, "id")),
                #("track_id", value.field(track, "id")),
              ],
              "",
            )
          Nil
        }
      }
    }
    "scrobble" -> {
      let track =
        db.query(
          database,
          "SELECT * FROM tracks WHERE title = ? AND artist = ? AND album = ? LIMIT 1",
          [
            value.field(record, "title"),
            value.field(record, "artist"),
            value.field(record, "album"),
          ],
        )
        |> list.first
        |> result.unwrap(value.null())
      case value.is_null(track) {
        True -> Nil
        False -> {
          let artist =
            lookup(
              database,
              "artists",
              "uri",
              value.string(track, "artist_uri"),
            )
          let album =
            lookup(database, "albums", "uri", value.string(track, "album_uri"))
          let timestamp =
            node.timestamp(value.string(record, "createdAt"))
            |> result.unwrap(node.now())
          let _ =
            db.insert(
              database,
              "scrobbles",
              [
                #("xata_id", id(uri)),
                #("uri", text(uri)),
                #("cid", value.field(row, "cid")),
                #("user_id", value.field(user, "id")),
                #("track_id", value.field(track, "id")),
                #("artist_id", value.field(artist, "id")),
                #("album_id", value.field(album, "id")),
                #("timestamp", number(timestamp)),
                #("created_at", number(timestamp)),
              ],
              "uri",
            )
          Nil
        }
      }
    }
    _ -> Nil
  }
}

pub fn apply_commit(database: db.Database, did: String, event: Dynamic) -> Nil {
  let kind =
    value.string(event, "collection") |> string.replace("app.rocksky.", "")
  let uri = value.string(event, "uri")
  case value.string(event, "operation") {
    "delete" -> {
      // Shared artist/album/song metadata may still be referenced by history.
      // Remove ownership; retain referenced metadata until a later full sync.
      let table = case kind {
        "artist" -> "user_artists"
        "album" -> "user_albums"
        "song" -> "user_tracks"
        "scrobble" -> "scrobbles"
        _ -> ""
      }
      case table {
        "" -> Nil
        _ ->
          db.run(database, "DELETE FROM " <> table <> " WHERE uri = ?", [
            text(uri),
          ])
      }
    }
    _ -> {
      let user = lookup(database, "users", "did", did)
      case value.is_null(user) {
        True -> Nil
        False -> materialize_record(database, user, kind, event)
      }
    }
  }
}
