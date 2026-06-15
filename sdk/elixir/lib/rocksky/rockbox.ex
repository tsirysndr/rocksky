defmodule Rocksky.Rockbox do
  @moduledoc "`app.rocksky.rockbox.*` — Rockbox audio settings."

  alias Rocksky.HTTP

  @doc """
  Get Rockbox audio settings.

  Pass `did:` to fetch any user's settings publicly (no auth needed).
  Omit `did:` (or pass an empty list) to fetch the authenticated caller's own settings.
  """
  def get_audio_settings(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.rockbox.getAudioSettings", params)

  @doc """
  Upsert Rockbox audio settings. Only provided sections are merged.

  Body keys: `:crossfade`, `:equalizer`, `:replayGain`, `:tone`.
  """
  def put_audio_settings(client, body \\ %{}),
    do: HTTP.procedure(client, "app.rocksky.rockbox.putAudioSettings", [], Map.new(body))
end
