import Foundation

public struct ShoutAuthor: Codable, Hashable, Sendable {
    public let id: String?
    public let did: String?
    public let handle: String?
    public let displayName: String?
    public let avatar: String?
}

public struct ShoutView: Codable, Hashable, Sendable {
    public let id: String?
    public let message: String?
    public let parent: String?
    public let createdAt: String?
    public let author: ShoutAuthor?
}

/// The lexicons reference `shoutViewBasic` in query responses but the defs
/// file only declares `shoutView`. We treat them as the same shape.
public typealias ShoutViewBasic = ShoutView

public struct ShoutsResponse: Codable, Sendable {
    public let shouts: [ShoutViewBasic]
}

public struct CreateShoutInput: Codable, Sendable {
    public let message: String

    public init(message: String) {
        self.message = message
    }
}

public struct ReplyShoutInput: Codable, Sendable {
    public let shoutId: String
    public let message: String

    public init(shoutId: String, message: String) {
        self.shoutId = shoutId
        self.message = message
    }
}

public struct ReportShoutInput: Codable, Sendable {
    public let shoutId: String
    public let reason: String?

    public init(shoutId: String, reason: String? = nil) {
        self.shoutId = shoutId
        self.reason = reason
    }
}
