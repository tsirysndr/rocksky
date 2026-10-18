import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/regexp
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, asc, eq, from, gt, is_null, like_optional, limit, or, order_by, run,
  set, update, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/error
import rocksky_api/lib/matching
import rocksky_api/lib/query_cache
import rocksky_api/log
import rocksky_api/node/abort
import rocksky_api/node/fetch
import rocksky_api/node/http_fetch
import rocksky_api/node/process
import rocksky_api/schema/albums
import rocksky_api/schema/artists
import rocksky_api/schema/tracks
import rocksky_api/scripts/backfill
import rocksky_api/scripts/common
import rocksky_api/task

pub type Hit {
  Hit(
    images: List(String),
    album_images: List(String),
    duration: Int,
    track_number: Int,
    disc_number: Int,
    isrc: option.Option(String),
    link: option.Option(String),
    release: option.Option(String),
    genres: List(String),
  )
}

pub type Outcome {
  Updated(replaced_art: Bool)
  Missed
  Clean
  Failed
}

pub type Stats {
  Stats(
    scanned: Int,
    updated: Int,
    missed: Int,
    clean: Int,
    replaced_art: Int,
    errors: Int,
  )
}

fn regex(pattern: String, insensitive: Bool) {
  let assert Ok(re) =
    regexp.compile(
      pattern,
      regexp.Options(case_insensitive: insensitive, multi_line: False),
    )
  re
}

pub fn replaceable(url: option.Option(String)) {
  case url {
    None -> False
    Some(url) ->
      string.starts_with(url, "https://cdn.rocksky.app")
      || string.starts_with(url, "https://cdn.bsky.app")
  }
}

pub fn best_image(images: List(String)) {
  list.first(images)
  |> option.from_result
  |> option.then(fn(url) {
    case url != "" && !replaceable(Some(url)) {
      True -> Some(url)
      False -> None
    }
  })
}

pub fn spotify_id(link: option.Option(String), kind: String) {
  let re = regex("open\\.spotify\\.com/" <> kind <> "/([A-Za-z0-9]+)", False)
  regexp.scan(re, option.unwrap(link, ""))
  |> list.first
  |> result.map(fn(m) { m.submatches })
  |> result.unwrap([])
  |> list.first
  |> result.unwrap(None)
}

pub fn primary_artist(name: String) {
  regexp.split(regex(",|\\sfeat\\.?\\s|\\sft\\.?\\s|\\s&\\s", True), name)
  |> list.first
  |> result.unwrap(name)
  |> string.trim
}

pub fn title_variants(title: String) {
  let patterns = [
    "\\s*[-–—]\\s*from\\s+[\"“].*$",
    "\\s*\\(\\s*from\\s+[^)]*\\)\\s*$",
    "\\s*[([]\\s*(feat|ft|with)\\.?\\s+[^)\\]]*[)\\]]\\s*$",
    "\\s*[-–—]\\s*(remaster(ed)?(\\s+\\d{4})?|single version|radio edit|album version|mono|stereo|live|bonus track|extended(\\s+mix)?|original mix)\\s*$",
    "\\s*\\([^)]*\\)\\s*$",
  ]
  list.fold(patterns, [title], fn(acc, pattern) {
    let value = regexp.replace(regex(pattern, True), title, "") |> string.trim
    let value = regexp.replace(regex("\\s{2,}", False), value, " ")
    case string.length(value) > 1 && !list.contains(acc, value) {
      True -> list.append(acc, [value])
      False -> acc
    }
  })
}

fn hit_decoder() {
  let images = decode.list(decode.field("url", decode.string, decode.success))
  use art <- decode.optional_field("images", [], images)
  use album_art <- decode.optional_field(
    "album",
    [],
    decode.optional_field("images", [], images, decode.success),
  )
  use duration <- decode.optional_field("duration_ms", 0, decode.int)
  use track <- decode.optional_field("track_number", 0, decode.int)
  use disc <- decode.optional_field("disc_number", 0, decode.int)
  use isrc <- decode.optional_field(
    "external_ids",
    None,
    decode.optional_field(
      "isrc",
      None,
      decode.optional(decode.string),
      decode.success,
    ),
  )
  use link <- decode.optional_field(
    "external_urls",
    None,
    decode.optional_field(
      "spotify",
      None,
      decode.optional(decode.string),
      decode.success,
    ),
  )
  use release <- decode.optional_field(
    "release_date",
    None,
    decode.optional(decode.string),
  )
  use genres <- decode.optional_field("genres", [], decode.list(decode.string))
  decode.success(Hit(
    art,
    album_art,
    duration,
    track,
    disc,
    isrc,
    link,
    release,
    genres,
  ))
}

