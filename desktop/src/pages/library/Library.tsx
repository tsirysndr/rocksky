import styled from "@emotion/styled";
import { shuffled } from "../../lib/shuffle";
import {
  IconAlertTriangle,
  IconArrowsShuffle,
  IconDots,
  IconDownload,
  IconHeart,
  IconMusic,
  IconPlayerPlay,
  IconSearch,
  IconUpload,
  IconUser,
  IconVinyl,
  IconX,
} from "@tabler/icons-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Tab, Tabs } from "baseui/tabs-motion";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import {
  downloadFromNavidrome,
  downloadTracksFromNavidrome,
  fetchNavidromeAlbum,
  coverArtUrlOf,
  type NavidromeAlbum,
  type NavidromeArtist,
  type NavidromeSong,
  type NavidromeCredentials,
} from "../../api/navidrome";
import {
  useNavidromeAlbumsQuery,
  useNavidromeArtistsQuery,
  useNavidromeCredentials,
  useNavidromeFavoritesQuery,
  useNavidromeTracksQuery,
  songToQueueTrack,
} from "../../hooks/useNavidrome";
import {
  useNavidromePlaylistsQuery,
  useDeletePlaylistMutation,
} from "../../hooks/useNavidrome";
import { useDeleteUploadByTrackIdMutation, useDeleteAlbumByIdMutation } from "../../hooks/useUploads";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import type { QueueTrack } from "../../atoms/queue";
import type { NavidromePlaylist } from "../../api/navidrome";
import { fetchNavidromePlaylist } from "../../api/navidrome";
import Main from "../../layouts/Main";
import { DropdownPortal } from "../../components/DropdownPortal";
import { AddToPlaylistMenu } from "../../components/AddToPlaylistMenu";
import PlaylistSearch from "../../components/PlaylistSearch";
import { WriteToNfcMenuItem } from "../../components/WriteToNfcMenuItem";
import { useWritable } from "../../hooks/useWritable";
import TrackArtMosaic from "../../components/TrackArtMosaic";
import { IconPlaylist, IconPlus } from "@tabler/icons-react";
import { useAtomValue, useSetAtom } from "jotai";
import { profileAtom } from "../../atoms/profile";
import { librarySearchOpenAtom } from "../../atoms/searchModal";
import {
  addLibrarySongsTargetAtom,
  editingLibraryPlaylistAtom,
  libraryPlaylistModalOpenAtom,
} from "../../atoms/libraryPlaylist";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Coarse total for a playlist, matching the profile playlists grid.
function formatTotalSecs(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = el?.parentElement ?? null;
  while (cur) {
    const overflowY = getComputedStyle(cur).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return cur;
    cur = cur.parentElement;
  }
  return null;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// The node is held in state, not a ref, so that it is a dependency of the
// effect. baseui only renders the active tab panel, so a sentinel mounts and
// unmounts on every tab switch — with a ref the effect wouldn't re-run for it,
// and the observer would end up attached to nothing (a panel opened after its
// query settled) or to a detached node (a panel returned to). Either way
// scrolling stopped loading more.
function useInfiniteScrollSentinel(
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  fetchNextPage: () => unknown,
) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: getScrollParent(el), rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, hasNextPage, isFetchingNextPage, fetchNextPage]);
  return setEl;
}

// ---------------------------------------------------------------------------
// Tab overrides (baseui requires plain objects)
// ---------------------------------------------------------------------------

// baseui addresses tabs by their index, but a link — or an NFC tap — names the
// tab it wants. This is the one place the two are tied together, so a tab moving
// doesn't silently repoint every ?tab= link at its neighbour.
const TAB_NAMES = [
  "tracks",
  "albums",
  "artists",
  "playlists",
  "favorites",
] as const;

export type LibraryTab = (typeof TAB_NAMES)[number];

export const isLibraryTab = (v: unknown): v is LibraryTab =>
  typeof v === "string" && (TAB_NAMES as readonly string[]).includes(v);

const tabKeyFor = (tab?: string) => {
  const i = TAB_NAMES.indexOf(tab as LibraryTab);
  return String(i < 0 ? 0 : i);
};

const tabOverrides = {
  Tab: {
    style: {
      color: "var(--color-text)",
      backgroundColor: "var(--color-background) !important",
    },
  },
  TabPanel: {
    style: { paddingTop: "16px", paddingBottom: "0", paddingLeft: "0", paddingRight: "0" },
  },
};

const tabsOverrides = {
  TabHighlight: { style: { backgroundColor: "var(--color-purple)" } },
  TabBorder: { style: { display: "none" } },
};

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Page = styled.div`
  margin-top: 70px;
  margin-bottom: 150px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.5rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const UploadButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 12px;
  border: none;
  background: var(--color-menu-hover);
  color: var(--color-text);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  &:hover { background: color-mix(in srgb, var(--color-primary) 15%, transparent); }
`;

const SearchWrap = styled.div`
  position: relative;
  margin-bottom: 16px;
`;

const SearchIconWrap = styled.span`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  pointer-events: none;
`;

const SearchInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 9px 36px;
  border-radius: 12px;
  border: 1.5px solid transparent;
  background: var(--color-menu-hover);
  color: var(--color-text);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  outline: none;
  &::placeholder { color: var(--color-text-muted); }
  &:focus { border-color: var(--color-primary); }
`;

const ClearBtn = styled.button`
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  cursor: pointer;
  border-radius: 6px;
  &:hover {
    color: var(--color-text);
    background: color-mix(in srgb, var(--color-text-muted) 15%, transparent);
  }
`;

// Keyboard-shortcut hint shown at the right of the search field.
const ShortcutHint = styled.span`
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  pointer-events: none;

  kbd {
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1;
    color: var(--color-text-muted);
    padding: 3px 6px;
    border: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: 5px;
  }
`;

const TrackList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const TrackRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 0;
  border-radius: 12px;
  cursor: pointer;
  &:hover { background: var(--color-menu-hover); }
  & .track-actions { opacity: 0; }
  &:hover .track-actions { opacity: 1; }
  &:hover .artwork-overlay { opacity: 1; }
`;

const TrackNum = styled.span`
  width: 28px;
  text-align: right;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
`;

const ArtworkBox = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--color-menu-hover);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
`;

const ArtworkOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
`;

const TrackInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const TrackTitle = styled.p`
  margin: 0;
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text);
`;

