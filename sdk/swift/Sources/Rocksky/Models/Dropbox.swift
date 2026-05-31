import Foundation

public struct DropboxFileView: Codable, Hashable, Sendable {
    public let id: String?
    public let name: String?
    public let pathLower: String?
    public let pathDisplay: String?
    public let clientModified: String?
    public let serverModified: String?
}

public struct DropboxFileListView: Codable, Sendable {
    public let files: [DropboxFileView]?
}

public struct DropboxTemporaryLinkView: Codable, Sendable {
    public let link: String?
}