fn base(ctx: Context) {
  case string.ends_with(ctx.env.riff_api_url, "/") {
    True -> string.drop_end(ctx.env.riff_api_url, 1)
    False -> ctx.env.riff_api_url
  }
}

fn request(ctx: Context, path: String, decoder) {
  let work = {
    use response <- task.then(
      http_fetch.get(base(ctx) <> path, [], abort.timeout(30_000))
      |> task.attempt_result,
    )
    case
      http_fetch.status(response) >= 200 && http_fetch.status(response) < 300
    {
      False -> task.ok(None)
      True -> {
        use data <- task.then(http_fetch.json(response) |> task.attempt_result)
        decode.run(data, decoder)
        |> error.decode("Riff response", _)
        |> task.from_result
      }
    }
  }
  work
  |> task.rescue(fn(e) {
    log.warn("Riff request failed: " <> error.describe(e))
    task.ok(None)
  })
}

fn get(ctx: Context, cache, kind: String, id: String) {
  query_cache.get(cache, kind <> ":" <> id, fn() {
    request(ctx, "/" <> kind <> "s/" <> id, decode.map(hit_decoder(), Some))
  })
}

fn search(ctx: Context, cache, kind: String, query: String) {
  query_cache.get(cache, kind <> "search:" <> string.lowercase(query), fn() {
    let params =
      fetch.query(
        json.object([#("type", json.string(kind)), #("q", json.string(query))]),
      )
    request(
      ctx,
      "/search?" <> params,
      decode.at([kind <> "s", "items"], decode.list(hit_decoder()))
        |> decode.map(fn(items) { list.first(items) |> option.from_result }),
    )
  })
}

fn album_search(ctx: Context, cache, titles: List(String), artist: String) {
  case titles {
    [] -> task.ok(None)
    [title, ..rest] -> {
      use hit <- task.then(search(
        ctx,
        cache,
        "album",
        "album:\"" <> title <> "\" artist:\"" <> primary_artist(artist) <> "\"",
      ))
      case hit {
        Some(_) -> task.ok(hit)
        None -> album_search(ctx, cache, rest, artist)
      }
    }
  }
}

pub fn find_album(ctx: Context, cache, title: String, artist: String, link) {
  use hit <- task.then(case spotify_id(link, "album") {
    Some(id) -> get(ctx, cache, "album", id)
    None -> task.ok(None)
  })
  case hit {
    Some(_) -> task.ok(hit)
    None -> album_search(ctx, cache, title_variants(title), artist)
  }
}

fn find_artist(ctx: Context, cache, name: String, link) {
  use hit <- task.then(case spotify_id(link, "artist") {
    Some(id) -> get(ctx, cache, "artist", id)
    None -> task.ok(None)
  })
  case hit {
    Some(_) -> task.ok(hit)
    None -> search(ctx, cache, "artist", "artist:\"" <> name <> "\"")
  }
}

fn fill_art(current, candidate, column) {
  case current == None || replaceable(current), best_image(candidate) {
    True, Some(url) -> [set(column, Some(url))]
    _, _ -> []
  }
}

fn fill_optional(current, candidate, column) {
  case current, candidate {
    None, Some(value) if value != "" -> [set(column, Some(value))]
    _, _ -> []
  }
}

fn link_patch(current, candidate, column) {
  case fill_optional(current, candidate, column) {
    [assignment] -> Some(assignment)
    _ -> None
  }
}

fn patch(
  ctx: Context,
  table,
  column,
  id: String,
  fields,
  link,
  dry: Bool,
  replaced: Bool,
) {
  let assignments = case link {
    None -> fields
    Some(link) -> [link, ..fields]
  }
  case assignments {
    [] -> task.ok(Clean)
    _ -> {
      let write = fn(values) {
        update(table, values, eq(column, id))
        |> run(ctx.db)
        |> task.map(fn(_) { Nil })
      }
      use _ <- task.map(case dry {
        True -> task.ok(Nil)
        False ->
          write(assignments)
          |> task.rescue(fn(e) {
            let message = error.describe(e)
            case
              option.is_some(link)
              && {
                string.contains(message, "spotify_link")
                || string.contains(message, "23505")
              }
            {
              True ->
                case fields {
                  [] -> task.ok(Nil)
                  _ -> write(fields)
                }
              False -> task.fail(e)
            }
          })
      })
      Updated(replaced)
    }
  }
}

pub fn fill_track(ctx: Context, cache, track: tracks.Track, dry: Bool) {
  use request <- task.then(
    matching.request(
      track.title,
      track.artist,
      None,
      Some(track.album),
      None,
      None,
      None,
      track.isrc,
      track.spotify_link,
    )
    |> task.from_result,
  )
  use candidate <- task.then(matching.match_track(ctx, request, None))
  use hit <- task.then(
    case option.then(candidate, fn(c) { c.identifiers.spotify }) {
      None -> task.ok(None)
      Some(id) -> get(ctx, cache, "track", id)
    },
  )
  case hit {
    None -> task.ok(Missed)
    Some(hit) -> {
      let table = tr.table()
      let fields =
        list.flatten([
          fill_art(track.album_art, hit.album_images, tr.album_art(table)),
          case track.duration == 0 && hit.duration > 0 {
            True -> [set(tr.duration(table), hit.duration)]
            False -> []
          },
          case track.track_number == None && hit.track_number > 0 {
            True -> [set(tr.track_number(table), Some(hit.track_number))]
            False -> []
          },
          case track.disc_number == None && hit.disc_number > 0 {
            True -> [set(tr.disc_number(table), Some(hit.disc_number))]
            False -> []
          },
          fill_optional(track.isrc, hit.isrc, tr.isrc(table)),
        ])
      patch(
        ctx,
        table,
        tr.id(table),
        track.id,
        fields,
        link_patch(track.spotify_link, hit.link, tr.spotify_link(table)),
        dry,
        replaceable(track.album_art) && best_image(hit.album_images) != None,
      )
    }
  }
}

pub fn fill_album(ctx: Context, cache, album: albums.Album, dry: Bool) {
  use hit <- task.then(find_album(
    ctx,
    cache,
    album.title,
    album.artist,
    album.spotify_link,
  ))
  case hit {
    None -> task.ok(Missed)
    Some(hit) -> {
      let table = al.table()
      let year =
        option.then(hit.release, fn(date) {
          string.slice(date, 0, 4) |> int.parse |> option.from_result
        })
      let fields =
        list.flatten([
          fill_art(album.album_art, hit.images, al.album_art(table)),
          fill_optional(album.release_date, hit.release, al.release_date(table)),
          case album.year, year {
            None, Some(year) -> [set(al.year(table), Some(year))]
            _, _ -> []
          },
        ])
      patch(
        ctx,
        table,
        al.id(table),
        album.id,
        fields,
        link_patch(album.spotify_link, hit.link, al.spotify_link(table)),
        dry,
        replaceable(album.album_art) && best_image(hit.images) != None,
      )
    }
  }
}

pub fn fill_artist(ctx: Context, cache, artist: artists.Artist, dry: Bool) {
  use hit <- task.then(find_artist(ctx, cache, artist.name, artist.spotify_link))
  case hit {
    None -> task.ok(Missed)
    Some(hit) -> {
      let table = ar.table()
      let fields =
        list.flatten([
          case artist.picture, best_image(hit.images) {
            None, Some(url) -> [set(ar.picture(table), Some(url))]
            _, _ -> []
          },
          case option.unwrap(artist.genres, []) == [] && hit.genres != [] {
            True -> [set(ar.genres(table), Some(hit.genres))]
            False -> []
          },
        ])
      patch(
        ctx,
        table,
        ar.id(table),
        artist.id,
        fields,
        link_patch(artist.spotify_link, hit.link, ar.spotify_link(table)),
        dry,
        False,
      )
    }
  }
}

fn walk(fetch, id, work, cursor: String, stats: Stats) {
  case stats.scanned >= backfill.limit() {
    True -> task.ok(stats)
    False -> {
      use rows <- task.then(fetch(cursor))
      let rows = list.take(rows, backfill.limit() - stats.scanned)
      case rows {
        [] -> task.ok(stats)
        _ -> {
          use outcomes <- task.then(
            task.parallel_map_limited(
              rows,
              backfill.positive_number("BACKFILL_CONCURRENCY", 4),
              fn(row) {
                work(row)
                |> task.rescue(fn(e) {
                  log.warn(error.describe(e))
                  task.ok(Failed)
                })
              },
            ),
          )
          let stats =
            list.fold(outcomes, stats, fn(stats, outcome) {
              let stats = Stats(..stats, scanned: stats.scanned + 1)
              case outcome {
                Updated(replaced) ->
                  Stats(
                    ..stats,
                    updated: stats.updated + 1,
                    replaced_art: stats.replaced_art
                      + case replaced {
                        True -> 1
                        False -> 0
                      },
                  )
                Missed -> Stats(..stats, missed: stats.missed + 1)
                Clean -> Stats(..stats, clean: stats.clean + 1)
                Failed -> Stats(..stats, errors: stats.errors + 1)
              }
            })
          log.info(
            "Scanned "
            <> int.to_string(stats.scanned)
            <> ", updated "
            <> int.to_string(stats.updated)
            <> ", missed "
            <> int.to_string(stats.missed)
            <> ", errors "
            <> int.to_string(stats.errors),
          )
          walk(
            fetch,
            id,
            work,
            list.last(rows) |> result.map(id) |> result.unwrap(cursor),
            stats,
          )
        }
      }
    }
  }
}

fn art_filter(column) {
  or([
    is_null(column),
    like_optional(column, "https://cdn.rocksky.app%"),
    like_optional(column, "https://cdn.bsky.app%"),
  ])
}

pub fn execute(ctx: Context, _args) {
  let health_url =
    case string.ends_with(base(ctx), "/v1") {
      True -> string.drop_end(base(ctx), 3)
      False -> base(ctx)
    }
    <> "/health"
  use health <- task.then(
    http_fetch.get(health_url, [], abort.timeout(5000)) |> task.attempt_result,
  )
  case http_fetch.status(health) >= 200 && http_fetch.status(health) < 300 {
    False -> task.fail(error.Message("Riff is not reachable"))
    True -> {
      let only =
        option.unwrap(process.env("BACKFILL_ONLY"), "all") |> string.lowercase
      let cache = query_cache.new(86_400_000, 1_000_000)
      let dry = backfill.dry_run()
      let size = backfill.number("BACKFILL_PAGE_SIZE", 500)
      let initial = Stats(0, 0, 0, 0, 0, 0)
      ["tracks", "albums", "artists"]
      |> list.filter(fn(kind) { only == "all" || only == kind })
      |> task.parallel_map(fn(kind) {
        case kind {
          "tracks" -> {
            let t = tr.table()
            walk(
              fn(cursor) {
                from(t)
                |> where(
                  and([
                    gt(tr.id(t), cursor),
                    or([eq(tr.duration(t), 0), art_filter(tr.album_art(t))]),
                  ]),
                )
                |> order_by([asc(tr.id(t))])
                |> limit(size)
                |> all(ctx.db)
              },
              fn(t: tracks.Track) { t.id },
              fn(t) { fill_track(ctx, cache, t, dry) },
              "",
              initial,
            )
          }
          "albums" -> {
            let t = al.table()
            walk(
              fn(cursor) {
                from(t)
                |> where(
                  and([gt(al.id(t), cursor), art_filter(al.album_art(t))]),
                )
                |> order_by([asc(al.id(t))])
                |> limit(size)
                |> all(ctx.db)
              },
              fn(a: albums.Album) { a.id },
              fn(a) { fill_album(ctx, cache, a, dry) },
              "",
              initial,
            )
          }
          _ -> {
            let t = ar.table()
            walk(
              fn(cursor) {
                from(t)
                |> where(and([gt(ar.id(t), cursor), is_null(ar.picture(t))]))
                |> order_by([asc(ar.id(t))])
                |> limit(size)
                |> all(ctx.db)
              },
              fn(a: artists.Artist) { a.id },
              fn(a) { fill_artist(ctx, cache, a, dry) },
              "",
              initial,
            )
          }
        }
      })
    }
  }
}

pub fn main() {
  common.run(execute)
}
