defmodule RemoteWs.NowPlayingTest do
  use RemoteWs.Test.Case
  alias RemoteWs.NowPlaying

  @did "did:plc:np"

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

    data = NowPlaying.handle_track(@did, track_data(), "CLI")

    assert data["liked"] == true
    assert data["album_art"] == "art"
    assert data["song_uri"] == "song://x"
    assert data["album_uri"] == "al://x"
    assert data["artist_uri"] == "ar://x"
    assert RedisMemory.get("nowplaying:#{@did}")
    assert RedisMemory.get("track:#{sha}")
    assert RedisMemory.get("likes:#{@did}:#{sha}")
  end

  test "uses cached like status without touching the store" do
    sha = sha_of("t", "a", "al")
    RedisMemory.put("likes:#{@did}:#{sha}", Jason.encode!(%{liked: true}))
    # No StoreStub.set_liked → if it consulted the store it would be false.
    data = NowPlaying.handle_track(@did, track_data(), "CLI")
    assert data["liked"] == true
  end

  test "does NOT emit song.changed when ws source is inactive" do
    NowPlaying.handle_track(@did, track_data(), "CLI")
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

    NowPlaying.handle_track(@did, track_data(), "Rocksky CLI")

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
    NowPlaying.handle_track(@did, track_data(), "CLI")
    refute_receive {:nats, "rocksky.song.changed", _}, 100
  end
end
