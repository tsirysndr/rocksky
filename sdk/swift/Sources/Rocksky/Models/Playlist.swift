import Foundation

public struct PlaylistViewBasic: Codable, Hashable, Sendable {
    public let id: String?
    public let title: String?
    public let uri: String?
    public let curatorDid: String?
    public let curatorHandle: String?
    public let curatorName: String?
    public let curatorAvatarUrl: String?
    public let description: String?
    public let coverImageUrl: String?
    public let createdAt: String?
    public let trackCount: Int?
}

public struct PlaylistViewDetailed: Codable, Hashable, Sendable {
    public let id: String?
    public let title: String?
    public let uri: String?
    public let curatorDid: String?
    public let curatorHandle: String?
    public let curatorName: String?
    public let curatorAvatarUrl: String?
    public let description: String?
    public let coverImageUrl: String?
    public let createdAt: String?
    public let tracks: [SongViewBasic]?
}

public struct PlaylistsResponse: Codable, Sendable {
    public let playlists: [PlaylistViewBasic]
}

public struct CreatePlaylistInput: Codable, Sendable {
    public let name: String
    public let description: String?

    public init(name: String, description: String? = nil) {
        self.name = name
        self.description = description
    }
}
