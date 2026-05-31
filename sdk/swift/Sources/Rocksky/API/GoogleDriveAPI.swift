import Foundation

public struct GoogleDriveAPI: Sendable {
    let transport: XRPCTransport

    public func getFiles(at: String? = nil) async throws -> GoogleDriveFileListView {
        try await transport.query(
            "app.rocksky.googledrive.getFiles",
            params: params(("at", at.map { .string($0) }))
        )
    }

    public func getFile(fileId: String) async throws -> GoogleDriveFileView {
        try await transport.query(
            "app.rocksky.googledrive.getFile",
            params: params(("fileId", .string(fileId)))
        )
    }

    public func downloadFile(fileId: String) async throws -> Data {
        try await transport.downloadBytes(
            "app.rocksky.googledrive.downloadFile",
            params: params(("fileId", .string(fileId)))
        )
    }
}
