import Foundation

public struct LikeAPI: Sendable {
    let transport: XRPCTransport

    private struct UriBody: Codable, Sendable {
        let uri: String
    }

    public func likeSong(uri: String) async throws -> SongViewDetailed {
        try await transport.procedure(
            "app.rocksky.like.likeSong",
            body: UriBody(uri: uri)
        )
    }

    public func dislikeSong(uri: String) async throws -> SongViewDetailed {
        try await transport.procedure(
            "app.rocksky.like.dislikeSong",
            body: UriBody(uri: uri)
        )
    }

    public func likeShout(uri: String) async throws -> ShoutView {
        try await transport.procedure(
            "app.rocksky.like.likeShout",
            body: UriBody(uri: uri)
        )
    }

    public func dislikeShout(uri: String) async throws -> ShoutView {
        try await transport.procedure(
            "app.rocksky.like.dislikeShout",
            body: UriBody(uri: uri)
        )
    }
}
