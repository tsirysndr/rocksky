import Foundation

public struct GraphRelationship: Codable, Hashable, Sendable {
    public let did: String
    public let following: String?
    public let followedBy: String?
}

public struct GraphFollowersResponse: Codable, Sendable {
    public let subject: ProfileViewBasic
    public let followers: [ProfileViewBasic]
    public let cursor: String?
    public let count: Int?
}

public struct GraphFollowsResponse: Codable, Sendable {
    public let subject: ProfileViewBasic
    public let follows: [ProfileViewBasic]
    public let cursor: String?
    public let count: Int?
}

public struct GraphFollowResult: Codable, Sendable {
    public let subject: ProfileViewBasic?
    public let followers: [ProfileViewBasic]?
    public let cursor: String?
}
