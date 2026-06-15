defmodule Rocksky.Rockbox do
  @moduledoc "`app.rocksky.rockbox.*` — Rockbox audio settings. Require an authenticated client."

  alias Rocksky.HTTP

  @doc "Get the authenticated user's Rockbox audio settings."
  def get_audio_settings(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.rockbox.getAudioSettings", params)

  @doc """
  Upsert Rockbox audio settings. Only provided sections are merged.

  Body keys: `:crossfade`, `:equalizer`, `:replayGain`, `:tone`.
  """
  def put_audio_settings(client, body \\ %{}),
    do: HTTP.procedure(client, "app.rocksky.rockbox.putAudioSettings", [], Map.new(body))
end
