defmodule Rocksky.ActorTest do
  use ExUnit.Case, async: true

  import Rocksky.Test.ReqHelpers

  test "get_profile/2 hits app.rocksky.actor.getProfile" do
    stub_json(:actor_profile, %{"did" => "did:plc:abc", "handle" => "alice"}, fn conn ->
      assert_path(conn, "/xrpc/app.rocksky.actor.getProfile")
      assert conn.query_params == %{"did" => "alice"}
    end)

    assert {:ok, %{"handle" => "alice"}} =
             client(:actor_profile) |> Rocksky.Actor.get_profile(did: "alice")
  end

  test "get_actor_scrobbles/2 passes pagination params" do
    stub_json(:actor_scrobbles, %{"scrobbles" => []}, fn conn ->
      assert_path(conn, "/xrpc/app.rocksky.actor.getActorScrobbles")

      assert conn.query_params == %{
               "did" => "alice",
               "limit" => "25",
               "offset" => "50"
             }
    end)

    assert {:ok, %{"scrobbles" => []}} =
             client(:actor_scrobbles)
             |> Rocksky.Actor.get_actor_scrobbles(did: "alice", limit: 25, offset: 50)
  end

  test "supports pipe composition" do
    stub_json(:actor_pipe, %{"scrobbles" => []})

    {:ok, body} =
      Rocksky.new(
        base_url: "https://api.test.rocksky.app",
        req_options: [plug: {Req.Test, :actor_pipe}]
      )
      |> Rocksky.Actor.get_actor_scrobbles(did: "alice")

    assert body == %{"scrobbles" => []}
  end
end
