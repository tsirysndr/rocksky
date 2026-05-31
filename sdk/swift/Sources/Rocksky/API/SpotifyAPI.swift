import Foundation

public struct SpotifyAPI: Sendable {
    let transport: XRPCTransport

    public func getCurrentlyPlaying(actor: String? = nil) async throws -> CurrentlyPlayingView {
        try await transport.query(
            "app.rocksky.spotify.getCurrentlyPlaying",
            params: params(("actor", actor.map { .string($0) }))
        )
    }

    public func play() async throws {
        try await transport.procedure("app.rocksky.spotify.play")
    }

    public func pause() async throws {
        try await transport.procedure("app.rocksky.spotify.pause")
    }

    public func next() async throws {
        try await transport.procedure("app.rocksky.spotify.next")
    }

    public func previous() async throws {
        try await transport.procedure("app.rocksky.spotify.previous")
    }

    public func seek(position: Int) async throws {
        try await transport.procedure(
            "app.rocksky.spotify.seek",
            params: params(("position", .int(position)))
        )
    }
}
