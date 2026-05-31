import Foundation

public struct ScrobbleAPI: Sendable {
    let transport: XRPCTransport

    public func getScrobble(uri: String) async throws -> ScrobbleViewDetailed {
        try await transport.query(
            "app.rocksky.scrobble.getScrobble",
            params: params(("uri", .string(uri)))
        )
    }

    public func getScrobbles(
        did: String? = nil,
        following: Bool? = nil,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> ScrobblesResponse {
        try await transport.query(
            "app.rocksky.scrobble.getScrobbles",
            params: params(
                ("did", did.map { .string($0) }),
                ("following", following.map { .bool($0) }),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }

    /// `app.rocksky.scrobble.createScrobble` — requires Bearer auth.
    public func createScrobble(_ input: CreateScrobbleInput) async throws -> ScrobbleViewBasic {
        try await transport.procedure(
            "app.rocksky.scrobble.createScrobble",
            body: input
        )
    }

    /// Convenience overload — scrobble a track without building a
    /// `CreateScrobbleInput` first.
    ///
    /// ```swift
    /// try await client.scrobble.createScrobble(
    ///     title: "Idioteque",
    ///     artist: "Radiohead",
    ///     album: "Kid A",
    ///     duration: 309_000
    /// )
    /// ```
    @discardableResult
    public func createScrobble(
        title: String,
        artist: String,
        album: String? = nil,
        duration: Int? = nil,
        mbId: String? = nil,
        isrc: String? = nil,
        albumArt: String? = nil,
        trackNumber: Int? = nil,
        releaseDate: String? = nil,
        year: Int? = nil,
        discNumber: Int? = nil,
        lyrics: String? = nil,
        composer: String? = nil,
        copyrightMessage: String? = nil,
        label: String? = nil,
        artistPicture: String? = nil,
        spotifyLink: String? = nil,
        lastfmLink: String? = nil,
        tidalLink: String? = nil,
        appleMusicLink: String? = nil,
        youtubeLink: String? = nil,
        deezerLink: String? = nil,
        timestamp: Int? = nil
    ) async throws -> ScrobbleViewBasic {
        try await createScrobble(
            CreateScrobbleInput(
                title: title,
                artist: artist,
                album: album,
                duration: duration,
                mbId: mbId,
                isrc: isrc,
                albumArt: albumArt,
                trackNumber: trackNumber,
                releaseDate: releaseDate,
                year: year,
                discNumber: discNumber,
                lyrics: lyrics,
                composer: composer,
                copyrightMessage: copyrightMessage,
                label: label,
                artistPicture: artistPicture,
                spotifyLink: spotifyLink,
                lastfmLink: lastfmLink,
                tidalLink: tidalLink,
                appleMusicLink: appleMusicLink,
                youtubeLink: youtubeLink,
                deezerLink: deezerLink,
                timestamp: timestamp
            )
        )
    }
}
