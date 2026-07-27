defmodule RemoteWs.NowPlaying do
  @moduledoc """
  Now-playing enrichment and the song.changed / song.stopped gating — a faithful
  port of apps/api/src/websocket/handler.ts (the `data.type === "track"` and the
  status branches).

  All Redis keys, TTLs, and the `ws_lastsong` gate semantics match the Node
  implementation 1:1 so both servers behave identically against shared Redis.
  """

  alias RemoteWs.{Nats, Redis, StopDebouncer, Store}

  @day_seconds 86_400

  @doc """
  Enrich a "track" now-playing payload and emit song.changed when appropriate.
  Returns the enriched `data` map (string keys) to broadcast. `source` is the
  device name used in the song.changed event.
  """
  def handle_track(did, data, source) do
    title = data["title"]
    artist = data["artist"]
    album = data["album"]
    sha256 = sha256_hex(String.downcase("#{title} - #{artist} - #{album}"))

    cached_track = Redis.get("track:#{sha256}")
    cached_likes = Redis.get("likes:#{did}:#{sha256}")

    {data, liked} = resolve_liked(data, did, sha256, cached_likes)

    duration_ms = data["duration_ms"] || data["duration"] || 0
    {data, duration_ms} = resolve_metadata(data, did, sha256, liked, duration_ms, cached_track)

    maybe_emit_song_changed(did, sha256, %{
      title: title,
      artist: artist,
      album: album,
      album_art: data["album_art"],
      duration_ms: duration_ms,
      source: source
    })

    data
  end

  @doc """
  Handle a status payload (`data.status`): persist the status, and drive the
  song.stopped debounce / ws_lastsong reactivation exactly like the Node handler.
  """
  def handle_status(did, data) do
    status = data["status"]
    Redis.set_ex("nowplaying:#{did}:status", 3, "#{status}")

    ws_was_playing = Redis.exists("ws_lastsong:#{did}")

    cond do
      status == 0 and ws_was_playing ->
        # Do NOT delete ws_lastsong here — only the debounce timer does, so a
        # status=1 within the window keeps the gate intact.
        Redis.set_ex("stopped:#{did}", @day_seconds, "1")
        StopDebouncer.schedule(did)

      status == 1 ->
        handle_resume(did)

      true ->
        :ok
    end

    :ok
  end

  # ---- liked resolution (handler.ts lines 82-98) ----

  defp resolve_liked(data, _did, _sha256, cached_likes) when is_binary(cached_likes) do
    liked = Jason.decode!(cached_likes)["liked"]
    {Map.put(data, "liked", liked), liked}
  end

  defp resolve_liked(data, did, sha256, _cached_likes) do
    liked = Store.liked?(did, sha256)
    Redis.set_ex("likes:#{did}:#{sha256}", 2, Jason.encode!(%{liked: liked}))
    {Map.put(data, "liked", liked), liked}
  end

  # ---- track metadata resolution (handler.ts lines 100-146) ----

  defp resolve_metadata(data, did, sha256, liked, duration_ms, cached_track)
       when is_binary(cached_track) do
    cached = Jason.decode!(cached_track)

    data =
      data
      |> Map.put("album_art", cached["albumArt"])
      |> Map.put("song_uri", cached["uri"])
      |> Map.put("album_uri", cached["albumUri"])
      |> Map.put("artist_uri", cached["artistUri"])

    duration_ms = cached["duration"] || duration_ms
    write_nowplaying(did, data, sha256, liked)
    {data, duration_ms}
  end

  defp resolve_metadata(data, did, sha256, liked, duration_ms, _cached_track_nil) do
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

        duration_ms = track.duration || duration_ms

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

        write_nowplaying(did, data, sha256, liked)
        {data, duration_ms}
    end
  end

  defp write_nowplaying(did, data, sha256, liked) do
    payload = data |> Map.put("sha256", sha256) |> Map.put("liked", liked)
    Redis.set_ex("nowplaying:#{did}", 3, Jason.encode!(payload))
  end

  # ---- song.changed gate (handler.ts lines 159-208) ----

  defp maybe_emit_song_changed(did, sha256, track) do
    last_song_sha = Redis.get("lastsong:#{did}")

    if last_song_sha != sha256 do
      if Redis.exists("ws_lastsong:#{did}") do
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
    end

    :ok
  end

  # ---- status=1 resume (handler.ts lines 243-272) ----

  defp handle_resume(did) do
    if StopDebouncer.has_pending?(did) do
      # Cancelled before firing — song.stopped was never published, PDS record
      # still exists, ws_lastsong still set.
      StopDebouncer.cancel(did)
      Redis.del("stopped:#{did}")
    else
      # No pending timer — the 15s stop already fired: ws_lastsong was deleted and
      # song.stopped published. Restore ws_lastsong from the saved value, then
      # delete lastsong so the next heartbeat re-publishes song.changed.
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

  defp sha256_hex(str) do
    :crypto.hash(:sha256, str) |> Base.encode16(case: :lower)
  end
end
