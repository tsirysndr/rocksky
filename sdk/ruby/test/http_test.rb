require_relative "test_helper"

class HttpTest < Minitest::Test
  def test_query_issues_get_with_params
    stub_xrpc(:get, "app.rocksky.actor.getProfile",
              body: { "handle" => "alice" })

    body = build_client.actor.get_profile(did: "alice.bsky.social")

    assert_equal "alice", body["handle"]
    assert_requested :get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.actor.getProfile",
                     query: { did: "alice.bsky.social" }
  end

  def test_drops_nil_params
    stub_xrpc(:get, "app.rocksky.actor.getActorScrobbles",
              body: { "scrobbles" => [] })

    build_client.actor.get_actor_scrobbles(did: "alice", limit: 25, offset: nil)

    assert_requested :get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.actor.getActorScrobbles",
                     query: { did: "alice", limit: "25" }
  end

  def test_joins_array_params_with_commas
    stub_xrpc(:get, "app.rocksky.artist.getArtists", body: { "artists" => [] })

    build_client.artist.get_artists(names: %w[Nirvana Pixies])

    assert_requested :get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.artist.getArtists",
                     query: { names: "Nirvana,Pixies" }
  end

  def test_serializes_booleans
    stub_xrpc(:get, "app.rocksky.scrobble.getScrobbles",
              body: { "scrobbles" => [] })

    build_client.scrobble.get_scrobbles(did: "alice", following: true)

    assert_requested :get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.scrobble.getScrobbles",
                     query: { did: "alice", following: "true" }
  end

  def test_procedure_posts_json_body
    stub_xrpc(:post, "app.rocksky.scrobble.createScrobble", body: { "ok" => true })

    build_client(token: "tok").scrobble.create_scrobble(
      title: "In Bloom",
      artist: "Nirvana",
      album: "Nevermind"
    )

    assert_requested(
      :post,
      "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.scrobble.createScrobble"
    ) do |req|
      req.headers["Content-Type"] == "application/json" &&
        req.headers["Authorization"] == "Bearer tok" &&
        JSON.parse(req.body) == {
          "title"  => "In Bloom",
          "artist" => "Nirvana",
          "album"  => "Nevermind"
        }
    end
  end

  def test_attaches_authorization_header_when_token_present
    stub_xrpc(:get, "app.rocksky.actor.getProfile", body: {})

    build_client(token: "tok").actor.get_profile(did: "alice")

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.actor.getProfile",
                     query: { did: "alice" },
                     headers: { "Authorization" => "Bearer tok" })
  end

  def test_omits_authorization_when_no_token
    stub_xrpc(:get, "app.rocksky.actor.getProfile", body: {})

    build_client.actor.get_profile(did: "alice")

    assert_requested(
      :get,
      "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.actor.getProfile",
      query: { did: "alice" }
    ) do |req|
      !req.headers.key?("Authorization")
    end
  end

  def test_sends_user_agent
    stub_xrpc(:get, "app.rocksky.actor.getProfile", body: {})

    build_client.actor.get_profile(did: "alice")

    assert_requested(
      :get,
      "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.actor.getProfile",
      query: { did: "alice" }
    ) do |req|
      req.headers["User-Agent"].start_with?("rocksky-ruby/")
    end
  end

  def test_passes_custom_headers
    stub_xrpc(:get, "app.rocksky.actor.getProfile", body: {})

    build_client(headers: { "X-Trace-Id" => "abc123" })
      .actor.get_profile(did: "alice")

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.actor.getProfile",
                     query: { did: "alice" },
                     headers: { "X-Trace-Id" => "abc123" })
  end

  def test_handles_non_json_response
    stub_request(:get, %r{getProfile}).to_return(
      status: 200,
      headers: { "content-type" => "text/plain" },
      body: "plain"
    )

    assert_equal "plain", build_client.actor.get_profile(did: "x")
  end
end
