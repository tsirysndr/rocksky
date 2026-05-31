import Foundation

/// Errors thrown by the Rocksky SDK.
public enum RockskyError: Error, Sendable, CustomStringConvertible {
    /// The base URL passed to the client could not be parsed.
    case invalidBaseURL(String)

    /// Failed to build the request URL (e.g. invalid query params).
    case invalidRequest(String)

    /// The server returned a non-2xx HTTP status. The decoded XRPC error body
    /// is included when available.
    case http(status: Int, error: XRPCErrorBody?, body: Data?)

    /// The response body could not be decoded into the expected type.
    case decoding(Error)

    /// The transport failed (DNS, TLS, offline, etc.).
    case transport(Error)

    /// A request that requires authentication was made without an auth token.
    case unauthenticated

    public var description: String {
        switch self {
        case .invalidBaseURL(let s):
            return "Invalid base URL: \(s)"
        case .invalidRequest(let s):
            return "Invalid request: \(s)"
        case .http(let status, let err, _):
            if let err = err {
                return "HTTP \(status): \(err.error ?? "error") — \(err.message ?? "no message")"
            }
            return "HTTP \(status)"
        case .decoding(let e):
            return "Decoding error: \(e)"
        case .transport(let e):
            return "Transport error: \(e)"
        case .unauthenticated:
            return "Authentication required for this request"
        }
    }
}

/// AT Protocol XRPC error envelope.
public struct XRPCErrorBody: Codable, Sendable {
    public let error: String?
    public let message: String?
}
