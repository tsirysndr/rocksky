import { Box, Text, ScrollBox, useApp, useInput } from "./ui.js";
import { getDefaultStore, useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useEffect, useRef, useState } from "react";
import { AddToPlaylistView } from "./AddToPlaylistView.js";
import { AuthView } from "./AuthView.js";
import { CacheView } from "./CacheView.js";
import { EqualizerView } from "./EqualizerView.js";
import { HelpView } from "./HelpView.js";
import { likedIdsAtom, useToggleLike } from "./likes.js";
import { queryClient } from "./queryClient.js";
import { initMpris, type MprisHandle } from "./mpris.js";
import { startMpdServer, type MpdServerHandle } from "../mpd/server.js";
import { loadSettings } from "./settings.js";
import { warmLibrary, libraryQuery } from "./library.js";
import { MusicView } from "./MusicView.js";
import { PlayerBar } from "./PlayerBar.js";
import { prefetchTick, resumeSession, skipNext, skipPrev } from "./playback.js";
import { playerController, Repeat } from "./player.js";
import { scrobblerTick } from "./scrobbler.js";
import { ProfileView } from "./ProfileView.js";
import { QueueView } from "./QueueView.js";
import { ScrobblesView } from "./ScrobblesView.js";
import { SearchOverlay } from "./SearchOverlay.js";
import { saveSession } from "./session.js";
import {
  addToPlaylistAtom,
  authAtom,
  authOpenAtom,
  helpOpenAtom,
  playerStatusAtom,
  queueOpenAtom,
  cacheOpenAtom,
  scrobbledTitleAtom,
  searchContextAtom,
  searchOpenAtom,
  soundOpenAtom,
  queueVersionAtom,
  nfcMessageAtom,
  tabAtom,
} from "./store.js";
import { startNfcWatch } from "./nfc.js";
import { BLUE, palette } from "./theme.js";
import { useFullScreen } from "./useFullScreen.js";

const TABS = ["Global Scrobbles", "My Music", "Profile"];

