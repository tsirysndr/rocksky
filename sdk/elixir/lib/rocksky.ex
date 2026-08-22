defmodule Rocksky do
  @moduledoc """
  Official Elixir SDK for Rocksky.

  A thin wrapper over the `:rocksky_erl` Rustler NIF (the shared Rust core,
  `rocksky-sdk`): AppView reads, AT Protocol PDS writes (scrobble fan-out, like,
  follow, shout) and the identity hashes — the same engine behind every Rocksky
  SDK.

  Reads/writes return `{:ok, value}` | `{:error, message}` with binary-keyed
  maps (the wire shape). Records passed to the write verbs are maps with
  camelCase binary keys — `"title"`, `"artist"`, `"album"`, `"albumArtist"`,
  `"durationMs"`, …

      {:ok, stats} = Rocksky.global_stats()
      Rocksky.song_hash("Chaser", "Calibro 35", "Jazzploitation")
  """

  # ---- reads (unauthenticated; trailing base overrides the AppView URL) ----

  @doc "An actor's detailed profile."
  def profile(actor, base \\ ""), do: :rocksky.profile(to_bin(actor), to_bin(base))

  @doc "An actor's scrobbles, newest first."
  def scrobbles(actor, limit \\ 50, offset \\ 0, base \\ ""),
    do: :rocksky.scrobbles(to_bin(actor), limit, offset, to_bin(base))

  @doc "Platform-wide top tracks chart."
  def top_tracks(limit \\ 50, offset \\ 0, base \\ ""),
    do: :rocksky.top_tracks(limit, offset, to_bin(base))

  @doc "Platform-wide totals."
  def global_stats(base \\ ""), do: :rocksky.global_stats(to_bin(base))

  @doc """
  Universal read escape hatch — call any `app.rocksky.*` query by nsid.

  `params` is a map of string params; the whole read-query catalog is reachable.

      Rocksky.get("app.rocksky.album.getAlbum", %{"uri" => uri})
      Rocksky.get("app.rocksky.charts.getScrobblesChart", %{"did" => did})
  """
  def get(nsid, params \\ %{}, base \\ "", token \\ ""),
    do: :rocksky.get(to_bin(nsid), params, to_bin(base), to_bin(token))

  @doc """
  Songs catalog (`app.rocksky.song.getSongs`) with optional `genre` and RSQL
  `filter` — a `Rocksky.Filter` or a raw RSQL binary.

      Rocksky.catalog_songs(50, 0, nil, Rocksky.Filter.eq(:artist, "Daft Punk"))
  """
  def catalog_songs(limit \\ 50, offset \\ 0, genre \\ nil, filter \\ nil, base \\ ""),
    do: get("app.rocksky.song.getSongs", catalog_params(limit, offset, genre, filter), base)

  @doc "Artists catalog (`app.rocksky.artist.getArtists`) — see `catalog_songs/5`."
  def catalog_artists(limit \\ 50, offset \\ 0, genre \\ nil, filter \\ nil, base \\ ""),
    do: get("app.rocksky.artist.getArtists", catalog_params(limit, offset, genre, filter), base)

  @doc "Albums catalog (`app.rocksky.album.getAlbums`) — see `catalog_songs/5`."
  def catalog_albums(limit \\ 50, offset \\ 0, genre \\ nil, filter \\ nil, base \\ ""),
    do: get("app.rocksky.album.getAlbums", catalog_params(limit, offset, genre, filter), base)

  @doc """
  Scrobble feed (`app.rocksky.scrobble.getScrobbles`) — the whole platform, one
  actor (`did`), or the accounts an actor follows (`did` + `following: true`).
  `filter` is a `Rocksky.Filter` (dotted selectors like `:"track.artist"` reach
  the joined track/user/artist) or a raw RSQL binary.

      Rocksky.scrobble_feed(nil, false, 50, 0, Rocksky.Filter.eq(:"track.artist", "Daft Punk"))
  """
  def scrobble_feed(
        did \\ nil,
        following \\ false,
        limit \\ 50,
        offset \\ 0,
        filter \\ nil,
        base \\ ""
      ) do
    params =
      %{"limit" => limit, "offset" => offset}
      |> put_param("did", did)
      |> put_param("following", if(following, do: true))
      |> put_param("filter", filter_param(filter))

    get("app.rocksky.scrobble.getScrobbles", params, base)
  end

  defp catalog_params(limit, offset, genre, filter) do
    %{"limit" => limit, "offset" => offset}
    |> put_param("genre", genre)
    |> put_param("filter", filter_param(filter))
  end

  defp put_param(params, _key, nil), do: params
  defp put_param(params, key, value), do: Map.put(params, key, value)

  defp filter_param(nil), do: nil
  defp filter_param(filter), do: Rocksky.Filter.build(filter)

  @doc """
  The authenticated viewer's unread-notification count (`token` required).
  Returns `%{"count" => n}`.
  """
  def unread_count(token, base \\ ""),
    do: :rocksky.unread_count(to_bin(token), to_bin(base))

  @doc """
  The authenticated viewer's notifications, most recent first (`token` required).
  `params` may include `"limit"` (default 30) and `"cursor"`.
  """
  def notifications(token, params \\ %{}, base \\ ""),
    do: :rocksky.notifications(to_bin(token), params, to_bin(base))

  @doc """
  Mark notifications as viewed (`token` required). `ids` is a list of notification
  ids, or `[]` to mark all. Returns `%{"unreadCount" => n}`.
  """
  def update_seen(token, ids \\ [], base \\ ""),
    do: :rocksky.update_seen(to_bin(token), ids, to_bin(base))

  @doc "Resolve full canonical metadata for a bare title + artist (matchSong)."
  def match_song(title, artist, mb_id \\ "", isrc \\ "", base \\ ""),
    do: :rocksky.match_song(to_bin(base), to_bin(title), to_bin(artist), to_bin(mb_id), to_bin(isrc))

  @doc """
  Top tracks chart over a typed date window.

  `interval` is `:all` | `{:days, n}` | `{:weeks, n}` | `{:months, n}` |
  `{:years, n}` | `{:range, start_rfc3339, end_rfc3339}`.

      Rocksky.top_tracks_interval(10, 0, {:days, 7})
  """
  def top_tracks_interval(limit \\ 50, offset \\ 0, interval \\ :all, base \\ ""),
    do: :rocksky.top_tracks_interval(limit, offset, interval, to_bin(base))

  @doc "Top artists chart over a typed date window (see `top_tracks_interval/4`)."
  def top_artists_interval(limit \\ 50, offset \\ 0, interval \\ :all, base \\ ""),
    do: :rocksky.top_artists_interval(limit, offset, interval, to_bin(base))

  @doc "Identity hash of a song — identical across every Rocksky SDK."
  def song_hash(title, artist, album),
    do: :rocksky.song_hash(to_bin(title), to_bin(artist), to_bin(album))

  # ---- authenticated agent -------------------------------------------------

  @doc """
  Log in with an app password, persisting the session at `session_path`.
  Returns an opaque agent handle (a NIF resource freed by GC).
  """
  def login(session_path, identifier, password, appview \\ "", dedup_path \\ ""),
    do:
      :rocksky.agent_login(
        to_bin(session_path),
        to_bin(identifier),
        to_bin(password),
        to_bin(appview),
        to_bin(dedup_path)
      )

  @doc "Scrobble a play (fans out to artist/album/song/scrobble). Returns the URIs."
  def scrobble(agent, track), do: :rocksky.agent_scrobble(agent, track)

  @doc """
  Scrobble from just a title + artist (album optional): resolve full metadata
  via matchSong, then fan out. `input` is a map with camelCase string keys:
  required `"title"`/`"artist"`; optional `"album"`, `"mbId"`, `"isrc"` (match
  anchors) and `"timestamp"` (scrobbled-at Unix seconds, default now).

      Rocksky.scrobble_match(agent, %{"title" => "Chaser", "artist" => "Calibro 35"})
  """
  def scrobble_match(agent, input) when is_map(input),
    do: :rocksky.agent_scrobble_match(agent, input)

  @doc "Download the caller's repo and (re)build the local dedup index (needs a dedup_path at login)."
  def sync_repo(agent), do: :rocksky.agent_sync_repo(agent)

  @doc "Keep the local dedup index hydrated from Jetstream in the background."
  def hydrate_from_jetstream(agent), do: :rocksky.agent_hydrate_from_jetstream(agent)

  @doc "Like a record by strong reference."
  def like(agent, uri, cid), do: :rocksky.agent_like(agent, to_bin(uri), to_bin(cid))

  @doc "Follow an account by DID."
  def follow(agent, did), do: :rocksky.agent_follow(agent, to_bin(did))

  @doc "Post a shout on a subject."
  def shout(agent, subject_uri, subject_cid, message),
    do: :rocksky.agent_shout(agent, to_bin(subject_uri), to_bin(subject_cid), to_bin(message))

  @doc """
  Post a shout with an optional GIF/sticker/clip. Pass at least one of `message`
  / `gif`. `gif` is a map (`"url"` required, plus `"previewUrl"`, `"alt"`,
  `"width"`, `"height"`) or `nil`.
  """
  def shout_with_gif(agent, subject_uri, subject_cid, message, gif \\ nil),
    do:
      :rocksky.agent_shout_with_gif(
        agent,
        to_bin(subject_uri),
        to_bin(subject_cid),
        to_bin(message),
        gif_arg(gif)
      )

  @doc "Reply to a shout with an optional GIF/sticker/clip (see `shout_with_gif/5`)."
  def reply_shout_with_gif(agent, subject_uri, subject_cid, parent_uri, parent_cid, message, gif \\ nil),
    do:
      :rocksky.agent_reply_shout_with_gif(
        agent,
        to_bin(subject_uri),
        to_bin(subject_cid),
        to_bin(parent_uri),
        to_bin(parent_cid),
        to_bin(message),
        gif_arg(gif)
      )

  @doc "Proactively refresh the session (keep-alive)."
  def refresh_session(agent), do: :rocksky.agent_refresh_session(agent)

  defp gif_arg(nil), do: :undefined
  defp gif_arg(gif), do: gif

  defp to_bin(s) when is_binary(s), do: s
  defp to_bin(s), do: to_string(s)
end
