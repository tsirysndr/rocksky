"""Native core bindings for Rocksky.

UniFFI-generated bindings to the shared Rust core (``rocksky-sdk``), so the
auth / record-write / dedup logic is identical across the Rust, Python, Ruby,
Clojure, and BEAM SDKs. This is the write + firehose side (AT Protocol PDS
writes); the HTTP client in the top-level :mod:`rocksky` package is the read side.

    from rocksky.core import AppView, Agent, song_hash

    av = AppView(None)
    print(av.global_stats().scrobbles)

    agent = Agent.login_password("session.json", "alice.bsky.social", "app-pw", None, None)
    out = agent.scrobble(ScrobbleInput(title="Chaser", artist="Calibro 35",
                                       album="Jazzploitation", album_artist="Calibro 35",
                                       duration_ms=182320))
    print(out.scrobble_uri)

The generated ``rocksky_uniffi`` module and its native library are build
artifacts produced by ``build-core.sh``.
"""

from .rocksky_uniffi import *  # noqa: F401,F403
