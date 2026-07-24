"""Read-only tour of the native Rocksky core (no auth needed).

    uv run python examples/native_core.py

Needs the native lib — run ./build-core.sh first (or it ships with the wheel).
The write side (login + scrobble) is shown commented at the bottom.
"""

from rocksky import AppView, ScrobbleInput, song_hash  # noqa: F401


def main() -> None:
    av = AppView(None)
    stats = av.global_stats()
    print(f"global: {stats.scrobbles} scrobbles · {stats.users} users · {stats.tracks} tracks")

    print("top tracks:")
    for t in av.top_tracks(5, 0):
        print(f"  {t.artist} — {t.title}")

    print("song hash:", song_hash("Chaser", "Calibro 35", "Jazzploitation"))

    # --- write side (uncomment with real credentials) ---
    # from rocksky import Agent
    # agent = Agent.login_password("session.json", "alice.bsky.social", "app-pw", None, None)
    # out = agent.scrobble(ScrobbleInput(
    #     title="Chaser", artist="Calibro 35",
    #     album="Jazzploitation", album_artist="Calibro 35", duration_ms=182320,
    # ))
    # print("scrobbled:", out.scrobble_uri)

    # --- library: your uploaded music (needs an access token) ---
    # from rocksky import Library
    # lib = Library(None, "YOUR_ACCESS_TOKEN")   # returns raw JSON strings
    # print(lib.get_genres())
    # print(lib.get_album_list("newest", 10, None, None, None, None))
    # print(lib.get_song("<song-id>"))


if __name__ == "__main__":
    main()
