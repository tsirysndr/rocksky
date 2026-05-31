import Foundation

public struct SongAPI: Sendable {
    let transport: XRPCTransport

    public func getSong(
        uri: String? = nil,
        mbid: String? = nil,
        isrc: String? = nil,
        spotifyId: String? = nil
    ) async throws -> SongViewDetailed {
        try await transport.query(
            "app.rocksky.song.getSong",
            params: params(
                ("uri", uri.map { .string($0) }),
                ("mbid", mbid.map { .string($0) }),
                ("isrc", isrc.map { .string($0) }),
                ("spotifyId", spotifyId.map { .string($0) })
            )
        )
    }

    public func getSongs(
        limit: Int? = nil,
        offset: Int? = nil,
        genre: String? = nil,
        mbid: String? = nil,
        isrc: String? = nil,
        spotifyId: String? = nil
    ) async throws -> SongsResponse {
        try await transport.query(
            "app.rocksky.song.getSongs",
            params: params(
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) }),
                ("genre", genre.map { .string($0) }),
                ("mbid", mbid.map { .string($0) }),
                ("isrc", isrc.map { .string($0) }),
                ("spotifyId", spotifyId.map { .string($0) })
            )
        )
    }

    public func getSongRecentListeners(
        uri: String,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> SongRecentListenersResponse {
        try await transport.query(
            "app.rocksky.song.getSongRecentListeners",
            params: params(
                ("uri", .string(uri)),
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }

    public func matchSong(
        title: String,
        artist: String,
        mbId: String? = nil,
        isrc: String? = nil
    ) async throws -> SongViewDetailed {
        try await transport.query(
            "app.rocksky.song.matchSong",
            params: params(
                ("title", .string(title)),
                ("artist", .string(artist)),
                ("mbId", mbId.map { .string($0) }),
                ("isrc", isrc.map { .string($0) })
            )
        )
    }

    public func createSong(_ input: CreateSongInput) async throws -> SongViewDetailed {
        try await transport.procedure(
            "app.rocksky.song.createSong",
            body: input
        )
    }

    /// Convenience overload — create a song record without wrapping a
    /// `CreateSongInput` manually.
    @discardableResult
    public func createSong(
        title: String,
        artist: String,
        albumArtist: String,
        album: String,
        duration: Int? = nil,
        mbId: String? = nil,
        isrc: String? = nil,
        albumArt: String? = nil,
        trackNumber: Int? = nil,
        releaseDate: String? = nil,
        year: Int? = nil,
        discNumber: Int? = nil,
        lyrics: String? = nil
    ) async throws -> SongViewDetailed {
        try await createSong(
            CreateSongInput(
                title: title,
                artist: artist,
                albumArtist: albumArtist,
                album: album,
                duration: duration,
                mbId: mbId,
                isrc: isrc,
                albumArt: albumArt,
                trackNumber: trackNumber,
                releaseDate: releaseDate,
                year: year,
                discNumber: discNumber,
                lyrics: lyrics
            )
        )
    }
}
