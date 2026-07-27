defmodule RemoteWs.NowPlayingTest do
  use RemoteWs.Test.Case
  alias RemoteWs.NowPlaying

  @did "did:plc:np"
  @dev "device-1"

  defp track_data, do: %{"type" => "track", "title" => "t", "artist" => "a", "album" => "al"}

  test "enriches liked + metadata and writes redis caches" do
    sha = sha_of("t", "a", "al")

    StoreStub.put_track(sha, %{
      album_art: "art",
      uri: "song://x",
      album_uri: "al://x",
      artist_uri: "ar://x",
      duration: 1000
    })

    StoreStub.set_liked(@did, sha)

    data = NowPlaying.handle_track(@did, @dev, "CLI", track_data())

    assert data["liked"] == true
    assert data["album_art"] == "art"
    assert data["song_uri"] == "song://x"
    assert data["album_uri"] == "al://x"
    assert data["artist_uri"] == "ar://x"
    # Cached per-device (for the snapshot) and, since it auto-adopted as primary,
    # into the per-user profile now-playing.
    assert RedisMemory.get("np:#{@did}:#{@dev}")
    assert RedisMemory.get("nowplaying:#{@did}")
    assert RedisMemory.get("track:#{sha}")
    assert RedisMemory.get("likes:#{@did}:#{sha}")
  end

  test "uses cached like status without touching the store" do
    sha = sha_of("t", "a", "al")
    RedisMemory.put("likes:#{@did}:#{sha}", Jason.encode!(%{liked: true}))
    data = NowPlaying.handle_track(@did, @dev, "CLI", track_data())
    assert data["liked"] == true
  end

  test "does NOT emit song.changed when ws source is inactive" do
    NowPlaying.handle_track(@did, @dev, "CLI", track_data())
    refute_receive {:nats, "rocksky.song.changed", _}, 100
  end

  test "emits song.changed when ws_lastsong active and track changed" do
    sha = sha_of("t", "a", "al")

    StoreStub.put_track(sha, %{
      album_art: "art",
      uri: "s",
      album_uri: "al",
      artist_uri: "ar",
      duration: 4200
    })

    RedisMemory.put("ws_lastsong:#{@did}", "old-sha")

    NowPlaying.handle_track(@did, @dev, "Rocksky CLI", track_data())

    assert_receive {:nats, "rocksky.song.changed", payload}
    assert payload["did"] == @did
    assert payload["track"]["name"] == "t"
    assert payload["track"]["source"] == "Rocksky CLI"
    assert payload["track"]["duration_ms"] == 4200
    assert payload["track"]["albumCoverUrl"] == "art"
    assert RedisMemory.get("lastsong:#{@did}") == sha
    assert RedisMemory.get("ws_lastsong:#{@did}") == sha
  end

  test "does NOT emit song.changed for the same track (sha match)" do
    sha = sha_of("t", "a", "al")
    RedisMemory.put("ws_lastsong:#{@did}", sha)
    RedisMemory.put("lastsong:#{@did}", sha)
    NowPlaying.handle_track(@did, @dev, "CLI", track_data())
    refute_receive {:nats, "rocksky.song.changed", _}, 100
  end

  describe "multiple simultaneous devices" do
    # Both players must be "connected" (registered) so the auto-adopt fallback
    # doesn't steal primary from a still-present device — matching production.
    test "a non-primary device does NOT drive the profile now-playing" do
      FakeDevice.start(@did, @dev, "CLI-1", self())
      FakeDevice.start(@did, "device-2", "CLI-2", self())

      # dev-1 auto-adopts as primary on its first track.
      RedisMemory.put("ws_lastsong:#{@did}", "seed")
      NowPlaying.handle_track(@did, @dev, "CLI-1", track_data())
      assert RedisMemory.get("primary_device:#{@did}") == @dev
      assert_receive {:nats, "rocksky.song.changed", %{"track" => %{"source" => "CLI-1"}}}

      # dev-2 plays a DIFFERENT track — it must NOT overwrite the profile.
      other = %{"type" => "track", "title" => "u", "artist" => "b", "album" => "bl"}
      data2 = NowPlaying.handle_track(@did, "device-2", "CLI-2", other)

      # dev-2 is still cached per-device (for the picker)…
      assert RedisMemory.get("np:#{@did}:device-2")
      # …but the profile is untouched: still dev-1's track, no new song.changed.
      assert RedisMemory.get("nowplaying:#{@did}") =~ ~s("title":"t")
      refute_receive {:nats, "rocksky.song.changed", %{"track" => %{"source" => "CLI-2"}}}, 100
      # And dev-2's enriched data is still returned for broadcast.
      assert data2["liked"] == false
    end

    test "set_primary switches the profile to the chosen device and republishes" do
      FakeDevice.start(@did, @dev, "CLI-1", self())
      FakeDevice.start(@did, "device-2", "CLI-2", self())

      # dev-1 is primary; seed dev-2's per-device cache with its current track.
      other = %{"type" => "track", "title" => "u", "artist" => "b", "album" => "bl"}
      RedisMemory.put("primary_device:#{@did}", @dev)
      NowPlaying.handle_track(@did, "device-2", "CLI-2", other)

      # User selects device-2 in the UI.
      NowPlaying.set_primary(@did, "device-2", "CLI-2")

      assert RedisMemory.get("primary_device:#{@did}") == "device-2"
      assert_receive {:nats, "rocksky.song.changed", payload}
      assert payload["track"]["name"] == "u"
      assert payload["track"]["source"] == "CLI-2"
    end
  end

  test "on_disconnect of the primary device stops the profile and clears primary" do
    RedisMemory.put("primary_device:#{@did}", @dev)
    RedisMemory.put("ws_lastsong:#{@did}", "sha")
    RedisMemory.put("nowplaying:#{@did}", "x")
    RedisMemory.put("np:#{@did}:#{@dev}", "y")

    NowPlaying.on_disconnect(@did, @dev)

    assert_receive {:nats, "rocksky.song.stopped", %{"did" => @did}}
    refute RedisMemory.exists("primary_device:#{@did}")
    refute RedisMemory.exists("nowplaying:#{@did}")
    refute RedisMemory.exists("np:#{@did}:#{@dev}")
  end

  test "on_disconnect of a non-primary device only drops its cache" do
    RedisMemory.put("primary_device:#{@did}", @dev)
    RedisMemory.put("np:#{@did}:other", "y")

    NowPlaying.on_disconnect(@did, "other")

    refute_receive {:nats, "rocksky.song.stopped", _}, 100
    assert RedisMemory.get("primary_device:#{@did}") == @dev
    refute RedisMemory.exists("np:#{@did}:other")
  end
end
