import styled from "@emotion/styled";
import { useNavigate } from "@tanstack/react-router";
import { Modal, ModalBody, ModalHeader } from "baseui/modal";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { createPlaylistModalOpenAtom } from "../../atoms/createPlaylist";
import { libraryPlaylistModalOpenAtom } from "../../atoms/libraryPlaylist";
import { playerControlsAtom } from "../../atoms/playerControls";
import { profileAtom } from "../../atoms/profile";
import {
  librarySearchOpenAtom,
  type SearchScope,
  searchModalOpenAtom,
  searchModalScopeAtom,
} from "../../atoms/searchModal";
import { fullscreenPlayerAtom } from "../../atoms/fullscreenPlayer";
import { nowPlayingAtom } from "../../atoms/nowpaying";
import { rightPaneHiddenAtom } from "../../atoms/rightPane";
import { shortcutsHelpOpenAtom } from "../../atoms/shortcuts";
import { themeAtom } from "../../atoms/theme";

// ── Shortcut catalogue (also drives the help modal) ─────────────────────────

type Shortcut = { keys: string[]; label: string };
type Group = { title: string; items: Shortcut[] };

// `g`-prefixed navigation targets (GitHub / Linear style).
const GO_ROUTES: Record<string, string> = {
  h: "/",
  l: "/library",
  c: "/charts",
  r: "/recommendations",
  w: "/wrapped",
};

// Single-key shortcuts that open the search palette pre-scoped to one type.
const SEARCH_SCOPE_KEYS: Record<string, SearchScope> = {
  s: "tracks",
  a: "artists",
  l: "albums",
  u: "users",
};

const GROUPS: Group[] = [
  {
    title: "General",
    items: [
      { keys: ["?"], label: "Show this help" },
      { keys: ["Esc"], label: "Close dialog / search" },
      { keys: ["t"], label: "Toggle light / dark theme" },
      { keys: ["\\"], label: "Show / hide the side panel" },
      { keys: ["f"], label: "Toggle the fullscreen player" },
      { keys: ["e"], label: "Equalizer (audio settings)" },
      { keys: ["c"], label: "Create a playlist" },
    ],
  },
  {
    title: "Search",
    items: [
      { keys: ["/"], label: "Search everything" },
      { keys: ["s"], label: "Search songs" },
      { keys: ["a"], label: "Search artists" },
      { keys: ["l"], label: "Search albums" },
      { keys: ["u"], label: "Search people" },
      { keys: ["⇧", "L"], label: "Search your library" },
    ],
  },
  {
    title: "Go to",
    items: [
      { keys: ["g", "h"], label: "Home" },
      { keys: ["g", "l"], label: "Library" },
      { keys: ["g", "c"], label: "Charts" },
      { keys: ["g", "p"], label: "Your profile" },
      { keys: ["g", "r"], label: "Recommendations" },
      { keys: ["g", "w"], label: "Wrapped" },
    ],
  },
  {
    title: "Playback",
    items: [
      { keys: ["k"], label: "Play / pause" },
      { keys: ["n"], label: "Next track" },
      { keys: ["b"], label: "Previous track" },
      { keys: ["m"], label: "Mute / unmute" },
      { keys: ["←"], label: "Seek back 10s" },
      { keys: ["→"], label: "Seek forward 10s" },
    ],
  },
];

// ── Styling ─────────────────────────────────────────────────────────────────

const Title = styled.h2`
  font-family: RockfordSansBold;
  font-size: 20px;
  margin: 0;
  color: var(--color-text);
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  padding: 4px 4px 24px;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
    gap: 24px;
  }
`;

const GroupTitle = styled.div`
  font-family: RockfordSansBold;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: 12px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 0;
`;

const RowLabel = styled.span`
  font-size: 14px;
  color: var(--color-text);
`;

