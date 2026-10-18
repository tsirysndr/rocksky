import gleam/list
import gleam/option.{type Option, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, all_columns, asc, count as db_count, count_distinct, eq, eq_columns,
  field, from, in_array, inner_join, left_join, map, nested, nullable, one,
  optional_selection, order_by, pair, required, select, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models.{
  type ScrobbleViewDetailed, ScrobbleViewDetailed,
}
import rocksky_api/lib/helpers
import rocksky_api/lib/track_likes
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/schema/albums.{type Album}
import rocksky_api/schema/artists.{type Artist}
import rocksky_api/schema/scrobbles.{type Scrobble}
import rocksky_api/schema/tracks.{type Track}
import rocksky_api/schema/users.{type User}
import rocksky_api/task.{type Task}
import rocksky_api/views/artist
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  // Optional auth: the scrobble stays public; a DID only fills in `liked`.
  xrpc_server.method(
    server,
    "app.rocksky.scrobble.getScrobble",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getScrobble"),
        models.get_scrobble_params_decoder(),
      )
      use view <- task.map(retrieve(ctx, params.uri, handler.caller(req)))
      models.encode_scrobble_view_detailed(view)
    },
  )
}

type Joined {
  Joined(
    scrobble: Scrobble,
    track: Track,
    user: User,
    album: Option(Album),
    artist: Option(Artist),
  )
}

type FirstScrobble {
  FirstScrobble(handle: String, avatar: String, timestamp: String)
}

fn retrieve(
  ctx: Context,
  uri: String,
  did: Option(String),
) -> Task(ScrobbleViewDetailed) {
  let scrobbles = sc.table()
  let tracks = t.table()
  let users = u.table()
  let albums = al.table()
  let artists = ar.table()
  let selection =
    pair(
      pair(
        nested("scrobble", all_columns(scrobbles)),
        nested("track", all_columns(tracks)),
      ),
      pair(
        nested("user", all_columns(users)),
        pair(
          nested("album", optional_selection(all_columns(albums))),
          nested("artist", optional_selection(all_columns(artists))),
        ),
      ),
    )
    |> map(fn(v) { Joined(v.0.0, v.0.1, v.1.0, v.1.1.0, v.1.1.1) })
  use joined <- task.then(
    select(scrobbles, selection)
    |> inner_join(
      tracks,
      eq_columns(sc.track_id(scrobbles), nullable(t.id(tracks))),
    )
    |> inner_join(
      users,
      eq_columns(sc.user_id(scrobbles), nullable(u.id(users))),
    )
    |> left_join(
      albums,
      eq_columns(sc.album_id(scrobbles), nullable(al.id(albums))),
    )
    |> left_join(
      artists,
      eq_columns(sc.artist_id(scrobbles), nullable(ar.id(artists))),
    )
    |> where(eq(sc.uri(scrobbles), Some(uri)))
    |> required(ctx.db, "Scrobble not found: " <> uri),
  )
  let track_id = joined.track.id
  let artist_names =
    joined.track.artist |> string.split(",") |> list.map(string.trim)
  use #(track_artists, likes, #(listeners, count), first) <- task.map(task.all4(
    from(artists)
      |> where(in_array(ar.name(artists), artist_names))
      |> all(ctx.db)
      |> task.map(fn(found) {
        // Keep the track's credit order.
        list.filter_map(artist_names, fn(name) {
          list.find(found, fn(a) { a.name == name })
        })
      }),
    track_likes.for_track_id(ctx, track_id, did),
    select(
      scrobbles,
      pair(
        field("listeners", count_distinct(sc.user_id(scrobbles))),
        field("plays", db_count()),
      ),
    )
      |> where(eq(sc.track_id(scrobbles), Some(track_id)))
      |> required(ctx.db, "counts"),
    select(
      scrobbles,
      pair(
        pair(field("handle", u.handle(users)), field("avatar", u.avatar(users))),
        field("timestamp", sc.timestamp(scrobbles)),
      )
        |> map(fn(v) { FirstScrobble(v.0.0, v.0.1, row.iso8601(v.1)) }),
    )
      |> left_join(
        users,
        eq_columns(sc.user_id(scrobbles), nullable(u.id(users))),
      )
      |> where(eq(sc.track_id(scrobbles), Some(track_id)))
      |> order_by([asc(sc.timestamp(scrobbles))])
      |> one(ctx.db),
  ))
  present(joined, track_artists, likes, listeners, count, first)
}

fn present(
  joined: Joined,
  track_artists: List(Artist),
  likes: track_likes.Likes,
  listeners: Int,
  count: Int,
  first: Option(FirstScrobble),
) -> ScrobbleViewDetailed {
  let Joined(scrobble:, track:, user:, album:, artist:) = joined
  ScrobbleViewDetailed(
    ..models.new_scrobble_view_detailed(),
    id: Some(scrobble.id),
    user: Some(user.handle),
    title: Some(track.title),
    artist: Some(track.artist),
    artist_uri: track.artist_uri,
    album: Some(track.album),
    album_uri: option.then(album, fn(a) { a.uri }),
    cover: track.album_art,
    date: Some(row.iso8601(scrobble.timestamp)),
    uri: scrobble.uri,
    sha256: Some(track.sha256),
    liked: Some(likes.liked),
    track_uri: track.uri,
    likes_count: Some(likes.likes_count),
    listeners: Some(listeners),
    scrobbles: Some(count),
    artists: Some(list.map(track_artists, artist.basic)),
    first_scrobble: option.map(first, fn(f) {
      models.ScrobbleFirstScrobbleView(
        handle: Some(f.handle),
        avatar: Some(f.avatar),
        timestamp: Some(f.timestamp),
      )
    }),
    mb_id: helpers.non_empty(track.mb_id),
    isrc: helpers.non_empty(track.isrc),
    tags: Some(option.then(artist, fn(a) { a.genres }) |> option.unwrap([])),
    created_at: Some(row.iso8601(scrobble.created_at)),
    updated_at: Some(row.iso8601(scrobble.updated_at)),
    album_artist: Some(track.album_artist),
    track_number: track.track_number,
    duration: Some(track.duration),
    youtube_link: track.youtube_link,
    spotify_link: track.spotify_link,
    apple_music_link: track.apple_music_link,
    tidal_link: track.tidal_link,
    disc_number: track.disc_number,
    lyrics: track.lyrics,
    composer: track.composer,
    genre: track.genre,
    label: track.label,
    copyright_message: track.copyright_message,
    key: track.key,
    acoustid_fingerprint: track.acoustid_fingerprint,
    xata_version: track.xata_version,
    bpm: track.bpm,
  )
}
