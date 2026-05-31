import Foundation

public struct PlaylistAPI: Sendable {
    let transport: XRPCTransport

    public func getPlaylist(uri: String) async throws -> PlaylistViewDetailed {
        try await transport.query(
            "app.rocksky.playlist.getPlaylist",
            params: params(("uri", .string(uri)))
        )
    }

    public func getPlaylists(limit: Int? = nil, offset: Int? = nil) async throws -> PlaylistsResponse {
        try await transport.query(
            "app.rocksky.playlist.getPlaylists",
            params: params(
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }

    public func createPlaylist(name: String, description: String? = nil) async throws {
        try await transport.procedure(
            "app.rocksky.playlist.createPlaylist",
            params: params(
                ("name", .string(name)),
                ("description", description.map { .string($0) })
            )
        )
    }

    public func startPlaylist(
        uri: String,
        shuffle: Bool? = nil,
        position: Int? = nil
    ) async throws {
        try await transport.procedure(
            "app.rocksky.playlist.startPlaylist",
            params: params(
                ("uri", .string(uri)),
                ("shuffle", shuffle.map { .bool($0) }),
                ("position", position.map { .int($0) })
            )
        )
    }

    public func insertFiles(uri: String, files: [String], position: Int? = nil) async throws {
        try await transport.procedure(
            "app.rocksky.playlist.insertFiles",
            params: params(
                ("uri", .string(uri)),
                ("files", .stringArray(files)),
                ("position", position.map { .int($0) })
            )
        )
    }

    public func insertDirectory(uri: String, directory: String, position: Int? = nil) async throws {
        try await transport.procedure(
            "app.rocksky.playlist.insertDirectory",
            params: params(
                ("uri", .string(uri)),
                ("directory", .string(directory)),
                ("position", position.map { .int($0) })
            )
        )
    }

    public func removeTrack(uri: String, position: Int) async throws {
        try await transport.procedure(
            "app.rocksky.playlist.removeTrack",
            params: params(
                ("uri", .string(uri)),
                ("position", .int(position))
            )
        )
    }

    public func removePlaylist(uri: String) async throws {
        try await transport.procedure(
            "app.rocksky.playlist.removePlaylist",
            params: params(("uri", .string(uri)))
        )
    }
}
