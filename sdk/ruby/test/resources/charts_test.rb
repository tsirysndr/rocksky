require_relative "../test_helper"

class ChartsTest < Minitest::Test
  def test_get_top_artists
    stub_xrpc(:get, "app.rocksky.charts.getTopArtists", body: { "artists" => [] })

    build_client.charts.get_top_artists(limit: 10, start_date: "2025-01-01")

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.charts.getTopArtists",
                     query: { limit: "10", startDate: "2025-01-01" })
  end

  def test_get_scrobbles_chart_renames_uri_params
    stub_xrpc(:get, "app.rocksky.charts.getScrobblesChart", body: {})

    build_client.charts.get_scrobbles_chart(
      did: "alice",
      artist_uri: "at://a",
      album_uri: "at://b",
      song_uri: "at://c"
    )

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.charts.getScrobblesChart",
                     query: {
                       did: "alice",
                       artisturi: "at://a",
                       albumuri: "at://b",
                       songuri: "at://c"
                     })
  end
end
