"""Remote player & controller — ergonomic wrappers over the native core.

The UniFFI-generated ``RemotePlayer`` / ``RemoteController`` objects speak the
Rocksky remote-control WebSocket protocol (see ``remote-ws/PROTOCOL.md``) but
use a **poll model**: their ``next_command()`` / ``next_event()`` calls *block*
until something arrives, so a host has to run them in a loop on a background
thread.

These thin facades do that for you and add ``.on(event, handler)`` registration
mirroring the TypeScript SDK — register handlers, call :meth:`RemotePlayer.listen`
(or :meth:`RemoteController.listen`), and the poll loop runs on a daemon thread
and dispatches to your callbacks.

    from rocksky import RemotePlayer, RemoteNowPlaying

    player = RemotePlayer(token, "My Player")
    player.on("play", engine.play)
    player.on("pause", engine.pause)
    player.on("seek", lambda position_ms: engine.seek(position_ms))
    player.listen()
    player.set_now_playing(RemoteNowPlaying(title="Chaser", artist="Calibro 35"))
    player.set_status(RemoteStatus.PLAYING)

The record/enum types (:class:`RemoteNowPlaying`, :class:`RemoteQueueItem`,
:class:`RemoteStatus`, :class:`RemoteCommand`, :class:`RemoteDevice`,
:class:`RemoteEvent`) are the generated ones, re-exported here and from the
package root.
"""

import threading
import typing

# The generated types live in the UniFFI module. They only exist when the core
# was built with the (default) ``remote-player`` feature; importing this module
# raises AttributeError otherwise, which the package root swallows.
from .rocksky_uniffi import RemoteCommand as RemoteCommand
from .rocksky_uniffi import RemoteController as _RemoteController
from .rocksky_uniffi import RemoteDevice as RemoteDevice
from .rocksky_uniffi import RemoteEvent as RemoteEvent
from .rocksky_uniffi import RemoteNowPlaying as RemoteNowPlaying
from .rocksky_uniffi import RemotePlayer as _RemotePlayer
from .rocksky_uniffi import RemoteQueueItem as RemoteQueueItem
from .rocksky_uniffi import RemoteStatus as RemoteStatus

__all__ = [
    "RemoteCommand",
    "RemoteController",
    "RemoteDevice",
    "RemoteEvent",
    "RemoteNowPlaying",
    "RemotePlayer",
    "RemoteQueueItem",
    "RemoteStatus",
]

Handler = typing.Callable[..., None]
Debug = typing.Callable[..., None]

# camelCase aliases (TS parity) -> canonical snake_case event names.
_ALIASES = {
    "queueJump": "queue_jump",
    "queueRemove": "queue_remove",
    "queueMove": "queue_move",
    "setShuffle": "set_shuffle",
    "setRepeat": "set_repeat",
    "setVolume": "set_volume",
    "setAudioSettings": "set_audio_settings",
    "deviceRegistered": "device_registered",
    "deviceUnregistered": "device_unregistered",
    "primaryChanged": "primary_changed",
    "nowPlaying": "now_playing",
}


def _noop(*_args: object, **_kwargs: object) -> None:
    pass


class _Poller:
    """Shared handler registry + background poll-loop machinery."""

    def __init__(self, debug: Debug | None) -> None:
        self._handlers: dict[str, Handler] = {}
        self._thread: threading.Thread | None = None
        self._running = False
        self._debug: Debug = debug or _noop

    def on(self, event: str, handler: Handler) -> "typing.Any":
        """Register a handler for ``event``. Returns ``self`` for chaining."""
        self._handlers[_ALIASES.get(event, event)] = handler
        return self

    def _emit(self, event: str, *args: object) -> None:
        handler = self._handlers.get(event)
        if handler is None:
            return
        try:
            handler(*args)
        except Exception as exc:  # a bad handler must not kill the loop
            self._debug("handler error", event, exc)

    def _start(self, name: str) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, name=name, daemon=True)
        self._thread.start()

    def _loop(self) -> None:  # pragma: no cover - overridden
        raise NotImplementedError


class RemotePlayer(_Poller):
    """A Rocksky-controllable player (advertises now-playing/status/queue).

    Connects and registers in the background on construction. Register command
    handlers with :meth:`on` (``play``, ``pause``, ``next``, ``previous``,
    ``seek`` → ``position_ms``, ``queue_jump`` → ``index``, ``queue_remove`` →
    ``index``, ``queue_move`` → ``(from, to)``, ``enqueue`` → the
    :class:`RemoteCommand.ENQUEUE`), then call :meth:`listen` to start
    dispatching.
    """

    def __init__(
        self,
        token: str,
        name: str,
        url: str | None = None,
        debug: Debug | None = None,
    ) -> None:
        super().__init__(debug)
        self._inner = _RemotePlayer.connect(token, name, url)

    def on(self, event: str, handler: Handler) -> "RemotePlayer":
        super().on(event, handler)
        return self

    def listen(self) -> "RemotePlayer":
        """Start the background poll loop dispatching to handlers. Idempotent."""
        self._start("rocksky-remote-player")
        return self

    # ── raw passthrough ────────────────────────────────────────────────────
    def next_command(self) -> RemoteCommand | None:
        """Block for the next command (advanced; :meth:`listen` is easier)."""
        return self._inner.next_command()

    # ── state push ─────────────────────────────────────────────────────────
    def set_now_playing(self, track: RemoteNowPlaying) -> None:
        self._inner.set_now_playing(track)

    def set_status(self, status: RemoteStatus) -> None:
        self._inner.set_status(status)

    def set_queue(self, items: typing.Sequence[RemoteQueueItem], index: int) -> None:
        self._inner.set_queue(list(items), index)

    def disconnect(self) -> None:
        """Disconnect and stop the poll loop."""
        self._running = False
        self._inner.disconnect()

    def _loop(self) -> None:
        while self._running:
            cmd = self._inner.next_command()
            if cmd is None:
                break
            self._dispatch(cmd)

    def _dispatch(self, cmd: RemoteCommand) -> None:
        if cmd.is_play():
            self._emit("play")
        elif cmd.is_pause():
            self._emit("pause")
        elif cmd.is_next():
            self._emit("next")
        elif cmd.is_previous():
            self._emit("previous")
        elif cmd.is_seek():
            self._emit("seek", cmd.position_ms)
        elif cmd.is_queue_jump():
            self._emit("queue_jump", cmd.index)
        elif cmd.is_queue_remove():
            self._emit("queue_remove", cmd.index)
        elif cmd.is_queue_move():
            self._emit("queue_move", cmd._from, cmd.to)
        elif cmd.is_set_shuffle():
            self._emit("set_shuffle", cmd.enabled)
        elif cmd.is_set_repeat():
            self._emit("set_repeat", cmd.mode)
        elif cmd.is_set_volume():
            self._emit("set_volume", cmd.volume)
        elif cmd.is_set_audio_settings():
            self._emit("set_audio_settings", cmd.settings_json)
        elif cmd.is_enqueue():
            self._emit("enqueue", cmd)
        else:  # pragma: no cover - defensive
            self._debug("unknown command", cmd)


