@module("../consts") external apiUrl: string = "API_URL"

@genType
type playlist = {
  id: string,
  name: string,
  picture: string,
  description?: string,
  uri?: string,
  spotifyLink?: string,
  tidalLink?: string,
  appleMusicLink?: string,
  trackCount: float,
}

type playlistsResponse = {playlists: array<playlist>}

// NOTE: the old module's `getPlaylist` (single playlist with tracks) was dead —
// usePlaylistQuery actually called getPlaylists, and the live single-playlist
// fetch lives on the inline usePlaylists hook against a different endpoint. Only
// the live `getPlaylists` is migrated here.
@genType
let getPlaylists = async (did: string): array<playlist> => {
  let res: Axios.response<playlistsResponse> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.actor.getActorPlaylists",
    {headers: Dict.make(), params: {"did": did}},
  )
  res.data.playlists
}
