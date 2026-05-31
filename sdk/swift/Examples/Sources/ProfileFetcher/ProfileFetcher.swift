import Foundation
import Rocksky

/// Usage: swift run ProfileFetcher <handle-or-did>
///
/// Fetches a Rocksky profile + the most recent scrobbles for that account.
/// Runs against the public API; no auth required for read endpoints.
@main
struct ProfileFetcher {
    static func main() async {
        let args = CommandLine.arguments
        let handle = args.count > 1 ? args[1] : "tsiry.rocksky.app"

        let client = RockskyClient()

        do {
            async let profile = client.actor.getProfile(did: handle)
            async let scrobbles = client.actor.getActorScrobbles(did: handle, limit: 5)
            async let stats = client.stats.getStats(did: handle)

            let (p, s, st) = try await (profile, scrobbles, stats)

            print("─────────────────────────────────────")
            print(p.displayName ?? p.handle ?? handle)
            print("did:    \(p.did ?? "?")")
            print("handle: \(p.handle ?? "?")")
            print("─────────────────────────────────────")
            print("\(st.scrobbles ?? 0) scrobbles · \(st.artists ?? 0) artists · \(st.albums ?? 0) albums")
            print("─────────────────────────────────────")
            print("recent scrobbles:")
            for scrobble in s.scrobbles {
                let when = scrobble.date ?? "?"
                print("  · \(scrobble.title ?? "?") — \(scrobble.artist ?? "?")  [\(when)]")
            }
        } catch {
            FileHandle.standardError.write(Data("error: \(error)\n".utf8))
            exit(1)
        }
    }
}