export function App() {
  const { exit } = useApp();
  const { rows, cols } = useFullScreen();
  const [tab, setTab] = useAtom(tabAtom);
  const [profileVisited, setProfileVisited] = useState(tab === 2);
  useEffect(() => {
    if (tab === 2) setProfileVisited(true);
  }, [tab]);
  const setPlayerStatus = useSetAtom(playerStatusAtom);
  const [searchOpen, setSearchOpen] = useAtom(searchOpenAtom);
  const setSearchContext = useSetAtom(searchContextAtom);
  const [queueOpen, setQueueOpen] = useAtom(queueOpenAtom);
  const [soundOpen, setSoundOpen] = useAtom(soundOpenAtom);
  const [helpOpen, setHelpOpen] = useAtom(helpOpenAtom);
  const [authOpen, setAuthOpen] = useAtom(authOpenAtom);
  const [cacheOpen, setCacheOpen] = useAtom(cacheOpenAtom);
  const [addTrack, setAddTrack] = useAtom(addToPlaylistAtom);
  const token = useAtomValue(authAtom);
  const setScrobbledTitle = useSetAtom(scrobbledTitleAtom);
  const setQueueVersion = useSetAtom(queueVersionAtom);
  const setLikedIds = useSetAtom(likedIdsAtom);
  const [nfcMessage, setNfcMessage] = useAtom(nfcMessageAtom);
  const toggleLike = useToggleLike(token);
  useEffect(() => {
    if (token) void warmLibrary(token);
  }, [token]);

  const overlayOpen =
    searchOpen ||
    queueOpen ||
    soundOpen ||
    helpOpen ||
    authOpen ||
    cacheOpen ||
    addTrack != null;

  // Expose the player over MPD (opt-in) so external clients — mpc, ncmpcpp,
  // MALP — can control this exact session and browse the library. It shares the
  // same playerController, so TUI and MPD state stay in sync both ways.
  useEffect(() => {
    const settings = loadSettings();
    if (!settings.mpd.enabled) return;
    let handle: MpdServerHandle | null = null;
    const store = getDefaultStore();
    startMpdServer({
      getToken: () => store.get(authAtom),
      port: settings.mpd.port,
      bind: settings.mpd.bind,
    })
      .then((h) => {
        handle = h;
      })
      .catch(() => {
        // No socket (e.g. port unavailable) — the TUI keeps working.
      });
    return () => handle?.close();
  }, []);

  // On Linux, expose the player over MPRIS (D-Bus) for media keys / desktop UI.
  const mprisRef = useRef<MprisHandle | null>(null);
  useEffect(() => {
    let handle: MprisHandle | null = null;
    initMpris().then((h) => {
      handle = h;
      mprisRef.current = h;
    });
    return () => {
      handle?.close();
      mprisRef.current = null;
    };
  }, []);

  // Tap an NFC tag to play the album or playlist it holds. Reads the token from
  // the store on each tap rather than closing over it, so signing in mid-session
  // doesn't need the watcher restarted (which would drop the reader).
  useEffect(() => {
    const store = getDefaultStore();
    return startNfcWatch(() => store.get(authAtom), setNfcMessage);
  }, [setNfcMessage]);

  // NFC notices are transient; clear them so the footer doesn't keep showing a
  // tap from ten minutes ago.
  useEffect(() => {
    if (!nfcMessage) return;
    const id = setTimeout(() => setNfcMessage(""), 6000);
    return () => clearTimeout(id);
  }, [nfcMessage, setNfcMessage]);

  useEffect(() => {
    const id = setInterval(() => {
      setPlayerStatus(playerController.status());
      mprisRef.current?.update();
    }, 500);
    return () => clearInterval(id);
  }, [setPlayerStatus]);

  // Persist the queue + playback position periodically so it survives restarts.
  useEffect(() => {
    const id = setInterval(
      () => saveSession(playerController.sessionSnapshot()),
      5000,
    );
    return () => clearInterval(id);
  }, []);

  // Seed the set of liked song URIs from the user's loved songs.
  useEffect(() => {
    if (!token) return;
    queryClient
      .fetchInfiniteQuery(libraryQuery(token, "favorites"))
      .then((data) => setLikedIds(new Set(data.pages.flat().flatMap(track =>
        track.kind === "track" && track.trackId ? [track.trackId] : []))))
      .catch(() => {});
  }, [token, setLikedIds]);

  // Refresh the queue view instantly whenever the queue mutates.
  useEffect(() => {
    playerController.onQueueChange = () => setQueueVersion((v) => v + 1);
    return () => {
      playerController.onQueueChange = null;
    };
  }, [setQueueVersion]);

  // Apply Last.fm scrobbling rules and precache the next track (at 50%).
  useEffect(() => {
    const id = setInterval(() => {
      scrobblerTick(token, (item) => setScrobbledTitle(item.title));
      prefetchTick(token);
    }, 2000);
    return () => clearInterval(id);
  }, [token, setScrobbledTitle]);

  const wide = cols >= 100 && rows >= 36;
  const listHeight = Math.max(1, rows - (rows < 26 ? 11 : wide ? 17 : 19));
  const titles = ["Global Scrobbles", "My Music", "Your Profile"];
  const descriptions = [
    "A live pulse of what everyone is listening to.",
    "Your collection, one good listen at a time.",
    "Your listening life, all in one place.",
  ];

  // Ctrl-C always works, including while a dialog owns the keyboard.
  useInput((input, key) => {
    if (key.ctrl && input === "c") exit();
  });

  useInput(
    (input, key) => {
      if (input === "q" || (key.ctrl && input === "c")) {
        // Note: don't call the native close() here — its audio-teardown can
        // block. Just unmount; cmd/tui force-exits, which frees the device.
        exit();
        return;
      }
      // Open overlays
      if (input === "/") {
        setSearchContext(tab === 1 ? "uploads" : "global");
        setSearchOpen(true);
        return;
      }
      if (input === "Q") return setQueueOpen(true);
      if (input === "e") return setSoundOpen(true);
      if (input === "?") return setHelpOpen(true);
      if (input === "A") return setAuthOpen(true);
      if (input === "C") return setCacheOpen(true);

      // Tabs
      if (key.tab)
        setTab((t) => (t + (key.shift ? TABS.length - 1 : 1)) % TABS.length);
      if (input === "1") setTab(0);
      if (input === "2") setTab(1);
      if (input === "3") setTab(2);

      // Transport
      if (input === " ") {
        const st = playerController.status();
        if (playerController.restored && (!st || st.state === "stopped")) {
          if (token) void resumeSession(token);
        } else {
          playerController.toggle();
        }
      }
      if (input === "n" && token) void skipNext(token);
      if (input === "p" && token) void skipPrev(token);
      if (input === "+" || input === "=") playerController.nudgeVolume(0.05);
      if (input === "-" || input === "_") playerController.nudgeVolume(-0.05);

      // Shuffle / repeat
      if (input === "s") playerController.toggleShuffle();
      if (input === "r") playerController.setRepeat(Repeat.All);
      if (input === "o") playerController.setRepeat(Repeat.One);
      if (input === "0") playerController.setRepeat(Repeat.Off);

      // Like the currently-playing track (My Music likes the selected one).
      if (input === "f" && tab !== 1) {
        void toggleLike(playerController.currentItem()?.trackId);
      }

      // Add the currently-playing track to a playlist (My Music adds selection).
      if (input === ";" && tab !== 1) {
        const cur = playerController.currentItem();
        if (cur?.trackId)
          setAddTrack({ trackId: cur.trackId, title: cur.title });
      }

      // Force-refresh the live scrobble feeds.
      if (input === "R") {
        queryClient.invalidateQueries({ queryKey: ["globalScrobbles"] });
        queryClient.invalidateQueries({ queryKey: ["actorScrobbles"] });
      }
    },
    { isActive: !overlayOpen },
  );

  if (cols < 60 || rows < 18) {
    return (
      <Box
        width={cols}
        height={rows}
        backgroundColor={palette.background}
        padding={1}
        flexDirection="column"
      >
        <Text bold color={BLUE}>
          ◈ rocksky
        </Text>
        <Text>Give your music a little more room.</Text>
        <Text dimColor>
          Resize to at least 60 columns × 18 rows. Press q to quit.
        </Text>
      </Box>
    );
  }

  return (
    <Box
      width={cols}
      height={rows}
      backgroundColor={palette.background}
      paddingX={2}
      paddingY={1}
      flexDirection="column"
    >
      <Box
        height={rows < 26 ? 2 : 3}
        alignItems="center"
        justifyContent="space-between"
      >
        <Text>
          <Text bold color={BLUE}>
            ◈ rocksky
          </Text>
          <Text color={palette.muted}> / your music, everywhere</Text>
        </Text>
        <Text color={token ? palette.pink : palette.muted}>
          {token ? "● Connected" : "○ Guest · A sign in"}
        </Text>
      </Box>
      {!wide && (
        <Box height={rows < 26 ? 1 : 2} gap={1}>
          {TABS.map((label, i) => (
            <Box
              key={label}
              paddingX={1}
              backgroundColor={tab === i ? palette.accent : palette.background}
              onMouseDown={() => {
                if (!overlayOpen) setTab(i);
              }}
            >
              <Text
                bold={tab === i}
                color={tab === i ? palette.background : palette.muted}
              >{`${i + 1} ${label}`}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box flexGrow={1} flexShrink={1} minHeight={0} gap={2}>
        {wide && (
          <Box
            width={23}
            flexDirection="column"
            paddingTop={1}
            overflow="hidden"
          >
            <Text color={palette.muted}>YOUR SPACE</Text>
            <Box height={1} />
            {TABS.map((label, i) => (
              <Box
                key={label}
                height={rows < 38 ? 2 : 3}
                paddingX={1}
                alignItems="center"
                backgroundColor={
                  tab === i ? palette.selected : palette.background
                }
                onMouseDown={() => {
                  if (!overlayOpen) setTab(i);
                }}
              >
                <Text
                  color={tab === i ? BLUE : palette.muted}
                  bold={tab === i}
                >{`${tab === i ? "▎" : " "} ${i + 1}  ${label === "Global Scrobbles" ? "Discover" : label}`}</Text>
              </Box>
            ))}
            <Box height={2} />
            <Text color={palette.muted}>PLAYER</Text>
            <Box height={1} />
            {[
              ["Q", "Queue", () => setQueueOpen(true)],
              ["e", "Sound & equalizer", () => setSoundOpen(true)],
              ["C", "Offline cache", () => setCacheOpen(true)],
              ["?", "Keyboard shortcuts", () => setHelpOpen(true)],
            ].map(([key, label, action]) => (
              <Box
                key={String(key)}
                height={2}
                paddingX={1}
                onMouseDown={() => {
                  if (!overlayOpen) (action as () => void)();
                }}
              >
                <Text>
                  <Text color={palette.accent}>{`${key}  `}</Text>
                  <Text color={palette.muted}>{String(label)}</Text>
                </Text>
              </Box>
            ))}
            <Box flexGrow={1} />
            <Text color={palette.muted}>Made for listening.</Text>
          </Box>
        )}
        <Box
          flexDirection="column"
          flexGrow={1}
          flexShrink={1}
          minWidth={0}
          overflow="hidden"
          backgroundColor={palette.surface}
          paddingX={2}
          paddingY={rows < 26 ? 0 : 1}
        >
          <Box justifyContent="space-between" height={rows < 26 ? 1 : 2}>
            <Text bold>
              {overlayOpen
                ? helpOpen
                  ? "Keyboard shortcuts"
                  : searchOpen
                    ? "Search"
                    : queueOpen
                      ? "Play queue"
                      : soundOpen
                        ? "Sound & equalizer"
                        : authOpen
                          ? "Your account"
                          : cacheOpen
                            ? "Offline cache"
                            : "Add to playlist"
                : titles[tab]}
            </Text>
            <Text color={BLUE}>/ Search</Text>
          </Box>
          {!overlayOpen && rows >= 26 && (
            <Box height={2}>
              <Text color={palette.muted}>{descriptions[tab]}</Text>
            </Box>
          )}
          <Box
            flexDirection="column"
            flexGrow={1}
            flexShrink={1}
            minHeight={0}
            overflow="hidden"
            display={overlayOpen ? "none" : "flex"}
          >
            <Box flexDirection="column" display={tab === 0 ? "flex" : "none"}>
              <ScrobblesView
                isActive={tab === 0 && !overlayOpen}
                height={listHeight}
              />
            </Box>
            <Box flexDirection="column" display={tab === 1 ? "flex" : "none"}>
              <MusicView
                isActive={tab === 1 && !overlayOpen}
                height={listHeight}
              />
            </Box>
            <Box
              flexDirection="column"
              flexGrow={1}
              flexShrink={1}
              minHeight={0}
              display={tab === 2 ? "flex" : "none"}
            >
              <ScrollBox focused={tab === 2 && !overlayOpen}>
                {(tab === 2 || profileVisited) && (
                  <ProfileView
                    height={listHeight}
                    isActive={tab === 2 && !overlayOpen}
                  />
                )}
              </ScrollBox>
            </Box>
          </Box>
          <Box
            flexDirection="column"
            flexGrow={overlayOpen ? 1 : 0}
            flexShrink={1}
            minHeight={0}
            overflow="hidden"
          >
            {overlayOpen && (
              <ScrollBox focused={helpOpen}>
                {addTrack != null ? (
                  <AddToPlaylistView />
                ) : authOpen ? (
                  <AuthView />
                ) : cacheOpen ? (
                  <CacheView />
                ) : helpOpen ? (
                  <HelpView />
                ) : searchOpen ? (
                  <SearchOverlay height={listHeight} />
                ) : queueOpen ? (
                  <QueueView height={listHeight} />
                ) : soundOpen ? (
                  <EqualizerView />
                ) : null}
              </ScrollBox>
            )}
          </Box>
        </Box>
      </Box>
      <Box height={1} />
      <PlayerBar />
      <Box height={1} />
      <Box height={1} justifyContent="space-between">
        <Text color={palette.muted} wrap="truncate-end">
          <Text color={BLUE}>Space</Text>
          {" play / pause    "}
          <Text color={BLUE}>/</Text>
          {" search    "}
          <Text color={BLUE}>Tab</Text>
          {" switch    "}
          <Text color={BLUE}>?</Text>
          {" help"}
        </Text>
        <Text
          color={nfcMessage ? palette.pink : palette.muted}
          wrap="truncate-end"
        >
          {nfcMessage || "q quit"}
        </Text>
      </Box>
    </Box>
  );
}
