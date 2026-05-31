defmodule Rocksky.SongTest do
  use ExUnit.Case, async: true

  import Rocksky.Test.ReqHelpers

  test "get_song/2 supports multiple identifiers" do
    stub_json(:song_get, %{"title" => "Smells Like Teen Spirit"}, fn conn ->
      assert_path(conn, "/xrpc/app.rocksky.song.getSong")
      assert conn.query_params == %{"isrc" => "USDW19811234"}
    end)

    assert {:ok, %{"title" => _}} =
             client(:song_get) |> Rocksky.Song.get_song(isrc: "USDW19811234")
  end

  test "match_song/2 returns a candidate" do
    stub_json(:song_match, %{"uri" => "at://song/1"}, fn conn ->
      assert conn.query_params["title"] == "Lithium"
      assert conn.query_params["artist"] == "Nirvana"
    end)

    assert {:ok, %{"uri" => "at://song/1"}} =
             client(:song_match)
             |> Rocksky.Song.match_song(title: "Lithium", artist: "Nirvana")
  end
end
