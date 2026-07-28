# Examples

The native-core demo lives at `src/rocksky/native_example.clj`:

```sh
./build-core.sh                                # build the native lib
clojure -M:native -m rocksky.native-example    # read-only tour
```

The remote-control demo (`RemotePlayer` + `RemoteController`) lives at
`src/rocksky/remote_example.clj`. It runs a controllable player and a remote UI
side by side — needs an access token and a reachable endpoint:

```sh
ROCKSKY_TOKEN=… clojure -M:native -m rocksky.remote-example
ROCKSKY_TOKEN=… clojure -M:native -m rocksky.remote-example wss://api.rocksky.app/ws
```
