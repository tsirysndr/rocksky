import Foundation

public struct MirrorAPI: Sendable {
    let transport: XRPCTransport

    public func getMirrorSources() async throws -> MirrorSourcesResponse {
        try await transport.query("app.rocksky.mirror.getMirrorSources")
    }

    public func putMirrorSource(_ input: PutMirrorSourceInput) async throws -> MirrorSourceView {
        try await transport.procedure(
            "app.rocksky.mirror.putMirrorSource",
            body: input
        )
    }

    /// Convenience overload.
    ///
    /// ```swift
    /// try await client.mirror.putMirrorSource(
    ///     provider: "lastfm",
    ///     enabled: true,
    ///     externalUsername: "rj",
    ///     apiKey: secret
    /// )
    /// ```
    @discardableResult
    public func putMirrorSource(
        provider: String,
        enabled: Bool? = nil,
        externalUsername: String? = nil,
        apiKey: String? = nil
    ) async throws -> MirrorSourceView {
        try await putMirrorSource(
            PutMirrorSourceInput(
                provider: provider,
                enabled: enabled,
                externalUsername: externalUsername,
                apiKey: apiKey
            )
        )
    }
}
