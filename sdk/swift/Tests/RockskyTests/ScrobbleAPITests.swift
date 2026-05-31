import XCTest
@testable import Rocksky

final class ScrobbleAPITests: XCTestCase {
    let base = URL(string: "https://api.rocksky.app")!

    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
    }

    func testCreateScrobbleSendsPostWithJSONBody() async throws {
        MockURLProtocol.stub(
            path: "/xrpc/app.rocksky.scrobble.createScrobble",
            with: .json(#"{"id":"123","title":"Idioteque","artist":"Radiohead"}"#)
        )

        let client = RockskyClient(baseURL: base, auth: .apiKey("rk_xxx"), session: .mock())
        let result = try await client.scrobble.createScrobble(
            CreateScrobbleInput(
                title: "Idioteque",
                artist: "Radiohead",
                album: "Kid A",
                duration: 309_000,
                timestamp: 1_700_000_000
            )
        )

        XCTAssertEqual(result.title, "Idioteque")

        let req = try XCTUnwrap(MockURLProtocol.recorded.first)
        XCTAssertEqual(req.method, "POST")
        XCTAssertEqual(req.headers["Content-Type"], "application/json")
        let payload = try XCTUnwrap(req.body)
        let dict = try JSONSerialization.jsonObject(with: payload) as? [String: Any]
        XCTAssertEqual(dict?["title"] as? String, "Idioteque")
        XCTAssertEqual(dict?["artist"] as? String, "Radiohead")
        XCTAssertEqual(dict?["album"] as? String, "Kid A")
        XCTAssertEqual(dict?["duration"] as? Int, 309_000)
    }

    func testCreateScrobbleConvenienceOverloadProducesIdenticalRequest() async throws {
        MockURLProtocol.stub(
            path: "/xrpc/app.rocksky.scrobble.createScrobble",
            with: .json(#"{"id":"x"}"#)
        )
        let client = RockskyClient(baseURL: base, auth: .apiKey("k"), session: .mock())
        _ = try await client.scrobble.createScrobble(
            title: "Idioteque",
            artist: "Radiohead",
            album: "Kid A",
            duration: 309_000,
            timestamp: 1_700_000_000
        )
        let req = try XCTUnwrap(MockURLProtocol.recorded.first)
        let payload = try XCTUnwrap(req.body)
        let dict = try JSONSerialization.jsonObject(with: payload) as? [String: Any]
        XCTAssertEqual(dict?["title"] as? String, "Idioteque")
        XCTAssertEqual(dict?["artist"] as? String, "Radiohead")
        XCTAssertEqual(dict?["album"] as? String, "Kid A")
        XCTAssertEqual(dict?["duration"] as? Int, 309_000)
        XCTAssertEqual(dict?["timestamp"] as? Int, 1_700_000_000)
    }

    func testGetScrobblesHasPaginationParams() async throws {
        MockURLProtocol.stub(
            path: "/xrpc/app.rocksky.scrobble.getScrobbles",
            with: .json(#"{"scrobbles":[]}"#)
        )
        let client = RockskyClient(baseURL: base, session: .mock())
        _ = try await client.scrobble.getScrobbles(
            did: "did:plc:abc",
            following: true,
            limit: 50,
            offset: 100
        )
        let req = try XCTUnwrap(MockURLProtocol.recorded.first)
        let q = req.url.query ?? ""
        XCTAssertTrue(q.contains("did=did:plc:abc") || q.contains("did=did%3Aplc%3Aabc"))
        XCTAssertTrue(q.contains("following=true"))
        XCTAssertTrue(q.contains("limit=50"))
        XCTAssertTrue(q.contains("offset=100"))
    }
}
