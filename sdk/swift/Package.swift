// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Rocksky",
    platforms: [
        .macOS(.v12),
        .iOS(.v15),
        .tvOS(.v15),
        .watchOS(.v8),
        .visionOS(.v1)
    ],
    products: [
        .library(
            name: "Rocksky",
            targets: ["Rocksky"]
        )
    ],
    targets: [
        .target(
            name: "Rocksky",
            path: "Sources/Rocksky"
        ),
        .testTarget(
            name: "RockskyTests",
            dependencies: ["Rocksky"],
            path: "Tests/RockskyTests"
        )
    ]
)
