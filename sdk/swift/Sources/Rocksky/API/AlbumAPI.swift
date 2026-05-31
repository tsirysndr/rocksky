import Foundation

public struct AlbumAPI: Sendable {
    let transport: XRPCTransport

    public func getAlbum(uri: String) async throws -> AlbumViewDetailed {
        try await transport.query(
            "app.rocksky.album.getAlbum",
            params: params(("uri", .string(uri)))
        )
    }

    public func getAlbums(
        limit: Int? = nil,
        offset: Int? = nil,
        genre: String? = nil
    ) async throws -> AlbumsResponse {
        try await transport.query(
            "app.rocksky.album.getAlbums",
            params: params(
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) }),
                ("genre", genre.map { .string($0) })
            )
        )
    }

    public func getAlbumTracks(uri: String) async throws -> AlbumTracksResponse {
        try await transport.query(
            "app.rocksky.album.getAlbumTracks",
            params: params(("uri", .string(uri)))
        )
    }
}
