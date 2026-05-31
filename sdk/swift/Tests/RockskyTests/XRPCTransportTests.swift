import XCTest
@testable import Rocksky

final class XRPCTransportTests: XCTestCase {
    let base = URL(string: "https://api.rocksky.app")!

    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
    }

    func testGetBuildsCorrectURLAndDecodes() async throws {
        MockURLProtocol.stub(
            path: "/xrpc/app.rocksky.actor.getProfile",
            with: .json(#"{"id":"abc","did":"did:plc:xyz","handle":"alice.bsky.social","displayName":"Alice"}"#)
        )

        let client = RockskyClient(baseURL: base, session: .mock())
        let profile = try await client.actor.getProfile(did: "alice.bsky.social")

        XCTAssertEqual(profile.handle, "alice.bsky.social")
        XCTAssertEqual(profile.displayName, "Alice")

        let req = try XCTUnwrap(MockURLProtocol.recorded.first)
        XCTAssertEqual(req.method, "GET")
        XCTAssertEqual(req.url.path, "/xrpc/app.rocksky.actor.getProfile")
        XCTAssertTrue(req.url.query?.contains("did=alice.bsky.social") ?? false)
        XCTAssertEqual(req.headers["Accept"], "application/json")
        XCTAssertNil(req.headers["Authorization"], "Default client should not send auth")
    }

    func testBearerAuthHeader() async throws {
        MockURLProtocol.stub(
            path: "/xrpc/app.rocksky.stats.getStats",
            with: .json(#"{"scrobbles":42}"#)
        )
        let client = RockskyClient(baseURL: base, auth: .bearer("secret-token"), session: .mock())
        let stats = try await client.stats.getStats(did: "did:plc:abc")
        XCTAssertEqual(stats.scrobbles, 42)

        let req = try XCTUnwrap(MockURLProtocol.recorded.first)
        XCTAssertEqual(req.headers["Authorization"], "Bearer secret-token")
    }

    func testApiKeyAuthHeader() async throws {
        MockURLProtocol.stub(
            path: "/xrpc/app.rocksky.stats.getStats",
            with: .json(#"{"scrobbles":1}"#)
        )
        let client = RockskyClient(baseURL: base, auth: .apiKey("rk_live_xxx"), session: .mock())
        _ = try await client.stats.getStats(did: "did:plc:abc")

        let req = try XCTUnwrap(MockURLProtocol.recorded.first)
        XCTAssertEqual(req.headers["Authorization"], "Bearer rk_live_xxx")
    }

    func testHTTPErrorIsThrownWithDecodedBody() async {
        MockURLProtocol.stub(
            path: "/xrpc/app.rocksky.actor.getProfile",
            with: .init(
                status: 401,
                body: Data(#"{"error":"AuthRequired","message":"Bearer token missing"}"#.utf8),
                headers: ["Content-Type": "application/json"]
            )
        )
        let client = RockskyClient(baseURL: base, session: .mock())
        do {
            _ = try await client.actor.getProfile(did: "alice.bsky.social")
            XCTFail("Expected RockskyError.http")
        } catch let RockskyError.http(status, body, _) {
            XCTAssertEqual(status, 401)
            XCTAssertEqual(body?.error, "AuthRequired")
            XCTAssertEqual(body?.message, "Bearer token missing")
        } catch {
            XCTFail("Wrong error: \(error)")
        }
    }

    func testDecodingErrorIsThrown() async {
        MockURLProtocol.stub(
            path: "/xrpc/app.rocksky.stats.getStats",
            with: .json(#"{"scrobbles":"not-a-number"}"#)
        )
        let client = RockskyClient(baseURL: base, session: .mock())
        do {
            _ = try await client.stats.getStats(did: "did:plc:abc")
            XCTFail("Expected RockskyError.decoding")
        } catch RockskyError.decoding {
            // expected
        } catch {
            XCTFail("Wrong error: \(error)")
        }
    }
}
