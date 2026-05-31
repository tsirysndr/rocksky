defmodule Rocksky.Spotify do
  @moduledoc "`app.rocksky.spotify.*` endpoints — Spotify remote control for the authenticated user."

  alias Rocksky.HTTP

  @doc "Currently playing on Spotify. Params: `:actor`."
  def get_currently_playing(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.spotify.getCurrentlyPlaying", params)

  @doc "Resume Spotify playback."
  def play(client, params \\ []),
    do: HTTP.procedure(client, "app.rocksky.spotify.play", params)

  @doc "Pause Spotify playback."
  def pause(client, params \\ []),
    do: HTTP.procedure(client, "app.rocksky.spotify.pause", params)

  @doc "Skip to next track."
  def next(client, params \\ []),
    do: HTTP.procedure(client, "app.rocksky.spotify.next", params)

  @doc "Go to previous track."
  def previous(client, params \\ []),
    do: HTTP.procedure(client, "app.rocksky.spotify.previous", params)

  @doc "Seek to position (ms). Params: `:position`."
  def seek(client, params \\ []),
    do: HTTP.procedure(client, "app.rocksky.spotify.seek", params)
end
