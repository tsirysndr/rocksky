import Foundation

public struct FeedAPI: Sendable {
    let transport: XRPCTransport

    public func getFeed(feed: String, limit: Int? = nil, cursor: String? = nil) async throws -> FeedResponse {
        try await transport.query(
            "app.rocksky.feed.getFeed",
            params: params(
                ("feed", .string(feed)),
                ("limit", limit.map { .int($0) }),
                ("cursor", cursor.map { .string($0) })
            )
        )
    }

    public func getFeedSkeleton(
        feed: String,
        limit: Int? = nil,
        offset: Int? = nil,
        cursor: String? = nil
    ) async throws -> FeedSkeletonResponse {
        try await transport.query(
            "app.rocksky.feed.getFeedSkeleton",
            params: params(
                ("feed", .string(feed)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) }),
                ("cursor", cursor.map { .string($0) })
            )
        )
    }

    public func getFeedGenerator(feed: String) async throws -> FeedGeneratorResponse {
        try await transport.query(
            "app.rocksky.feed.getFeedGenerator",
            params: params(("feed", .string(feed)))
        )
    }

    public func getFeedGenerators(size: Int? = nil) async throws -> FeedGeneratorsResponse {
        try await transport.query(
            "app.rocksky.feed.getFeedGenerators",
            params: params(("size", size.map { .int($0) }))
        )
    }

    public func describeFeedGenerator() async throws -> DescribeFeedGeneratorResponse {
        try await transport.query("app.rocksky.feed.describeFeedGenerator")
    }

    public func getRecommendations(did: String, limit: Int? = nil) async throws -> RecommendationsResponse {
        try await transport.query(
            "app.rocksky.feed.getRecommendations",
            params: params(
                ("did", .string(did)),
                ("limit", limit.map { .int($0) })
            )
        )
    }

    public func getArtistRecommendations(did: String, limit: Int? = nil) async throws -> RecommendedArtistsResponse {
        try await transport.query(
            "app.rocksky.feed.getArtistRecommendations",
            params: params(
                ("did", .string(did)),
                ("limit", limit.map { .int($0) })
            )
        )
    }

    public func getAlbumRecommendations(did: String, limit: Int? = nil) async throws -> RecommendedAlbumsResponse {
        try await transport.query(
            "app.rocksky.feed.getAlbumRecommendations",
            params: params(
                ("did", .string(did)),
                ("limit", limit.map { .int($0) })
            )
        )
    }

    public func getStories(size: Int? = nil) async throws -> StoriesResponse {
        try await transport.query(
            "app.rocksky.feed.getStories",
            params: params(("size", size.map { .int($0) }))
        )
    }

    public func search(query: String) async throws -> SearchResults {
        try await transport.query(
            "app.rocksky.feed.search",
            params: params(("query", .string(query)))
        )
    }
}
