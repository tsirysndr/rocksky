defmodule Rocksky.Core do
  @moduledoc """
  Native core bindings for Rocksky.

  A thin wrapper over the `:rocksky_erl` NIF package (the shared Rust core,
  `rocksky-sdk`): AT Protocol PDS **writes** (scrobble fan-out, like, follow,
  shout), AppView reads, and the identity hashes shared across every Rocksky SDK.
  This is the write + dedup side; `Rocksky.Client` is the read/HTTP side.

  Reads/writes return `{:ok, value}` | `{:error, message}` with binary-keyed
  maps (the wire shape). Records passed to the write verbs are maps with
  camelCase binary keys — `"title"`, `"artist"`, `"album"`, `"albumArtist"`,
  `"durationMs"`, …

      {:ok, stats} = Rocksky.Core.global_stats()
      Rocksky.Core.song_hash("Chaser", "Calibro 35", "Jazzploitation")
  """

  # ---- reads (unauthenticated) --------------------------------------------

  @doc "An actor's detailed profile."
  def profile(actor, base \\ ""), do: :rocksky.profile(to_bin(actor), to_bin(base))

  @doc "An actor's scrobbles, newest first."
  def scrobbles(actor, limit \\ 50, offset \\ 0, base \\ ""),
    do: :rocksky.scrobbles(to_bin(actor), limit, offset, to_bin(base))

  @doc "Platform-wide top tracks chart. `base` overrides the AppView URL."
  def top_tracks(limit \\ 50, offset \\ 0, base \\ ""),
    do: :rocksky.top_tracks(limit, offset, to_bin(base))

  @doc "Platform-wide totals."
  def global_stats(base \\ ""), do: :rocksky.global_stats(to_bin(base))

  @doc "Identity hash of a song — identical across every Rocksky SDK."
  def song_hash(title, artist, album),
    do: :rocksky.song_hash(to_bin(title), to_bin(artist), to_bin(album))

  # ---- authenticated agent -------------------------------------------------

  @doc """
  Log in with an app password, persisting the session at `session_path`.
  Returns an opaque agent handle (a NIF resource freed by GC).
  """
  def login(session_path, identifier, password, appview \\ ""),
    do:
      :rocksky.agent_login(
        to_bin(session_path),
        to_bin(identifier),
        to_bin(password),
        to_bin(appview)
      )

  @doc "Scrobble a play (fans out to artist/album/song/scrobble). Returns the URIs."
  def scrobble(agent, track), do: :rocksky.agent_scrobble(agent, track)

  @doc "Like a record by strong reference."
  def like(agent, uri, cid), do: :rocksky.agent_like(agent, to_bin(uri), to_bin(cid))

  @doc "Follow an account by DID."
  def follow(agent, did), do: :rocksky.agent_follow(agent, to_bin(did))

  @doc "Post a shout on a subject."
  def shout(agent, subject_uri, subject_cid, message),
    do: :rocksky.agent_shout(agent, to_bin(subject_uri), to_bin(subject_cid), to_bin(message))

  @doc "Proactively refresh the session (keep-alive)."
  def refresh_session(agent), do: :rocksky.agent_refresh_session(agent)

  defp to_bin(s) when is_binary(s), do: s
  defp to_bin(s), do: to_string(s)
end
