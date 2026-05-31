import Foundation

public struct AlbumViewBasic: Codable, Hashable, Sendable {
    public let id: String?
    public let uri: String?
    public let title: String?
    public let artist: String?
    public let artistUri: String?
    public let year: Int?
    public let albumArt: String?
    public let releaseDate: String?
    public let sha256: String?
    public let playCount: Int?
    public let uniqueListeners: Int?
}

public struct AlbumViewDetailed: Codable, Hashable, Sendable {
    public let id: String?
    public let uri: String?
    public let title: String?
    public let artist: String?
    public let artistUri: String?
    public let year: Int?
    public let albumArt: String?
    public let releaseDate: String?
    public let sha256: String?
    public let playCount: Int?
    public let uniqueListeners: Int?
    public let tags: [String]?
    public let tracks: [SongViewBasic]?
}

public struct AlbumsResponse: Codable, Sendable {
    public let albums: [AlbumViewBasic]
}

public struct AlbumTracksResponse: Codable, Sendable {
    public let tracks: [SongViewBasic]
}
