require_relative "../test_helper"

class GraphTest < Minitest::Test
  def test_follow_account_posts_with_query_param
    stub_xrpc(:post, "app.rocksky.graph.followAccount", body: { "ok" => true })

    build_client(token: "tok").graph.follow_account(account: "alice.bsky.social")

    assert_requested(:post,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.graph.followAccount",
                     query: { account: "alice.bsky.social" })
  end

  def test_unfollow_account
    stub_xrpc(:post, "app.rocksky.graph.unfollowAccount", body: {})

    build_client(token: "tok").graph.unfollow_account(account: "alice.bsky.social")

    assert_requested :post,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.graph.unfollowAccount",
                     query: { account: "alice.bsky.social" }
  end

  def test_get_followers_supports_dids_array
    stub_xrpc(:get, "app.rocksky.graph.getFollowers", body: { "followers" => [] })

    build_client.graph.get_followers(
      actor: "alice",
      dids: %w[did:plc:1 did:plc:2],
      limit: 50
    )

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.graph.getFollowers",
                     query: {
                       actor: "alice",
                       dids: "did:plc:1,did:plc:2",
                       limit: "50"
                     })
  end
end
