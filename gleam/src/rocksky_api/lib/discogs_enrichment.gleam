import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  conflict_target, delete, eq, from, insert, on_conflict_update, one,
  returning_one, run, set, transaction, update, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/discogs_credits as dc
import rocksky_api/drizzle/schema/discogs_identifiers as di
import rocksky_api/drizzle/schema/discogs_masters as dm
import rocksky_api/drizzle/schema/discogs_release_artists as da
import rocksky_api/drizzle/schema/discogs_release_labels as dl
import rocksky_api/drizzle/schema/discogs_releases as dr
import rocksky_api/drizzle/schema/discogs_searches as ds
import rocksky_api/drizzle/schema/discogs_tracks as dt
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/lib/discogs
import rocksky_api/lib/discogs_models as d
import rocksky_api/lib/discogs_relation as relation
import rocksky_api/node/crypto
import rocksky_api/node/js
import rocksky_api/schema/discogs_releases
import rocksky_api/schema/discogs_searches
import rocksky_api/task

pub const miss_retry_ms = 2_592_000_000

pub type DiscogsLookup {
  Matched(release: discogs_releases.DiscogsRelease)
  Missed
  Unavailable
  Skipped
}

pub fn discogs_search_key(artist: String, album: String) {
  string.trim(album)
  <> " - "
  <> string.trim(artist) |> string.lowercase |> crypto.sha256_hex
}

pub fn is_stale_search(search: discogs_searches.DiscogsSearch, now: Int) {
  option.is_none(search.release_id)
  && now - row.to_unix_ms(search.searched_at) > miss_retry_ms
}

pub fn to_discogs_credit_rows(
  release_id: String,
  credits: List(d.DiscogsCredit),
) {
  let table = dc.table()
  credits
  |> list.filter(fn(c) { string.trim(c.name) != "" })
  |> list.index_map(fn(c, index) {
    [
      set(dc.release_id(table), release_id),
      set(dc.artist_id(table), relation.nonzero(c.artist_id)),
      set(dc.name(table), string.trim(c.name)),
      set(dc.role(table), relation.trimmed(c.role)),
      set(dc.tracks(table), relation.trimmed(c.tracks)),
      set(dc.position(table), index),
    ]
  })
}

pub fn to_discogs_release_row(
  track: d.DiscogsEnrichedTrack,
  score: Option(Float),
) {
  let table = dr.table()
  case relation.nonzero(track.discogs_release_id) {
    Some(id) if track.album != "" && track.artist != "" ->
      Some([
        set(dr.discogs_id(table), id),
        set(dr.master_id(table), track.discogs_master_id),
        set(dr.title(table), track.album),
        set(dr.artist(table), case track.album_artist {
          Some(a) if a != "" -> a
          _ -> track.artist
        }),
        set(dr.album_art(table), track.album_art),
        set(dr.year(table), track.year),
        set(dr.original_year(table), track.original_year),
        set(dr.release_date(table), track.release_date),
        set(dr.country(table), track.country),
        set(dr.label(table), track.label),
        set(dr.catalog_number(table), track.catalog_number),
        set(dr.barcode(table), track.barcode),
        set(dr.formats(table), track.formats),
        set(dr.genres(table), track.genres),
        set(dr.styles(table), track.styles),
        set(dr.discogs_url(table), track.discogs_url),
        set(dr.score(table), score),
      ])
    _ -> None
  }
}

pub fn match_score(response: d.DiscogsEnrichResponse) {
  let id = option.then(response.track, fn(t) { t.discogs_release_id })
  list.find(response.matches, fn(m) { Some(m.id) == id })
  |> result.or(list.first(response.matches))
  |> option.from_result
  |> option.map(fn(m) { m.score })
}

