import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all_columns, and, eq, eq_columns, field, from, inner_join, one, or, required,
  select, where,
}
import rocksky_api/drizzle/schema/loved_tracks as lt
import rocksky_api/drizzle/schema/spotify_accounts as sa
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/json_value
import rocksky_api/lexicon/models
import rocksky_api/node/crypto
import rocksky_api/node/redis
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

type Playing {
  Playing(
    fields: List(#(String, json_value.JsonValue)),
    title: String,
    artists: List(String),
    album: String,
  )
}

fn decoder() {
  use fields <- decode.then(decode.dict(decode.string, json_value.decoder()))
  use title <- decode.then(decode.at(["item", "name"], decode.string))
  use artists <- decode.then(decode.at(
    ["item", "artists"],
    decode.list(decode.field("name", decode.string, decode.success)),
  ))
  use album <- decode.then(decode.at(["item", "album", "name"], decode.string))
  decode.success(Playing(dict.to_list(fields), title, artists, album))
}

import gleam/dict

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.spotify.getCurrentlyPlaying",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("spotify.getCurrentlyPlaying"),
        models.spotify_get_currently_playing_params_decoder(),
      )
      let actor = case params.actor {
        None | Some("") -> handler.caller(req)
        _ -> params.actor
      }
      use actor <- task.then(case actor {
        None -> task.fail(error.Message("User not found"))
        Some(actor) -> task.ok(actor)
      })
      retrieve(ctx, actor, False)
    },
  )
}

pub fn retrieve(ctx: Context, actor: String, include_sha: Bool) {
  let users = u.table()
  let accounts = sa.table()
  let tracks = t.table()
  let loved = lt.table()
  use user <- task.then(
    from(users)
    |> where(or([eq(u.did(users), actor), eq(u.handle(users), actor)]))
    |> required(ctx.db, "User not found"),
  )
  use account <- task.then(
    select(accounts, field("email", sa.email(accounts)))
    |> where(eq(sa.user_id(accounts), user.id))
    |> required(ctx.db, "Spotify account not found"),
  )
  use cached <- task.then(
    task.attempt_result(redis.get(ctx.redis, account <> ":current")),
  )
  case cached {
    None -> task.ok(json.object([]))
    Some(raw) -> {
      use playing <- task.then(task.from_result(
        json.parse(raw, decoder())
        |> result.replace_error(error.Message("Invalid Spotify current track")),
      ))
      let sha =
        crypto.sha256_hex(string.lowercase(
          playing.title
          <> " - "
          <> string.join(playing.artists, ", ")
          <> " - "
          <> playing.album,
        ))
      use record <- task.then(
        select(tracks, all_columns(tracks))
        |> where(eq(t.sha256(tracks), sha))
        |> one(ctx.db),
      )
      use liked <- task.map(
        select(loved, field("id", lt.id(loved)))
        |> inner_join(tracks, eq_columns(lt.track_id(loved), t.id(tracks)))
        |> where(
          and([eq(t.sha256(tracks), sha), eq(lt.user_id(loved), user.id)]),
        )
        |> one(ctx.db),
      )
      let fields =
        playing.fields
        |> list.filter(fn(pair) {
          !list.contains(["songUri", "albumUri", "artistUri", "liked"], pair.0)
          && !{ include_sha && pair.0 == "sha256" }
        })
      let uris = case record {
        None -> []
        Some(track) ->
          [
            #("songUri", track.uri),
            #("albumUri", track.album_uri),
            #("artistUri", track.artist_uri),
          ]
          |> list.map(fn(pair) {
            #(pair.0, case pair.1 {
              None -> json_value.Null
              Some(uri) -> json_value.String(uri)
            })
          })
      }
      json_value.Object([
        #("liked", json_value.Boolean(liked != None)),
        ..list.append(
          case include_sha {
            True -> [#("sha256", json_value.String(sha))]
            False -> []
          },
          list.append(fields, uris),
        )
      ])
      |> json_value.encode
    }
  }
}
