defmodule Rocksky.Scrobble.BuilderTest do
  use ExUnit.Case, async: true

  import Rocksky.Test.ReqHelpers

  alias Rocksky.Error
  alias Rocksky.Scrobble.Builder, as: Scrobble

  test "new/1 accepts required + optional fields and returns a struct" do
    builder = Scrobble.new(title: "In Bloom", artist: "Nirvana", album: "Nevermind")
    assert %Scrobble{title: "In Bloom", artist: "Nirvana", album: "Nevermind"} = builder
  end

  test "named setters are snake-cased and update the builder" do
    builder =
      Scrobble.new(title: "x", artist: "y")
      |> Scrobble.album("Nevermind")
      |> Scrobble.album_art("https://art")
      |> Scrobble.mb_id("mbid-1")
      |> Scrobble.spotify_link("https://open.spotify.com/track/1")
      |> Scrobble.timestamp(1_700_000_000)

    assert builder.album == "Nevermind"
    assert builder.albumArt == "https://art"
    assert builder.mbId == "mbid-1"
    assert builder.spotifyLink == "https://open.spotify.com/track/1"
    assert builder.timestamp == 1_700_000_000
  end

  test "put/2 sets multiple fields at once and rejects unknown keys" do
    builder =
      Scrobble.new(title: "x", artist: "y")
      |> Scrobble.put(album: "Nevermind", year: 1991)

    assert builder.album == "Nevermind"
    assert builder.year == 1991

    assert_raise KeyError, fn ->
      Scrobble.put(builder, not_a_field: "x")
    end
  end

  test "to_body/1 strips nil fields and keeps camelCase keys" do
    body =
      Scrobble.new(title: "In Bloom", artist: "Nirvana")
      |> Scrobble.album_art("https://art")
      |> Scrobble.mb_id("mbid-1")
      |> Scrobble.to_body()

    assert body == %{
             title: "In Bloom",
             artist: "Nirvana",
             albumArt: "https://art",
             mbId: "mbid-1"
           }
  end

  test "submit/2 issues POST with the builder body" do
    stub_json(:scrobble_builder_submit, %{}, fn conn ->
      assert_method(conn, "POST")
      assert_path(conn, "/xrpc/app.rocksky.scrobble.createScrobble")

      assert read_json_body(conn) == %{
               "title" => "In Bloom",
               "artist" => "Nirvana",
               "album" => "Nevermind",
               "timestamp" => 1_700_000_000
             }
    end)

    client = client(:scrobble_builder_submit, token: "tok")

    assert {:ok, %{}} =
             Scrobble.new(title: "In Bloom", artist: "Nirvana")
             |> Scrobble.album("Nevermind")
             |> Scrobble.timestamp(1_700_000_000)
             |> Scrobble.submit(client)
  end

  test "submit/2 short-circuits when required fields are missing" do
    client = client(:scrobble_builder_missing)

    assert {:error, %Error{reason: :missing_fields, body: %{missing: missing}, status: nil}} =
             Scrobble.new(title: "Only title")
             |> Scrobble.submit(client)

    assert missing == [:artist]
  end

  test "submit/2 lists all missing required fields" do
    client = client(:scrobble_builder_empty)

    assert {:error, %Error{reason: :missing_fields, body: %{missing: missing}}} =
             Scrobble.new() |> Scrobble.submit(client)

    assert :title in missing
    assert :artist in missing
  end
end
