defmodule Rocksky.ClientTest do
  use ExUnit.Case, async: true

  alias Rocksky.Client

  test "defaults to public API base URL" do
    client = Rocksky.new()
    assert client.base_url == "https://api.rocksky.app"
    assert client.token == nil
  end

  test "honors explicit base_url and trims trailing slash" do
    client = Rocksky.new(base_url: "https://example.com/")
    assert client.base_url == "https://example.com"
  end

  test "stores token and extra headers" do
    client = Rocksky.new(token: "abc", headers: [{"x-app", "test"}])
    assert client.token == "abc"
    assert {"x-app", "test"} in client.headers
  end

  test "with_token derives a new client" do
    base = Rocksky.new()
    authed = Client.with_token(base, "tok")
    assert authed.token == "tok"
    assert base.token == nil
  end
end
