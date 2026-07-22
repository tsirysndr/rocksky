"""Rocksky — Python SDK.

Native bindings to the shared Rocksky Rust core (``rocksky-sdk``) via UniFFI:
AppView reads, AT Protocol PDS writes, a local dedup index, and the identity
hashes — the same engine behind every Rocksky SDK.

    from rocksky import AppView, Agent, ScrobbleInput, song_hash
"""

import typing

from .rocksky_uniffi import *  # noqa: F401,F403
from .rocksky_uniffi import AppView as _AppView


class AppView(_AppView):  # noqa: F811 — thin facade over the generated class
    """Unauthenticated read client over the public Rocksky AppView.

    ``base`` defaults to ``None`` (the public AppView at
    ``https://api.rocksky.app``). Pass a URL to target a self-hosted AppView.
    """

    def __init__(self, base: typing.Optional[str] = None):
        super().__init__(base)
