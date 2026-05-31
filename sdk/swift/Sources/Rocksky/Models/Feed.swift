import Foundation

public struct StoryView: Codable, Hashable, Sendable {
    public let album: String?
    public let albumArt: String?
    public let albumArtist: String?
    public let albumUri: String?
    public let artist: String?
    public let artistUri: String?
    public let avatar: String?
    public let createdAt: String?
    public let did: String?
    public let handle: String?
    public let id: String?
    public let title: String?
    public let trackId: String?
    public let trackUri: String?
    public let uri: String?
}

public struct StoriesResponse: Codable, Sendable {
    public let stories: [StoryView]
}

public struct FeedGeneratorView: Codable, Hashable, Sendable {
    public let id: String?
    public let name: String?
    public let description: String?
    public let uri: String?
    public let avatar: String?
    public let creator: ProfileViewBasic?
}

public struct FeedGeneratorsResponse: Codable, Sendable {
    public let feeds: [FeedGeneratorView]
}

public struct FeedGeneratorResponse: Codable, Sendable {
    public let view: FeedGeneratorView?
}

public struct FeedItemView: Codable, Sendable {
    public let scrobble: ScrobbleViewBasic?
}

public struct FeedResponse: Codable, Sendable {
    public let feed: [FeedItemView]
    public let cursor: String?
}

public struct RecommendationView: Codable, Hashable, Sendable {
    public let title: String?
    public let artist: String?
    public let album: String?
    public let albumArt: String?
    public let trackUri: String?
    public let artistUri: String?
    public let albumUri: String?
    public let genres: [String]?
    public let recommendationScore: Int?
    /// `neighbour` | `social` | `serendipity`
    public let source: String?
    public let likesCount: Int?
}

public struct RecommendationsResponse: Codable, Sendable {
    public let recommendations: [RecommendationView]
    public let cursor: String?
}

public struct RecommendedArtistView: Codable, Hashable, Sendable {
    public let id: String?
    public let uri: String?
    public let name: String?
    public let picture: String?
    public let genres: [String]?
    public let recommendationScore: Int?
    public let source: String?
}

public struct RecommendedArtistsResponse: Codable, Sendable {
    public let artists: [RecommendedArtistView]
    public let cursor: String?
}

public struct RecommendedAlbumView: Codable, Hashable, Sendable {
    public let id: String?
    public let uri: String?
    public let title: String?
    public let artist: String?
    public let artistUri: String?
    public let year: Int?
    public let albumArt: String?
    public let recommendationScore: Int?
    public let source: String?
}

public struct RecommendedAlbumsResponse: Codable, Sendable {
    public let albums: [RecommendedAlbumView]
    public let cursor: String?
}

/// One result inside `app.rocksky.feed.search`. The server returns a
/// heterogeneous array — we decode each entry based on the AT Protocol
/// `$type` discriminator.
public enum SearchHit: Codable, Sendable {
    case song(SongViewBasic)
    case album(AlbumViewBasic)
    case artist(ArtistViewBasic)
    case playlist(PlaylistViewBasic)
    case profile(ProfileViewBasic)
    case unknown

    private enum TypeKey: String, CodingKey { case type = "$type" }

    public init(from decoder: Decoder) throws {
        let typeContainer = try decoder.container(keyedBy: TypeKey.self)
        let type = try typeContainer.decodeIfPresent(String.self, forKey: .type)
        let single = try decoder.singleValueContainer()
        switch type {
        case "app.rocksky.song.defs#songViewBasic":
            self = .song(try single.decode(SongViewBasic.self))
        case "app.rocksky.album.defs#albumViewBasic":
            self = .album(try single.decode(AlbumViewBasic.self))
        case "app.rocksky.artist.defs#artistViewBasic":
            self = .artist(try single.decode(ArtistViewBasic.self))
        case "app.rocksky.playlist.defs#playlistViewBasic":
            self = .playlist(try single.decode(PlaylistViewBasic.self))
        case "app.rocksky.actor.defs#profileViewBasic":
            self = .profile(try single.decode(ProfileViewBasic.self))
        default:
            // Permissive: don't blow up on a type the SDK hasn't met yet.
            self = .unknown
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .song(let s): try container.encode(s)
        case .album(let a): try container.encode(a)
        case .artist(let a): try container.encode(a)
        case .playlist(let p): try container.encode(p)
        case .profile(let p): try container.encode(p)
        case .unknown: try container.encodeNil()
        }
    }
}

public struct SearchResults: Codable, Sendable {
    public let hits: [SearchHit]?
    public let processingTimeMs: Int?
    public let limit: Int?
    public let offset: Int?
    public let estimatedTotalHits: Int?
}

public struct FeedSkeletonResponse: Codable, Sendable {
    public let scrobbles: [ScrobbleViewBasic]?
    public let cursor: String?
}

public struct DescribeFeedGeneratorResponse: Codable, Sendable {
    public let did: String?
    public let feeds: [FeedUriView]?

    public struct FeedUriView: Codable, Hashable, Sendable {
        public let uri: String?
    }
}
