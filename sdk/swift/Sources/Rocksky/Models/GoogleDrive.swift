import Foundation

public struct GoogleDriveFileView: Codable, Hashable, Sendable {
    public let id: String?
}

public struct GoogleDriveFileListView: Codable, Sendable {
    public let files: [GoogleDriveFileView]?
}
