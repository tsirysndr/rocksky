defmodule Rocksky.Playlist do
  @moduledoc """
  `app.rocksky.playlist.*` — the global, AT-Proto-backed playlists.

  Distinct from `Rocksky.Library`, whose playlist functions drive the
  Subsonic/Navidrome library (`app.rocksky.library.*`).

  Writes publish records to the caller's repo, so they take a `token` and only
  appear in reads once the AppView has ingested the commit.
  """

  defp to_bin(nil), do: ""
  defp to_bin(v) when is_binary(v), do: v
  defp to_bin(v), do: to_string(v)

  @doc "The playlist catalog."
  def list(limit \\ 50, offset \\ 0, base \\ ""),
    do: :rocksky.playlists(to_bin(base), limit, offset)

  @doc "A single playlist with its tracks."
  def get(uri, base \\ ""), do: :rocksky.playlist(to_bin(base), to_bin(uri))

  @doc """
  Create a playlist. Returns `%{"uri" => ..., "cid" => ...}`. Pass `""` to omit
  an optional field.
  """
  def create(token, name, description \\ "", picture_url \\ "", base \\ ""),
    do:
      :rocksky.create_playlist(
        to_bin(base),
        to_bin(token),
        to_bin(name),
        to_bin(description),
        to_bin(picture_url)
      )

  @doc "Rename or re-describe a playlist. Owner only; the AT-URI is unchanged."
  def update(token, uri, name \\ "", description \\ "", picture_url \\ "", base \\ ""),
    do:
      :rocksky.update_playlist(
        to_bin(base),
        to_bin(token),
        to_bin(uri),
        to_bin(name),
        to_bin(description),
        to_bin(picture_url)
      )

  @doc """
  Add songs by their `app.rocksky.song` AT-URIs. Owner only. Returns the AT-URIs
  of the created entry records.
  """
  def add_songs(token, uri, songs, base \\ ""),
    do:
      :rocksky.add_songs_to_playlist(
        to_bin(base),
        to_bin(token),
        to_bin(uri),
        Enum.map(songs, &to_bin/1)
      )

  @doc "Remove a song. Only the repo that added an entry can retract it."
  def remove_track(token, uri, song_uri, base \\ ""),
    do:
      :rocksky.remove_playlist_track(
        to_bin(base),
        to_bin(token),
        to_bin(uri),
        to_bin(song_uri)
      )

  @doc "Delete a playlist and the caller's own entries. Owner only."
  def remove(token, uri, base \\ ""),
    do: :rocksky.remove_playlist(to_bin(base), to_bin(token), to_bin(uri))

  @doc """
  Escape hatch — call any `app.rocksky.*` procedure whose arguments ride the
  query string.
  """
  def post(nsid, params \\ %{}, base \\ "", token \\ ""),
    do: :rocksky.post(to_bin(nsid), params, to_bin(base), to_bin(token))
end
