import Foundation

public struct ShoutAPI: Sendable {
    let transport: XRPCTransport

    public func getAlbumShouts(
        uri: String,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> ShoutsResponse {
        try await transport.query(
            "app.rocksky.shout.getAlbumShouts",
            params: params(
                ("uri", .string(uri)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }

    public func getArtistShouts(
        uri: String,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> ShoutsResponse {
        try await transport.query(
            "app.rocksky.shout.getArtistShouts",
            params: params(
                ("uri", .string(uri)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }

    public func getTrackShouts(uri: String) async throws -> ShoutsResponse {
        try await transport.query(
            "app.rocksky.shout.getTrackShouts",
            params: params(("uri", .string(uri)))
        )
    }

    public func getProfileShouts(
        did: String,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> ShoutsResponse {
        try await transport.query(
            "app.rocksky.shout.getProfileShouts",
            params: params(
                ("did", .string(did)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }

    public func getShoutReplies(
        uri: String,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> ShoutsResponse {
        try await transport.query(
            "app.rocksky.shout.getShoutReplies",
            params: params(
                ("uri", .string(uri)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }

    public func createShout(message: String) async throws -> ShoutView {
        try await transport.procedure(
            "app.rocksky.shout.createShout",
            body: CreateShoutInput(message: message)
        )
    }

    public func replyShout(shoutId: String, message: String) async throws -> ShoutView {
        try await transport.procedure(
            "app.rocksky.shout.replyShout",
            body: ReplyShoutInput(shoutId: shoutId, message: message)
        )
    }

    public func removeShout(id: String) async throws -> ShoutView {
        try await transport.procedure(
            "app.rocksky.shout.removeShout",
            params: params(("id", .string(id))),
            body: Optional<EmptyResponse>.none,
            as: ShoutView.self
        )
    }

    public func reportShout(shoutId: String, reason: String? = nil) async throws -> ShoutView {
        try await transport.procedure(
            "app.rocksky.shout.reportShout",
            body: ReportShoutInput(shoutId: shoutId, reason: reason)
        )
    }
}
