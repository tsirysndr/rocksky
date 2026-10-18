import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, asc, eq, eq_columns, field, from, gt, is_null, left_join, limit,
  order_by, pair, run, select, set, update, where,
}
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/spotify_accounts as sa
import rocksky_api/drizzle/schema/spotify_apps as app
import rocksky_api/drizzle/schema/spotify_tokens as st
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/crypto
import rocksky_api/node/fetch
import rocksky_api/node/js
import rocksky_api/schema/artists
import rocksky_api/scripts/common
import rocksky_api/task

pub fn token(ctx: Context) {
  let tokens = st.table()
  let accounts = sa.table()
  let apps = app.table()
  use rows <- task.then(
    select(
      tokens,
      pair(
        field("refresh", st.refresh_token(tokens)),
        pair(
          field("client", app.spotify_app_id(apps)),
          field("secret", app.spotify_secret(apps)),
        ),
      ),
    )
    |> left_join(accounts, eq_columns(sa.user_id(accounts), st.user_id(tokens)))
    |> left_join(
      apps,
      eq_columns(app.spotify_app_id(apps), st.spotify_app_id(tokens)),
    )
    |> where(eq(sa.is_beta_user(accounts), True))
    |> all(ctx.db),
  )
  use credentials <- task.then(
    list.drop(rows, js.random_int(list.length(rows)))
    |> list.first
    |> result.map_error(fn(_) { error.Message("No beta Spotify account") })
    |> task.from_result,
  )
  use refresh <- task.then(
    crypto.aes_ctr_decrypt(
      credentials.0,
      ctx.env.spotify_encryption_key,
      ctx.env.spotify_encryption_iv,
    )
    |> error.map_js
    |> task.from_result,
  )
  use secret <- task.then(
    crypto.aes_ctr_decrypt(
      credentials.1.1,
      ctx.env.spotify_encryption_key,
      ctx.env.spotify_encryption_iv,
    )
    |> error.map_js
    |> task.from_result,
  )
  use response <- task.then(
    fetch.request(
      "https://accounts.spotify.com/api/token",
      "POST",
      [#("Content-Type", "application/x-www-form-urlencoded")],
      Some(
        fetch.query(
          json.object([
            #("grant_type", json.string("refresh_token")),
            #("refresh_token", json.string(refresh)),
            #("client_id", json.string(credentials.1.0)),
            #("client_secret", json.string(secret)),
          ]),
        ),
      ),
    )
    |> task.attempt_result,
  )
  decode.run(
    response.data,
    decode.field("access_token", decode.string, decode.success),
  )
  |> error.decode("Spotify token", _)
  |> task.from_result
}

fn decoder() {
  use items <- decode.then(decode.at(
    ["artists", "items"],
    decode.list({
      use genres <- decode.optional_field(
        "genres",
        [],
        decode.list(decode.string),
      )
      use images <- decode.optional_field(
        "images",
        [],
        decode.list(decode.field("url", decode.string, decode.success)),
      )
      decode.success(#(genres, images))
    }),
  ))
  decode.success(items)
}

pub fn enrich(ctx: Context, artist: artists.Artist) {
  use token <- task.then(token(ctx))
  let query =
    fetch.query(
      json.object([
        #("q", json.string(artist.name)),
        #("type", json.string("artist")),
        #("limit", json.int(1)),
      ]),
    )
  use response <- task.then(
    fetch.request(
      ctx.env.spotify_api_url <> "/search?" <> query,
      "GET",
      [#("Authorization", "Bearer " <> token)],
      None,
    )
    |> task.attempt_result,
  )
  use items <- task.then(
    decode.run(response.data, decoder())
    |> error.decode("Spotify artist", _)
    |> task.from_result,
  )
  case items {
    [] -> task.ok(Nil)
    [#(genres, images), ..] -> {
      let table = ar.table()
      let fields =
        list.flatten([
          case genres {
            [] -> []
            _ -> [set(ar.genres(table), Some(genres))]
          },
          case option.unwrap(artist.picture, ""), images {
            "", [url, ..] -> [set(ar.picture(table), Some(url))]
            _, _ -> []
          },
        ])
      case fields {
        [] -> task.ok(Nil)
        _ ->
          update(table, fields, eq(ar.id(table), artist.id))
          |> run(ctx.db)
          |> task.map(fn(_) { Nil })
      }
    }
  }
}

fn retry(ctx: Context, artist: artists.Artist) {
  enrich(ctx, artist)
  |> task.rescue(fn(e) {
    log.warn(
      "Error fetching genres for " <> artist.name <> ": " <> error.describe(e),
    )
    use _ <- task.then(task.sleep(1000) |> task.attempt)
    retry(ctx, artist)
  })
}

fn pages(ctx: Context, cursor: String) {
  let table = ar.table()
  use rows <- task.then(
    from(table)
    |> where(and([is_null(ar.genres(table)), gt(ar.id(table), cursor)]))
    |> order_by([asc(ar.id(table))])
    |> limit(1000)
    |> all(ctx.db),
  )
  case rows {
    [] -> task.ok(Nil)
    _ -> {
      use _ <- task.then(
        common.each(rows, fn(artist) {
          use _ <- task.then(retry(ctx, artist))
          task.sleep(1000) |> task.attempt
        }),
      )
      pages(
        ctx,
        list.last(rows) |> result.map(fn(a) { a.id }) |> result.unwrap(cursor),
      )
    }
  }
}

pub fn execute(ctx: Context, _args) {
  pages(ctx, "")
}

pub fn main() {
  common.run(execute)
}
