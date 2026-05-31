defmodule Rocksky.Scrobble.Builder do
  @moduledoc """
  Builder for `app.rocksky.scrobble.createScrobble`.

  ## Example

      alias Rocksky.Scrobble.Builder, as: Scrobble

      Scrobble.new(title: "In Bloom", artist: "Nirvana")
      |> Scrobble.album("Nevermind")
      |> Scrobble.album_art("https://...")
      |> Scrobble.timestamp(System.system_time(:second))
      |> Scrobble.submit(client)

  The lighter-weight one-shot `Rocksky.Scrobble.create_scrobble/2` is still
  available if you prefer a keyword list.
  """

  use Rocksky.Builder,
    nsid: "app.rocksky.scrobble.createScrobble",
    required: [:title, :artist],
    optional: [
      :album,
      :duration,
      :mbId,
      :isrc,
      :albumArt,
      :trackNumber,
      :releaseDate,
      :year,
      :discNumber,
      :lyrics,
      :composer,
      :copyrightMessage,
      :label,
      :artistPicture,
      :spotifyLink,
      :lastfmLink,
      :tidalLink,
      :appleMusicLink,
      :youtubeLink,
      :deezerLink,
      :timestamp
    ]
end
