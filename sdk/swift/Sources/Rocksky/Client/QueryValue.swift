import Foundation

/// A type that can be rendered as a query-string parameter. Repeated values
/// (arrays of strings) are emitted as multiple `key=value` pairs, matching the
/// XRPC convention.
public enum QueryValue: Sendable, ExpressibleByStringLiteral, ExpressibleByIntegerLiteral, ExpressibleByBooleanLiteral {
    case string(String)
    case int(Int)
    case bool(Bool)
    case stringArray([String])
    case date(Date)

    public init(stringLiteral value: String) { self = .string(value) }
    public init(integerLiteral value: Int) { self = .int(value) }
    public init(booleanLiteral value: Bool) { self = .bool(value) }

    func queryItems(name: String) -> [URLQueryItem] {
        switch self {
        case .string(let s):
            return [URLQueryItem(name: name, value: s)]
        case .int(let i):
            return [URLQueryItem(name: name, value: String(i))]
        case .bool(let b):
            return [URLQueryItem(name: name, value: b ? "true" : "false")]
        case .stringArray(let arr):
            return arr.map { URLQueryItem(name: name, value: $0) }
        case .date(let d):
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return [URLQueryItem(name: name, value: f.string(from: d))]
        }
    }
}

/// Helpers for building `[String: QueryValue]` dictionaries with optional
/// values. Skips nil entries so callers don't have to.
@inlinable
public func params(_ pairs: (String, QueryValue?)...) -> [String: QueryValue] {
    var out: [String: QueryValue] = [:]
    for (k, v) in pairs {
        if let v = v { out[k] = v }
    }
    return out
}