pub fn enrich_album_with_discogs(
  ctx: Context,
  artist: String,
  album: String,
  album_id: Option(String),
) {
  case string.trim(artist) == "" || string.trim(album) == "" {
    True -> task.ok(Skipped)
    False -> {
      let sha = discogs_search_key(artist, album)
      let searches = ds.table()
      let releases = dr.table()
      use existing <- task.then(
        from(searches) |> where(eq(ds.sha256(searches), sha)) |> one(ctx.db),
      )
      use cached <- task.then(case existing {
        Some(search) ->
          case is_stale_search(search, js.now_ms()), search.release_id {
            False, None -> task.ok(Some(Missed))
            False, Some(id) -> {
              use release <- task.then(
                from(releases) |> where(eq(dr.id(releases), id)) |> one(ctx.db),
              )
              case release {
                Some(r) ->
                  case r.credits_fetched_at {
                    Some(_) -> {
                      use _ <- task.map(link_album(
                        ctx,
                        album,
                        artist,
                        album_id,
                        r.id,
                      ))
                      Some(Matched(r))
                    }
                    None -> task.ok(None)
                  }
                None -> task.ok(None)
              }
            }
            _, _ -> task.ok(None)
          }
        None -> task.ok(None)
      })
      case cached {
        Some(lookup) -> task.ok(lookup)
        None -> fetch(ctx, artist, album, album_id, sha)
      }
    }
  }
}

fn fetch(
  ctx: Context,
  artist: String,
  album: String,
  album_id: Option(String),
  sha: String,
) {
  use response <- task.then(discogs.enrich_with_discogs(
    ctx,
    d.DiscogsQuery(artist, Some(album), None),
  ))
  case response {
    None -> task.ok(Unavailable)
    Some(response) -> {
      let score = match_score(response)
      let values = option.then(response.track, to_discogs_release_row(_, score))
      case values {
        None -> {
          use _ <- task.map(record_search(ctx, sha, artist, album, None, None))
          Missed
        }
        Some(values) -> {
          let releases = dr.table()
          let values =
            list.append(values, [set(dr.credits_fetched_at(releases), None)])
          use release <- task.then(
            insert(releases, values)
            |> on_conflict_update(
              [conflict_target(dr.discogs_id(releases))],
              list.append(values, [
                set(dr.updated_at(releases), row.from_unix_ms(js.now_ms())),
              ]),
            )
            |> returning_one(ctx.db, "Discogs release insert failed"),
          )
          let credits =
            option.then(response.track, fn(t) { t.credits })
            |> option.unwrap([])
          use _ <- task.then(store_credits(ctx, release.id, credits))
          use _ <- task.then(store_relations(
            ctx,
            release.id,
            release.discogs_id,
            release.master_id,
          ))
          let completed = row.from_unix_ms(js.now_ms())
          use _ <- task.then(
            update(
              releases,
              [
                set(dr.credits_fetched_at(releases), Some(completed)),
                set(dr.updated_at(releases), completed),
              ],
              eq(dr.id(releases), release.id),
            )
            |> run(ctx.db),
          )
          use _ <- task.then(record_search(
            ctx,
            sha,
            artist,
            album,
            Some(release.id),
            score,
          ))
          use _ <- task.map(link_album(ctx, album, artist, album_id, release.id))
          Matched(
            discogs_releases.DiscogsRelease(
              ..release,
              credits_fetched_at: Some(completed),
            ),
          )
        }
      }
    }
  }
}

fn store_credits(
  ctx: Context,
  release_id: String,
  credits: List(d.DiscogsCredit),
) {
  transaction(ctx.db, fn(tx) {
    let table = dc.table()
    use _ <- task.then(
      delete(table, eq(dc.release_id(table), release_id)) |> run(tx),
    )
    task.each_(to_discogs_credit_rows(release_id, credits), fn(values) {
      insert(table, values) |> run(tx)
    })
  })
}

fn store_relations(
  ctx: Context,
  release_id: String,
  discogs_id: Int,
  master_id: Option(Int),
) {
  use release <- task.then(discogs.get_discogs_release(ctx, discogs_id))
  use _ <- task.then(case release {
    None -> task.ok(Nil)
    Some(r) -> write_release_children(ctx, release_id, r)
  })
  case relation.nonzero(master_id) {
    None -> task.ok(Nil)
    Some(id) -> store_master(ctx, id)
  }
}

