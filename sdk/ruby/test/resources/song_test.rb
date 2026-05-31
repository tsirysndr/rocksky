require_relative "../test_helper"

class SongTest < Minitest::Test
  def test_get_song_supports_alternate_identifiers
    stub_xrpc(:get, "app.rocksky.song.getSong", body: { "title" => "X" })

    build_client.song.get_song(isrc: "USRC17607839")

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.song.getSong",
                     query: { isrc: "USRC17607839" })
  end

  def test_get_song_renames_spotify_id
    stub_xrpc(:get, "app.rocksky.song.getSong", body: {})

    build_client.song.get_song(spotify_id: "abc123")

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.song.getSong",
                     query: { spotifyId: "abc123" })
  end

  def test_match_song
    stub_xrpc(:get, "app.rocksky.song.matchSong", body: {})

    build_client.song.match_song(title: "In Bloom", artist: "Nirvana",
                                 mb_id: "abc", isrc: "USRC")

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.song.matchSong",
                     query: { title: "In Bloom", artist: "Nirvana",
                              mbId: "abc", isrc: "USRC" })
  end

  def test_create_song
    stub_xrpc(:post, "app.rocksky.song.createSong", body: {})

    build_client(token: "tok").song.create_song(
      title: "In Bloom", artist: "Nirvana", album: "Nevermind"
    )

    assert_requested(
      :post,
      "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.song.createSong"
    ) do |req|
      JSON.parse(req.body) == {
        "title"  => "In Bloom",
        "artist" => "Nirvana",
        "album"  => "Nevermind"
      }
    end
  end
end
