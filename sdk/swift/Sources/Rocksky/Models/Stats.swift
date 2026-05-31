import Foundation

public struct StatsView: Codable, Hashable, Sendable {
    public let scrobbles: Int?
    public let artists: Int?
    public let lovedTracks: Int?
    public let albums: Int?
    public let tracks: Int?
}

public struct WrappedArtist: Codable, Hashable, Sendable {
    public let id: String?
    public let name: String?
    public let picture: String?
    public let uri: String?
    public let playCount: Int?
}

public struct WrappedTrack: Codable, Hashable, Sendable {
    public let id: String?
    public let title: String?
    public let artist: String?
    public let albumArt: String?
    public let uri: String?
    public let artistUri: String?
    public let albumUri: String?
    public let playCount: Int?
}

public struct WrappedAlbum: Codable, Hashable, Sendable {
    public let id: String?
    public let title: String?
    public let artist: String?
    public let albumArt: String?
    public let uri: String?
    public let playCount: Int?
}

public struct WrappedGenreCount: Codable, Hashable, Sendable {
    public let genre: String?
    public let count: Int?
}

public struct WrappedMonthCount: Codable, Hashable, Sendable {
    public let month: Int?
    public let count: Int?
}

public struct WrappedDayCount: Codable, Hashable, Sendable {
    public let date: String?
    public let count: Int?
}

public struct WrappedMilestone: Codable, Hashable, Sendable {
    public let trackTitle: String?
    public let artistName: String?
    public let timestamp: String?
    public let trackUri: String?
}

public struct WrappedView: Codable, Sendable {
    public let year: Int?
    public let totalScrobbles: Int?
    public let totalListeningTimeMinutes: Int?
    public let topArtists: [WrappedArtist]?
    public let topTracks: [WrappedTrack]?
    public let topAlbums: [WrappedAlbum]?
    public let topGenres: [WrappedGenreCount]?
    public let scrobblesPerMonth: [WrappedMonthCount]?
    public let mostActiveDay: WrappedDayCount?
    public let mostActiveHour: Int?
    public let newArtistsCount: Int?
    public let longestStreak: Int?
    public let firstScrobble: WrappedMilestone?
    public let lastScrobble: WrappedMilestone?
}
