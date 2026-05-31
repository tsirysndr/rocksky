import Foundation

public struct GraphAPI: Sendable {
    let transport: XRPCTransport

    public func followAccount(account: String) async throws -> GraphFollowResult {
        try await transport.procedure(
            "app.rocksky.graph.followAccount",
            params: params(("account", .string(account))),
            body: Optional<EmptyResponse>.none,
            as: GraphFollowResult.self
        )
    }

    public func unfollowAccount(account: String) async throws -> GraphFollowResult {
        try await transport.procedure(
            "app.rocksky.graph.unfollowAccount",
            params: params(("account", .string(account))),
            body: Optional<EmptyResponse>.none,
            as: GraphFollowResult.self
        )
    }

    public func getFollowers(
        actor: String,
        limit: Int? = nil,
        dids: [String]? = nil,
        cursor: String? = nil
    ) async throws -> GraphFollowersResponse {
        try await transport.query(
            "app.rocksky.graph.getFollowers",
            params: params(
                ("actor", .string(actor)),
                ("limit", limit.map { .int($0) }),
                ("dids", dids.map { .stringArray($0) }),
                ("cursor", cursor.map { .string($0) })
            )
        )
    }

    public func getFollows(
        actor: String,
        limit: Int? = nil,
        dids: [String]? = nil,
        cursor: String? = nil
    ) async throws -> GraphFollowsResponse {
        try await transport.query(
            "app.rocksky.graph.getFollows",
            params: params(
                ("actor", .string(actor)),
                ("limit", limit.map { .int($0) }),
                ("dids", dids.map { .stringArray($0) }),
                ("cursor", cursor.map { .string($0) })
            )
        )
    }

    public func getKnownFollowers(
        actor: String,
        limit: Int? = nil,
        cursor: String? = nil
    ) async throws -> GraphFollowersResponse {
        try await transport.query(
            "app.rocksky.graph.getKnownFollowers",
            params: params(
                ("actor", .string(actor)),
                ("limit", limit.map { .int($0) }),
                ("cursor", cursor.map { .string($0) })
            )
        )
    }
}
