/**
 * Raycast-style quick-search over the authenticated user's OWN library
 * (Navidrome: songs / albums / artists), with add-to-queue actions on results.
 * Opened with Shift+L (see components/KeyboardShortcuts), mounted once globally
 * from the root route. Mirrors the styling of the global SearchModal.
 *
 * Add-to-queue goes through useUploadPlayer, which is device-aware — so it drives
 * the local in-browser engine, or relays to the active remote device.
 */
import styled from "@emotion/styled";
import { shuffled } from "../../lib/shuffle";
import { Search as SearchIcon } from "@styled-icons/evaicons-solid";
import { useNavigate } from "@tanstack/react-router";
import { IconArrowsShuffle, IconDots, IconDownload, IconPlayerPlay, IconPlaylist, IconPlaylistAdd, IconCornerDownRight } from "@tabler/icons-react";
import { useAtom, useSetAtom } from "jotai";
import _ from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchNavidromeAlbum,
  downloadFromNavidrome,
  coverArtUrlOf,
  searchNavidrome,
  type NavidromeAlbum,
  type NavidromeArtist,
  type NavidromeSong,
} from "../../api/navidrome";
import { addToLibraryPlaylistSongAtom } from "../../atoms/addToLibraryPlaylist";
import { librarySearchOpenAtom } from "../../atoms/searchModal";
import AlbumArt from "../../components/AlbumArt";
import Artist from "../../components/Icons/Artist";
import Disc from "../../components/Icons/Disc";
import { songToQueueTrack, useNavidromeCredentials } from "../../hooks/useNavidrome";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import type { QueueTrack } from "../../atoms/queue";

// ── Result model ──────────────────────────────────────────────────────────────

type Item =
  | { kind: "song"; id: string; song: NavidromeSong }
  | { kind: "album"; id: string; album: NavidromeAlbum }
  | { kind: "artist"; id: string; artist: NavidromeArtist };

// ── Styling (mirrors layouts/Search/SearchModal) ──────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 16px 16px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(3px);
`;

const Panel = styled.div`
  width: 100%;
  max-width: 640px;
  max-height: 66vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
`;

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);
`;

const QueryInput = styled.input`
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text);
  font-family: RockfordSansRegular;
  font-size: 18px;
  &::placeholder {
    color: var(--color-text-muted);
  }
`;

const ScopeBadge = styled.span`
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-primary);
  border: 1px solid color-mix(in srgb, var(--color-primary) 40%, transparent);
  border-radius: 6px;
  padding: 4px 7px;
`;

const EscHint = styled.kbd`
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1;
  color: var(--color-text-muted);
  padding: 4px 7px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 6px;
`;

const Results = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
`;

const SectionLabel = styled.div`
  font-family: RockfordSansBold;
  font-size: 11px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  padding: 12px 12px 6px;
`;

const Row = styled.div<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 9px;
  cursor: pointer;
  background: ${({ active }) => (active ? "var(--color-menu-hover)" : "transparent")};
`;

const Thumb = styled.div<{ round?: boolean }>`
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: ${({ round }) => (round ? "50%" : "6px")};
  overflow: hidden;
  background: var(--color-skeleton-background);
  display: flex;
  align-items: center;
  justify-content: center;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const RowText = styled.div`
  min-width: 0;
  flex: 1;
`;

const Primary = styled.div`
  color: var(--color-text);
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Secondary = styled.div`
  color: var(--color-text-muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const MenuBtn = styled.button`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  &:hover {
    background: var(--color-background);
    color: var(--color-text);
  }
`;

const Empty = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 9px 16px;
  border-top: 1px solid rgba(128, 128, 128, 0.18);
  color: var(--color-text-muted);
  font-size: 12px;
`;

const FootHint = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  kbd {
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 2px 6px;
    border: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: 5px;
  }
`;

// Row action menu (portal, above the palette).
const MenuOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1190;
`;

const Menu = styled.div`
  position: fixed;
  z-index: 1200;
  min-width: 190px;
  padding: 6px;
  background: var(--color-background);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 10px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
`;

const MenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text);
  font-size: 14px;
  font-family: RockfordSansRegular;
  text-align: left;
  cursor: pointer;
  &:hover {
    background: var(--color-menu-hover);
  }
