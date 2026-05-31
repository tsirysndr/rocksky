import Foundation

/// `com.atproto.repo.strongRef` — used as a typed pointer to another record.
public struct StrongRef: Codable, Hashable, Sendable {
    public let uri: String
    public let cid: String

    public init(uri: String, cid: String) {
        self.uri = uri
        self.cid = cid
    }
}
