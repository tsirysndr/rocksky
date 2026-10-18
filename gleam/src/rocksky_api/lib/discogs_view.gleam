import gleam/float
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{all, asc, eq, from, one, order_by, where}
import rocksky_api/drizzle/schema/discogs_credits as d_credits
import rocksky_api/drizzle/schema/discogs_identifiers as d_identifiers
import rocksky_api/drizzle/schema/discogs_masters as dm
import rocksky_api/drizzle/schema/discogs_release_artists as d_artists
import rocksky_api/drizzle/schema/discogs_release_labels as d_labels
import rocksky_api/drizzle/schema/discogs_tracks as d_tracklist
import rocksky_api/lexicon/models
import rocksky_api/schema/discogs_credits
import rocksky_api/schema/discogs_identifiers
import rocksky_api/schema/discogs_masters
import rocksky_api/schema/discogs_release_artists
import rocksky_api/schema/discogs_release_labels
import rocksky_api/schema/discogs_releases
import rocksky_api/schema/discogs_tracks
import rocksky_api/task

pub fn release(r: discogs_releases.DiscogsRelease) -> models.AlbumDiscogsView {
  models.AlbumDiscogsView(
    ..models.new_album_discogs_view(),
    release_id: Some(r.discogs_id),
    master_id: r.master_id,
    title: Some(r.title),
    artist: Some(r.artist),
    album_art: r.album_art,
    year: r.year,
    original_year: r.original_year,
    release_date: r.release_date,
    country: r.country,
    label: r.label,
    catalog_number: r.catalog_number,
    barcode: r.barcode,
    formats: r.formats,
    genres: r.genres,
    styles: r.styles,
    url: r.discogs_url,
    score: option.map(r.score, fn(v) { float.round(v *. 100.0) }),
  )
}

pub fn credit(
  r: discogs_credits.DiscogsCredit,
) -> models.AlbumDiscogsCreditView {
  models.AlbumDiscogsCreditView(
    artist_id: r.artist_id,
    name: Some(r.name),
    role: r.role,
    tracks: r.tracks,
  )
}

pub fn track(r: discogs_tracks.DiscogsTrack) -> models.AlbumDiscogsTrackView {
  models.AlbumDiscogsTrackView(
    position: r.position,
    type_: r.type_,
    title: Some(r.title),
    duration: r.duration,
    duration_ms: r.duration_ms,
    disc_number: r.disc_number,
    track_number: r.track_number,
  )
}

pub fn label(
  r: discogs_release_labels.DiscogsReleaseLabel,
) -> models.AlbumDiscogsLabelView {
  models.AlbumDiscogsLabelView(
    label_id: r.label_id,
    name: Some(r.name),
    catalog_number: r.catalog_number,
    kind: Some(r.kind),
    entity_type: r.entity_type,
  )
}

pub fn identifier(
  r: discogs_identifiers.DiscogsIdentifier,
) -> models.AlbumDiscogsIdentifierView {
  models.AlbumDiscogsIdentifierView(
    type_: Some(r.type_),
    value: r.value,
    description: r.description,
  )
}

pub fn artist(
  r: discogs_release_artists.DiscogsReleaseArtist,
) -> models.AlbumDiscogsArtistView {
  models.AlbumDiscogsArtistView(
    artist_id: r.artist_id,
    name: Some(r.name),
    anv: r.anv,
    join_phrase: r.join_phrase,
    role: r.role,
  )
}

pub fn master(
  r: discogs_masters.DiscogsMaster,
) -> models.AlbumDiscogsMasterView {
  models.AlbumDiscogsMasterView(
    master_id: Some(r.discogs_id),
    title: Some(r.title),
    artist: r.artist,
    year: r.year,
    main_release_id: r.main_release_id,
    url: r.discogs_url,
    genres: r.genres,
    styles: r.styles,
  )
}

fn nonempty(items) {
  case items {
    [] -> None
    _ -> Some(items)
  }
}

pub fn retrieve(ctx: Context, r: discogs_releases.DiscogsRelease) {
  let credits_table = d_credits.table()
  use credits <- task.then(
    from(credits_table)
    |> where(eq(d_credits.release_id(credits_table), r.id))
    |> order_by([asc(d_credits.position(credits_table))])
    |> all(ctx.read_db)
    |> task.map(list.map(_, credit)),
  )
  let tracklist_table = d_tracklist.table()
  use tracklist <- task.then(
    from(tracklist_table)
    |> where(eq(d_tracklist.release_id(tracklist_table), r.id))
    |> order_by([asc(d_tracklist.idx(tracklist_table))])
    |> all(ctx.read_db)
    |> task.map(list.map(_, track)),
  )
  let labels_table = d_labels.table()
  use labels <- task.then(
    from(labels_table)
    |> where(eq(d_labels.release_id(labels_table), r.id))
    |> order_by([
      asc(d_labels.kind(labels_table)),
      asc(d_labels.position(labels_table)),
    ])
    |> all(ctx.read_db)
    |> task.map(list.map(_, label)),
  )
  let identifiers_table = d_identifiers.table()
  use identifiers <- task.then(
    from(identifiers_table)
    |> where(eq(d_identifiers.release_id(identifiers_table), r.id))
    |> order_by([asc(d_identifiers.position(identifiers_table))])
    |> all(ctx.read_db)
    |> task.map(list.map(_, identifier)),
  )
  let artists_table = d_artists.table()
  use artists <- task.then(
    from(artists_table)
    |> where(eq(d_artists.release_id(artists_table), r.id))
    |> order_by([asc(d_artists.position(artists_table))])
    |> all(ctx.read_db)
    |> task.map(list.map(_, artist)),
  )
  use master <- task.map(case r.master_id {
    None -> task.ok(None)
    Some(id) -> {
      let table = dm.table()
      from(table)
      |> where(eq(dm.discogs_id(table), id))
      |> one(ctx.read_db)
      |> task.map(option.map(_, master))
    }
  })
  models.AlbumDiscogsView(
    ..release(r),
    credits: nonempty(credits),
    tracklist: nonempty(tracklist),
    labels: nonempty(labels),
    identifiers: nonempty(identifiers),
    artists: nonempty(artists),
    master: master,
  )
}
