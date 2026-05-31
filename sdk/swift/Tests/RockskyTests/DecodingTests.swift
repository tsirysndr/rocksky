import XCTest
@testable import Rocksky

final class DecodingTests: XCTestCase {
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    func testProfileViewDetailedDecodes() throws {
        let json = """
        {
          "id": "u-1",
          "did": "did:plc:abc",
          "handle": "alice.bsky.social",
          "displayName": "Alice",
          "avatar": "https://cdn.example/a.jpg",
          "createdAt": "2024-01-02T03:04:05.000Z",
          "updatedAt": "2024-06-01T00:00:00.000Z",
          "spotifyConnected": true
        }
        """
        let view = try decoder.decode(ProfileViewDetailed.self, from: Data(json.utf8))
        XCTAssertEqual(view.handle, "alice.bsky.social")
        XCTAssertEqual(view.spotifyConnected, true)
    }

    func testScrobblesResponseDecodes() throws {
        let json = """
        {
          "scrobbles": [
            {"id":"s1","title":"Pyramid Song","artist":"Radiohead","liked":true,"likesCount":7}
          ]
        }
        """
        let resp = try decoder.decode(ScrobblesResponse.self, from: Data(json.utf8))
        XCTAssertEqual(resp.scrobbles.count, 1)
        XCTAssertEqual(resp.scrobbles[0].title, "Pyramid Song")
        XCTAssertEqual(resp.scrobbles[0].liked, true)
        XCTAssertEqual(resp.scrobbles[0].likesCount, 7)
    }

    func testSearchHitDispatchesOnDollarType() throws {
        let json = """
        [
          {"$type":"app.rocksky.song.defs#songViewBasic","title":"OK Computer"},
          {"$type":"app.rocksky.artist.defs#artistViewBasic","name":"Radiohead"},
          {"$type":"some.unknown.type#x","whatever":1}
        ]
        """
        let hits = try decoder.decode([SearchHit].self, from: Data(json.utf8))
        XCTAssertEqual(hits.count, 3)
        if case .song(let s) = hits[0] { XCTAssertEqual(s.title, "OK Computer") } else { XCTFail() }
        if case .artist(let a) = hits[1] { XCTAssertEqual(a.name, "Radiohead") } else { XCTFail() }
        if case .unknown = hits[2] { /* ok */ } else { XCTFail() }
    }

    func testWrappedViewDecodes() throws {
        let json = """
        {
          "year": 2025,
          "totalScrobbles": 12345,
          "totalListeningTimeMinutes": 50000,
          "topArtists": [{"id":"a1","name":"Boards of Canada","playCount":900}],
          "topTracks": [{"id":"t1","title":"Roygbiv","playCount":120}],
          "topAlbums": [],
          "topGenres": [{"genre":"idm","count":600}],
          "scrobblesPerMonth": [{"month":1,"count":1000}],
          "mostActiveDay": {"date":"2025-07-04","count":300},
          "mostActiveHour": 21,
          "newArtistsCount": 50,
          "longestStreak": 14
        }
        """
        let view = try decoder.decode(WrappedView.self, from: Data(json.utf8))
        XCTAssertEqual(view.year, 2025)
        XCTAssertEqual(view.topArtists?.first?.name, "Boards of Canada")
        XCTAssertEqual(view.mostActiveHour, 21)
    }
}
