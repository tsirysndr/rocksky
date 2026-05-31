require_relative "test_helper"

class ClientTest < Minitest::Test
  def test_defaults_to_production_base_url
    assert_equal "https://api.rocksky.app", Rocksky::Client::DEFAULT_BASE_URL
  end

  def test_picks_up_env_base_url
    ENV["ROCKSKY_BASE_URL"] = "https://api.staging.rocksky.app"
    client = Rocksky.new
    assert_equal "https://api.staging.rocksky.app", client.base_url
  ensure
    ENV.delete("ROCKSKY_BASE_URL")
  end

  def test_strips_trailing_slash_from_base_url
    client = Rocksky.new(base_url: "https://api.rocksky.app/")
    assert_equal "https://api.rocksky.app", client.base_url
  end

  def test_with_token_returns_new_client
    original = build_client(token: "a")
    derived = original.with_token("b")

    assert_equal "a", original.token
    assert_equal "b", derived.token
    refute_same original, derived
    assert_equal original.base_url, derived.base_url
  end

  def test_inspect_filters_token
    client = build_client(token: "secret")
    refute_includes client.inspect, "secret"
    assert_includes client.inspect, "[FILTERED]"
  end

  def test_resource_accessors_memoise
    client = build_client
    assert_same client.actor, client.actor
    assert_same client.scrobble, client.scrobble
    assert_kind_of Rocksky::Resources::Actor, client.actor
    assert_kind_of Rocksky::Resources::Scrobble, client.scrobble
  end

  def test_raw_query_passthrough
    stub_xrpc(:get, "app.rocksky.actor.getProfile",
              body: { "handle" => "alice" })

    body = build_client.query("app.rocksky.actor.getProfile", did: "alice")
    assert_equal "alice", body["handle"]
  end
end
