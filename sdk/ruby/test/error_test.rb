require_relative "test_helper"

class ErrorTest < Minitest::Test
  def test_400_raises_bad_request
    stub_xrpc(:get, "app.rocksky.song.getSong",
              status: 400, body: { "message" => "missing uri" })

    err = assert_raises(Rocksky::BadRequest) do
      build_client.song.get_song(uri: "x")
    end

    assert_equal 400, err.status
    assert_equal "missing uri", err.message
    assert_equal "app.rocksky.song.getSong", err.nsid
  end

  def test_401_raises_unauthorized
    stub_xrpc(:post, "app.rocksky.scrobble.createScrobble",
              status: 401, body: { "message" => "nope" })

    assert_raises(Rocksky::Unauthorized) do
      build_client.scrobble.create_scrobble(title: "x", artist: "y")
    end
  end

  def test_404_raises_not_found
    stub_xrpc(:get, "app.rocksky.song.getSong",
              status: 404, body: { "message" => "not found" })

    assert_raises(Rocksky::NotFound) do
      build_client.song.get_song(uri: "x")
    end
  end

  def test_429_raises_rate_limited
    stub_xrpc(:get, "app.rocksky.song.getSong",
              status: 429, body: { "message" => "slow down" })

    assert_raises(Rocksky::RateLimited) do
      build_client.song.get_song(uri: "x")
    end
  end

  def test_500_raises_server_error
    stub_xrpc(:get, "app.rocksky.stats.getStats",
              status: 500, body: { "message" => "boom" })

    assert_raises(Rocksky::ServerError) do
      build_client.stats.get_stats(did: "x")
    end
  end

  def test_unknown_status_raises_generic_http_error
    stub_xrpc(:get, "app.rocksky.stats.getStats",
              status: 418, body: { "message" => "teapot" })

    err = assert_raises(Rocksky::HTTPError) do
      build_client.stats.get_stats(did: "x")
    end
    refute_kind_of Rocksky::BadRequest, err
  end

  def test_transport_errors_raise_transport_error
    stub_request(:get, %r{getProfile}).to_raise(SocketError.new("nope"))

    assert_raises(Rocksky::TransportError) do
      build_client.actor.get_profile(did: "x")
    end
  end

  def test_falls_back_to_default_message_when_body_empty
    stub_xrpc(:get, "app.rocksky.song.getSong", status: 500, body: "")

    err = assert_raises(Rocksky::ServerError) do
      build_client.song.get_song(uri: "x")
    end
    assert_equal "request failed", err.message
  end

  def test_extracts_string_body_as_message
    stub_request(:get, %r{getSong}).to_return(
      status: 400, headers: { "content-type" => "text/plain" }, body: "bad input"
    )

    err = assert_raises(Rocksky::BadRequest) do
      build_client.song.get_song(uri: "x")
    end
    assert_equal "bad input", err.message
  end
end
