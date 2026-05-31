import Foundation

public struct ActorAPI: Sendable {
    let transport: XRPCTransport

    /// `app.rocksky.actor.getProfile` — full profile (avatar, handle, linked accounts).
    public func getProfile(did: String) async throws -> ProfileViewDetailed {
        try await transport.query(
            "app.rocksky.actor.getProfile",
            params: params(("did", .string(did)))
        )
    }

    /// `app.rocksky.actor.getActorAlbums` — albums a user has scrobbled.
    public func getActorAlbums(
        did: String,
        limit: Int? = nil,
        offset: Int? = nil,
        startDate: Date? = nil,
        endDate: Date? = nil
    ) async throws -> ActorAlbumsResponse {
        try await transport.query(
            "app.rocksky.actor.getActorAlbums",
            params: params(
                ("did", .string(did)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) }),
                ("startDate", startDate.map { .date($0) }),
                ("endDate", endDate.map { .date($0) })
            )
        )
    }

    public func getActorArtists(
        did: String,
        limit: Int? = nil,
        offset: Int? = nil,
        startDate: Date? = nil,
        endDate: Date? = nil
    ) async throws -> ActorArtistsResponse {
        try await transport.query(
            "app.rocksky.actor.getActorArtists",
            params: params(
                ("did", .string(did)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) }),
                ("startDate", startDate.map { .date($0) }),
                ("endDate", endDate.map { .date($0) })
            )
        )
    }

    public func getActorCompatibility(did: String) async throws -> ActorCompatibilityResponse {
        try await transport.query(
            "app.rocksky.actor.getActorCompatibility",
            params: params(("did", .string(did)))
        )
    }

    public func getActorLovedSongs(
        did: String,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> ActorLovedSongsResponse {
        try await transport.query(
            "app.rocksky.actor.getActorLovedSongs",
            params: params(
                ("did", .string(did)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }

    public func getActorNeighbours(did: String) async throws -> ActorNeighboursResponse {
        try await transport.query(
            "app.rocksky.actor.getActorNeighbours",
            params: params(("did", .string(did)))
        )
    }

    public func getActorPlaylists(
        did: String,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> ActorPlaylistsResponse {
        try await transport.query(
            "app.rocksky.actor.getActorPlaylists",
            params: params(
                ("did", .string(did)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }

    public func getActorScrobbles(
        did: String,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> ActorScrobblesResponse {
        try await transport.query(
            "app.rocksky.actor.getActorScrobbles",
            params: params(
                ("did", .string(did)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }

    public func getActorSongs(
        did: String,
        limit: Int? = nil,
        offset: Int? = nil,
        startDate: Date? = nil,
        endDate: Date? = nil
    ) async throws -> ActorSongsResponse {
        try await transport.query(
            "app.rocksky.actor.getActorSongs",
            params: params(
                ("did", .string(did)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) }),
                ("startDate", startDate.map { .date($0) }),
                ("endDate", endDate.map { .date($0) })
            )
        )
    }
}