const Keys = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
`;

const Kbd = styled.kbd`
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1;
  min-width: 22px;
  padding: 5px 7px;
  text-align: center;
  color: var(--color-text);
  background-color: var(--color-input-background);
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 6px;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.12);
`;

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <Keys>
      {keys.map((k, i) => (
        <Kbd key={`${k}-${i}`}>{k}</Kbd>
      ))}
    </Keys>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

function isEditableTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable
  );
}

function KeyboardShortcuts() {
  const navigate = useNavigate();
  const profile = useAtomValue(profileAtom);
  const controls = useAtomValue(playerControlsAtom);
  const [{ darkMode }, setTheme] = useAtom(themeAtom);
  const [helpOpen, setHelpOpen] = useAtom(shortcutsHelpOpenAtom);
  const [paneHidden, setPaneHidden] = useAtom(rightPaneHiddenAtom);
  const [fullscreenOpen, setFullscreenOpen] = useAtom(fullscreenPlayerAtom);
  const nowPlaying = useAtomValue(nowPlayingAtom);
  const [searchOpen, setSearchOpen] = useAtom(searchModalOpenAtom);
  const setSearchScope = useSetAtom(searchModalScopeAtom);
  const setLibrarySearchOpen = useSetAtom(librarySearchOpenAtom);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useAtom(
    createPlaylistModalOpenAtom,
  );
  const [libraryPlaylistOpen, setLibraryPlaylistOpen] = useAtom(
    libraryPlaylistModalOpenAtom,
  );

  // The keydown listener is installed once; read the latest values through a
  // ref so it never closes over stale state.
  const stateRef = useRef({
    navigate,
    profile,
    controls,
    darkMode,
    setTheme,
    helpOpen,
    setHelpOpen,
    paneHidden,
    setPaneHidden,
    fullscreenOpen,
    setFullscreenOpen,
    nowPlaying,
    searchOpen,
    setSearchOpen,
    setSearchScope,
    setLibrarySearchOpen,
    createPlaylistOpen,
    setCreatePlaylistOpen,
    libraryPlaylistOpen,
    setLibraryPlaylistOpen,
  });
  stateRef.current = {
    navigate,
    profile,
    controls,
    darkMode,
    setTheme,
    helpOpen,
    setHelpOpen,
    paneHidden,
    setPaneHidden,
    fullscreenOpen,
    setFullscreenOpen,
    nowPlaying,
    searchOpen,
    setSearchOpen,
    setSearchScope,
    setLibrarySearchOpen,
    createPlaylistOpen,
    setCreatePlaylistOpen,
    libraryPlaylistOpen,
    setLibraryPlaylistOpen,
  };

  useEffect(() => {
    // Timestamp of the last `g` press, for the `g`-prefixed navigation combos.
    let pendingGoAt = 0;

    const toggleTheme = () => {
      const next = !stateRef.current.darkMode;
      stateRef.current.setTheme({ darkMode: next });
      localStorage.setItem("darkMode", next ? "true" : "false");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;

      // Escape closes any open overlay (baseui also closes on Escape, but this
      // covers focus edge-cases and keeps the pending `g` state clean).
      if (e.key === "Escape") {
        if (s.fullscreenOpen) s.setFullscreenOpen(false);
        if (s.helpOpen) s.setHelpOpen(false);
        if (s.searchOpen) s.setSearchOpen(false);
        if (s.createPlaylistOpen) s.setCreatePlaylistOpen(false);
        if (s.libraryPlaylistOpen) s.setLibraryPlaylistOpen(false);
        s.setLibrarySearchOpen(false);
        pendingGoAt = 0;
        return;
      }

      // Never hijack typing, and ignore browser/OS chords.
      if (isEditableTarget(e.target)) return;
      // A modal that owns the screen owns the keyboard too: without this, `c`
      // pressed with focus outside its inputs stacks the ATProto playlist
      // modal on top of the library one.
      if (s.libraryPlaylistOpen) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Second key of a `g …` navigation combo.
      if (pendingGoAt && e.timeStamp - pendingGoAt < 1200) {
        pendingGoAt = 0;
        if (e.key === "p") {
          if (s.profile?.handle) {
            e.preventDefault();
            s.navigate({
              to: "/profile/$did",
              params: { did: s.profile.handle },
            });
          }
          return;
        }
        const to = GO_ROUTES[e.key];
        if (to) {
          e.preventDefault();
          s.navigate({ to });
        }
        return;
      }

      // Single-key shortcuts that open the palette scoped to one type.
      const scope = SEARCH_SCOPE_KEYS[e.key];
      if (scope) {
        e.preventDefault();
        s.setSearchScope(scope);
        s.setSearchOpen(true);
        return;
      }

      switch (e.key) {
        case "/":
          e.preventDefault();
          s.setSearchScope("all");
          s.setSearchOpen(true);
          break;
        // Shift+L → quick-search the signed-in user's own library.
        case "L":
          if (s.profile?.handle) {
            e.preventDefault();
            s.setLibrarySearchOpen(true);
          }
          break;
        case "c":
          if (s.profile?.handle) {
            e.preventDefault();
            s.setCreatePlaylistOpen(true);
          }
          break;
        case "?":
          e.preventDefault();
          s.setHelpOpen(!s.helpOpen);
          break;
        case "g":
          pendingGoAt = e.timeStamp;
          break;
        case "t":
          e.preventDefault();
          toggleTheme();
          break;
        case "\\":
          e.preventDefault();
          s.setPaneHidden(!s.paneHidden);
          break;
        case "f":
          // Nothing to show fullscreen without a track, and the player that
          // hosts the overlay does not render at all in that case.
          if (!s.nowPlaying) break;
          e.preventDefault();
          s.setFullscreenOpen(!s.fullscreenOpen);
          break;
        case "e":
          e.preventDefault();
          s.navigate({ to: "/settings/audio" });
          break;
        case "k":
          if (s.controls) {
            e.preventDefault();
            s.controls.toggle();
          }
          break;
        case "n":
          if (s.controls) {
            e.preventDefault();
            s.controls.next();
          }
          break;
        case "b":
          if (s.controls) {
            e.preventDefault();
            s.controls.previous();
          }
          break;
        case "m":
          if (s.controls) {
            e.preventDefault();
            s.controls.toggleMute();
          }
          break;
        case "ArrowRight":
          if (s.controls) {
            e.preventDefault();
            s.controls.seekBy(10_000);
          }
          break;
        case "ArrowLeft":
          if (s.controls) {
            e.preventDefault();
            s.controls.seekBy(-10_000);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Modal
      size="auto"
      isOpen={helpOpen}
      onClose={() => setHelpOpen(false)}
      overrides={{
        Root: { style: { zIndex: 1000 } },
        Dialog: {
          style: {
            backgroundColor: "var(--color-background)",
            maxWidth: "640px",
            width: "90vw",
          },
        },
        Close: { style: { color: "var(--color-text-muted)" } },
      }}
    >
      <ModalHeader className="!mx-[24px] !mt-[24px] !mb-[8px]">
        <Title>Keyboard shortcuts</Title>
      </ModalHeader>
      <ModalBody className="!mx-[24px]">
        <Columns>
          {GROUPS.map((group) => (
            <div key={group.title}>
              <GroupTitle>{group.title}</GroupTitle>
              {group.items.map((item) => (
                <Row key={item.label}>
                  <RowLabel>{item.label}</RowLabel>
                  <KeyCombo keys={item.keys} />
                </Row>
              ))}
            </div>
          ))}
        </Columns>
      </ModalBody>
    </Modal>
  );
}

export default KeyboardShortcuts;