const TrackMeta = styled.p`
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Duration = styled.span`
  font-size: 0.75rem;
  color: var(--color-text-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
`;

const MenuWrap = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const MenuBtn = styled.button`
  padding: 5px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  cursor: pointer;
  &:hover { background: var(--color-menu-hover); color: var(--color-text); }
`;

const MenuHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 8px;
`;

const MenuHeaderArt = styled.div`
  width: 38px;
  height: 38px;
  border-radius: 6px;
  background: var(--color-menu-hover);
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const MenuHeaderInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const MenuHeaderTitle = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MenuHeaderArtist = styled.p`
  margin: 2px 0 0;
  font-size: 0.725rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MenuDivider = styled.div`
  height: 1px;
  background: var(--color-menu-hover);
  margin: 2px 0;
`;

const MenuItem = styled.button`
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  border-radius: 8px;
  cursor: pointer;
  &:hover { background: var(--color-menu-hover); }
`;

const DangerMenuItem = styled(MenuItem)`
  color: #e55;
  &:hover { background: color-mix(in srgb, #e55 12%, transparent); }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 20px;
`;

const AlbumCard = styled.div`
  cursor: pointer;
  &:hover .album-art-wrap { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.14); }
  &:hover .album-actions { opacity: 1; pointer-events: auto; }
`;

const AlbumArtContainer = styled.div`
  position: relative;
  margin-bottom: 10px;
`;

const AlbumArtWrap = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  background: var(--color-menu-hover);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s, box-shadow 0.15s;
`;

const AlbumActionsOverlay = styled.div`
  position: absolute;
  bottom: 8px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  z-index: 2;
  & > * { flex: 1; display: flex; justify-content: center; }
`;

const AlbumFloatBtn = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(0,0,0,0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(4px);
  flex-shrink: 0;
  &:hover { background: rgba(0,0,0,0.8); }
`;

const AlbumName = styled.p`
  margin: 0;
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const AlbumArtistName = styled.p`
  margin: 2px 0 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ArtistGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 20px;
`;

const ArtistCard = styled.div`
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  &:hover .artist-avatar { transform: scale(1.04); box-shadow: 0 8px 24px rgba(0,0,0,0.14); }
`;

const ArtistAvatar = styled.div`
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: var(--color-menu-hover);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s, box-shadow 0.15s;
  font-size: 2rem;
  font-family: RockfordSansBold;
  color: var(--color-text-muted);
`;

const ArtistNameLabel = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 96px 0;
  color: var(--color-text-muted);
`;

const EmptyTitle = styled.p`
  margin: 0;
  font-size: 1rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
`;

const EmptySubtitle = styled.p`
  margin: 4px 0 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  text-align: center;
`;

const PrimaryButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  &:hover { opacity: 0.9; }
`;

const Sentinel = styled.div`height: 1px;`;

const PlayButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`;

const PlayBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  border: none;
  background: var(--color-text);
  color: var(--color-background);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  border-radius: 999px;
  cursor: pointer;
  &:hover:not(:disabled) { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: default; }
`;

const ShuffleBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 4px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  &:hover:not(:disabled) { color: var(--color-text); }
  &:disabled { opacity: 0.4; cursor: default; }
`;

// A failed load used to leave the tab on its skeleton forever, which reads as a
// library that never finishes loading rather than one that couldn't.
function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState>
      <IconAlertTriangle size={48} color="var(--color-text-muted)" />
      <div style={{ textAlign: "center" }}>
        <EmptyTitle>Couldn't load your library</EmptyTitle>
        <EmptySubtitle>Check your connection and try again</EmptySubtitle>
      </div>
      <PrimaryButton onClick={onRetry}>Retry</PrimaryButton>
    </EmptyState>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

const shimmer = `
  @keyframes shimmer {
    0% { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
`;

const Shimmer = styled.div`
  ${shimmer}
  background: linear-gradient(
    90deg,
    var(--color-skeleton-background) 25%,
    var(--color-skeleton-foreground) 50%,
    var(--color-skeleton-background) 75%
  );
  background-size: 800px 100%;
  animation: shimmer 1.4s infinite linear;
  border-radius: 6px;
  flex-shrink: 0;
`;

const TrackRowSkeletonWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 0;
`;

const TrackInfoSkeleton = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

function TrackRowSkeleton({ titleWidth = "55%", metaWidth = "35%" }: { titleWidth?: string; metaWidth?: string }) {
  return (
    <TrackRowSkeletonWrap>
      <Shimmer style={{ width: 12, height: 14, borderRadius: 3 }} />
      <Shimmer style={{ width: 40, height: 40, borderRadius: 8 }} />
      <TrackInfoSkeleton>
        <Shimmer style={{ width: titleWidth, height: 14 }} />
        <Shimmer style={{ width: metaWidth, height: 12 }} />
      </TrackInfoSkeleton>
      <Shimmer style={{ width: 32, height: 14 }} />
    </TrackRowSkeletonWrap>
  );
}

function TracksSkeleton() {
  // vary widths a bit so the rows don't look mechanically identical
  const widths: Array<[string, string]> = [
    ["55%", "35%"],
    ["70%", "40%"],
    ["48%", "30%"],
    ["62%", "38%"],
    ["50%", "32%"],
    ["68%", "42%"],
    ["58%", "34%"],
    ["52%", "36%"],
  ];
  return (
    <TrackList>
      {widths.map(([t, m], i) => (
        <TrackRowSkeleton key={i} titleWidth={t} metaWidth={m} />
      ))}
    </TrackList>
  );
}

function AlbumsSkeleton() {
  return (
    <Grid>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i}>
          <Shimmer style={{ width: "100%", aspectRatio: 1, borderRadius: 12, marginBottom: 10 }} />
          <Shimmer style={{ width: "75%", height: 14, marginBottom: 6 }} />
          <Shimmer style={{ width: "55%", height: 12 }} />
        </div>
      ))}
    </Grid>
  );
}

function ArtistsSkeleton() {
  return (
    <ArtistGrid>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Shimmer style={{ width: 100, height: 100, borderRadius: "50%" }} />
          <Shimmer style={{ width: 80, height: 13 }} />
        </div>
      ))}
    </ArtistGrid>
  );
}

// ---------------------------------------------------------------------------
// TrackContextMenu
// ---------------------------------------------------------------------------

function TrackContextMenu({
  song, albumArt, anchorEl, creds, onPlay, onPlayNext, onPlayLast, onDelete, onClose,
}: {
  song: NavidromeSong;
  albumArt: string | null;
  anchorEl: HTMLElement | null;
  creds: NavidromeCredentials;
  onPlay: () => void;
  onPlayNext: (t: QueueTrack) => void;
  onPlayLast: (t: QueueTrack) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const track = songToQueueTrack(song, creds, albumArt);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <DropdownPortal anchorEl={anchorEl} menuRef={menuRef}>
      <MenuHeader>
        <MenuHeaderArt>
          {albumArt
            ? <img src={albumArt} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <IconMusic size={16} color="var(--color-text-muted)" />}
        </MenuHeaderArt>
        <MenuHeaderInfo>
          <MenuHeaderTitle>{song.title}</MenuHeaderTitle>
          <MenuHeaderArtist>{song.artist}</MenuHeaderArtist>
        </MenuHeaderInfo>
      </MenuHeader>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); onPlay(); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconPlayerPlay size={14} /> Play</span>
      </MenuItem>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); onPlayNext(track); onClose(); }}>Play next</MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); onPlayLast(track); onClose(); }}>Add to queue</MenuItem>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); downloadFromNavidrome(creds, song.id); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconDownload size={14} /> Download</span>
      </MenuItem>
      <MenuDivider />
      <AddToPlaylistMenu songId={song.id} title={song.title} onDone={onClose} />
      {song.artistId && (
        <>
          <MenuDivider />
          <MenuItem onClick={(e) => { e.stopPropagation(); navigate({ to: "/library/artist/$id", params: { id: song.artistId! } }); onClose(); }}>
            Go to artist
          </MenuItem>
        </>
      )}
      {song.albumId && (
        <MenuItem onClick={(e) => { e.stopPropagation(); navigate({ to: "/library/album/$id", params: { id: song.albumId! } }); onClose(); }}>
          Go to album
        </MenuItem>
      )}
      <MenuDivider />
      <DangerMenuItem onClick={(e) => { e.stopPropagation(); if (!window.confirm(`Delete "${song.title}"? This cannot be undone.`)) return; onDelete(); onClose(); }}>
        Delete track
      </DangerMenuItem>
    </DropdownPortal>
  );
}

// ---------------------------------------------------------------------------
// AlbumContextMenu
// ---------------------------------------------------------------------------

function AlbumContextMenu({
  album, albumArtUrl, anchorEl, creds, onDeleteAlbum, onClose,
}: {
  album: NavidromeAlbum;
  albumArtUrl: string | null;
  anchorEl: HTMLElement | null;
  creds: NavidromeCredentials;
  onDeleteAlbum: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { playNow, playNextAll, playLastAll } = useUploadPlayer();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const fetchTracks = async () => {
    const full = await fetchNavidromeAlbum(creds, album.id);
    return (full?.song ?? []).map((s) => songToQueueTrack(s, creds, albumArtUrl));
  };

  return (
    <DropdownPortal anchorEl={anchorEl} menuRef={menuRef}>
      <MenuHeader>
        <MenuHeaderArt>
          {albumArtUrl
            ? <img src={albumArtUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <IconVinyl size={16} color="var(--color-text-muted)" />}
        </MenuHeaderArt>
        <MenuHeaderInfo>
          <MenuHeaderTitle>{album.name}</MenuHeaderTitle>
          <MenuHeaderArtist>{album.artist}</MenuHeaderArtist>
        </MenuHeaderInfo>
      </MenuHeader>
      <MenuDivider />
      <MenuItem onClick={async (e) => { e.stopPropagation(); playNow(await fetchTracks()); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconPlayerPlay size={14} /> Play</span>
      </MenuItem>
      <MenuItem onClick={async (e) => { e.stopPropagation(); const t = await fetchTracks(); playNow(shuffled(t)); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconArrowsShuffle size={14} /> Play shuffled</span>
      </MenuItem>
      <MenuDivider />
      <MenuItem onClick={async (e) => { e.stopPropagation(); playNextAll(await fetchTracks()); onClose(); }}>Play next</MenuItem>
      <MenuItem onClick={async (e) => { e.stopPropagation(); playLastAll(await fetchTracks()); onClose(); }}>Play last</MenuItem>
      <MenuItem onClick={async (e) => { e.stopPropagation(); const t = await fetchTracks(); playNextAll(shuffled(t)); onClose(); }}>Insert shuffled</MenuItem>
      <MenuItem onClick={async (e) => { e.stopPropagation(); const t = await fetchTracks(); playLastAll(shuffled(t)); onClose(); }}>Insert last shuffled</MenuItem>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); downloadFromNavidrome(creds, album.id); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconDownload size={14} /> Download album</span>
      </MenuItem>
      <WriteToNfcMenuItem target={{ kind: "album", id: album.id, uri: album.uri }} label={album.name} sublabel={album.artist} onDone={onClose} />
      {album.artistId && (
        <>
          <MenuDivider />
          <MenuItem onClick={(e) => { e.stopPropagation(); navigate({ to: "/library/artist/$id", params: { id: album.artistId! } }); onClose(); }}>
            Go to artist
          </MenuItem>
        </>
      )}
      <MenuDivider />
      <DangerMenuItem onClick={(e) => { e.stopPropagation(); if (!window.confirm(`Delete all tracks from "${album.name}"? This cannot be undone.`)) return; onDeleteAlbum(); onClose(); }}>
        Delete album
      </DangerMenuItem>
    </DropdownPortal>
  );
}

// ---------------------------------------------------------------------------
// PlaylistContextMenu
// ---------------------------------------------------------------------------

function PlaylistContextMenu({
  playlist, anchorEl, creds, onPlay, onShuffle, onAddSongs, onRename, onDelete, onClose,
}: {
  playlist: NavidromePlaylist;
  anchorEl: HTMLElement | null;
  creds: NavidromeCredentials;
  onPlay: () => void;
  onShuffle: () => void;
  onAddSongs: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { playNextAll, playLastAll } = useUploadPlayer();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const fetchTracks = async () => {
    const full = await fetchNavidromePlaylist(creds, playlist.id);
    return (full?.entry ?? []).map((s) =>
      songToQueueTrack(s, creds, s.coverArt ? coverArtUrlOf(s) : null),
    );
  };

  return (
    <DropdownPortal anchorEl={anchorEl} menuRef={menuRef}>
      <MenuHeader>
        <MenuHeaderArt>
          <TrackArtMosaic trackArts={playlist.trackArts} fallbackSize={16} />
        </MenuHeaderArt>
        <MenuHeaderInfo>
          <MenuHeaderTitle>{playlist.name}</MenuHeaderTitle>
          <MenuHeaderArtist>{playlist.songCount} tracks</MenuHeaderArtist>
        </MenuHeaderInfo>
      </MenuHeader>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); onPlay(); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconPlayerPlay size={14} /> Play</span>
      </MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); onShuffle(); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconArrowsShuffle size={14} /> Play shuffled</span>
      </MenuItem>
      <MenuDivider />
      <MenuItem onClick={async (e) => { e.stopPropagation(); playNextAll(await fetchTracks()); onClose(); }}>Play next</MenuItem>
      <MenuItem onClick={async (e) => { e.stopPropagation(); playLastAll(await fetchTracks()); onClose(); }}>Play last</MenuItem>
      <MenuItem onClick={async (e) => { e.stopPropagation(); const t = await fetchTracks(); playNextAll(shuffled(t)); onClose(); }}>Insert shuffled</MenuItem>
      <MenuItem onClick={async (e) => { e.stopPropagation(); const t = await fetchTracks(); playLastAll(shuffled(t)); onClose(); }}>Insert last shuffled</MenuItem>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); onAddSongs(); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconPlus size={14} /> Add songs</span>
      </MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); downloadFromNavidrome(creds, playlist.id); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconDownload size={14} /> Download playlist</span>
      </MenuItem>
      <WriteToNfcMenuItem
        target={{ kind: "playlist", id: playlist.id, uri: playlist.uri }}
        label={playlist.name}
        sublabel={`${playlist.songCount} tracks`}
        onDone={onClose}
      />
      <MenuItem onClick={(e) => { e.stopPropagation(); onRename(); onClose(); }}>Rename</MenuItem>
      <MenuDivider />
      <DangerMenuItem onClick={(e) => { e.stopPropagation(); if (!window.confirm(`Delete playlist "${playlist.name}"? This cannot be undone.`)) return; onDelete(); onClose(); }}>
        Delete playlist
      </DangerMenuItem>
    </DropdownPortal>
  );
}

// ---------------------------------------------------------------------------
// FavoritesContextMenu
// ---------------------------------------------------------------------------

// Favorites are a query, not a record: no AT-URI and no library id. Every action
// therefore works off the songs already on screen rather than fetching a
// container by id the way the album and playlist menus do.
function FavoritesContextMenu({
  songs, anchorEl, creds, did, tracks, onPlay, onShuffle, onClose,
}: {
  songs: NavidromeSong[];
  anchorEl: HTMLElement | null;
  creds: NavidromeCredentials;
  /** Whose favorites these are — the only handle a tag can name them by. */
  did?: string;
  tracks: () => QueueTrack[];
  onPlay: () => void;
  onShuffle: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { playNextAll, playLastAll } = useUploadPlayer();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <DropdownPortal anchorEl={anchorEl} menuRef={menuRef}>
      <MenuHeader>
        <MenuHeaderArt>
          <IconHeart size={16} color="var(--color-text-muted)" />
        </MenuHeaderArt>
        <MenuHeaderInfo>
          <MenuHeaderTitle>Favorites</MenuHeaderTitle>
          <MenuHeaderArtist>{songs.length} track{songs.length !== 1 ? "s" : ""}</MenuHeaderArtist>
        </MenuHeaderInfo>
      </MenuHeader>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); onPlay(); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconPlayerPlay size={14} /> Play</span>
      </MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); onShuffle(); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconArrowsShuffle size={14} /> Play shuffled</span>
      </MenuItem>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); playNextAll(tracks()); onClose(); }}>Play next</MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); playLastAll(tracks()); onClose(); }}>Play last</MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); playNextAll(shuffled(tracks())); onClose(); }}>Insert shuffled</MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); playLastAll(shuffled(tracks())); onClose(); }}>Insert last shuffled</MenuItem>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); downloadFavorites(creds, songs); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconDownload size={14} /> Download</span>
      </MenuItem>
      <WriteToNfcMenuItem
        target={{ kind: "favorites", did: did ?? "" }}
        label="Favorites"
        sublabel={`${songs.length} track${songs.length !== 1 ? "s" : ""}`}
        onDone={onClose}
      />
    </DropdownPortal>
  );
}

// One file per track — there is no favorites id for the server to zip. That is
// a lot of downloads to start by accident, so a large set asks first.
const DOWNLOAD_CONFIRM_THRESHOLD = 5;

function downloadFavorites(creds: NavidromeCredentials, songs: NavidromeSong[]) {
  if (songs.length === 0) return;
  if (
    songs.length > DOWNLOAD_CONFIRM_THRESHOLD &&
    !window.confirm(`Download ${songs.length} favorite tracks as ${songs.length} separate files?`)
  ) {
    return;
  }
  downloadTracksFromNavidrome(creds, songs.map((s) => s.id));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Library() {
  const navigate = useNavigate();
  const { playNow, playNext, playLast } = useUploadPlayer();
  const credentials = useNavidromeCredentials();
  const creds = credentials.data;
  const did = useAtomValue(profileAtom)?.did;
  const deleteTrack = useDeleteUploadByTrackIdMutation();
  const deleteAlbumById = useDeleteAlbumByIdMutation();
  const { data: playlists = [], isLoading: playlistsLoading } = useNavidromePlaylistsQuery();
  const deletePlaylist = useDeletePlaylistMutation();
  const setPlaylistModalOpen = useSetAtom(libraryPlaylistModalOpenAtom);
  const setEditingPlaylist = useSetAtom(editingLibraryPlaylistAtom);
  const setAddSongsTarget = useSetAtom(addLibrarySongsTargetAtom);

  // ?tab= picks the opening tab so a link — or an NFC tap landing on favorites —
  // can point at one. It seeds the state rather than driving it, so clicking
  // between tabs afterwards doesn't rewrite the URL on every switch.
  const search = useSearch({ strict: false }) as { tab?: string };
  const [activeKey, setActiveKey] = useState<string | number>(() => tabKeyFor(search.tab));
  useEffect(() => {
    if (search.tab) setActiveKey(tabKeyFor(search.tab));
  }, [search.tab]);

  // Shift+T on the Favorites tab writes the favorites themselves. The other
  // tabs are lists rather than a single subject, so it stays inert there —
  // those rows have their own context-menu entry.
  useWritable(
    did && activeKey === tabKeyFor("favorites")
      ? { target: { kind: "favorites", did }, label: "Favorites" }
      : null,
  );

  const [openPlaylistMenuId, setOpenPlaylistMenuId] = useState<string | null>(null);
  const [playlistMenuAnchor, setPlaylistMenuAnchor] = useState<HTMLElement | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [openAlbumMenuKey, setOpenAlbumMenuKey] = useState<string | null>(null);
  const [albumMenuAnchor, setAlbumMenuAnchor] = useState<HTMLElement | null>(null);
  const [favoritesMenuOpen, setFavoritesMenuOpen] = useState(false);
  const [favoritesMenuAnchor, setFavoritesMenuAnchor] = useState<HTMLElement | null>(null);
  const [openFavoriteMenuId, setOpenFavoriteMenuId] = useState<string | null>(null);
  const [favoriteMenuAnchor, setFavoriteMenuAnchor] = useState<HTMLElement | null>(null);
  const [playlistFilter, setPlaylistFilter] = useState("");
  const [favoritesFilter, setFavoritesFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const setLibrarySearchOpen = useSetAtom(librarySearchOpenAtom);
  const [searchQuery, setSearchQuery] = useState<string | undefined>(undefined);

  useEffect(() => {
    const trimmed = searchInput.trim();
    const timer = setTimeout(() => setSearchQuery(trimmed || undefined), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const tracksQuery = useNavidromeTracksQuery(searchQuery);
  const albumsQuery = useNavidromeAlbumsQuery(searchQuery);
  const artistsQuery = useNavidromeArtistsQuery(searchQuery);
  const favoritesQuery = useNavidromeFavoritesQuery();

  // Offset paging can hand back a row twice if the server's order shifts between
  // pages. Duplicates would render twice and push real entries off the end, so
  // drop them by id.
  const allSongs: NavidromeSong[] = useMemo(
    () => dedupeById(tracksQuery.data?.pages.flat() ?? []),
    [tracksQuery.data],
  );
  const albums: NavidromeAlbum[] = useMemo(
    () => dedupeById(albumsQuery.data?.pages.flat() ?? []),
    [albumsQuery.data],
  );
  const artists: NavidromeArtist[] = useMemo(() => artistsQuery.data ?? [], [artistsQuery.data]);

  // getStarred2 takes no query, so the search box filters this tab here instead
  // of server-side — otherwise typing would leave favorites untouched and look
  // broken next to the three tabs that do respond.
  const matches = (s: NavidromeSong, q: string) =>
    [s.title, s.artist, s.album].some((f) => (f ?? "").toLowerCase().includes(q));

  // What the tab holds before the quick filter. Kept apart so the filter box
  // stays on screen when it matches nothing — otherwise it would unmount with
  // the list and leave no way to clear the term.
  const favoritesAll: NavidromeSong[] = useMemo(() => {
    const all = favoritesQuery.data ?? [];
    const q = searchQuery?.toLowerCase();
    return q ? all.filter((s) => matches(s, q)) : all;
  }, [favoritesQuery.data, searchQuery]);

  const favorites: NavidromeSong[] = useMemo(() => {
    const q = favoritesFilter.trim().toLowerCase();
    return q ? favoritesAll.filter((s) => matches(s, q)) : favoritesAll;
  }, [favoritesAll, favoritesFilter]);

  const tracksSentinelRef = useInfiniteScrollSentinel(tracksQuery.hasNextPage, tracksQuery.isFetchingNextPage, tracksQuery.fetchNextPage);
  const albumsSentinelRef = useInfiniteScrollSentinel(albumsQuery.hasNextPage, albumsQuery.isFetchingNextPage, albumsQuery.fetchNextPage);

  const handleTrackClick = useCallback((_song: NavidromeSong, idx: number) => {
    if (!creds) return;
    const queue = allSongs.map((s) => songToQueueTrack(s, creds, s.coverArt ? coverArtUrlOf(s) : null));
    playNow(queue, idx);
  }, [allSongs, creds, playNow]);

  const favoriteTracks = useCallback((): QueueTrack[] => {
    if (!creds) return [];
    return favorites.map((s) => songToQueueTrack(s, creds, s.coverArt ? coverArtUrlOf(s) : null));
  }, [favorites, creds]);

  const playFavorites = useCallback((shuffle = false, startIndex = 0) => {
    const tracks = favoriteTracks();
    if (!tracks.length) return;
    // No start index when shuffling: there is no chosen track to lead with, and
    // pinning one would leave the queue's head fixed.
    if (shuffle) playNow(shuffled(tracks));
    else playNow(tracks, startIndex);
  }, [favoriteTracks, playNow]);

  const visiblePlaylists = useMemo(() => {
    const q = playlistFilter.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter((pl) =>
      [pl.name, pl.comment].some((f) => (f ?? "").toLowerCase().includes(q)),
    );
  }, [playlists, playlistFilter]);

  const openCreatePlaylist = useCallback(() => {
    setEditingPlaylist(null);
    setAddSongsTarget(null);
    setPlaylistModalOpen(true);
  }, [setEditingPlaylist, setAddSongsTarget, setPlaylistModalOpen]);

  const openEditPlaylist = useCallback((pl: NavidromePlaylist) => {
    setAddSongsTarget(null);
    setEditingPlaylist({ id: pl.id, name: pl.name, description: pl.comment });
    setPlaylistModalOpen(true);
  }, [setAddSongsTarget, setEditingPlaylist, setPlaylistModalOpen]);

  const openAddSongs = useCallback((pl: NavidromePlaylist) => {
    setEditingPlaylist(null);
    setAddSongsTarget({ id: pl.id, name: pl.name });
    setPlaylistModalOpen(true);
  }, [setEditingPlaylist, setAddSongsTarget, setPlaylistModalOpen]);

  const playPlaylist = useCallback(
    async (pl: NavidromePlaylist, shuffle = false) => {
      if (!creds) return;
      const full = await fetchNavidromePlaylist(creds, pl.id);
      let tracks = (full?.entry ?? []).map((s) =>
        songToQueueTrack(s, creds, s.coverArt ? coverArtUrlOf(s) : null),
      );
      if (shuffle) tracks = shuffled(tracks);
      playNow(tracks);
    },
    [creds, playNow],
  );

  // Every tab is gated on the navidrome credentials, so a failure there has to
  // break the skeletons in all of them — otherwise they spin forever.
  const retry = useCallback(() => {
    if (credentials.isError) {
      credentials.refetch();
      return;
    }
    tracksQuery.refetch();
    albumsQuery.refetch();
    artistsQuery.refetch();
    favoritesQuery.refetch();
  }, [credentials, tracksQuery, albumsQuery, artistsQuery, favoritesQuery]);

  const tracksFailed = credentials.isError || tracksQuery.isError;
  const albumsFailed = credentials.isError || albumsQuery.isError;
  const artistsFailed = credentials.isError || artistsQuery.isError;
  const favoritesFailed = credentials.isError || favoritesQuery.isError;

  const isLoading = !tracksFailed && (!creds || tracksQuery.isLoading);

  return (
    <Main>
      <Page>
        <Header>
          <Title>My Library</Title>
          <UploadButton onClick={() => navigate({ to: "/library/upload" })}>
            <IconUpload size={15} /> Upload Music
          </UploadButton>
        </Header>

        <SearchWrap>
          <SearchIconWrap><IconSearch size={15} /></SearchIconWrap>
          {/* Opens the library quick-search palette (also Shift+L). */}
          <SearchInput
            type="text"
            readOnly
            placeholder="Search your library…"
            value={searchInput}
            style={{ cursor: "pointer" }}
            onMouseDown={(e) => { e.preventDefault(); setLibrarySearchOpen(true); }}
            onFocus={() => setLibrarySearchOpen(true)}
          />
          <ShortcutHint aria-hidden><kbd>⇧</kbd><kbd>L</kbd></ShortcutHint>
          {searchInput && (
            <ClearBtn onClick={() => setSearchInput("")}><IconX size={14} /></ClearBtn>
          )}
        </SearchWrap>

        <Tabs
          activeKey={activeKey}
          onChange={({ activeKey }) => setActiveKey(activeKey as string | number)}
          overrides={tabsOverrides}
          activateOnFocus
        >
          {/* -------- Tracks -------- */}
          <Tab title="Tracks" overrides={tabOverrides}>
            {isLoading && <TracksSkeleton />}

            {tracksFailed && allSongs.length === 0 && <LoadFailed onRetry={retry} />}

            {!isLoading && !tracksFailed && allSongs.length === 0 && (
              <EmptyState>
                <IconVinyl size={48} color="var(--color-text-muted)" />
                {searchQuery ? (
                  <div style={{ textAlign: "center" }}>
                    <EmptyTitle>No results for "{searchQuery}"</EmptyTitle>
                    <EmptySubtitle>Try a different search term</EmptySubtitle>
                  </div>
                ) : (
                  <>
                    <div style={{ textAlign: "center" }}>
                      <EmptyTitle>Your library is empty</EmptyTitle>
                      <EmptySubtitle>Upload your music files to start listening</EmptySubtitle>
                    </div>
                    <PrimaryButton onClick={() => navigate({ to: "/library/upload" })}>
                      <IconUpload size={15} /> Upload your first track
                    </PrimaryButton>
                  </>
                )}
              </EmptyState>
            )}

            {allSongs.length > 0 && creds && (
              <TrackList>
                {allSongs.map((song, idx) => {
                  const albumArt = song.coverArt ? coverArtUrlOf(song) : null;
                  return (
                    <TrackRow key={song.id} onClick={() => handleTrackClick(song, idx)}>
                      <TrackNum>{idx + 1}</TrackNum>
                      <ArtworkBox>
                        {albumArt ? (
                          <>
                            <img src={albumArt} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <ArtworkOverlay className="artwork-overlay">
                              <IconPlayerPlay size={16} color="#fff" fill="#fff" />
                            </ArtworkOverlay>
                          </>
                        ) : (
                          <IconMusic size={18} color="var(--color-text-muted)" />
                        )}
                      </ArtworkBox>
                      <TrackInfo>
                        <TrackTitle>{song.title}</TrackTitle>
                        <TrackMeta>{song.artist}{song.album && ` — ${song.album}`}</TrackMeta>
                      </TrackInfo>
                      <Duration>{formatDuration(song.duration)}</Duration>
                      <div className="track-actions" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <MenuWrap>
                          <MenuBtn onClick={(e) => {
                            e.stopPropagation();
                            if (openMenuId === song.id) { setOpenMenuId(null); setMenuAnchor(null); }
                            else { setOpenMenuId(song.id); setMenuAnchor(e.currentTarget); }
                          }}>
                            <IconDots size={15} />
                          </MenuBtn>
                          {openMenuId === song.id && (
                            <TrackContextMenu
                              song={song}
                              albumArt={albumArt}
                              anchorEl={menuAnchor}
                              creds={creds}
                              onPlay={() => handleTrackClick(song, idx)}
                              onPlayNext={playNext}
                              onPlayLast={playLast}
                              onDelete={() => deleteTrack.mutate(song.id)}
                              onClose={() => { setOpenMenuId(null); setMenuAnchor(null); }}
                            />
                          )}
                        </MenuWrap>
                      </div>
                    </TrackRow>
                  );
                })}
                <Sentinel ref={tracksSentinelRef} />
                {tracksQuery.isFetchingNextPage && (
                  <>
                    <TrackRowSkeleton />
                    <TrackRowSkeleton titleWidth="65%" metaWidth="38%" />
                    <TrackRowSkeleton titleWidth="48%" metaWidth="30%" />
                  </>
                )}
              </TrackList>
            )}
          </Tab>

          {/* -------- Albums -------- */}
          <Tab title="Albums" overrides={tabOverrides}>
            {!albumsFailed && (albumsQuery.isLoading || !creds) && <AlbumsSkeleton />}
            {albumsFailed && albums.length === 0 && <LoadFailed onRetry={retry} />}
            {!albumsFailed && !albumsQuery.isLoading && creds && albums.length === 0 && (
              <EmptyState>
                <IconVinyl size={48} color="var(--color-text-muted)" />
                <div style={{ textAlign: "center" }}>
                  <EmptyTitle>No albums yet</EmptyTitle>
                  <EmptySubtitle>Upload tagged music files to see albums</EmptySubtitle>
                </div>
              </EmptyState>
            )}
            {creds && albums.length > 0 && (
              <Grid>
                {albums.map((alb) => {
                  const albumArtUrl = alb.coverArt ? coverArtUrlOf(alb) : null;
                  return (
                    <AlbumCard key={alb.id} onClick={() => navigate({ to: "/library/album/$id", params: { id: alb.id } })}>
                      <AlbumArtContainer>
                        <AlbumArtWrap className="album-art-wrap">
                          {albumArtUrl
                            ? <img src={albumArtUrl} alt={alb.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <IconVinyl size={40} color="var(--color-text-muted)" />}
                        </AlbumArtWrap>
                        <AlbumActionsOverlay className="album-actions">
                          <MenuWrap>
                            <AlbumFloatBtn onClick={async (e) => {
                              e.stopPropagation();
                              const full = await fetchNavidromeAlbum(creds, alb.id);
                              playNow((full?.song ?? []).map((s) => songToQueueTrack(s, creds, albumArtUrl)));
                            }}>
                              <IconPlayerPlay size={16} fill="#fff" />
                            </AlbumFloatBtn>
                          </MenuWrap>
                          <MenuWrap>
                            <AlbumFloatBtn onClick={(e) => {
                              e.stopPropagation();
                              if (openAlbumMenuKey === alb.id) { setOpenAlbumMenuKey(null); setAlbumMenuAnchor(null); }
                              else { setOpenAlbumMenuKey(alb.id); setAlbumMenuAnchor(e.currentTarget); }
                            }}>
                              <IconDots size={16} />
                            </AlbumFloatBtn>
                            {openAlbumMenuKey === alb.id && (
                              <AlbumContextMenu
                                album={alb}
                                albumArtUrl={albumArtUrl}
                                anchorEl={albumMenuAnchor}
                                creds={creds}
                                onDeleteAlbum={() => deleteAlbumById.mutate(alb.id)}
                                onClose={() => { setOpenAlbumMenuKey(null); setAlbumMenuAnchor(null); }}
                              />
                            )}
                          </MenuWrap>
                        </AlbumActionsOverlay>
                      </AlbumArtContainer>
                      <AlbumName title={alb.name}>{alb.name}</AlbumName>
                      <AlbumArtistName title={alb.artist}>{alb.artist}</AlbumArtistName>
                    </AlbumCard>
                  );
                })}
              </Grid>
            )}
            <Sentinel ref={albumsSentinelRef} />
          </Tab>

          {/* -------- Artists -------- */}
          <Tab title="Artists" overrides={tabOverrides}>
            {!artistsFailed && (artistsQuery.isLoading || !creds) && <ArtistsSkeleton />}
            {artistsFailed && artists.length === 0 && <LoadFailed onRetry={retry} />}
            {!artistsFailed && !artistsQuery.isLoading && creds && artists.length === 0 && (
              <EmptyState>
                <IconUser size={48} color="var(--color-text-muted)" />
                <div style={{ textAlign: "center" }}>
                  <EmptyTitle>No artists yet</EmptyTitle>
                  <EmptySubtitle>Upload tagged music files to see artists</EmptySubtitle>
                </div>
              </EmptyState>
            )}
            {creds && artists.length > 0 && (
              <ArtistGrid>
                {artists.map((art) => (
                  <ArtistCard key={art.id} onClick={() => navigate({ to: "/library/artist/$id", params: { id: art.id } })}>
                    <ArtistAvatar className="artist-avatar">
                      {art.artistImageUrl
                        ? <img src={art.artistImageUrl} alt={art.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : art.name.charAt(0).toUpperCase()}
                    </ArtistAvatar>
                    <ArtistNameLabel title={art.name}>{art.name}</ArtistNameLabel>
                  </ArtistCard>
                ))}
              </ArtistGrid>
            )}
          </Tab>

          {/* -------- Playlists -------- */}
          <Tab title="Playlists" overrides={tabOverrides}>
            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
              <UploadButton onClick={openCreatePlaylist}>
                <IconPlus size={15} /> New playlist
              </UploadButton>
              <PlaylistSearch
                onChange={setPlaylistFilter}
                label="Search your playlists"
                placeholder="Search your playlists"
              />
            </div>
            {(playlistsLoading || !creds) && <TracksSkeleton />}
            {!playlistsLoading && creds && playlists.length === 0 && (
              <EmptyState>
                <IconPlaylist size={48} color="var(--color-text-muted)" />
                <div style={{ textAlign: "center" }}>
                  <EmptyTitle>No playlists yet</EmptyTitle>
                  <EmptySubtitle>Create a playlist to organize your music</EmptySubtitle>
                </div>
              </EmptyState>
            )}
            {creds && playlists.length > 0 && visiblePlaylists.length === 0 && (
              <EmptyState>
                <IconPlaylist size={48} color="var(--color-text-muted)" />
                <div style={{ textAlign: "center" }}>
                  <EmptyTitle>No playlists match "{playlistFilter.trim()}"</EmptyTitle>
                  <EmptySubtitle>Try a different search term</EmptySubtitle>
                </div>
              </EmptyState>
            )}
            {creds && visiblePlaylists.length > 0 && (
              <TrackList>
                {visiblePlaylists.map((pl) => (
                  <TrackRow key={pl.id} onClick={() => navigate({ to: "/library/playlist/$id", params: { id: pl.id } })}>
                    <ArtworkBox>
                      {coverArtUrlOf(pl)
                        ? <img src={coverArtUrlOf(pl)!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <TrackArtMosaic trackArts={pl.trackArts} />}
                    </ArtworkBox>
                    <TrackInfo>
                      <TrackTitle>{pl.name}</TrackTitle>
                      <TrackMeta>{pl.songCount} track{pl.songCount !== 1 ? "s" : ""}{pl.duration > 0 && ` · ${formatTotalSecs(pl.duration)}`}</TrackMeta>
                    </TrackInfo>
                    <div className="track-actions" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <MenuWrap>
                        <MenuBtn onClick={(e) => {
                          e.stopPropagation();
                          if (openPlaylistMenuId === pl.id) { setOpenPlaylistMenuId(null); setPlaylistMenuAnchor(null); }
                          else { setOpenPlaylistMenuId(pl.id); setPlaylistMenuAnchor(e.currentTarget); }
                        }}>
                          <IconDots size={15} />
                        </MenuBtn>
                        {openPlaylistMenuId === pl.id && (
                          <PlaylistContextMenu
                            playlist={pl}
                            anchorEl={playlistMenuAnchor}
                            creds={creds}
                            onPlay={() => playPlaylist(pl)}
                            onShuffle={() => playPlaylist(pl, true)}
                            onAddSongs={() => openAddSongs(pl)}
                            onRename={() => openEditPlaylist(pl)}
                            onDelete={() => deletePlaylist.mutate(pl.id)}
                            onClose={() => { setOpenPlaylistMenuId(null); setPlaylistMenuAnchor(null); }}
                          />
                        )}
                      </MenuWrap>
                    </div>
                  </TrackRow>
                ))}
              </TrackList>
            )}
          </Tab>

          {/* -------- Favorites -------- */}
          <Tab title="Favorites" overrides={tabOverrides}>
            {!favoritesFailed && (favoritesQuery.isLoading || !creds) && <TracksSkeleton />}

            {favoritesFailed && favorites.length === 0 && <LoadFailed onRetry={retry} />}

            {!favoritesFailed && !favoritesQuery.isLoading && creds && favoritesAll.length === 0 && (
              <EmptyState>
                <IconHeart size={48} color="var(--color-text-muted)" />
                <div style={{ textAlign: "center" }}>
                  {searchQuery ? (
                    <>
                      <EmptyTitle>No favorites match "{searchQuery}"</EmptyTitle>
                      <EmptySubtitle>Try a different search term</EmptySubtitle>
                    </>
                  ) : (
                    <>
                      <EmptyTitle>No favorites yet</EmptyTitle>
                      {/* Loves on tracks with no uploaded file are left out by the
                          server, so "you have none" and "none of yours are here"
                          look the same — say which. */}
                      <EmptySubtitle>
                        Tracks you love that are in your library show up here
                      </EmptySubtitle>
                    </>
                  )}
                </div>
              </EmptyState>
            )}

            {creds && favoritesAll.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", marginBottom: 16 }}>
                <PlayButtons style={{ marginBottom: 0 }}>
                  <PlayBtn onClick={() => playFavorites()}>
                    <IconPlayerPlay size={15} /> Play
                  </PlayBtn>
                  <ShuffleBtn onClick={() => playFavorites(true)}>
                    <IconArrowsShuffle size={15} /> Shuffle
                  </ShuffleBtn>
                  <ShuffleBtn onClick={() => downloadFavorites(creds, favorites)}>
                    <IconDownload size={15} /> Download
                  </ShuffleBtn>
                  <MenuWrap>
                    <MenuBtn aria-label="Favorites actions" title="More" onClick={(e) => {
                      e.stopPropagation();
                      if (favoritesMenuOpen) { setFavoritesMenuOpen(false); setFavoritesMenuAnchor(null); }
                      else { setFavoritesMenuOpen(true); setFavoritesMenuAnchor(e.currentTarget); }
                    }}>
                      <IconDots size={15} />
                    </MenuBtn>
                    {favoritesMenuOpen && (
                      <FavoritesContextMenu
                        songs={favorites}
                        anchorEl={favoritesMenuAnchor}
                        creds={creds}
                        did={did}
                        tracks={favoriteTracks}
                        onPlay={() => playFavorites()}
                        onShuffle={() => playFavorites(true)}
                        onClose={() => { setFavoritesMenuOpen(false); setFavoritesMenuAnchor(null); }}
                      />
                    )}
                  </MenuWrap>
                </PlayButtons>
                <PlaylistSearch
                  onChange={setFavoritesFilter}
                  label="Search your favorites"
                  placeholder="Search your favorites"
                />
                </div>

                {favorites.length === 0 && (
                  <EmptyState>
                    <IconHeart size={48} color="var(--color-text-muted)" />
                    <div style={{ textAlign: "center" }}>
                      <EmptyTitle>No favorites match "{favoritesFilter.trim()}"</EmptyTitle>
                      <EmptySubtitle>Try a different search term</EmptySubtitle>
                    </div>
                  </EmptyState>
                )}

                <TrackList>
                  {favorites.map((song, idx) => {
                    const albumArt = song.coverArt ? coverArtUrlOf(song) : null;
                    return (
                      <TrackRow key={song.id} onClick={() => playFavorites(false, idx)}>
                        <TrackNum>{idx + 1}</TrackNum>
                        <ArtworkBox>
                          {albumArt ? (
                            <>
                              <img src={albumArt} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              <ArtworkOverlay className="artwork-overlay">
                                <IconPlayerPlay size={16} color="#fff" fill="#fff" />
                              </ArtworkOverlay>
                            </>
                          ) : (
                            <IconMusic size={18} color="var(--color-text-muted)" />
                          )}
                        </ArtworkBox>
                        <TrackInfo>
                          <TrackTitle>{song.title}</TrackTitle>
                          <TrackMeta>{song.artist}{song.album && ` — ${song.album}`}</TrackMeta>
                        </TrackInfo>
                        <Duration>{formatDuration(song.duration)}</Duration>
                        <div className="track-actions" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <MenuWrap>
                            <MenuBtn onClick={(e) => {
                              e.stopPropagation();
                              if (openFavoriteMenuId === song.id) { setOpenFavoriteMenuId(null); setFavoriteMenuAnchor(null); }
                              else { setOpenFavoriteMenuId(song.id); setFavoriteMenuAnchor(e.currentTarget); }
                            }}>
                              <IconDots size={15} />
                            </MenuBtn>
                            {openFavoriteMenuId === song.id && (
                              <TrackContextMenu
                                song={song}
                                albumArt={albumArt}
                                anchorEl={favoriteMenuAnchor}
                                creds={creds}
                                onPlay={() => playFavorites(false, idx)}
                                onPlayNext={playNext}
                                onPlayLast={playLast}
                                onDelete={() => deleteTrack.mutate(song.id)}
                                onClose={() => { setOpenFavoriteMenuId(null); setFavoriteMenuAnchor(null); }}
                              />
                            )}
                          </MenuWrap>
                        </div>
                      </TrackRow>
                    );
                  })}
                </TrackList>
              </>
            )}
          </Tab>
        </Tabs>
      </Page>
    </Main>
  );
}
