import Foundation

public struct ChartsScrobbleView: Codable, Hashable, Sendable {
    public let date: String?
    public let count: Int?
}

public struct ChartsView: Codable, Sendable {
    public let scrobbles: [ChartsScrobbleView]?
}

public struct TopArtistsResponse: Codable, Sendable {
    public let artists: [ArtistViewBasic]
}

public struct TopTracksResponse: Codable, Sendable {
    public let tracks: [SongViewBasic]
}
