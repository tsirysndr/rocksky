// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RockskyExamples",
    platforms: [
        .macOS(.v12)
    ],
    dependencies: [
        .package(path: "..")
    ],
    targets: [
        .executableTarget(
            name: "ProfileFetcher",
            dependencies: [.product(name: "Rocksky", package: "swift")],
            path: "Sources/ProfileFetcher"
        ),
        .executableTarget(
            name: "TopArtists",
            dependencies: [.product(name: "Rocksky", package: "swift")],
            path: "Sources/TopArtists"
        ),
        .executableTarget(
            name: "ScrobbleCLI",
            dependencies: [.product(name: "Rocksky", package: "swift")],
            path: "Sources/ScrobbleCLI"
        )
    ]
)
