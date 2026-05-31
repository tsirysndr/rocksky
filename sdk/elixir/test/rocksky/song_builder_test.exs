defmodule Rocksky.Song.BuilderTest do
  use ExUnit.Case, async: true

  import Rocksky.Test.ReqHelpers

  alias Rocksky.Song.Builder, as: Song

  test "submit/2 POSTs to createSong with the chained body" do
    stub_json(:song_builder_submit, %{"uri" => "at://song/1"}, fn conn ->
      assert_path(conn, "/xrpc/app.rocksky.song.createSong")

      assert read_json_body(conn) == %{
               "title" => "Lithium",
               "artist" => "Nirvana",
               "album" => "Nevermind",
               "isrc" => "USDW19811234",
               "duration" => 257_000
             }
    end)

    client = client(:song_builder_submit, token: "tok")

    assert {:ok, %{"uri" => "at://song/1"}} =
             Song.new(title: "Lithium", artist: "Nirvana")
             |> Song.album("Nevermind")
             |> Song.isrc("USDW19811234")
             |> Song.duration(257_000)
             |> Song.submit(client)
  end

  test "album_artist setter maps to albumArtist key" do
    body =
      Song.new(title: "x", artist: "y")
      |> Song.album_artist("Various Artists")
      |> Song.to_body()

    assert body[:albumArtist] == "Various Artists"
  end
end
