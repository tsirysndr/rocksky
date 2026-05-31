defmodule Rocksky.Player do
  @moduledoc "`app.rocksky.player.*` endpoints — remote control of a Rocksky player."

  alias Rocksky.HTTP

  @doc "Currently playing track. Params: `:playerId`, `:actor`."
  def get_currently_playing(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.player.getCurrentlyPlaying", params)

  @doc "Playback queue. Params: `:playerId`."
  def get_playback_queue(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.player.getPlaybackQueue", params)

  @doc "Resume playback. Params: `:playerId`."
  def play(client, params \\ []),
    do: HTTP.procedure(client, "app.rocksky.player.play", params)

  @doc "Pause playback. Params: `:playerId`."
  def pause(client, params \\ []),
    do: HTTP.procedure(client, "app.rocksky.player.pause", params)

  @doc "Skip to next track. Params: `:playerId`."
  def next(client, params \\ []),
    do: HTTP.procedure(client, "app.rocksky.player.next", params)

  @doc "Go to previous track. Params: `:playerId`."
  def previous(client, params \\ []),
    do: HTTP.procedure(client, "app.rocksky.player.previous", params)

  @doc "Seek to position (ms). Params: `:playerId`, `:position`."
  def seek(client, params \\ []),
    do: HTTP.procedure(client, "app.rocksky.player.seek", params)

  @doc "Play a single file. Params: `:playerId`, `:fileId`."
  def play_file(client, params \\ []),
    do: HTTP.procedure(client, "app.rocksky.player.playFile", params)

  @doc "Play a directory. Params: `:playerId`, `:directoryId`, `:shuffle`, `:recurse`, `:position`."
  def play_directory(client, params \\ []),
    do: HTTP.procedure(client, "app.rocksky.player.playDirectory", params)

  @doc "Append items to the queue. Params: `:playerId`, `:items`, `:position`, `:shuffle`."
  def add_items_to_queue(client, params \\ []),
    do: HTTP.procedure(client, "app.rocksky.player.addItemsToQueue", params)
end
