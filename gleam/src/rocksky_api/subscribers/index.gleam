import rocksky_api/context.{type Context}
import rocksky_api/subscribers/playlist
import rocksky_api/subscribers/scrobble
import rocksky_api/subscribers/status
import rocksky_api/subscribers/track
import rocksky_api/subscribers/user

pub fn start(ctx: Context) {
  let playlists = playlist.start(ctx)
  let tracks = track.start(ctx)
  let users = user.start(ctx)
  let scrobbles = scrobble.start(ctx)
  let statuses = status.start(ctx, status.new())
  [playlists.0, playlists.1, tracks, users, scrobbles, statuses.0, statuses.1]
}
