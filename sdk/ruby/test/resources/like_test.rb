require_relative "../test_helper"

class LikeTest < Minitest::Test
  def test_like_song
    stub_xrpc(:post, "app.rocksky.like.likeSong", body: {})

    build_client(token: "tok").like.like_song(uri: "at://song")

    assert_requested(
      :post,
      "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.like.likeSong"
    ) do |req|
      JSON.parse(req.body) == { "uri" => "at://song" }
    end
  end

  def test_dislike_song
    stub_xrpc(:post, "app.rocksky.like.dislikeSong", body: {})
    build_client(token: "tok").like.dislike_song(uri: "at://s")

    assert_requested :post,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.like.dislikeSong"
  end

  def test_like_shout
    stub_xrpc(:post, "app.rocksky.like.likeShout", body: {})
    build_client(token: "tok").like.like_shout(uri: "at://s")
    assert_requested :post,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.like.likeShout"
  end
end
