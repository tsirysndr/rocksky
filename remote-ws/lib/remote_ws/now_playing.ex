defmodule RemoteWs.NowPlaying do
  @moduledoc """
  Now-playing enrichment, per-device caching, primary-device selection, and the
  profile `song.changed` / `song.stopped` gating.

  A user (DID) can have several players streaming at once. Each device's enriched
  now-playing is cached under `np:{did}:{device_id}` so a newly-connected client
  can be handed a snapshot and list every player. But the user's PUBLIC profile
  now-playing + scrobble is inherently one stream, so it is driven only by the
  **primary device** — the one the user selected in the UI (`set_primary`), or,
  when none is selected/connected, the sole active player (auto-adopted).

  The profile machinery (`nowplaying:{did}`, `nowplaying:{did}:status`,
  `lastsong:{did}`, `ws_lastsong:{did}`, `stopped:{did}` and the NATS events) is
  unchanged from the original port and still per-DID — it just runs only for the
  primary device, so non-primary players never touch it (and never fight over it,
  or over the Navidrome coordination in apps/api).
  """

  alias RemoteWs.{Devices, Nats, Redis, StopDebouncer, Store}

  @day_seconds 86_400
  # Per-device now-playing cache lifetime. Players re-push every few seconds, so
  # this only needs to outlive one push gap (it seeds the register snapshot).
  @np_ttl 30
  # The queue changes less often (only on user edits), so it's cached longer so a
  # newly-connected client's snapshot still has it. Cleared on disconnect.
  @queue_ttl 3600

  # ── track ──────────────────────────────────────────────────────────────────

  @doc """
  Handle a `track` push from `device_id`: enrich it, cache it per-device, adopt a
  primary if none is connected, and — only when this device is the primary —
  drive the profile now-playing (`song.changed`). Returns the enriched `data` map
  to broadcast. `name` is the device's display name (the song.changed `source`).
  """
  def handle_track(did, device_id, name, data) do
    {data, sha256, duration_ms, liked} = enrich(did, data)
    cache_device_np(did, device_id, data, sha256, liked)
    ensure_primary(did, device_id)

    if primary_device(did) == device_id do
      write_nowplaying(did, data, sha256, liked)

      maybe_emit_song_changed(did, sha256, %{
        title: data["title"],
        artist: data["artist"],
        album: data["album"],
        album_art: data["album_art"],
        duration_ms: duration_ms,
        source: name
      })
    end

    data
  end

  @doc "Handle a `status` push from `device_id` — drives the profile only if primary."
  def handle_status(did, device_id, data) do
    if primary_device(did) == device_id, do: profile_status(did, data)
    :ok
  end

  @doc """
  Handle a `queue` push from `device_id`: cache the device's playback queue so the
  miniplayers can display and stay in sync with the real remote queue. Purely
  per-device — never touches the profile. Returns `data` (broadcast unchanged).
  """
  def handle_queue(did, device_id, data) do
    data = enrich_queue(data)
    Redis.set_ex("queue:#{did}:#{device_id}", @queue_ttl, Jason.encode!(data))
    data
  end

  # Fill each queue item's album art (and song/album URIs) from the canonical DB
  # values, keyed by the same sha256 as now-playing. The CLI's queue items often
  # carry no cover (Navidrome/playlist tracks) or a stale one, so without this the
  # miniplayer queue shows broken/placeholder art everywhere. One batched query.
  defp enrich_queue(%{"queue" => items} = data) when is_list(items) do
    shas = Enum.map(items, &queue_item_sha/1)
    found = Store.get_tracks_by_sha256(Enum.uniq(shas))

    enriched =
      Enum.zip(items, shas)
      |> Enum.map(fn {item, sha} ->
        case Map.get(found, sha) do
          nil ->
            item

          t ->
            item
            |> Map.put("album_art", t.album_art || item["album_art"])
            |> Map.put("song_uri", t.uri || item["song_uri"])
            |> Map.put("album_uri", t.album_uri || item["album_uri"])
        end
      end)

    Map.put(data, "queue", enriched)
  end

  defp enrich_queue(data), do: data

  defp queue_item_sha(item),
    do: sha256_hex(String.downcase("#{item["title"]} - #{item["artist"]} - #{item["album"]}"))

  @doc "The cached queue for one device (for the register snapshot), or nil."
  def device_queue(did, device_id) do
    case Redis.get("queue:#{did}:#{device_id}") do
      nil -> nil
      json -> Jason.decode!(json)
    end
  end

  # ── primary selection ────────────────────────────────────────────────────────

  @doc "The user's current primary device id (scrobble/profile source), or nil."
  def primary_device(did), do: Redis.get("primary_device:#{did}")

  @doc """
  Explicitly set the user's primary device from a UI selection and re-point the
  profile now-playing at that device's current track. Broadcasts `primary_changed`
  so every one of the user's clients converges on the same active device.
  """
  def set_primary(did, device_id, name) do
    Redis.set_ex("primary_device:#{did}", @day_seconds, device_id)
    broadcast_primary(did, device_id)
    # Force the profile to republish for the newly-selected device's track.
    Redis.del("lastsong:#{did}")

    case device_np(did, device_id) do
      nil ->
        :ok

      np ->
        write_nowplaying_raw(did, np)

        publish_song_changed(did, np["sha256"], %{
          title: np["title"],
          artist: np["artist"],
          album: np["album"],
          album_art: np["album_art"],
          duration_ms: np["duration_ms"] || np["length"] || 0,
          source: name
        })
    end

    :ok
  end

  @doc """
  Handle a device disconnecting: forget its cached now-playing, and if it was the
  primary, end the profile now-playing (so the public profile stops cleanly).
  """
  def on_disconnect(did, device_id) do
    Redis.del("np:#{did}:#{device_id}")
    Redis.del("queue:#{did}:#{device_id}")

    if primary_device(did) == device_id do
      Enum.each(
        [
          "primary_device:#{did}",
          "lastsong:#{did}",
          "ws_lastsong:#{did}",
          "nowplaying:#{did}",
          "stopped:#{did}"
        ],
        &Redis.del/1
      )

      # Debounced rather than published outright: a disconnect is usually a
      # reload or a network blip, and firing immediately deleted the status
      # record for a track that was still playing.
      StopDebouncer.schedule(did)
    end

    :ok
  end

  @doc "The cached enriched now-playing for one device (for the register snapshot), or nil."
  def device_np(did, device_id) do
    case Redis.get("np:#{did}:#{device_id}") do
      nil -> nil
      json -> Jason.decode!(json)
    end
  end

  # ── primary internals ────────────────────────────────────────────────────────

  # Adopt `device_id` as primary when there is no primary, or the current one is
  # no longer connected — so a lone player scrobbles with zero UI, and the profile
  # doesn't get stuck on a device that went away.
  defp ensure_primary(did, device_id) do
    cur = primary_device(did)

    if is_nil(cur) or not Devices.connected?(did, cur) do
      Redis.set_ex("primary_device:#{did}", @day_seconds, device_id)
      broadcast_primary(did, device_id)
    end

    :ok
  end

  defp broadcast_primary(did, device_id) do
    Devices.broadcast(did, Jason.encode!(%{type: "primary_changed", device_id: device_id}))
  end

  # ── enrichment (liked + metadata + sha) ──────────────────────────────────────

  defp enrich(did, data) do
    sha256 =
      sha256_hex(String.downcase("#{data["title"]} - #{data["artist"]} - #{data["album"]}"))

    cached_track = Redis.get("track:#{sha256}")
    cached_likes = Redis.get("likes:#{did}:#{sha256}")
    {data, liked} = resolve_liked(data, did, sha256, cached_likes)
    duration_ms = data["duration_ms"] || data["duration"] || 0
    {data, duration_ms} = resolve_metadata(data, did, sha256, liked, duration_ms, cached_track)
    {data, sha256, duration_ms, liked}
  end

  defp resolve_liked(data, _did, _sha256, cached_likes) when is_binary(cached_likes) do
    liked = Jason.decode!(cached_likes)["liked"]
    {Map.put(data, "liked", liked), liked}
  end

  defp resolve_liked(data, did, sha256, _cached_likes) do
    liked = Store.liked?(did, sha256)
    Redis.set_ex("likes:#{did}:#{sha256}", 2, Jason.encode!(%{liked: liked}))
    {Map.put(data, "liked", liked), liked}
  end

  defp resolve_metadata(data, _did, _sha256, _liked, duration_ms, cached_track)
       when is_binary(cached_track) do
    cached = Jason.decode!(cached_track)

    data =
      data
      |> Map.put("album_art", cached["albumArt"])
      |> Map.put("song_uri", cached["uri"])
      |> Map.put("album_uri", cached["albumUri"])
      |> Map.put("artist_uri", cached["artistUri"])

    {data, cached["duration"] || duration_ms}
  end

  defp resolve_metadata(data, _did, sha256, liked, duration_ms, _cached_track_nil) do
    case Store.get_track_by_sha256(sha256) do
      nil ->
        {data, duration_ms}

      track ->
        data =
          data
          |> Map.put("album_art", track.album_art)
          |> Map.put("song_uri", track.uri)
          |> Map.put("album_uri", track.album_uri)
          |> Map.put("artist_uri", track.artist_uri)

        Redis.set_ex(
          "track:#{sha256}",
          10,
          Jason.encode!(%{
            albumArt: track.album_art,
            uri: track.uri,
            albumUri: track.album_uri,
            artistUri: track.artist_uri,
            duration: track.duration,
            liked: liked
          })
        )

        {data, track.duration || duration_ms}
    end
  end

  # ── profile now-playing (primary only) ───────────────────────────────────────

  defp enriched_payload(data, sha256, liked),
    do: data |> Map.put("sha256", sha256) |> Map.put("liked", liked)

  defp write_nowplaying(did, data, sha256, liked),
    do: Redis.set_ex("nowplaying:#{did}", 3, Jason.encode!(enriched_payload(data, sha256, liked)))

  defp write_nowplaying_raw(did, np),
    do: Redis.set_ex("nowplaying:#{did}", 3, Jason.encode!(np))

  defp cache_device_np(did, device_id, data, sha256, liked),
    do:
      Redis.set_ex(
        "np:#{did}:#{device_id}",
        @np_ttl,
        Jason.encode!(enriched_payload(data, sha256, liked))
      )

  # song.changed only when the track actually changed AND the WS source is active
  # (ws_lastsong present) — same gate as the original port.
  defp maybe_emit_song_changed(did, sha256, track) do
    if Redis.get("lastsong:#{did}") != sha256 and Redis.exists("ws_lastsong:#{did}") do
      publish_song_changed(did, sha256, track)
    end

    :ok
  end

  defp publish_song_changed(did, sha256, track) do
    StopDebouncer.cancel(did)
    Redis.set_ex("lastsong:#{did}", @day_seconds, sha256)
    Redis.set_ex("ws_lastsong:#{did}", @day_seconds, sha256)
    Redis.del("stopped:#{did}")

    Nats.publish(
      "rocksky.song.changed",
      Jason.encode!(%{
        did: did,
        track: %{
          name: track.title,
          artist: track.artist,
          album: track.album,
          albumCoverUrl: track.album_art,
          duration_ms: track.duration_ms,
          source: track.source
        }
      })
    )
  end

  defp profile_status(did, data) do
    status = data["status"]
    Redis.set_ex("nowplaying:#{did}:status", 3, "#{status}")

    ws_was_playing = Redis.exists("ws_lastsong:#{did}")

    cond do
      status == 0 and ws_was_playing ->
        Redis.set_ex("stopped:#{did}", @day_seconds, "1")
        StopDebouncer.schedule(did)

      status == 1 ->
        handle_resume(did)

      true ->
        :ok
    end

    :ok
  end

  defp handle_resume(did) do
    if StopDebouncer.has_pending?(did) do
      StopDebouncer.cancel(did)
      Redis.del("stopped:#{did}")
    else
      case Redis.get("stopped:#{did}") do
        nil ->
          :ok

        _ ->
          saved_sha = Redis.get("lastsong:#{did}")
          Redis.del("stopped:#{did}")
          Redis.del("lastsong:#{did}")
          if saved_sha, do: Redis.set_ex("ws_lastsong:#{did}", @day_seconds, saved_sha)
      end
    end
  end

  defp sha256_hex(str), do: :crypto.hash(:sha256, str) |> Base.encode16(case: :lower)
end
