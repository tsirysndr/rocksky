defmodule Rocksky.ScrobbleTest do
  use ExUnit.Case, async: true

  import Rocksky.Test.ReqHelpers

  test "create_scrobble/2 sends POST with JSON body" do
    stub_json(:scrobble_create, %{}, fn conn ->
      assert_method(conn, "POST")
      assert_path(conn, "/xrpc/app.rocksky.scrobble.createScrobble")

      assert read_json_body(conn) == %{
               "title" => "In Bloom",
               "artist" => "Nirvana",
               "album" => "Nevermind"
             }
    end)

    assert {:ok, %{}} =
             client(:scrobble_create, token: "tok")
             |> Rocksky.Scrobble.create_scrobble(
               title: "In Bloom",
               artist: "Nirvana",
               album: "Nevermind"
             )
  end

  test "get_scrobble/2 queries by uri" do
    stub_json(:scrobble_get, %{"id" => "s1"}, fn conn ->
      assert_path(conn, "/xrpc/app.rocksky.scrobble.getScrobble")
      assert conn.query_params == %{"uri" => "at://x"}
    end)

    assert {:ok, %{"id" => "s1"}} =
             client(:scrobble_get) |> Rocksky.Scrobble.get_scrobble(uri: "at://x")
  end

  test "get_scrobbles/2 supports `following` flag" do
    stub_json(:scrobble_list, %{"scrobbles" => []}, fn conn ->
      assert conn.query_params == %{
               "did" => "alice",
               "following" => "true",
               "limit" => "10"
             }
    end)

    assert {:ok, _} =
             client(:scrobble_list)
             |> Rocksky.Scrobble.get_scrobbles(did: "alice", following: true, limit: 10)
  end
end
