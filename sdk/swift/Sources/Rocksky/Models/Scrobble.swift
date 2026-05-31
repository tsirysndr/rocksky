import Foundation

public struct ScrobbleViewBasic: Codable, Hashable, Sendable {
    public let id: String?
    public let user: String?
    public let userDisplayName: String?
    public let userAvatar: String?
    public let title: String?
    public let artist: String?
    public let artistUri: String?
    public let album: String?
    public let albumUri: String?
    public let cover: String?
    public let date: String?
    public let uri: String?
    public let sha256: String?
    public let liked: Bool?
    public let likesCount: Int?
}

public struct ScrobbleFirstScrobbleView: Codable, Hashable, Sendable {
    public let handle: String?
    public let avatar: String?
    public let timestamp: String?
}

public struct ScrobbleViewDetailed: Codable, Hashable, Sendable {
    public let id: String?
    public let user: String?
    public let title: String?
    public let artist: String?
    public let artistUri: String?
    public let album: String?
    public let albumUri: String?
    public let cover: String?
    public let date: String?
    public let uri: String?
    public let sha256: String?
    public let listeners: Int?
    public let scrobbles: Int?
    public let artists: [ArtistViewBasic]?
    public let firstScrobble: ScrobbleFirstScrobbleView?
}

public struct ScrobblesResponse: Codable, Sendable {
    public let scrobbles: [ScrobbleViewBasic]
}

/// Input for `app.rocksky.scrobble.createScrobble`. `title` and `artist` are
/// required; everything else is best-effort metadata.
public struct CreateScrobbleInput: Codable, Sendable {
    public let title: String
    public let artist: String
    public let album: String?
    public let duration: Int?
    public let mbId: String?
    public let isrc: String?
    public let albumArt: String?
    public let trackNumber: Int?
    public let releaseDate: String?
    public let year: Int?
    public let discNumber: Int?
    public let lyrics: String?
    public let composer: String?
    public let copyrightMessage: String?
    public let label: String?
    public let artistPicture: String?
    public let spotifyLink: String?
    public let lastfmLink: String?
    public let tidalLink: String?
    public let appleMusicLink: String?
    public let youtubeLink: String?
    public let deezerLink: String?
    /// Unix timestamp in seconds. If omitted, the server uses the current time.
    public let timestamp: Int?

    public init(
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
    ) {
        self.title = title
        self.artist = artist
        self.album = album
        self.duration = duration
        self.mbId = mbId
        self.isrc = isrc
        self.albumArt = albumArt
        self.trackNumber = trackNumber
        self.releaseDate = releaseDate
        self.year = year
        self.discNumber = discNumber
        self.lyrics = lyrics
        self.composer = composer
        self.copyrightMessage = copyrightMessage
        self.label = label
        self.artistPicture = artistPicture
        self.spotifyLink = spotifyLink
        self.lastfmLink = lastfmLink
        self.tidalLink = tidalLink
        self.appleMusicLink = appleMusicLink
        self.youtubeLink = youtubeLink
        self.deezerLink = deezerLink
        self.timestamp = timestamp
    }
}
