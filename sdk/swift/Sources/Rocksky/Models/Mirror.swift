import Foundation

public struct MirrorSourceView: Codable, Hashable, Sendable {
    public let provider: String
    public let enabled: Bool
    public let externalUsername: String?
    public let hasCredentials: Bool
    public let lastPolledAt: String?
    public let lastScrobbleSeenAt: String?
}

public struct MirrorSourcesResponse: Codable, Sendable {
    public let sources: [MirrorSourceView]
}

public struct PutMirrorSourceInput: Codable, Sendable {
    public let provider: String
    public let enabled: Bool?
    public let externalUsername: String?
    /// API key / token. Omit to leave unchanged; empty string to clear.
    public let apiKey: String?

    public init(
        provider: String,
        enabled: Bool? = nil,
        externalUsername: String? = nil,
        apiKey: String? = nil
    ) {
        self.provider = provider
        self.enabled = enabled
        self.externalUsername = externalUsername
        self.apiKey = apiKey
    }
}
