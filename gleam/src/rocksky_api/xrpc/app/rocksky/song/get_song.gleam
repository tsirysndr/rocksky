import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, all_columns, asc, count as db_count, eq, eq_columns, field, from,
  in_array, left_join, map, nested, nullable, one, optional_selection, or,
  order_by, pair, required, select, where,
}
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/user_tracks as ut
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/models.{type SongViewDetailed, SongViewDetailed}
import rocksky_api/lib/helpers
import rocksky_api/lib/track_likes
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/schema/artists.{type Artist}
import rocksky_api/schema/tracks.{type Track}
import rocksky_api/task.{type Task}
import rocksky_api/views/artist
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.song.getSong",
    Some(auth.verifier(ctx)),
    fn(req) {
      let options =
        handler.options("getSong") |> handler.on_error(handler.Propagate)
      use params <- handler.query(
        req,
        options,
        models.song_get_song_params_decoder(),
      )
      use view <- task.map(retrieve(ctx, params, handler.caller(req)))
      models.encode_song_view_detailed(view)
    },
  )
}

type FirstScrobble {
  FirstScrobble(handle: String, avatar: String, timestamp: String)
}

fn retrieve(
  ctx: Context,
  params: models.SongGetSongParams,
  did: Option(String),
) -> Task(SongViewDetailed) {
  let uri = helpers.non_empty(params.uri)
  let mbid = helpers.non_empty(params.mbid)
  let isrc = helpers.non_empty(params.isrc)
  let spotify = helpers.non_empty(params.spotify_id)
  let identifiers =
    list.filter_map([uri, mbid, isrc, spotify], option.to_result(_, Nil))
  case identifiers {
    [] ->
      task.fail(error.InvalidRequest(
        "getSong requires one of: uri, mbid, isrc, spotifyId",
      ))
    [identifier, ..] -> {
      let tracks = t.table()
      let artists = a.table()
      let user_tracks = ut.table()
      let scrobbles = sc.table()
      let users = u.table()
      use user_track <- task.then(case uri {
        None -> task.ok(None)
        Some(uri) ->
          select(user_tracks, field("track_id", ut.track_id(user_tracks)))
          |> where(eq(ut.uri(user_tracks), Some(uri)))
          |> one(ctx.read_db)
      })
      let clauses =
        list.filter_map(
          [
            option.map(user_track, eq(t.id(tracks), _)),
            option.map(uri, fn(v) { eq(t.uri(tracks), Some(v)) }),
            option.map(mbid, fn(v) { eq(t.mb_id(tracks), Some(v)) }),
            option.map(isrc, fn(v) { eq(t.isrc(tracks), Some(v)) }),
            option.map(spotify, fn(v) {
              eq(
                t.spotify_link(tracks),
                Some("https://open.spotify.com/track/" <> v),
              )
            }),
          ],
          option.to_result(_, Nil),
        )
      use #(track, artist) <- task.then(
        select(
          tracks,
          pair(
            nested("track", all_columns(tracks)),
            nested("artist", optional_selection(all_columns(artists))),
          ),
        )
        |> left_join(artists, eq_columns(t.artist_uri(tracks), a.uri(artists)))
        |> where(or(clauses))
        |> required(ctx.read_db, "Song not found: " <> identifier),
      )
      let names = string.split(track.artist, ",") |> list.map(string.trim)
      use credits <- task.then(
        from(artists)
        |> where(in_array(a.name(artists), list.unique(names)))
        |> all(ctx.read_db),
      )
      let credits =
        list.filter_map(names, fn(name) {
          list.find(credits, fn(a) { a.name == name })
        })
      use #(likes, listeners, plays, first) <- task.map(task.all4(
        track_likes.for_track_id(ctx, track.id, did),
        select(user_tracks, field("count", db_count()))
          |> where(eq(ut.track_id(user_tracks), track.id))
          |> required(ctx.read_db, "Missing count"),
        select(scrobbles, field("count", db_count()))
          |> where(eq(sc.track_id(scrobbles), Some(track.id)))
          |> required(ctx.read_db, "Missing count"),
        select(
          scrobbles,
          pair(
            pair(
              field("handle", u.handle(users)),
              field("avatar", u.avatar(users)),
            ),
            field("timestamp", sc.timestamp(scrobbles)),
          )
            |> map(fn(value) {
              FirstScrobble(value.0.0, value.0.1, row.iso8601(value.1))
            }),
        )
          |> left_join(
            users,
            eq_columns(sc.user_id(scrobbles), nullable(u.id(users))),
          )
          |> where(eq(sc.track_id(scrobbles), Some(track.id)))
          |> order_by([asc(sc.timestamp(scrobbles))])
          |> one(ctx.read_db),
      ))
      present(track, artist, credits, likes, listeners, plays, first)
    }
  }
}

fn present(
  track: Track,
  artist: Option(Artist),
  track_artists: List(Artist),
  likes: track_likes.Likes,
  listeners: Int,
  count: Int,
  first: Option(FirstScrobble),
) -> SongViewDetailed {
  SongViewDetailed(
    ..models.new_song_view_detailed(),
    id: Some(track.id),
    title: Some(track.title),
    artist: Some(track.artist),
    artist_uri: track.artist_uri,
    album: Some(track.album),
    album_uri: track.album_uri,
    album_art: track.album_art,
    uri: track.uri,
    sha256: Some(track.sha256),
    liked: Some(likes.liked),
    likes_count: Some(likes.likes_count),
    unique_listeners: Some(listeners),
    play_count: Some(count),
    artists: Some(list.map(track_artists, artist.basic)),
    first_scrobble: option.map(first, fn(f) {
      models.SongFirstScrobbleView(
        handle: Some(f.handle),
        avatar: Some(f.avatar),
        timestamp: Some(f.timestamp),
      )
    }),
    mb_id: helpers.non_empty(track.mb_id),
    isrc: helpers.non_empty(track.isrc),
    tags: Some(option.then(artist, fn(a) { a.genres }) |> option.unwrap([])),
    created_at: Some(row.iso8601(track.created_at)),
    updated_at: Some(row.iso8601(track.updated_at)),
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
