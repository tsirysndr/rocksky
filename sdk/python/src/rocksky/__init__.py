"""Rocksky — Python SDK.

Native bindings to the shared Rocksky Rust core (``rocksky-sdk``) via UniFFI:
AppView reads, AT Protocol PDS writes, a local dedup index, and the identity
hashes — the same engine behind every Rocksky SDK.

    from rocksky import AppView, Agent, ScrobbleInput, song_hash

Build a Rocksky-controllable player or a remote UI with the ``RemotePlayer`` /
``RemoteController`` convenience wrappers (see ``rocksky.remote``):

    from rocksky import RemotePlayer, RemoteController
"""

import typing

from .rocksky_uniffi import *  # noqa: F401,F403
from .rocksky_uniffi import AppView as _AppView

# Ergonomic poll-loop wrappers over the generated RemotePlayer/RemoteController
# (they shadow the raw generated classes brought in by the star-import above).
# Guarded so a core built without the (default) `remote-player` feature still
# imports — the wrappers are simply absent then.
try:
    from .remote import RemoteController, RemotePlayer  # noqa: F401
except (ImportError, AttributeError):  # pragma: no cover - feature-gated
    pass


class AppView(_AppView):  # noqa: F811 — thin facade over the generated class
    """Read client over the public Rocksky AppView.

    ``base`` defaults to ``None`` (the public AppView at
    ``https://api.rocksky.app``). Pass a URL to target a self-hosted AppView.
    ``token``, when given, is sent as ``Authorization: Bearer <token>`` on every
    read — needed only for auth-gated queries.
    """

    def __init__(
        self,
        base: typing.Optional[str] = None,
        token: typing.Optional[str] = None,
    ):
        super().__init__(base, token)
