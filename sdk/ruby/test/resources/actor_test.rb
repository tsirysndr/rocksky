require_relative "../test_helper"

class ActorTest < Minitest::Test
  def test_get_profile
    stub_xrpc(:get, "app.rocksky.actor.getProfile",
              body: { "did" => "did:plc:abc", "handle" => "alice" })

    body = build_client.actor.get_profile(did: "alice")
    assert_equal "alice", body["handle"]
  end

  def test_get_actor_scrobbles_passes_pagination
    stub_xrpc(:get, "app.rocksky.actor.getActorScrobbles",
              body: { "scrobbles" => [] })

    build_client.actor.get_actor_scrobbles(did: "alice", limit: 25, offset: 50)

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.actor.getActorScrobbles",
                     query: { did: "alice", limit: "25", offset: "50" })
  end

  def test_get_actor_albums_renames_dates
    stub_xrpc(:get, "app.rocksky.actor.getActorAlbums", body: {})

    build_client.actor.get_actor_albums(
      did: "alice",
      start_date: "2025-01-01",
      end_date: "2025-12-31"
    )

    assert_requested(:get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.actor.getActorAlbums",
                     query: {
                       did: "alice",
                       startDate: "2025-01-01",
                       endDate: "2025-12-31"
                     })
  end

  def test_neighbours_and_compatibility
    stub_xrpc(:get, "app.rocksky.actor.getActorNeighbours", body: {})
    stub_xrpc(:get, "app.rocksky.actor.getActorCompatibility", body: {})

    client = build_client
    client.actor.get_actor_neighbours(did: "alice")
    client.actor.get_actor_compatibility(did: "alice")

    assert_requested :get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.actor.getActorNeighbours",
                     query: { did: "alice" }
    assert_requested :get,
                     "#{RockskyTest::BASE_URL}/xrpc/app.rocksky.actor.getActorCompatibility",
                     query: { did: "alice" }
  end
end
