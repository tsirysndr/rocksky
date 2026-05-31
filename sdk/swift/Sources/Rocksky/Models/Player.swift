import Foundation

public struct CurrentlyPlayingView: Codable, Hashable, Sendable {
    public let title: String?
}

public struct PlaybackQueueView: Codable, Sendable {
    public let tracks: [SongViewBasic]?
}
