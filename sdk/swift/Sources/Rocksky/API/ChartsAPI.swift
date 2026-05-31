import Foundation

public struct ChartsAPI: Sendable {
    let transport: XRPCTransport

    public func getTopArtists(
        limit: Int? = nil,
        offset: Int? = nil,
        startDate: Date? = nil,
        endDate: Date? = nil
    ) async throws -> TopArtistsResponse {
        try await transport.query(
            "app.rocksky.charts.getTopArtists",
            params: params(
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) }),
                ("startDate", startDate.map { .date($0) }),
                ("endDate", endDate.map { .date($0) })
            )
        )
    }

    public func getTopTracks(
        limit: Int? = nil,
        offset: Int? = nil,
        startDate: Date? = nil,
        endDate: Date? = nil
    ) async throws -> TopTracksResponse {
        try await transport.query(
            "app.rocksky.charts.getTopTracks",
            params: params(
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) }),
                ("startDate", startDate.map { .date($0) }),
                ("endDate", endDate.map { .date($0) })
            )
        )
    }

    public func getScrobblesChart(
        did: String? = nil,
        artistUri: String? = nil,
        albumUri: String? = nil,
        songUri: String? = nil,
        genre: String? = nil,
        from: String? = nil,
        to: String? = nil
    ) async throws -> ChartsView {
        try await transport.query(
            "app.rocksky.charts.getScrobblesChart",
            params: params(
                ("did", did.map { .string($0) }),
                ("artisturi", artistUri.map { .string($0) }),
                ("albumuri", albumUri.map { .string($0) }),
                ("songuri", songUri.map { .string($0) }),
                ("genre", genre.map { .string($0) }),
                ("from", from.map { .string($0) }),
                ("to", to.map { .string($0) })
            )
        )
    }
}
