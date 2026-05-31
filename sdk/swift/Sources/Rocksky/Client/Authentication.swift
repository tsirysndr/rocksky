import Foundation

/// Authentication strategy for outgoing requests.
public enum Authentication: Sendable {
    /// No authentication header.
    case none

    /// `Authorization: Bearer <token>` — JWT issued by the Rocksky auth flow.
    case bearer(String)

    /// `Authorization: Bearer <key>` — long-lived API key issued via
    /// `app.rocksky.apikey.createApikey`. Wire-identical to `.bearer` but kept
    /// distinct so call sites can express intent.
    case apiKey(String)

    var headerValue: String? {
        switch self {
        case .none: return nil
        case .bearer(let t): return "Bearer \(t)"
        case .apiKey(let k): return "Bearer \(k)"
        }
    }
}
