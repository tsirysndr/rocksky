import Foundation

// MARK: - app.rocksky.actor.defs

public struct ProfileViewBasic: Codable, Hashable, Sendable {
    public let id: String?
    public let did: String?
    public let handle: String?
    public let displayName: String?
    public let avatar: String?
    public let createdAt: String?
    public let updatedAt: String?
}

public struct ProfileViewDetailed: Codable, Hashable, Sendable {
    public let id: String?
    public let did: String?
    public let handle: String?
    public let displayName: String?
    public let avatar: String?
    public let createdAt: String?
    public let updatedAt: String?
    // The server enriches this with linked-account state, but the lexicon
    // doesn't pin a schema for them, so we keep them as opaque JSON.
    public let spotifyConnected: Bool?
}

public struct ArtistViewBasicShared: Codable, Hashable, Sendable {
    public let id: String?
    public let name: String?
    public let picture: String?
    public let uri: String?
    public let user1Rank: Int?
    public let user2Rank: Int?
    public let weight: Int?
}

public struct NeighbourViewBasic: Codable, Hashable, Sendable {
    public let userId: String?
    public let did: String?
    public let handle: String?
    public let displayName: String?
    public let avatar: String?
    public let sharedArtistsCount: Int?
    public let similarityScore: Int?
    public let topSharedArtistNames: [String]?
    public let topSharedArtistsDetails: [ArtistViewBasic]?
}

public struct CompatibilityViewBasic: Codable, Hashable, Sendable {
    public let compatibilityLevel: Int?
    public let compatibilityPercentage: Int?
    public let sharedArtists: Int?
    public let topSharedArtistNames: [String]?
    public let topSharedDetailedArtists: [ArtistViewBasicShared]?
    public let user1ArtistCount: Int?
    public let user2ArtistCount: Int?
}

public struct TrackView: Codable, Hashable, Sendable {
    public let name: String
    public let artist: String
    public let album: String?
    public let albumCoverUrl: String?
    public let durationMs: Int?
    public let source: String?
    public let recordingMbId: String?

    public init(
        name: String,
        artist: String,
        album: String? = nil,
        albumCoverUrl: String? = nil,
        durationMs: Int? = nil,
        source: String? = nil,
        recordingMbId: String? = nil
    ) {
        self.name = name
        self.artist = artist
        self.album = album
        self.albumCoverUrl = albumCoverUrl
        self.durationMs = durationMs
        self.source = source
        self.recordingMbId = recordingMbId
    }
}

// MARK: - Query response wrappers

public struct ActorAlbumsResponse: Codable, Sendable {
    public let albums: [AlbumViewBasic]
}

public struct ActorArtistsResponse: Codable, Sendable {
    public let artists: [ArtistViewBasic]
}

public struct ActorCompatibilityResponse: Codable, Sendable {
    public let compatibility: CompatibilityViewBasic?
}

public struct ActorLovedSongsResponse: Codable, Sendable {
    public let tracks: [SongViewBasic]
}

public struct ActorNeighboursResponse: Codable, Sendable {
    public let neighbours: [NeighbourViewBasic]
}

public struct ActorPlaylistsResponse: Codable, Sendable {
    public let playlists: [PlaylistViewBasic]
}

public struct ActorScrobblesResponse: Codable, Sendable {
    public let scrobbles: [ScrobbleViewBasic]
}

public struct ActorSongsResponse: Codable, Sendable {
    public let songs: [SongViewBasic]
}
