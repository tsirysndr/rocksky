defmodule Rocksky.Apikey.BuilderTest do
  use ExUnit.Case, async: true

  import Rocksky.Test.ReqHelpers

  alias Rocksky.Apikey.Builder, as: Apikey
  alias Rocksky.Error

  test "submit/2 POSTs to createApikey" do
    stub_json(:apikey_builder, %{"id" => "key-1"}, fn conn ->
      assert_path(conn, "/xrpc/app.rocksky.apikey.createApikey")
      assert read_json_body(conn) == %{"name" => "my-bot", "description" => "home server"}
    end)

    assert {:ok, %{"id" => "key-1"}} =
             Apikey.new(name: "my-bot")
             |> Apikey.description("home server")
             |> Apikey.submit(client(:apikey_builder, token: "tok"))
  end

  test "name is required" do
    assert {:error, %Error{reason: :missing_fields, body: %{missing: [:name]}}} =
             Apikey.new() |> Apikey.submit(client(:apikey_builder_missing))
  end
end
