defmodule RemoteWs.Ws.HandlerTest do
  use RemoteWs.Test.Case
  alias RemoteWs.Ws.Handler

  defp new_did, do: "did:plc:#{System.unique_integer([:positive])}"
  defp state, do: %{device_id: nil, did: nil}

  test "register replies 'registered' and announces to other devices" do
    did = new_did()
    token = Token.sign(%{"did" => did})
    other = FakeDevice.start(did, "other", "Other", self())

    {frames, new_state} =
      Handler.handle(
        %{"type" => "register", "clientName" => "Rocksky CLI", "token" => token},
        state()
      )

    # Reply, then a device snapshot for the newly-connected client.
    assert [reply, snapshot] = frames
    decoded = Jason.decode!(reply)
    assert decoded["status"] == "registered"
    assert is_binary(decoded["deviceId"])
    assert new_state.did == did
    assert new_state.device_id == decoded["deviceId"]

    snap = Jason.decode!(snapshot)
    assert snap["type"] == "devices"
    # No player has streamed yet, so the list is empty (controllers are excluded).
    assert snap["devices"] == []

    assert_receive {:pushed, ^other, frame}
    ann = Jason.decode!(frame)
    assert ann["type"] == "device_registered"
    assert ann["clientName"] == "Rocksky CLI"
  end

  test "command with target routes to one device; no target broadcasts to all" do
    did = new_did()
    token = Token.sign(%{"did" => did})
    a = FakeDevice.start(did, "a", "A", self())
    b = FakeDevice.start(did, "b", "B", self())
    st = %{device_id: "sender", did: did}

    Handler.handle(
      %{"type" => "command", "action" => "pause", "target" => "a", "token" => token},
      st
    )

    assert_receive {:pushed, ^a, frame}
    assert Jason.decode!(frame) == %{"type" => "command", "action" => "pause"}
    refute_receive {:pushed, ^b, _}, 100

    Handler.handle(%{"type" => "command", "action" => "next", "token" => token}, st)
    assert_receive {:pushed, ^a, f1}
    assert_receive {:pushed, ^b, f2}
    assert Jason.decode!(f1)["action"] == "next"
    assert Jason.decode!(f2)["action"] == "next"
  end

  test "seek command carries its position in args" do
    did = new_did()
    token = Token.sign(%{"did" => did})
    a = FakeDevice.start(did, "a", "A", self())
    st = %{device_id: "sender", did: did}

    Handler.handle(
      %{
        "type" => "command",
        "action" => "seek",
        "args" => %{"position" => 12_345},
        "token" => token
      },
      st
    )

    assert_receive {:pushed, ^a, frame}

    assert Jason.decode!(frame) == %{
             "type" => "command",
             "action" => "seek",
             "args" => %{"position" => 12_345}
           }
  end

  test "device track message broadcasts enriched data with device_name" do
    did = new_did()
    token = Token.sign(%{"did" => did})
    sha = sha_of("t", "a", "al")

    StoreStub.put_track(sha, %{
      album_art: "art",
      uri: "s",
      album_uri: "al",
      artist_uri: "ar",
      duration: 1000
    })

    cli = FakeDevice.start(did, "cli", "Rocksky CLI", self())
    st = %{device_id: "cli", did: did}
    # Pre-mark cli primary so this test only observes the message broadcast (not
    # the primary_changed that auto-adoption would also push).
    RedisMemory.put("primary_device:#{did}", "cli")

    data = %{
      "type" => "track",
      "title" => "t",
      "artist" => "a",
      "album" => "al",
      "is_playing" => true
    }

    Handler.handle(
      %{"type" => "message", "data" => data, "device_id" => "cli", "token" => token},
      st
    )

    assert_receive {:pushed, ^cli, frame}
    env = Jason.decode!(frame)
    assert env["type"] == "message"
    assert env["device_id"] == "cli"
    assert env["device_name"] == "Rocksky CLI"
    assert env["data"]["album_art"] == "art"
    assert env["data"]["is_playing"] == true
    assert env["data"]["liked"] == false
  end

  test "an invalid token is ignored (no reply, no broadcast)" do
    did = new_did()
    _dev = FakeDevice.start(did, "a", "A", self())

    {frames, _st} =
      Handler.handle(%{"type" => "register", "clientName" => "x", "token" => "garbage"}, state())

    assert frames == []
    refute_receive {:pushed, _, _}, 100
  end

  test "set_primary broadcasts primary_changed to all the user's devices" do
    did = new_did()
    token = Token.sign(%{"did" => did})
    a = FakeDevice.start(did, "a", "A", self())
    b = FakeDevice.start(did, "b", "B", self())

    Handler.handle(
      %{"type" => "set_primary", "device_id" => "b", "token" => token},
      %{device_id: "a", did: did}
    )

    assert_receive {:pushed, ^a, frame}
    assert Jason.decode!(frame) == %{"type" => "primary_changed", "device_id" => "b"}
    assert_receive {:pushed, ^b, _}
  end

  test "on_disconnect announces device_unregistered to the other devices" do
    did = new_did()
    a = FakeDevice.start(did, "a", "A", self())

    Handler.on_disconnect(%{did: did, device_id: "gone"})

    assert_receive {:pushed, ^a, frame}
    assert Jason.decode!(frame) == %{"type" => "device_unregistered", "device_id" => "gone"}
  end
end
