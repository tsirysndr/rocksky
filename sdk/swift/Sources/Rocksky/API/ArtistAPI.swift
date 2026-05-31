import Foundation

public struct ArtistAPI: Sendable {
    let transport: XRPCTransport

    public func getArtist(uri: String) async throws -> ArtistViewDetailed {
        try await transport.query(
            "app.rocksky.artist.getArtist",
            params: params(("uri", .string(uri)))
        )
    }

    public func getArtists(
        limit: Int? = nil,
        offset: Int? = nil,
        names: String? = nil,
        genre: String? = nil
    ) async throws -> ArtistsResponse {
        try await transport.query(
            "app.rocksky.artist.getArtists",
            params: params(
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) }),
                ("names", names.map { .string($0) }),
                ("genre", genre.map { .string($0) })
            )
        )
    }

    public func getArtistAlbums(uri: String) async throws -> ArtistAlbumsResponse {
        try await transport.query(
            "app.rocksky.artist.getArtistAlbums",
            params: params(("uri", .string(uri)))
        )
    }

    public func getArtistTracks(
        uri: String? = nil,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> ArtistTracksResponse {
        try await transport.query(
            "app.rocksky.artist.getArtistTracks",
            params: params(
                ("uri", uri.map { .string($0) }),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }

    public func getArtistListeners(
        uri: String,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> ArtistListenersResponse {
        try await transport.query(
            "app.rocksky.artist.getArtistListeners",
            params: params(
                ("uri", .string(uri)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }

    public func getArtistRecentListeners(
        uri: String,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> ArtistRecentListenersResponse {
        try await transport.query(
            "app.rocksky.artist.getArtistRecentListeners",
            params: params(
                ("uri", .string(uri)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }
}
