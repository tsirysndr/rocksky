import Foundation
import Rocksky

/// Usage:
///   ROCKSKY_API_KEY=rk_xxx \
///   swift run ScrobbleCLI "Track Title" "Artist Name" [album] [durationMs]
///
/// Scrobbles a track to your Rocksky account using an API key created at
/// https://rocksky.app/settings/apikeys (or via the
/// `app.rocksky.apikey.createApikey` XRPC procedure).
@main
struct ScrobbleCLI {
    static func main() async {
        guard let apiKey = ProcessInfo.processInfo.environment["ROCKSKY_API_KEY"] else {
            FileHandle.standardError.write(Data("Set ROCKSKY_API_KEY in the environment.\n".utf8))
            exit(2)
        }
        let argv = CommandLine.arguments
        guard argv.count >= 3 else {
            FileHandle.standardError.write(
                Data("Usage: ScrobbleCLI <title> <artist> [album] [durationMs]\n".utf8)
            )
            exit(2)
        }
        let title = argv[1]
        let artist = argv[2]
        let album = argv.count > 3 ? argv[3] : nil
        let duration = argv.count > 4 ? Int(argv[4]) : nil

        let client = RockskyClient(auth: .apiKey(apiKey))
        do {
            let scrobble = try await client.scrobble.createScrobble(
                title: title,
                artist: artist,
                album: album,
                duration: duration,
                timestamp: Int(Date().timeIntervalSince1970)
            )
            print("Scrobbled: \(scrobble.title ?? title) — \(scrobble.artist ?? artist)")
            if let uri = scrobble.uri { print("at-uri:    \(uri)") }
        } catch RockskyError.http(let status, let body, _) {
            FileHandle.standardError.write(
                Data("HTTP \(status): \(body?.message ?? "request failed")\n".utf8)
            )
            exit(1)
        } catch {
            FileHandle.standardError.write(Data("error: \(error)\n".utf8))
            exit(1)
        }
    }
}
