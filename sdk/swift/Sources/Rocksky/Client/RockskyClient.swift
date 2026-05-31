import Foundation

/// Entry point for the Rocksky SDK.
///
/// ```swift
/// let client = RockskyClient(baseURL: URL(string: "https://api.rocksky.app")!)
/// let profile = try await client.actor.getProfile(did: "alice.bsky.social")
/// ```
///
/// Authenticate with `withAuth(_:)` to receive a copy bound to a credential:
///
/// ```swift
/// let authed = client.withAuth(.apiKey("rk_live_..."))
/// try await authed.scrobble.createScrobble(.init(title: "Idioteque", artist: "Radiohead"))
/// ```
public struct RockskyClient: Sendable {
    /// Default public Rocksky API endpoint.
    public static let defaultBaseURL = URL(string: "https://api.rocksky.app")!

    public let transport: XRPCTransport

    public init(
        baseURL: URL = RockskyClient.defaultBaseURL,
        auth: Authentication = .none,
        session: URLSession = .shared,
        userAgent: String = "rocksky-swift/0.1"
    ) {
        self.transport = XRPCTransport(
            baseURL: baseURL,
            auth: auth,
            session: session,
            userAgent: userAgent
        )
    }

    /// Internal initializer used to share the same `XRPCTransport` actor across
    /// API namespace structs.
    init(transport: XRPCTransport) {
        self.transport = transport
    }

    /// Return a client bound to a different credential. The new client shares
    /// no state with the original — useful for per-request auth.
    public func withAuth(_ auth: Authentication) -> RockskyClient {
        RockskyClient(
            baseURL: RockskyClient.defaultBaseURL,
            auth: auth
        )
    }

    // MARK: - Namespaced APIs

    public var actor: ActorAPI { ActorAPI(transport: transport) }
    public var album: AlbumAPI { AlbumAPI(transport: transport) }
    public var apikey: ApikeyAPI { ApikeyAPI(transport: transport) }
    public var artist: ArtistAPI { ArtistAPI(transport: transport) }
    public var charts: ChartsAPI { ChartsAPI(transport: transport) }
    public var dropbox: DropboxAPI { DropboxAPI(transport: transport) }
    public var feed: FeedAPI { FeedAPI(transport: transport) }
    public var googleDrive: GoogleDriveAPI { GoogleDriveAPI(transport: transport) }
    public var graph: GraphAPI { GraphAPI(transport: transport) }
    public var like: LikeAPI { LikeAPI(transport: transport) }
    public var mirror: MirrorAPI { MirrorAPI(transport: transport) }
    public var player: PlayerAPI { PlayerAPI(transport: transport) }
    public var playlist: PlaylistAPI { PlaylistAPI(transport: transport) }
    public var scrobble: ScrobbleAPI { ScrobbleAPI(transport: transport) }
    public var shout: ShoutAPI { ShoutAPI(transport: transport) }
    public var song: SongAPI { SongAPI(transport: transport) }
    public var spotify: SpotifyAPI { SpotifyAPI(transport: transport) }
    public var stats: StatsAPI { StatsAPI(transport: transport) }
}