class RemoteController(_Poller):
    """A remote UI: list devices, pick primary, send commands, observe state.

    Connects and registers in the background on construction. Register event
    handlers with :meth:`on` — each receives the matching :class:`RemoteEvent`
    variant (``devices``, ``device_registered``, ``device_unregistered``,
    ``primary_changed``, ``now_playing``, ``status``, ``queue``) — then call
    :meth:`listen`.
    """

    def __init__(
        self,
        token: str,
        name: str,
        url: str | None = None,
        debug: Debug | None = None,
    ) -> None:
        super().__init__(debug)
        self._inner = _RemoteController.connect(token, name, url)

    def on(self, event: str, handler: Handler) -> "RemoteController":
        super().on(event, handler)
        return self

    def listen(self) -> "RemoteController":
        """Start the background poll loop dispatching to handlers. Idempotent."""
        self._start("rocksky-remote-controller")
        return self

    # ── raw passthrough ────────────────────────────────────────────────────
    def next_event(self) -> RemoteEvent | None:
        """Block for the next event (advanced; :meth:`listen` is easier)."""
        return self._inner.next_event()

    # ── controls ───────────────────────────────────────────────────────────
    def set_primary(self, device_id: str) -> None:
        self._inner.set_primary(device_id)

    def play(self, target: str | None = None) -> None:
        self._inner.play(target)

    def pause(self, target: str | None = None) -> None:
        self._inner.pause(target)

    def next(self, target: str | None = None) -> None:
        self._inner.next(target)

    def previous(self, target: str | None = None) -> None:
        self._inner.previous(target)

    def seek(self, target: str | None, position_ms: int) -> None:
        self._inner.seek(target, position_ms)

    def queue_jump(self, target: str | None, index: int) -> None:
        self._inner.queue_jump(target, index)

    def queue_remove(self, target: str | None, index: int) -> None:
        self._inner.queue_remove(target, index)

    def queue_move(self, target: str | None, from_index: int, to_index: int) -> None:
        """Move queue item ``from_index`` to ``to_index`` (arrayMove semantics)."""
        self._inner.queue_move(target, from_index, to_index)

    def set_shuffle(self, target: str | None, enabled: bool) -> None:
        """Turn queue shuffle on/off. A player without shuffle ignores it."""
        self._inner.set_shuffle(target, enabled)

    def set_repeat(self, target: str | None, mode: str) -> None:
        """Set the queue repeat mode: ``"off"`` | ``"all"`` | ``"one"``."""
        self._inner.set_repeat(target, mode)

    def set_volume(self, target: str | None, volume: float) -> None:
        """Set output volume 0.0..=1.0. A player without volume ignores it."""
        self._inner.set_volume(target, min(1.0, max(0.0, volume)))

    def set_audio_settings(self, target: str | None, settings_json: str) -> None:
        """Apply a partial audio-settings document (JSON, PROTOCOL.md §6.1).

        Raises on invalid JSON rather than silently sending nothing.
        """
        self._inner.set_audio_settings(target, settings_json)

    def enqueue(
        self,
        target: str | None,
        tracks: typing.Sequence[RemoteQueueItem],
        mode: str = "now",
        shuffle: bool = False,
        start_index: int = 0,
    ) -> None:
        self._inner.enqueue(target, list(tracks), mode, shuffle, start_index)

    def disconnect(self) -> None:
        """Disconnect and stop the poll loop."""
        self._running = False
        self._inner.disconnect()

    def _loop(self) -> None:
        while self._running:
            event = self._inner.next_event()
            if event is None:
                break
            self._dispatch(event)

    def _dispatch(self, event: RemoteEvent) -> None:
        if event.is_devices():
            self._emit("devices", event)
        elif event.is_device_registered():
            self._emit("device_registered", event)
        elif event.is_device_unregistered():
            self._emit("device_unregistered", event)
        elif event.is_primary_changed():
            self._emit("primary_changed", event)
        elif event.is_now_playing():
            self._emit("now_playing", event)
        elif event.is_status():
            self._emit("status", event)
        elif event.is_queue():
            self._emit("queue", event)
        else:  # pragma: no cover - defensive
            self._debug("unknown event", event)
