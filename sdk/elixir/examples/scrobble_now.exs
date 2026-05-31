# Submit a scrobble. Requires an authenticated client.
#
#   ROCKSKY_TOKEN=eyJ... mix run examples/scrobble_now.exs

token = System.get_env("ROCKSKY_TOKEN") || raise "set ROCKSKY_TOKEN"

client =
  Rocksky.new(
    base_url: System.get_env("ROCKSKY_BASE_URL", "https://api.rocksky.app"),
    token: token
  )

case Rocksky.Scrobble.create_scrobble(client,
       title: "In Bloom",
       artist: "Nirvana",
       album: "Nevermind",
       timestamp: System.system_time(:second)
     ) do
  {:ok, _body} -> IO.puts("ok: scrobble queued")
  {:error, err} -> IO.warn("failed: " <> Exception.message(err))
end
