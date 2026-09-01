# @rocksky/playerd

A headless [Rocksky](https://rocksky.app) player. `playerd` registers itself as
a playback device on Rocksky's remote-control WebSocket, shows up in the device
picker of the web and desktop miniplayers, and plays whatever you send to it —
uploads, library tracks, or local files. It scrobbles to Rocksky natively and
remembers the queue and exact position across restarts.

```sh
npm install -g @rocksky/playerd
playerd
```

The install fetches the prebuilt binary for your platform from the matching
[GitHub release](https://github.com/tsirysndr/rocksky/releases) and verifies
its SHA-256. Supported: macOS arm64 (Apple Silicon), Linux x86_64 and Linux
aarch64. On Linux the binary needs ALSA at runtime
(`sudo apt-get install libasound2` on Debian/Ubuntu).

If install scripts were skipped (`--ignore-scripts`), the binary is downloaded
on first run instead.

## Quick start

```sh
rocksky login   # or drop a token at ~/.rocksky/token.json
playerd         # the device name defaults to your hostname
```

Full documentation — configuration, audio outputs, running as a service —
lives in the [playerd README](https://github.com/tsirysndr/rocksky/tree/main/playerd#readme).

## Publishing (maintainers)

The npm version must equal `playerd/Cargo.toml`'s — the package downloads the
`playerd-v<version>` release, and `prepublishOnly` enforces the match:

```sh
cd playerd/npm
npm version <new-version> --no-git-tag-version   # after bumping Cargo.toml
npm publish --access public
```
