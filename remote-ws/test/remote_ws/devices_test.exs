defmodule RemoteWs.DevicesTest do
  use RemoteWs.Test.Case
  alias RemoteWs.Devices

  defp new_did, do: "did:plc:#{System.unique_integer([:positive])}"

  test "broadcast reaches all registered devices" do
    did = new_did()
    a = FakeDevice.start(did, "a", "A", self())
    b = FakeDevice.start(did, "b", "B", self())

    Devices.broadcast(did, "hello")

    assert_receive {:pushed, ^a, "hello"}
    assert_receive {:pushed, ^b, "hello"}
  end

  test "send_to targets a single device" do
    did = new_did()
    a = FakeDevice.start(did, "a", "A", self())
    _b = FakeDevice.start(did, "b", "B", self())

    assert :ok = Devices.send_to(did, "a", "x")
    assert_receive {:pushed, ^a, "x"}
    refute_receive {:pushed, _, "x"}, 100
  end

  test "send_to returns :not_found for an unknown device" do
    assert :not_found = Devices.send_to(new_did(), "nope", "x")
  end

  test "name_of resolves a device's client name" do
    did = new_did()
    FakeDevice.start(did, "cli", "Rocksky CLI", self())
    assert Devices.name_of(did, "cli") == "Rocksky CLI"
    assert Devices.name_of(did, "missing") == nil
  end

  test "broadcast_except skips the given device" do
    did = new_did()
    a = FakeDevice.start(did, "a", "A", self())
    b = FakeDevice.start(did, "b", "B", self())

    Devices.broadcast_except(did, "a", "y")

    assert_receive {:pushed, ^b, "y"}
    refute_receive {:pushed, ^a, "y"}, 100
  end
end
