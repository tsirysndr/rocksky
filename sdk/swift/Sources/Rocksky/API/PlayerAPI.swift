import Foundation

public struct PlayerAPI: Sendable {
    let transport: XRPCTransport

    public func getCurrentlyPlaying(
        playerId: String? = nil,
        actor: String? = nil
    ) async throws -> CurrentlyPlayingView {
        try await transport.query(
            "app.rocksky.player.getCurrentlyPlaying",
            params: params(
                ("playerId", playerId.map { .string($0) }),
                ("actor", actor.map { .string($0) })
            )
        )
    }

    public func getPlaybackQueue(playerId: String? = nil) async throws -> PlaybackQueueView {
        try await transport.query(
            "app.rocksky.player.getPlaybackQueue",
            params: params(("playerId", playerId.map { .string($0) }))
        )
    }

    public func play(playerId: String? = nil) async throws {
        try await transport.procedure(
            "app.rocksky.player.play",
            params: params(("playerId", playerId.map { .string($0) }))
        )
    }

    public func pause(playerId: String? = nil) async throws {
        try await transport.procedure(
            "app.rocksky.player.pause",
            params: params(("playerId", playerId.map { .string($0) }))
        )
    }

    public func next(playerId: String? = nil) async throws {
        try await transport.procedure(
            "app.rocksky.player.next",
            params: params(("playerId", playerId.map { .string($0) }))
        )
    }

    public func previous(playerId: String? = nil) async throws {
        try await transport.procedure(
            "app.rocksky.player.previous",
            params: params(("playerId", playerId.map { .string($0) }))
        )
    }

    public func seek(position: Int, playerId: String? = nil) async throws {
        try await transport.procedure(
            "app.rocksky.player.seek",
            params: params(
                ("position", .int(position)),
                ("playerId", playerId.map { .string($0) })
            )
        )
    }

    public func playFile(fileId: String, playerId: String? = nil) async throws {
        try await transport.procedure(
            "app.rocksky.player.playFile",
            params: params(
                ("fileId", .string(fileId)),
                ("playerId", playerId.map { .string($0) })
            )
        )
    }

    public func playDirectory(
        directoryId: String,
        playerId: String? = nil,
        shuffle: Bool? = nil,
        recurse: Bool? = nil,
        position: Int? = nil
    ) async throws {
        try await transport.procedure(
            "app.rocksky.player.playDirectory",
            params: params(
                ("directoryId", .string(directoryId)),
                ("playerId", playerId.map { .string($0) }),
                ("shuffle", shuffle.map { .bool($0) }),
                ("recurse", recurse.map { .bool($0) }),
                ("position", position.map { .int($0) })
            )
        )
    }

    public func addItemsToQueue(
        items: [String],
        playerId: String? = nil,
        position: Int? = nil,
        shuffle: Bool? = nil
    ) async throws {
        try await transport.procedure(
            "app.rocksky.player.addItemsToQueue",
            params: params(
                ("items", .stringArray(items)),
                ("playerId", playerId.map { .string($0) }),
                ("position", position.map { .int($0) }),
                ("shuffle", shuffle.map { .bool($0) })
            )
        )
    }

    public func addDirectoryToQueue(
        directory: String,
        playerId: String? = nil,
        position: Int? = nil,
        shuffle: Bool? = nil
    ) async throws {
        try await transport.procedure(
            "app.rocksky.player.addDirectoryToQueue",
            params: params(
                ("directory", .string(directory)),
                ("playerId", playerId.map { .string($0) }),
                ("position", position.map { .int($0) }),
                ("shuffle", shuffle.map { .bool($0) })
            )
        )
    }
}
