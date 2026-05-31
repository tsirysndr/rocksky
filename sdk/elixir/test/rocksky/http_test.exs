defmodule Rocksky.HTTPTest do
  use ExUnit.Case, async: true

  import Rocksky.Test.ReqHelpers

  alias Rocksky.{Error, HTTP}

  test "query issues GET to /xrpc/<nsid> with params and parses JSON" do
    stub_json(:http_query, %{"ok" => true}, fn conn ->
      assert_method(conn, "GET")
      assert_path(conn, "/xrpc/app.rocksky.actor.getProfile")
      assert conn.query_params == %{"did" => "alice.bsky.social"}
    end)

    client = client(:http_query)

    assert {:ok, %{"ok" => true}} =
             HTTP.query(client, "app.rocksky.actor.getProfile", did: "alice.bsky.social")
  end

  test "procedure issues POST with JSON body" do
    stub_json(:http_procedure, %{"id" => "k1"}, fn conn ->
      assert_method(conn, "POST")
      assert_path(conn, "/xrpc/app.rocksky.apikey.createApikey")
      assert read_json_body(conn) == %{"name" => "my-key"}
    end)

    client = client(:http_procedure, token: "tok")

    assert {:ok, %{"id" => "k1"}} =
             HTTP.procedure(client, "app.rocksky.apikey.createApikey", [], %{name: "my-key"})
  end

  test "sends Bearer token when client has one" do
    stub_json(:http_auth, %{}, fn conn ->
      assert {"authorization", "Bearer tok"} in conn.req_headers
    end)

    client = client(:http_auth, token: "tok")
    assert {:ok, _} = HTTP.query(client, "app.rocksky.actor.getProfile", did: "x")
  end

  test "omits Authorization header when no token" do
    stub_json(:http_noauth, %{}, fn conn ->
      refute Enum.any?(conn.req_headers, fn {k, _} -> k == "authorization" end)
    end)

    client = client(:http_noauth)
    assert {:ok, _} = HTTP.query(client, "app.rocksky.actor.getProfile", did: "x")
  end

  test "drops nil params and joins list params with commas" do
    stub_json(:http_params, %{}, fn conn ->
      assert conn.query_params == %{"names" => "a,b,c"}
    end)

    client = client(:http_params)

    assert {:ok, _} =
             HTTP.query(client, "app.rocksky.artist.getArtists",
               names: ["a", "b", "c"],
               genre: nil
             )
  end

  test "wraps non-2xx responses in Rocksky.Error" do
    stub_status(:http_404, 404, %{"message" => "not found"})
    client = client(:http_404)

    assert {:error, %Error{status: 404, reason: :not_found, message: "not found"}} =
             HTTP.query(client, "app.rocksky.song.getSong", uri: "missing")
  end

  test "401 surfaces as :unauthorized" do
    stub_status(:http_401, 401, %{"message" => "nope"})
    client = client(:http_401)

    assert {:error, %Error{status: 401, reason: :unauthorized}} =
             HTTP.procedure(client, "app.rocksky.scrobble.createScrobble", [], %{
               title: "x",
               artist: "y"
             })
  end

  test "500 surfaces as :server_error" do
    stub_status(:http_500, 500, %{"message" => "boom"})
    # Disable Req's automatic 5xx retry so the test stays fast and deterministic.
    client = client(:http_500, req_options: [plug: {Req.Test, :http_500}, retry: false])

    assert {:error, %Error{status: 500, reason: :server_error}} =
             HTTP.query(client, "app.rocksky.stats.getStats", did: "x")
  end

  test "transport errors surface as :transport_error" do
    Req.Test.stub(:http_xport, fn conn ->
      Req.Test.transport_error(conn, :econnrefused)
    end)

    client = client(:http_xport, req_options: [plug: {Req.Test, :http_xport}, retry: false])

    assert {:error, %Error{reason: :transport_error}} =
             HTTP.query(client, "app.rocksky.actor.getProfile", did: "x")
  end
end
