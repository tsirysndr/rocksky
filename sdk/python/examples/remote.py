"""Remote player + controller tour (needs a real Rocksky access token).

    uv run python examples/remote.py <ACCESS_TOKEN>

A RemotePlayer advertises what "this device" is playing and reacts to commands
from a controller; a RemoteController lists the user's players, picks a primary,
observes their state, and sends commands. Both use a background poll thread —
register handlers with ``.on(event, fn)`` and call ``.listen()``.

Needs the native lib — run ./build-core.sh first (or it ships with the wheel).
"""

import sys
import time

from rocksky import (
    RemoteController,
    RemoteNowPlaying,
    RemotePlayer,
    RemoteQueueItem,
    RemoteStatus,
)


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python examples/remote.py <ACCESS_TOKEN>")
        raise SystemExit(2)
    token = sys.argv[1]

    # ── player: expose this process as a controllable device ────────────────
    player = RemotePlayer(token, "Python Example Player")
    player.on("play", lambda: print("[player] play"))
    player.on("pause", lambda: print("[player] pause"))
    player.on("next", lambda: print("[player] next"))
    player.on("previous", lambda: print("[player] previous"))
    player.on("seek", lambda position_ms: print(f"[player] seek -> {position_ms}ms"))
    player.on("queue_jump", lambda index: print(f"[player] queue jump -> {index}"))
    player.on("queue_remove", lambda index: print(f"[player] queue remove -> {index}"))
    player.on("enqueue", lambda cmd: print(f"[player] enqueue {len(cmd.tracks)} track(s), mode={cmd.mode}"))
    player.listen()

    # Advertise a track + queue so controllers have something to show.
    player.set_now_playing(
        RemoteNowPlaying(
            title="Chaser",
            artist="Calibro 35",
            album="Jazzploitation",
            album_artist="Calibro 35",
            duration_ms=182320,
            elapsed_ms=0,
            is_playing=True,
        )
    )
    player.set_status(RemoteStatus.PLAYING)
    player.set_queue(
        [RemoteQueueItem(title="Chaser", artist="Calibro 35", album="Jazzploitation")],
        0,
    )

    # ── controller: observe + drive the user's players ──────────────────────
    controller = RemoteController(token, "Python Example Controller")
    controller.on("devices", lambda e: print(f"[controller] {len(e.devices)} device(s), primary={e.primary_device}"))
    controller.on("now_playing", lambda e: print(f"[controller] {e.device_name}: {e.track.artist} — {e.track.title}"))
    controller.on("status", lambda e: print(f"[controller] {e.device_name}: {e.status}"))
    controller.on("queue", lambda e: print(f"[controller] {e.device_name}: queue index {e.index}"))
    controller.listen()

    # Drive whatever devices exist (None target = broadcast to all).
    time.sleep(1)
    controller.pause(None)
    controller.seek(None, 42000)

    print("listening for 30s — control this player from the Rocksky miniplayer…")
    try:
        time.sleep(30)
    except KeyboardInterrupt:
        pass
    finally:
        controller.disconnect()
        player.disconnect()


if __name__ == "__main__":
    main()