`;

const ICON = "var(--color-text-muted)";

// ── Palette ───────────────────────────────────────────────────────────────────

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { data: creds } = useNavidromeCredentials();
  const { playNow, playNext, playLast, playNextAll, playLastAll } = useUploadPlayer();

  const [query, setQuery] = useState("");
  const setAddToPlaylistSong = useSetAtom(addToLibraryPlaylistSongAtom);
  const [songs, setSongs] = useState<NavidromeSong[]>([]);
  const [albums, setAlbums] = useState<NavidromeAlbum[]>([]);
  const [artists, setArtists] = useState<NavidromeArtist[]>([]);
  const [active, setActive] = useState(0);
  const [menu, setMenu] = useState<{ item: Item; x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const credsRef = useRef(creds);
  credsRef.current = creds;

  // Debounced Navidrome search.
  const runSearch = useMemo(
    () =>
      _.debounce(async (q: string) => {
        const c = credsRef.current;
        if (!c) return;
        try {
          const res = await searchNavidrome(c, q, { songCount: 30, albumCount: 20, artistCount: 20 });
          setSongs(res.songs);
          setAlbums(res.albums);
          setArtists(res.artists);
        } catch {
          setSongs([]);
          setAlbums([]);
          setArtists([]);
        }
      }, 200),
    [],
  );

  useEffect(() => {
    inputRef.current?.focus();
    return () => runSearch.cancel();
  }, [runSearch]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      runSearch.cancel();
      setSongs([]);
      setAlbums([]);
      setArtists([]);
      return;
    }
    runSearch(q);
  }, [query, runSearch]);

  // Flat, ordered list for arrow-key navigation.
  const flat: Item[] = useMemo(
    () => [
      ...songs.map((song): Item => ({ kind: "song", id: song.id, song })),
      ...albums.map((album): Item => ({ kind: "album", id: album.id, album })),
      ...artists.map((artist): Item => ({ kind: "artist", id: artist.id, artist })),
    ],
    [songs, albums, artists],
  );

  const prevFlat = useRef(flat);
  if (prevFlat.current !== flat) {
    prevFlat.current = flat;
    if (active !== 0) setActive(0);
  }

  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const albumTracks = useCallback(
    async (album: NavidromeAlbum): Promise<QueueTrack[]> => {
      if (!creds) return [];
      const full = await fetchNavidromeAlbum(creds, album.id);
      const albumSongs = (full as unknown as { song?: NavidromeSong[] }).song ?? [];
      return albumSongs.map((s) => songToQueueTrack(s, creds));
    },
    [creds],
  );

  // Default action (Enter / row click): songs play now; albums/artists open
  // their library page. Queue actions live in the ⋯ menu.
  const activate = useCallback(
    (item: Item | undefined) => {
      if (!item || !creds) return;
      if (item.kind === "song") {
        playNow([songToQueueTrack(item.song, creds)]);
      } else if (item.kind === "album") {
        navigate({ to: "/library/album/$id", params: { id: item.album.id } });
      } else {
        navigate({ to: "/library/artist/$id", params: { id: item.artist.id } });
      }
      onClose();
    },
    [creds, playNow, navigate, onClose],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (menu) setMenu(null);
      else onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(flat[active]);
    }
  };

  const openMenu = (item: Item, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({ item, x: Math.min(r.right, window.innerWidth - 200), y: r.bottom + 4 });
  };

  const trimmed = query.trim();
  let flatIndex = -1;

  const renderRow = (item: Item, opts: { primary: string; secondary: string | null; art: string | null; round: boolean; icon: React.ReactNode; withMenu: boolean }) => {
    flatIndex += 1;
    const idx = flatIndex;
    return (
      <Row
        key={`${item.kind}-${item.id}`}
        active={idx === active}
        ref={(el) => {
          rowRefs.current[idx] = el;
        }}
        onMouseMove={() => setActive(idx)}
        onClick={() => activate(item)}
      >
        <Thumb round={opts.round}>
          {opts.art ? <AlbumArt src={opts.art} alt={opts.primary} /> : opts.icon}
        </Thumb>
        <RowText>
          <Primary>{opts.primary}</Primary>
          {opts.secondary && <Secondary>{opts.secondary}</Secondary>}
        </RowText>
        {opts.withMenu && (
          <MenuBtn
            aria-label="Actions"
            onClick={(e) => {
              e.stopPropagation();
              openMenu(item, e.currentTarget);
            }}
          >
            <IconDots size={18} />
          </MenuBtn>
        )}
      </Row>
    );
  };

  return (
    <Panel onClick={(e) => e.stopPropagation()}>
      <SearchRow>
        <SearchIcon size={22} color="var(--color-text-muted)" />
        <QueryInput
          ref={inputRef}
          value={query}
          placeholder="Search your library…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ScopeBadge>Library</ScopeBadge>
        <EscHint>esc</EscHint>
      </SearchRow>

      {flat.length > 0 && (
        <Results>
          {songs.length > 0 && (
            <div>
              <SectionLabel>Songs</SectionLabel>
              {songs.map((song) =>
                renderRow(
                  { kind: "song", id: song.id, song },
                  {
                    primary: song.title,
                    secondary: `${song.artist} — ${song.album}`,
                    art: song.coverArt && creds ? coverArtUrlOf(song) : null,
                    round: false,
                    icon: <Disc color={ICON} width={22} height={22} />,
                    withMenu: true,
                  },
                ),
              )}
            </div>
          )}
          {albums.length > 0 && (
            <div>
              <SectionLabel>Albums</SectionLabel>
              {albums.map((album) =>
                renderRow(
                  { kind: "album", id: album.id, album },
                  {
                    primary: album.name,
                    secondary: album.artist,
                    art: album.coverArt && creds ? coverArtUrlOf(album) : null,
                    round: false,
                    icon: <Disc color={ICON} width={22} height={22} />,
                    withMenu: true,
                  },
                ),
              )}
            </div>
          )}
          {artists.length > 0 && (
            <div>
              <SectionLabel>Artists</SectionLabel>
              {artists.map((artist) =>
                renderRow(
                  { kind: "artist", id: artist.id, artist },
                  {
                    primary: artist.name,
                    secondary: null,
                    art: artist.artistImageUrl || (artist.coverArt && creds ? coverArtUrlOf(artist) : null),
                    round: true,
                    icon: <Artist color={ICON} />,
                    withMenu: false,
                  },
                ),
              )}
            </div>
          )}
        </Results>
      )}

      {flat.length === 0 && (
        <Empty>
          {trimmed.length < 2
            ? "Search your library — songs, albums and artists."
            : `No results for “${trimmed}”.`}
        </Empty>
      )}

      <Footer>
        <FootHint>
          <kbd>↑</kbd>
          <kbd>↓</kbd> navigate
        </FootHint>
        <FootHint>
          <kbd>↵</kbd> play / open
        </FootHint>
        <FootHint>
          <kbd>esc</kbd> close
        </FootHint>
      </Footer>

      {menu &&
        createPortal(
          <>
            <MenuOverlay onClick={() => setMenu(null)} />
            <Menu style={{ left: menu.x, top: menu.y, transform: "translateX(-100%)" }}>
              <MenuItem
                onClick={async () => {
                  const it = menu.item;
                  setMenu(null);
                  if (it.kind === "song") playNow([songToQueueTrack(it.song, creds!)]);
                  else if (it.kind === "album") playNow(await albumTracks(it.album));
                  onClose();
                }}
              >
                <IconPlayerPlay size={16} color={ICON} /> Play
              </MenuItem>
              <MenuItem
                onClick={async () => {
                  const it = menu.item;
                  setMenu(null);
                  if (it.kind === "song") playNext(songToQueueTrack(it.song, creds!));
                  else if (it.kind === "album") playNextAll(await albumTracks(it.album));
                }}
              >
                <IconCornerDownRight size={16} color={ICON} /> Play next
              </MenuItem>
              <MenuItem
                onClick={async () => {
                  const it = menu.item;
                  setMenu(null);
                  if (it.kind === "song") playLast(songToQueueTrack(it.song, creds!));
                  else if (it.kind === "album") playLastAll(await albumTracks(it.album));
                }}
              >
                <IconPlaylistAdd size={16} color={ICON} /> Add to queue
              </MenuItem>
              {menu.item.kind === "album" && (
                <>
                  <MenuItem
                    onClick={async () => {
                      const it = menu.item;
                      setMenu(null);
                      if (it.kind !== "album") return;
                      const t = await albumTracks(it.album);
                      playNextAll(shuffled(t));
                    }}
                  >
                    <IconArrowsShuffle size={16} color={ICON} /> Insert shuffled
                  </MenuItem>
                  <MenuItem
                    onClick={async () => {
                      const it = menu.item;
                      setMenu(null);
                      if (it.kind !== "album") return;
                      const t = await albumTracks(it.album);
                      playLastAll(shuffled(t));
                    }}
                  >
                    <IconArrowsShuffle size={16} color={ICON} /> Insert last
                    shuffled
                  </MenuItem>
                </>
              )}
              {menu.item.kind === "song" && (
                <MenuItem
                  onClick={() => {
                    const it = menu.item;
                    setMenu(null);
                    if (it.kind !== "song") return;
                    setAddToPlaylistSong({ id: it.song.id, title: it.song.title });
                    onClose();
                  }}
                >
                  <IconPlaylist size={16} color={ICON} /> Add to playlist…
                </MenuItem>
              )}
              {(menu.item.kind === "song" || menu.item.kind === "album") && (
                <MenuItem
                  onClick={() => {
                    const it = menu.item;
                    setMenu(null);
                    if (!creds) return;
                    if (it.kind === "song") downloadFromNavidrome(creds, it.song.id);
                    else if (it.kind === "album")
                      downloadFromNavidrome(creds, it.album.id);
                  }}
                >
                  <IconDownload size={16} color={ICON} />{" "}
                  {menu.item.kind === "album" ? "Download album" : "Download"}
                </MenuItem>
              )}
            </Menu>
          </>,
          // Portal into #root (which carries the `.dark` class) — NOT document.body,
          // which is outside #root and so never gets the themed CSS variables.
          document.getElementById("root") ?? document.body,
        )}
    </Panel>
  );
}

function LibrarySearchModal() {
  const [open, setOpen] = useAtom(librarySearchOpenAtom);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <Overlay onClick={() => setOpen(false)}>
      <Palette onClose={() => setOpen(false)} />
    </Overlay>
  );
}

export default LibrarySearchModal;
