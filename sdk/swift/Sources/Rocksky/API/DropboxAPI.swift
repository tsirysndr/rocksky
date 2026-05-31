import Foundation

public struct DropboxAPI: Sendable {
    let transport: XRPCTransport

    public func getFiles(at: String? = nil) async throws -> DropboxFileListView {
        try await transport.query(
            "app.rocksky.dropbox.getFiles",
            params: params(("at", at.map { .string($0) }))
        )
    }

    public func getMetadata(path: String) async throws -> DropboxFileView {
        try await transport.query(
            "app.rocksky.dropbox.getMetadata",
            params: params(("path", .string(path)))
        )
    }

    public func getTemporaryLink(path: String) async throws -> DropboxTemporaryLinkView {
        try await transport.query(
            "app.rocksky.dropbox.getTemporaryLink",
            params: params(("path", .string(path)))
        )
    }

    /// Returns the raw file bytes. The XRPC endpoint streams
    /// `application/octet-stream`.
    public func downloadFile(fileId: String) async throws -> Data {
        try await transport.downloadBytes(
            "app.rocksky.dropbox.downloadFile",
            params: params(("fileId", .string(fileId)))
        )
    }
}
