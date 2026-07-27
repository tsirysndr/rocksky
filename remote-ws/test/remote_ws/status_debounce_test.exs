defmodule RemoteWs.StatusDebounceTest do
  use RemoteWs.Test.Case
  alias RemoteWs.NowPlaying

  # The status branch only drives the profile for the PRIMARY device, so each
  # test marks its device as primary first.
  @dev "device-1"

  defp primary(did), do: RedisMemory.put("primary_device:#{did}", @dev)

  test "status=0 with active ws source schedules song.stopped, then fires" do
    did = "did:plc:stop1"
    primary(did)
    RedisMemory.put("ws_lastsong:#{did}", "sha")

    NowPlaying.handle_status(did, @dev, %{"status" => 0})

    # Debounce is 30ms in test config; give it ample room.
    assert_receive {:nats, "rocksky.song.stopped", %{"did" => ^did}}, 500
    refute RedisMemory.exists("ws_lastsong:#{did}")
  end

  test "status=1 within the window cancels a pending song.stopped" do
    did = "did:plc:stop2"
    primary(did)
    RedisMemory.put("ws_lastsong:#{did}", "sha")

    NowPlaying.handle_status(did, @dev, %{"status" => 0})
    NowPlaying.handle_status(did, @dev, %{"status" => 1})

    refute_receive {:nats, "rocksky.song.stopped", _}, 200
    assert RedisMemory.exists("ws_lastsong:#{did}")
  end

  test "status=0 without an active ws source does nothing" do
    did = "did:plc:stop3"
    primary(did)
    NowPlaying.handle_status(did, @dev, %{"status" => 0})
    refute_receive {:nats, "rocksky.song.stopped", _}, 200
  end

  test "status persists to redis" do
    did = "did:plc:stop4"
    primary(did)
    NowPlaying.handle_status(did, @dev, %{"status" => 2})
    assert RedisMemory.get("nowplaying:#{did}:status") == "2"
  end

  test "a non-primary device's status does not drive the profile" do
    did = "did:plc:stop5"
    primary(did)
    RedisMemory.put("ws_lastsong:#{did}", "sha")

    # A DIFFERENT device sends status=0 — must be ignored.
    NowPlaying.handle_status(did, "device-2", %{"status" => 0})
    refute_receive {:nats, "rocksky.song.stopped", _}, 200
    assert RedisMemory.exists("ws_lastsong:#{did}")
  end
end
