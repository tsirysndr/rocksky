defmodule RemoteWs.StatusDebounceTest do
  use RemoteWs.Test.Case
  alias RemoteWs.NowPlaying

  test "status=0 with active ws source schedules song.stopped, then fires" do
    did = "did:plc:stop1"
    RedisMemory.put("ws_lastsong:#{did}", "sha")

    NowPlaying.handle_status(did, %{"status" => 0})

    # Debounce is 30ms in test config; give it ample room.
    assert_receive {:nats, "rocksky.song.stopped", %{"did" => ^did}}, 500
    refute RedisMemory.exists("ws_lastsong:#{did}")
  end

  test "status=1 within the window cancels a pending song.stopped" do
    did = "did:plc:stop2"
    RedisMemory.put("ws_lastsong:#{did}", "sha")

    NowPlaying.handle_status(did, %{"status" => 0})
    NowPlaying.handle_status(did, %{"status" => 1})

    refute_receive {:nats, "rocksky.song.stopped", _}, 200
    assert RedisMemory.exists("ws_lastsong:#{did}")
  end

  test "status=0 without an active ws source does nothing" do
    did = "did:plc:stop3"
    NowPlaying.handle_status(did, %{"status" => 0})
    refute_receive {:nats, "rocksky.song.stopped", _}, 200
  end

  test "status persists to redis" do
    did = "did:plc:stop4"
    NowPlaying.handle_status(did, %{"status" => 2})
    assert RedisMemory.get("nowplaying:#{did}:status") == "2"
  end
end
