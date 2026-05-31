defmodule Rocksky.GraphTest do
  use ExUnit.Case, async: true

  import Rocksky.Test.ReqHelpers

  test "follow_account/2 issues procedure with `account` query param" do
    stub_json(:graph_follow, %{}, fn conn ->
      assert_method(conn, "POST")
      assert_path(conn, "/xrpc/app.rocksky.graph.followAccount")
      assert conn.query_params == %{"account" => "alice.bsky.social"}
    end)

    assert {:ok, %{}} =
             client(:graph_follow, token: "tok")
             |> Rocksky.Graph.follow_account(account: "alice.bsky.social")
  end

  test "get_followers/2 supports `dids` list params" do
    stub_json(:graph_followers, %{"followers" => []}, fn conn ->
      assert conn.query_params["dids"] == "a,b"
    end)

    assert {:ok, _} =
             client(:graph_followers)
             |> Rocksky.Graph.get_followers(actor: "alice", dids: ["a", "b"])
  end
end
