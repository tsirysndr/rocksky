import XCTest
@testable import Rocksky

final class GraphAPITests: XCTestCase {
    let base = URL(string: "https://api.rocksky.app")!

    override func setUp() { super.setUp(); MockURLProtocol.reset() }

    func testGetFollowersDecodesAndCursor() async throws {
        MockURLProtocol.stub(
            path: "/xrpc/app.rocksky.graph.getFollowers",
            with: .json(#"""
            {
              "subject": {"did":"did:plc:abc","handle":"alice.bsky.social"},
              "followers": [
                {"did":"did:plc:bob","handle":"bob.bsky.social"},
                {"did":"did:plc:carol","handle":"carol.bsky.social"}
              ],
              "cursor": "next-page",
              "count": 2
            }
            """#)
        )

        let client = RockskyClient(baseURL: base, session: .mock())
        let result = try await client.graph.getFollowers(actor: "alice.bsky.social", limit: 50)
        XCTAssertEqual(result.subject.handle, "alice.bsky.social")
        XCTAssertEqual(result.followers.count, 2)
        XCTAssertEqual(result.cursor, "next-page")
        XCTAssertEqual(result.count, 2)
    }

    func testGetFollowersExpandsDidsArray() async throws {
        MockURLProtocol.stub(
            path: "/xrpc/app.rocksky.graph.getFollowers",
            with: .json(#"{"subject":{},"followers":[]}"#)
        )
        let client = RockskyClient(baseURL: base, session: .mock())
        _ = try await client.graph.getFollowers(
            actor: "alice.bsky.social",
            dids: ["did:plc:1", "did:plc:2"]
        )
        let req = try XCTUnwrap(MockURLProtocol.recorded.first)
        let components = URLComponents(url: req.url, resolvingAgainstBaseURL: false)
        let didItems = components?.queryItems?.filter { $0.name == "dids" } ?? []
        XCTAssertEqual(didItems.count, 2)
    }
}
