import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// `URLProtocol` subclass that records every outgoing request and replays
/// canned responses keyed by `URLComponents.path` (so namespace lookups don't
/// depend on host or query order). Use inside tests to assert on what the SDK
/// actually sent over the wire.
final class MockURLProtocol: URLProtocol, @unchecked Sendable {
    struct RecordedRequest: Sendable {
        let url: URL
        let method: String
        let headers: [String: String]
        let body: Data?
    }

    struct Response: Sendable {
        let status: Int
        let body: Data
        let headers: [String: String]

        static func json(_ body: String, status: Int = 200) -> Response {
            Response(
                status: status,
                body: Data(body.utf8),
                headers: ["Content-Type": "application/json"]
            )
        }
    }

    /// path -> queued responses (consumed in FIFO order)
    nonisolated(unsafe) static var queue: [String: [Response]] = [:]
    nonisolated(unsafe) static var recorded: [RecordedRequest] = []
    private static let lock = NSLock()

    static func reset() {
        lock.lock(); defer { lock.unlock() }
        queue.removeAll()
        recorded.removeAll()
    }

    static func stub(path: String, with response: Response) {
        lock.lock(); defer { lock.unlock() }
        queue[path, default: []].append(response)
    }

    static func record(_ req: RecordedRequest) {
        lock.lock(); defer { lock.unlock() }
        recorded.append(req)
    }

    static func dequeue(path: String) -> Response? {
        lock.lock(); defer { lock.unlock() }
        guard var list = queue[path], !list.isEmpty else { return nil }
        let r = list.removeFirst()
        queue[path] = list
        return r
    }

    // MARK: URLProtocol

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url = request.url!
        let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?.path ?? url.path
        let headers = (request.allHTTPHeaderFields ?? [:])
        // Foundation strips httpBody when the request gets wrapped into a
        // URLSessionUploadTask; fall back to the stream-based body if needed.
        let body = request.httpBody ?? Self.readBodyStream(request.httpBodyStream)
        MockURLProtocol.record(
            .init(url: url, method: request.httpMethod ?? "GET", headers: headers, body: body)
        )

        guard let response = MockURLProtocol.dequeue(path: path) else {
            client?.urlProtocol(
                self,
                didFailWithError: NSError(
                    domain: "MockURLProtocol",
                    code: 404,
                    userInfo: [NSLocalizedDescriptionKey: "No stub for path: \(path)"]
                )
            )
            return
        }

        let http = HTTPURLResponse(
            url: url,
            statusCode: response.status,
            httpVersion: "HTTP/1.1",
            headerFields: response.headers
        )!
        client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: response.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func readBodyStream(_ stream: InputStream?) -> Data? {
        guard let stream = stream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let bufSize = 4096
        let buf = UnsafeMutablePointer<UInt8>.allocate(capacity: bufSize)
        defer { buf.deallocate() }
        while stream.hasBytesAvailable {
            let read = stream.read(buf, maxLength: bufSize)
            if read <= 0 { break }
            data.append(buf, count: read)
        }
        return data
    }
}

extension URLSession {
    /// Returns a `URLSession` configured to route every request through
    /// `MockURLProtocol`.
    static func mock() -> URLSession {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: cfg)
    }
}
