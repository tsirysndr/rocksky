import Foundation

public struct ArtistViewBasic: Codable, Hashable, Sendable {
    public let id: String?
    public let uri: String?
    public let name: String?
    public let picture: String?
    public let sha256: String?
    public let playCount: Int?
    public let uniqueListeners: Int?
    public let tags: [String]?
}

public struct ArtistViewDetailed: Codable, Hashable, Sendable {
    public let id: String?
    public let uri: String?
    public let name: String?
    public let picture: String?
    public let sha256: String?
    public let playCount: Int?
    public let uniqueListeners: Int?
    public let tags: [String]?
}

/// Used inside `app.rocksky.artist.defs#listenerViewBasic.mostListenedSong`.
public struct ArtistSongViewBasic: Codable, Hashable, Sendable {
    public let uri: String?
    public let title: String?
    public let playCount: Int?
}

public struct ListenerViewBasic: Codable, Hashable, Sendable {
    public let id: String?
    public let did: String?
    public let handle: String?
    public let displayName: String?
    public let avatar: String?
    public let mostListenedSong: ArtistSongViewBasic?
    public let totalPlays: Int?
    public let rank: Int?
}

public struct RecentListenerView: Codable, Hashable, Sendable {
    public let id: String?
    public let did: String?
    public let handle: String?
    public let displayName: String?
    public let avatar: String?
    public let timestamp: String?
    public let scrobbleUri: String?
}

/// Used by scrobble records to carry artist MusicBrainz IDs.
public struct ArtistMbid: Codable, Hashable, Sendable {
    public let mbid: String?
    public let name: String?

    public init(mbid: String? = nil, name: String? = nil) {
        self.mbid = mbid
        self.name = name
    }
}

public struct ArtistsResponse: Codable, Sendable {
    public let artists: [ArtistViewBasic]
}

public struct ArtistAlbumsResponse: Codable, Sendable {
    public let albums: [AlbumViewBasic]
}

public struct ArtistTracksResponse: Codable, Sendable {
    public let tracks: [SongViewBasic]
}

public struct ArtistListenersResponse: Codable, Sendable {
    public let listeners: [ListenerViewBasic]
}

public struct ArtistRecentListenersResponse: Codable, Sendable {
    public let listeners: [RecentListenerView]
}
