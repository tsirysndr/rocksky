import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  eq, eq_columns, field, inner_join, pair, required, select, where,
}
import rocksky_api/drizzle/schema/spotify_apps as a
import rocksky_api/drizzle/schema/spotify_tokens as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/node/crypto
import rocksky_api/node/fetch
import rocksky_api/task

pub type Action {
  Play
  Pause
  Next
  Previous
  Seek(Int)
}

pub fn token(ctx: Context, did: String) {
  refresh(ctx, did, False)
}

pub fn verified_token(ctx: Context, did: String) {
  refresh(ctx, did, True)
}

fn refresh(ctx: Context, did: String, strict: Bool) {
  let users = u.table()
  let apps = a.table()
  let tokens = t.table()
  use credentials <- task.then(
    select(
      tokens,
      pair(
        field("refresh", t.refresh_token(tokens)),
        pair(
          field("client", a.spotify_app_id(apps)),
          field("secret", a.spotify_secret(apps)),
        ),
      ),
    )
    |> inner_join(users, eq_columns(t.user_id(tokens), u.id(users)))
    |> inner_join(
      apps,
      eq_columns(t.spotify_app_id(tokens), a.spotify_app_id(apps)),
    )
    |> where(eq(u.did(users), did))
    |> required(ctx.db, "Spotify account not found"),
  )
  use refresh <- task.then(task.from_result(
    crypto.aes_ctr_decrypt(
      credentials.0,
      ctx.env.spotify_encryption_key,
      ctx.env.spotify_encryption_iv,
    )
    |> error.map_js,
  ))
  use secret <- task.then(task.from_result(
    crypto.aes_ctr_decrypt(
      credentials.1.1,
      ctx.env.spotify_encryption_key,
      ctx.env.spotify_encryption_iv,
    )
    |> error.map_js,
  ))
  let body =
    json.object([
      #("grant_type", json.string("refresh_token")),
      #("refresh_token", json.string(refresh)),
      #("client_id", json.string(credentials.1.0)),
      #("client_secret", json.string(secret)),
    ])
    |> fetch.query
  use response <- task.then(
    task.attempt_result(fetch.request(
      "https://accounts.spotify.com/api/token",
      "POST",
      [#("Content-Type", "application/x-www-form-urlencoded")],
      Some(body),
    )),
  )
  case strict && { response.status < 200 || response.status >= 300 } {
    True -> task.fail(error.Unauthorized("Spotify authorization failed"))
    False ->
      task.from_result(
        decode.run(
          response.data,
          decode.field("access_token", decode.string, decode.success),
        )
        |> error.decode("Spotify token", _),
      )
      |> task.then(fn(token) {
        case strict && token == "" {
          True -> task.fail(error.Unauthorized("Spotify authorization failed"))
          False -> task.ok(token)
        }
      })
  }
}

pub fn run(ctx: Context, did: String, action: Action) {
  use token <- task.then(token(ctx, did))
  let #(method, path) = case action {
    Play -> #("PUT", "play")
    Pause -> #("PUT", "pause")
    Next -> #("POST", "next")
    Previous -> #("POST", "previous")
    Seek(position) -> #("PUT", "seek?position_ms=" <> int.to_string(position))
  }
  use response <- task.map(
    task.attempt_result(fetch.request(
      ctx.env.spotify_api_url <> "/me/player/" <> path,
      method,
      [#("Authorization", "Bearer " <> token)],
      None,
    )),
  )
  response.status
}
