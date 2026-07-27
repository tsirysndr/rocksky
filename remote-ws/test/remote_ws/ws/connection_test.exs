defmodule RemoteWs.Ws.ConnectionTest do
  use RemoteWs.Test.Case
  alias RemoteWs.Ws.Connection

  @state %{device_id: nil, did: nil}

  test "a ping frame yields pong" do
    assert {:push, {:text, "pong"}, _} =
             Connection.handle_in({"ping", [opcode: :text]}, @state)
  end

  test "invalid JSON is ignored" do
    assert {:ok, _} = Connection.handle_in({"{not json", [opcode: :text]}, @state)
  end

  test "binary frames are ignored" do
    assert {:ok, _} = Connection.handle_in({<<1, 2, 3>>, [opcode: :binary]}, @state)
  end

  test "a {:push, frame} message is forwarded to the socket" do
    assert {:push, {:text, "hi"}, _} = Connection.handle_info({:push, "hi"}, @state)
  end
end
