require_relative "../test_helper"

class ScrobbleTest < Minitest::Test
  def test_create_scrobble_posts_json
    stub_xrpc(:post, "app.rocksky.scrobble.createScrobble", body: { "ok" => true })

    build_client(token: "tok").scrobble.create_scrobble(
      title: "In Bloom",
      artist: "Nirvana",
      album: "Nevermind",
      timestamp: 1_700_000_000
    )

    assert_requested(
      :post,
      "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.scrobble.createScrobble"
    ) do |req|
      JSON.parse(req.body) == {
        "title"     => "In Bloom",
        "artist"    => "Nirvana",
        "album"     => "Nevermind",
        "timestamp" => 1_700_000_000
      }
    end
  end

  def test_create_scrobble_drops_nil_extras
    stub_xrpc(:post, "app.rocksky.scrobble.createScrobble", body: {})

    build_client(token: "tok").scrobble.create_scrobble(
      title: "x",
      artist: "y",
      album: nil
    )

    assert_requested(
      :post,
      "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.scrobble.createScrobble"
    ) do |req|
      parsed = JSON.parse(req.body)
      parsed == { "title" => "x", "artist" => "y" }
    end
  end

  def test_get_scrobble
    stub_xrpc(:get, "app.rocksky.scrobble.getScrobble", body: { "id" => "s1" })

    body = build_client.scrobble.get_scrobble(uri: "at://x")
    assert_equal "s1", body["id"]

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.scrobble.getScrobble",
                     query: { uri: "at://x" })
  end

  def test_get_scrobbles_with_following_flag
    stub_xrpc(:get, "app.rocksky.scrobble.getScrobbles", body: { "scrobbles" => [] })

    build_client.scrobble.get_scrobbles(did: "alice", following: true, limit: 10)

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.scrobble.getScrobbles",
                     query: { did: "alice", following: "true", limit: "10" })
  end
end
