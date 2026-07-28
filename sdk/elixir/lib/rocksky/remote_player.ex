defmodule Rocksky.RemotePlayer do
  @moduledoc """
  Build a Rocksky-controllable player over the remote-control WebSocket
  (see `remote-ws/PROTOCOL.md`).

  `connect/2,3` registers as a device in the background; you advertise what
  you're playing (`set_now_playing/2`, `set_status/2`, `set_queue/3`) and react
  to commands a miniplayer sends (play/pause/next/previous/seek/enqueue/queue
  actions). Heartbeat, reconnect, and the device-id handshake are handled by the
  native core.

  Poll `next_command/1` in a loop, or let `listen/2` do it for you and dispatch
  each command to a handler map:

      player = Rocksky.RemotePlayer.connect(token, "My Player")

      Rocksky.RemotePlayer.listen(player, %{
        play: fn -> engine_play() end,
        pause: fn -> engine_pause() end,
        next: fn -> engine_next() end,
        seek: fn ms -> engine_seek(ms) end,
        enqueue: fn cmd -> engine_enqueue(cmd["tracks"], cmd["mode"]) end
      })

      Rocksky.RemotePlayer.set_now_playing(player, %{
        "title" => "Chaser", "artist" => "Calibro 35",
        "durationMs" => 182_320, "elapsedMs" => 0, "isPlaying" => true
      })
      Rocksky.RemotePlayer.set_status(player, "playing")

  The handle is an opaque NIF resource (freed by GC); `disconnect/1` just stops
  the background task. Setters return `{:ok, value}` | `{:error, message}`.
  Records/queue items are maps with camelCase string keys.
  """

  @doc """
  Connect and register a controllable player. `name` is the miniplayer
  device-picker label; `url` overrides the WebSocket endpoint (`nil` = public).
  Returns the opaque player handle.
  """
  def connect(token, name, url \\ nil)

  def connect(token, name, nil),
    do: :rocksky_remote_player.connect(to_bin(token), to_bin(name))

  def connect(token, name, url),
    do: :rocksky_remote_player.connect(to_bin(token), to_bin(name), to_bin(url))

  @doc """
  Advertise the currently-playing track. `track` is a map with camelCase string
  keys: `"title"`, `"artist"`, and optional `"album"`, `"albumArtist"`,
  `"albumArt"`, `"durationMs"`, `"elapsedMs"`, `"isPlaying"`. Call it whenever
  the track changes, and periodically with a fresh `"elapsedMs"` so controllers
  show smooth progress.
  """
  def set_now_playing(handle, track) when is_map(track),
    do: :rocksky_remote_player.set_now_playing(handle, track)

  @doc ~S(Advertise transport status: `"playing"`, `"paused"`, or `"stopped"`.)
  def set_status(handle, status),
    do: :rocksky_remote_player.set_status(handle, to_bin(status))

  @doc """
  Advertise the playback queue + active `index`. `items` is a list of queue-item
  maps (camelCase string keys); `index` is 0-based.
  """
  def set_queue(handle, items, index) when is_list(items),
    do: :rocksky_remote_player.set_queue(handle, items, index)

  @doc """
  Block until the next controller command, returned as a decoded command map
  (e.g. `%{"action" => "play"}` or `%{"action" => "seek", "position" => ms}`).
  Returns `nil` once the player is disconnected.
  """
  def next_command(handle) do
    case :rocksky_remote_player.next_command(handle) do
      :undefined -> nil
      {:error, _} -> nil
      command when is_map(command) -> command
      _ -> nil
    end
  end

  @doc "Disconnect and stop the background task (the handle stays valid until GC'd)."
  def disconnect(handle),
    do: :rocksky_remote_player.disconnect(handle)

  @doc """
  Spawn a process that loops `next_command/1` and dispatches each command to the
  matching function in `handlers`. Returns `{:ok, pid}`. The loop ends when the
  player disconnects.

  `handlers` is a map keyed by command:

    * `:play`, `:pause`, `:next`, `:previous` — 0-arity functions
    * `:seek` — receives the position in ms
    * `:queue_jump`, `:queue_remove` — receive the queue index
    * `:enqueue` — receives the full command map
      (`"tracks"`, `"mode"`, `"shuffle"`, `"startIndex"`)

  Unhandled commands are ignored.
  """
  def listen(handle, handlers) when is_map(handlers),
    do: Task.start(fn -> listen_loop(handle, handlers) end)

  defp listen_loop(handle, handlers) do
    case next_command(handle) do
      nil ->
        :ok

      command ->
        dispatch(command, handlers)
        listen_loop(handle, handlers)
    end
  end

  defp dispatch(%{"action" => action} = command, handlers) do
    case action do
      "play" -> invoke(handlers, :play, [])
      "pause" -> invoke(handlers, :pause, [])
      "next" -> invoke(handlers, :next, [])
      "previous" -> invoke(handlers, :previous, [])
      "seek" -> invoke(handlers, :seek, [Map.get(command, "position", 0)])
      "queue_jump" -> invoke(handlers, :queue_jump, [Map.get(command, "index", 0)])
      "queue_remove" -> invoke(handlers, :queue_remove, [Map.get(command, "index", 0)])
      "enqueue" -> invoke(handlers, :enqueue, [command])
      _ -> :ok
    end
  end

  defp dispatch(_, _), do: :ok

  defp invoke(handlers, key, args) do
    case Map.get(handlers, key) do
      fun when is_function(fun) -> apply(fun, args)
      _ -> :ok
    end
  end

  defp to_bin(nil), do: ""
  defp to_bin(s) when is_binary(s), do: s
  defp to_bin(s), do: to_string(s)
end
