import { Box, Text, useApp, useInput } from "ink";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useEffect, useRef } from "react";
import { AuthView } from "./AuthView";
import { CacheView } from "./CacheView";
import { EqualizerView } from "./EqualizerView";
import { HelpView } from "./HelpView";
import { RockskyClient } from "client";
import { likedUrisAtom, useToggleLike } from "./likes";
import { initMpris, type MprisHandle } from "./mpris";
import { MusicView } from "./MusicView";
import { PlayerBar } from "./PlayerBar";
import { prefetchTick, resumeSession } from "./playback";
import { playerController, Repeat } from "./player";
import { scrobblerTick } from "./scrobbler";
import { ProfileView } from "./ProfileView";
import { QueueView } from "./QueueView";
import { ScrobblesView } from "./ScrobblesView";
import { SearchOverlay } from "./SearchOverlay";
import { saveSession } from "./session";
import {
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
  tabAtom,
} from "./store";
import { BLUE } from "./theme";
import { useFullScreen } from "./useFullScreen";

const TABS = ["Global Scrobbles", "My Music", "Profile"];

export function App() {
  const { exit } = useApp();
  const { rows, cols } = useFullScreen();
  const [tab, setTab] = useAtom(tabAtom);
  const setPlayerStatus = useSetAtom(playerStatusAtom);
  const [searchOpen, setSearchOpen] = useAtom(searchOpenAtom);
  const setSearchContext = useSetAtom(searchContextAtom);
  const [queueOpen, setQueueOpen] = useAtom(queueOpenAtom);
  const [soundOpen, setSoundOpen] = useAtom(soundOpenAtom);
  const [helpOpen, setHelpOpen] = useAtom(helpOpenAtom);
  const [authOpen, setAuthOpen] = useAtom(authOpenAtom);
  const [cacheOpen, setCacheOpen] = useAtom(cacheOpenAtom);
  const token = useAtomValue(authAtom);
  const setScrobbledTitle = useSetAtom(scrobbledTitleAtom);
  const setQueueVersion = useSetAtom(queueVersionAtom);
  const setLikedUris = useSetAtom(likedUrisAtom);
  const toggleLike = useToggleLike(token);

  const overlayOpen =
    searchOpen || queueOpen || soundOpen || helpOpen || authOpen || cacheOpen;

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
    const client = new RockskyClient(token);
    client
      .getCurrentUser()
      .then((u: any) => client.getLovedSongs(u.did))
      .then((tracks: any[]) =>
        setLikedUris(
          new Set(tracks.map((t) => t.uri).filter(Boolean) as string[]),
        ),
      )
      .catch(() => {});
  }, [token, setLikedUris]);

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

  const listHeight = Math.max(5, rows - 14);

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
      if (key.tab) setTab((t) => (t + 1) % TABS.length);
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
      if (input === "n") playerController.next();
      if (input === "p") playerController.previous();
      if (input === "+" || input === "=") playerController.nudgeVolume(0.05);
      if (input === "-" || input === "_") playerController.nudgeVolume(-0.05);

      // Shuffle / repeat
      if (input === "s") playerController.toggleShuffle();
      if (input === "r") playerController.setRepeat(Repeat.All);
      if (input === "o") playerController.setRepeat(Repeat.One);
      if (input === "0") playerController.setRepeat(Repeat.Off);

      // Like the currently-playing track (My Music likes the selected one).
      if (input === "f" && tab !== 1) {
        void toggleLike(playerController.currentItem()?.uri);
      }
    },
    { isActive: !overlayOpen },
  );

  return (
    <Box flexDirection="column" width={cols} height={rows} padding={1}>
      <Box marginBottom={1}>
        <Text bold color={BLUE}>
          {"♫ Rocksky   "}
        </Text>
        {TABS.map((label, i) => (
          <Text
            key={label}
            bold={i === tab}
            inverse={i === tab}
            color={i === tab ? BLUE : undefined}
            dimColor={i !== tab}
          >
            {` ${i + 1} ${label} `}
          </Text>
        ))}
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {/* Tab views stay mounted (hidden) while an overlay is open, so their
            navigation state — mode, drill path, selection — is preserved. */}
        <Box
          flexDirection="column"
          flexGrow={1}
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
          <Box flexDirection="column" display={tab === 2 ? "flex" : "none"}>
            <ProfileView
              height={listHeight}
              isActive={tab === 2 && !overlayOpen}
            />
          </Box>
        </Box>

        {authOpen ? (
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
      </Box>

      <Box flexDirection="column">
        <PlayerBar />
        <Text dimColor wrap="truncate-end">
          {"? help · / search · Q queue · e eq · Space play/pause · n/p next/prev · Tab tabs · q quit"}
        </Text>
      </Box>
    </Box>
  );
}
