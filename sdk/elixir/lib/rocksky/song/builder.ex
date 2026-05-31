defmodule Rocksky.Song.Builder do
  @moduledoc """
  Builder for `app.rocksky.song.createSong`.

  ## Example

      alias Rocksky.Song.Builder, as: Song

      Song.new(title: "Lithium", artist: "Nirvana")
      |> Song.album("Nevermind")
      |> Song.duration(257_000)
      |> Song.isrc("USDW19811234")
      |> Song.submit(client)
  """

  use Rocksky.Builder,
    nsid: "app.rocksky.song.createSong",
    required: [:title, :artist],
    optional: [
      :albumArtist,
      :album,
      :duration,
      :mbId,
      :isrc,
      :albumArt,
      :trackNumber,
      :releaseDate,
      :year,
      :discNumber,
      :lyrics
    ]
end
