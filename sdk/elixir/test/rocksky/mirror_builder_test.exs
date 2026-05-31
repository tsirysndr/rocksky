defmodule Rocksky.Mirror.BuilderTest do
  use ExUnit.Case, async: true

  import Rocksky.Test.ReqHelpers

  alias Rocksky.Error
  alias Rocksky.Mirror.Builder, as: Mirror

  test "submit/2 POSTs to putMirrorSource" do
    stub_json(:mirror_builder, %{}, fn conn ->
      assert_method(conn, "POST")
      assert_path(conn, "/xrpc/app.rocksky.mirror.putMirrorSource")

      assert read_json_body(conn) == %{
               "provider" => "lastfm",
               "enabled" => true,
               "externalUsername" => "alice",
               "apiKey" => "secret"
             }
    end)

    assert {:ok, %{}} =
             Mirror.new(provider: "lastfm", enabled: true)
             |> Mirror.external_username("alice")
             |> Mirror.api_key("secret")
             |> Mirror.submit(client(:mirror_builder, token: "tok"))
  end

  test "accepts snake_case keys in new/1" do
    builder =
      Mirror.new(
        provider: "lastfm",
        enabled: true,
        external_username: "alice",
        api_key: "secret"
      )

    assert builder.externalUsername == "alice"
    assert builder.apiKey == "secret"
  end

  test "submit/2 reports missing required fields" do
    assert {:error, %Error{reason: :missing_fields, body: %{missing: missing}}} =
             Mirror.new(provider: "lastfm")
             |> Mirror.submit(client(:mirror_builder_missing))

    assert missing == [:enabled]
  end
end
