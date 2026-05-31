import Foundation

public struct ApikeyView: Codable, Hashable, Sendable {
    public let id: String?
    public let name: String?
    public let description: String?
    public let createdAt: String?
}

public struct ApikeysResponse: Codable, Sendable {
    public let apiKeys: [ApikeyView]
}

public struct CreateApikeyInput: Codable, Sendable {
    public let name: String
    public let description: String?

    public init(name: String, description: String? = nil) {
        self.name = name
        self.description = description
    }
}

public struct UpdateApikeyInput: Codable, Sendable {
    public let id: String
    public let name: String
    public let description: String?

    public init(id: String, name: String, description: String? = nil) {
        self.id = id
        self.name = name
        self.description = description
    }
}
