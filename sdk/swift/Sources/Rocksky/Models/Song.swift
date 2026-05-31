import Foundation

public struct SongViewBasic: Codable, Hashable, Sendable {
    public let id: String?
    public let title: String?
    public let artist: String?
    public let albumArtist: String?
    public let albumArt: String?
    public let uri: String?
    public let album: String?
    public let duration: Int?
    public let trackNumber: Int?
    public let discNumber: Int?
    public let playCount: Int?
    public let uniqueListeners: Int?
    public let albumUri: String?
    public let artistUri: String?
    public let sha256: String?
    public let mbid: String?
    public let isrc: String?
    public let tags: [String]?
    public let createdAt: String?
}

public struct SongFirstScrobbleView: Codable, Hashable, Sendable {
    public let handle: String?
    public let avatar: String?
    public let timestamp: String?
}

public struct SongViewDetailed: Codable, Hashable, Sendable {
    public let id: String?
    public let title: String?
    public let artist: String?
    public let albumArtist: String?
    public let albumArt: String?
    public let uri: String?
    public let album: String?
    public let duration: Int?
    public let trackNumber: Int?
    public let discNumber: Int?
    public let playCount: Int?
    public let uniqueListeners: Int?
    public let albumUri: String?
    public let artistUri: String?
    public let sha256: String?
    public let mbid: String?
    public let isrc: String?
    public let tags: [String]?
    public let createdAt: String?
    public let artists: [ArtistViewBasic]?
    public let firstScrobble: SongFirstScrobbleView?
}

public struct SongRecentListenerView: Codable, Hashable, Sendable {
    public let id: String?
    public let did: String?
    public let handle: String?
    public let displayName: String?
    public let avatar: String?
    public let timestamp: String?
    public let scrobbleUri: String?
}

public struct SongsResponse: Codable, Sendable {
    public let songs: [SongViewBasic]
}

public struct SongRecentListenersResponse: Codable, Sendable {
    public let listeners: [SongRecentListenerView]
}

public struct CreateSongInput: Codable, Sendable {
    public let title: String
    public let artist: String
    public let albumArtist: String
    public let album: String
    public let duration: Int?
    public let mbId: String?
    public let isrc: String?
    public let albumArt: String?
    public let trackNumber: Int?
    public let releaseDate: String?
    public let year: Int?
    public let discNumber: Int?
    public let lyrics: String?

    public init(
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
    ) {
        self.title = title
        self.artist = artist
        self.albumArtist = albumArtist
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
    }
}
