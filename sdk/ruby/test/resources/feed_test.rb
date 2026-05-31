require_relative "../test_helper"

class FeedTest < Minitest::Test
  def test_search_accepts_positional_argument
    stub_xrpc(:get, "app.rocksky.feed.search", body: { "hits" => [] })

    build_client.feed.search("nirvana")

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.feed.search",
                     query: { query: "nirvana" })
  end

  def test_search_accepts_query_keyword
    stub_xrpc(:get, "app.rocksky.feed.search", body: { "hits" => [] })

    build_client.feed.search(query: "pixies")

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.feed.search",
                     query: { query: "pixies" })
  end

  def test_search_raises_on_empty_input
    assert_raises(ArgumentError) { build_client.feed.search }
    assert_raises(ArgumentError) { build_client.feed.search("") }
  end

  def test_get_feed_passes_cursor
    stub_xrpc(:get, "app.rocksky.feed.getFeed", body: { "feed" => [] })

    build_client.feed.get_feed(feed: "at://x", limit: 50, cursor: "abc")

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.feed.getFeed",
                     query: { feed: "at://x", limit: "50", cursor: "abc" })
  end

  def test_recommendations
    stub_xrpc(:get, "app.rocksky.feed.getRecommendations", body: {})
    stub_xrpc(:get, "app.rocksky.feed.getArtistRecommendations", body: {})
    stub_xrpc(:get, "app.rocksky.feed.getAlbumRecommendations", body: {})

    client = build_client
    client.feed.get_recommendations(did: "alice", limit: 10)
    client.feed.get_artist_recommendations(did: "alice")
    client.feed.get_album_recommendations(did: "alice")

    assert_requested :get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.feed.getRecommendations",
                     query: { did: "alice", limit: "10" }
  end
end
