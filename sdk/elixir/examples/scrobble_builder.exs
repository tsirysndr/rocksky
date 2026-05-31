# Submit a scrobble using the chainable builder API.
#
#   ROCKSKY_TOKEN=eyJ... mix run examples/scrobble_builder.exs

alias Rocksky.Scrobble.Builder, as: Scrobble

token = System.get_env("ROCKSKY_TOKEN") || raise "set ROCKSKY_TOKEN"

client =
  Rocksky.new(
    base_url: System.get_env("ROCKSKY_BASE_URL", "https://api.rocksky.app"),
    token: token
  )

result =
  Scrobble.new(title: "In Bloom", artist: "Nirvana")
  |> Scrobble.album("Nevermind")
  |> Scrobble.album_art("https://i.scdn.co/image/...")
  |> Scrobble.year(1991)
  |> Scrobble.track_number(2)
  |> Scrobble.spotify_link("https://open.spotify.com/track/...")
  |> Scrobble.timestamp(System.system_time(:second))
  |> Scrobble.submit(client)

case result do
  {:ok, _} -> IO.puts("ok: scrobble queued")
  {:error, err} -> IO.warn("failed: " <> Exception.message(err))
end