pub fn write_release_children(
  ctx: Context,
  release_id: String,
  release: d.DiscogsRelease,
) {
  let artists = da.table()
  let labels = dl.table()
  let identifiers = di.table()
  let tracks = dt.table()
  transaction(ctx.db, fn(tx) {
    use _ <- task.then(
      delete(artists, eq(da.release_id(artists), release_id)) |> run(tx),
    )
    use _ <- task.then(
      delete(labels, eq(dl.release_id(labels), release_id)) |> run(tx),
    )
    use _ <- task.then(
      delete(identifiers, eq(di.release_id(identifiers), release_id)) |> run(tx),
    )
    use _ <- task.then(
      delete(tracks, eq(dt.release_id(tracks), release_id)) |> run(tx),
    )
    use _ <- task.then(
      task.each_(
        relation.to_release_artist_rows(
          release_id,
          option.unwrap(release.artists, []),
        ),
        fn(v) { insert(artists, v) |> run(tx) },
      ),
    )
    use _ <- task.then(
      task.each_(relation.to_release_label_rows(release_id, release), fn(v) {
        insert(labels, v) |> run(tx)
      }),
    )
    use _ <- task.then(
      task.each_(
        relation.to_identifier_rows(
          release_id,
          option.unwrap(release.identifiers, []),
        ),
        fn(v) { insert(identifiers, v) |> run(tx) },
      ),
    )
    task.each_(
      relation.to_track_rows(release_id, option.unwrap(release.tracklist, [])),
      fn(v) { insert(tracks, v) |> run(tx) },
    )
  })
}

fn store_master(ctx: Context, id: Int) {
  let masters = dm.table()
  use stored <- task.then(
    from(masters) |> where(eq(dm.discogs_id(masters), id)) |> one(ctx.db),
  )
  case stored {
    Some(_) -> task.ok(Nil)
    None -> {
      use master <- task.then(discogs.get_discogs_master(ctx, id))
      case option.then(master, relation.to_master_row) {
        None -> task.ok(Nil)
        Some(values) ->
          insert(masters, values)
          |> on_conflict_update(
            [conflict_target(dm.discogs_id(masters))],
            list.append(values, [
              set(dm.updated_at(masters), row.from_unix_ms(js.now_ms())),
            ]),
          )
          |> run(ctx.db)
          |> task.map(fn(_) { Nil })
      }
    }
  }
}

fn record_search(
  ctx: Context,
  sha: String,
  artist: String,
  album: String,
  release_id: Option(String),
  score: Option(Float),
) {
  let table = ds.table()
  let now = row.from_unix_ms(js.now_ms())
  let updates = [
    set(ds.release_id(table), release_id),
    set(ds.score(table), score),
    set(ds.searched_at(table), now),
  ]
  insert(
    table,
    list.append(
      [
        set(ds.sha256(table), sha),
        set(ds.artist(table), artist),
        set(ds.album(table), album),
      ],
      updates,
    ),
  )
  |> on_conflict_update(
    [conflict_target(ds.sha256(table))],
    list.append(updates, [set(ds.updated_at(table), now)]),
  )
  |> run(ctx.db)
}

fn link_album(
  ctx: Context,
  album: String,
  artist: String,
  album_id: Option(String),
  release_id: String,
) {
  let table = al.table()
  let condition = case album_id {
    Some(id) if id != "" -> eq(al.id(table), id)
    _ ->
      eq(
        al.sha256(table),
        album <> " - " <> artist |> string.lowercase |> crypto.sha256_hex,
      )
  }
  use existing <- task.then(from(table) |> where(condition) |> one(ctx.db))
  case existing {
    Some(album) ->
      case album.discogs_release_id {
        Some(_) -> task.ok(Nil)
        None ->
          update(
            table,
            [set(al.discogs_release_id(table), Some(release_id))],
            eq(al.id(table), album.id),
          )
          |> run(ctx.db)
          |> task.map(fn(_) { Nil })
      }
    None -> task.ok(Nil)
  }
}

pub fn enrich_scrobble_with_discogs(ctx: Context, track_id: String) {
  let table = t.table()
  use track <- task.then(
    from(table) |> where(eq(t.id(table), track_id)) |> one(ctx.db),
  )
  case track {
    None -> task.ok(Nil)
    Some(track) ->
      enrich_album_with_discogs(
        ctx,
        case track.album_artist {
          "" -> track.artist
          a -> a
        },
        track.album,
        None,
      )
      |> task.map(fn(_) { Nil })
  }
}
