import Foundation

public struct SpotifyTrackView: Codable, Hashable, Sendable {
    public let id: String?
    public let name: String?
    public let artist: String?
    public let album: String?
    public let duration: Int?
    public let previewUrl: String?
}
