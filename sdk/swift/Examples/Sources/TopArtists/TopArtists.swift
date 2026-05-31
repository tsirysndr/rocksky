import Foundation
import Rocksky

/// Usage: swift run TopArtists [limit]
///
/// Prints the global top artists chart from `app.rocksky.charts.getTopArtists`.
@main
struct TopArtistsExample {
    static func main() async {
        let limit = CommandLine.arguments.count > 1 ? Int(CommandLine.arguments[1]) ?? 10 : 10

        let client = RockskyClient()
        do {
            let chart = try await client.charts.getTopArtists(limit: limit)
            print("Top \(chart.artists.count) artists on Rocksky:\n")
            for (i, a) in chart.artists.enumerated() {
                let name = a.name ?? "unknown"
                let plays = a.playCount ?? 0
                print(String(format: "%2d. %-40s %d plays", i + 1, name, plays))
            }
        } catch {
            FileHandle.standardError.write(Data("error: \(error)\n".utf8))
            exit(1)
        }
    }
}
