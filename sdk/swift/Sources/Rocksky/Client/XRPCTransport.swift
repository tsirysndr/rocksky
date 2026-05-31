import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Low-level XRPC transport. Responsible for building `/xrpc/<nsid>` URLs,
/// attaching authentication, encoding bodies, and decoding responses.
///
/// Typical SDK users won't touch this directly — use `RockskyClient` and its
/// namespaced APIs (`client.actor`, `client.scrobble`, etc.) instead. This type
/// is public so power users can call methods the SDK hasn't wrapped yet.
public actor XRPCTransport {
    public let baseURL: URL
    public private(set) var auth: Authentication
    public let session: URLSession
    public let userAgent: String

    private let jsonEncoder: JSONEncoder
    private let jsonDecoder: JSONDecoder

    public init(
        baseURL: URL,
        auth: Authentication = .none,
        session: URLSession = .shared,
        userAgent: String = "rocksky-swift/0.1"
    ) {
        self.baseURL = baseURL
        self.auth = auth
        self.session = session
        self.userAgent = userAgent

        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.outputFormatting = [.withoutEscapingSlashes]
        self.jsonEncoder = enc

        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        self.jsonDecoder = dec
    }

    /// Replace the auth credential (e.g. after token refresh).
    public func setAuth(_ auth: Authentication) {
        self.auth = auth
    }

    // MARK: - Public XRPC entrypoints

    /// Send a GET request to `/xrpc/<nsid>` and decode the JSON body into `Out`.
    public func query<Out: Decodable & Sendable>(
        _ nsid: String,
        params: [String: QueryValue] = [:],
        as type: Out.Type = Out.self
    ) async throws -> Out {
        let req = try buildRequest(nsid: nsid, method: "GET", params: params, body: Optional<Empty>.none)
        let data = try await send(req)
        return try decode(Out.self, from: data)
    }

    /// Send a GET request to `/xrpc/<nsid>` with no expected body. Useful for
    /// procedures that return 200 with `{}`.
    public func query(
        _ nsid: String,
        params: [String: QueryValue] = [:]
    ) async throws {
        let req = try buildRequest(nsid: nsid, method: "GET", params: params, body: Optional<Empty>.none)
        _ = try await send(req)
    }

    /// Send a POST request to `/xrpc/<nsid>`, optionally with a JSON body and
    /// query parameters. Decodes the JSON response into `Out`.
    public func procedure<In: Encodable & Sendable, Out: Decodable & Sendable>(
        _ nsid: String,
        params: [String: QueryValue] = [:],
        body: In? = nil,
        as type: Out.Type = Out.self
    ) async throws -> Out {
        let req = try buildRequest(nsid: nsid, method: "POST", params: params, body: body)
        let data = try await send(req)
        return try decode(Out.self, from: data)
    }

    /// POST without a typed response (server may return `{}` or empty body).
    public func procedure<In: Encodable & Sendable>(
        _ nsid: String,
        params: [String: QueryValue] = [:],
        body: In? = nil
    ) async throws {
        let req = try buildRequest(nsid: nsid, method: "POST", params: params, body: body)
        _ = try await send(req)
    }

    /// POST with no input body.
    public func procedure(
        _ nsid: String,
        params: [String: QueryValue] = [:]
    ) async throws {
        let req = try buildRequest(nsid: nsid, method: "POST", params: params, body: Optional<Empty>.none)
        _ = try await send(req)
    }

    /// GET a binary blob — used for the file-download endpoints.
    public func downloadBytes(
        _ nsid: String,
        params: [String: QueryValue] = [:]
    ) async throws -> Data {
        let req = try buildRequest(nsid: nsid, method: "GET", params: params, body: Optional<Empty>.none)
        return try await send(req)
    }

    // MARK: - Internals

    private struct Empty: Encodable, Sendable {}

    private func buildRequest<In: Encodable>(
        nsid: String,
        method: String,
        params: [String: QueryValue],
        body: In?
    ) throws -> URLRequest {
        guard var comps = URLComponents(
            url: baseURL.appendingPathComponent("xrpc/\(nsid)"),
            resolvingAgainstBaseURL: false
        ) else {
            throw RockskyError.invalidRequest("Could not build URLComponents for \(nsid)")
        }

        if !params.isEmpty {
            var items: [URLQueryItem] = []
            // Stable ordering keeps tests deterministic.
            for key in params.keys.sorted() {
                guard let value = params[key] else { continue }
                items.append(contentsOf: value.queryItems(name: key))
            }
            comps.queryItems = items
        }

        guard let url = comps.url else {
            throw RockskyError.invalidRequest("Could not assemble URL for \(nsid)")
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        if let authHeader = auth.headerValue {
            req.setValue(authHeader, forHTTPHeaderField: "Authorization")
        }
        if let body = body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try jsonEncoder.encode(body)
        }
        return req
    }

    private func send(_ req: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.dataTask(for: req)
        } catch {
            throw RockskyError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw RockskyError.transport(URLError(.badServerResponse))
        }
        if !(200..<300).contains(http.statusCode) {
            let body = try? jsonDecoder.decode(XRPCErrorBody.self, from: data)
            throw RockskyError.http(status: http.statusCode, error: body, body: data)
        }
        return data
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        if data.isEmpty, T.self == EmptyResponse.self {
            // Best-effort handling for endpoints that 200 with no body.
            return EmptyResponse() as! T
        }
        do {
            return try jsonDecoder.decode(T.self, from: data)
        } catch {
            throw RockskyError.decoding(error)
        }
    }
}

/// Placeholder value for endpoints that return an empty JSON response.
public struct EmptyResponse: Codable, Sendable {
    public init() {}
}

// MARK: - URLSession async shim for Linux

extension URLSession {
    fileprivate func dataTask(for request: URLRequest) async throws -> (Data, URLResponse) {
        #if canImport(FoundationNetworking)
        return try await withCheckedThrowingContinuation { cont in
            let task = self.dataTask(with: request) { data, resp, err in
                if let err = err { cont.resume(throwing: err); return }
                guard let data = data, let resp = resp else {
                    cont.resume(throwing: URLError(.badServerResponse)); return
                }
                cont.resume(returning: (data, resp))
            }
            task.resume()
        }
        #else
        return try await self.data(for: request)
        #endif
    }
}
