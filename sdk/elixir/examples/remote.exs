# RemotePlayer + RemoteController tour over the remote-control WebSocket.
#
#   ROCKSKY_ERL_PATH=../erlang ROCKSKY_TOKEN=<jwt> mix run examples/remote.exs
#
# Needs the native lib built with the remote-player feature (../erlang/build-core.sh)
# and a Rocksky access token (JWT) in $ROCKSKY_TOKEN.

token =
  case System.get_env("ROCKSKY_TOKEN") do
    nil ->
      IO.puts("set ROCKSKY_TOKEN to a Rocksky access token")
      System.halt(1)

    t ->
      t
  end

# --- player: advertise what we're "playing" and react to commands ---
player = Rocksky.RemotePlayer.connect(token, "Elixir Player")

Rocksky.RemotePlayer.listen(player, %{
  play: fn -> IO.puts("player: play") end,
  pause: fn -> IO.puts("player: pause") end,
  next: fn -> IO.puts("player: next") end,
  previous: fn -> IO.puts("player: previous") end,
  seek: fn ms -> IO.puts("player: seek #{ms}ms") end,
  enqueue: fn cmd -> IO.puts("player: enqueue #{length(cmd["tracks"])} track(s)") end
})

{:ok, _} =
  Rocksky.RemotePlayer.set_now_playing(player, %{
    "title" => "Chaser",
    "artist" => "Calibro 35",
    "album" => "Jazzploitation",
    "albumArtist" => "Calibro 35",
    "durationMs" => 182_320,
    "elapsedMs" => 0,
    "isPlaying" => true
  })

{:ok, _} = Rocksky.RemotePlayer.set_status(player, "playing")

{:ok, _} =
  Rocksky.RemotePlayer.set_queue(
    player,
    [%{"title" => "Chaser", "artist" => "Calibro 35", "durationMs" => 182_320}],
    0
  )

# --- controller: observe devices and drive the primary ---
ctl = Rocksky.RemoteController.connect(token, "Elixir Controller")

Rocksky.RemoteController.listen(ctl, %{
  devices: fn e -> IO.puts("controller: #{length(e["devices"])} device(s)") end,
  now_playing: fn e -> IO.puts("controller: now playing on #{e["deviceId"]}") end
})

# broadcast a pause to every device (nil target), then seek the player.
{:ok, _} = Rocksky.RemoteController.pause(ctl)
{:ok, _} = Rocksky.RemoteController.seek(ctl, nil, 42_000)

IO.puts("listening for 10s...")
Process.sleep(10_000)

Rocksky.RemoteController.disconnect(ctl)
Rocksky.RemotePlayer.disconnect(player)
IO.puts("done")
