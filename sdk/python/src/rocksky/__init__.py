"""Rocksky — Python SDK.

Native bindings to the shared Rocksky Rust core (``rocksky-sdk``) via UniFFI:
AppView reads, AT Protocol PDS writes, a local dedup index, and the identity
hashes — the same engine behind every Rocksky SDK.

    from rocksky import AppView, Agent, ScrobbleInput, song_hash
"""

from .rocksky_uniffi import *  # noqa: F401,F403
