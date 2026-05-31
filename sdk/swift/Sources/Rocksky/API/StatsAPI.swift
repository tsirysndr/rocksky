import Foundation

public struct StatsAPI: Sendable {
    let transport: XRPCTransport

    public func getStats(did: String) async throws -> StatsView {
        try await transport.query(
            "app.rocksky.stats.getStats",
            params: params(("did", .string(did)))
        )
    }

    public func getWrapped(did: String, year: Int? = nil) async throws -> WrappedView {
        try await transport.query(
            "app.rocksky.stats.getWrapped",
            params: params(
                ("did", .string(did)),
                ("year", year.map { .int($0) })
            )
        )
    }
}
