import styled from "@emotion/styled";
import {
  IconArrowsShuffle,
  IconDots,
  IconMusic,
  IconPlayerPlay,
  IconSearch,
  IconUpload,
  IconUser,
  IconVinyl,
  IconX,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { Tab, Tabs } from "baseui/tabs-motion";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import ContentLoader from "react-content-loader";
import {
  fetchNavidromeAlbum,
  getCoverArtUrl,
  type NavidromeAlbum,
  type NavidromeArtist,
  type NavidromeSong,
  type NavidromeCredentials,
} from "../../api/navidrome";
import {
  useNavidromeAlbumsQuery,
  useNavidromeArtistsQuery,
  useNavidromeCredentials,
  useNavidromeTracksQuery,
  songToQueueTrack,
} from "../../hooks/useNavidrome";
import { useDeleteUploadByTrackIdMutation, useDeleteAlbumByIdMutation } from "../../hooks/useUploads";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import type { QueueTrack } from "../../atoms/queue";
import Main from "../../layouts/Main";
import { DropdownPortal } from "../../components/DropdownPortal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
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

function useInfiniteScrollSentinel(
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  fetchNextPage: () => unknown,
) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return ref;
}

// ---------------------------------------------------------------------------
// Tab overrides (baseui requires plain objects)
// ---------------------------------------------------------------------------

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
      <MenuItem onClick={async (e) => { e.stopPropagation(); const t = await fetchTracks(); playNow([...t].sort(() => Math.random() - 0.5)); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconArrowsShuffle size={14} /> Play shuffled</span>
      </MenuItem>
      <MenuDivider />
      <MenuItem onClick={async (e) => { e.stopPropagation(); playNextAll(await fetchTracks()); onClose(); }}>Play next</MenuItem>
      <MenuItem onClick={async (e) => { e.stopPropagation(); playLastAll(await fetchTracks()); onClose(); }}>Play last</MenuItem>
      <MenuItem onClick={async (e) => { e.stopPropagation(); const t = await fetchTracks(); playLastAll([...t].sort(() => Math.random() - 0.5)); onClose(); }}>Add shuffled</MenuItem>
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
// Page
// ---------------------------------------------------------------------------

export default function Library() {
  const navigate = useNavigate();
  const { playNow, playNext, playLast } = useUploadPlayer();
  const { data: creds } = useNavidromeCredentials();
  const deleteTrack = useDeleteUploadByTrackIdMutation();
  const deleteAlbumById = useDeleteAlbumByIdMutation();

  const [activeKey, setActiveKey] = useState<string | number>("0");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [openAlbumMenuKey, setOpenAlbumMenuKey] = useState<string | null>(null);
  const [albumMenuAnchor, setAlbumMenuAnchor] = useState<HTMLElement | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState<string | undefined>(undefined);

  useEffect(() => {
    const trimmed = searchInput.trim();
    const timer = setTimeout(() => setSearchQuery(trimmed || undefined), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const tracksQuery = useNavidromeTracksQuery(searchQuery);
  const albumsQuery = useNavidromeAlbumsQuery(searchQuery);
  const artistsQuery = useNavidromeArtistsQuery(searchQuery);

  const allSongs: NavidromeSong[] = useMemo(() => tracksQuery.data?.pages.flat() ?? [], [tracksQuery.data]);
  const albums: NavidromeAlbum[] = useMemo(() => albumsQuery.data?.pages.flat() ?? [], [albumsQuery.data]);
  const artists: NavidromeArtist[] = useMemo(() => artistsQuery.data ?? [], [artistsQuery.data]);

  const tracksSentinelRef = useInfiniteScrollSentinel(tracksQuery.hasNextPage, tracksQuery.isFetchingNextPage, tracksQuery.fetchNextPage);
  const albumsSentinelRef = useInfiniteScrollSentinel(albumsQuery.hasNextPage, albumsQuery.isFetchingNextPage, albumsQuery.fetchNextPage);

  const handleTrackClick = useCallback((song: NavidromeSong, idx: number) => {
    if (!creds) return;
    const queue = allSongs.map((s) => songToQueueTrack(s, creds, s.coverArt ? getCoverArtUrl(creds, s.coverArt) : null));
    playNow(queue, idx);
  }, [allSongs, creds, playNow]);

  const isLoading = !creds || tracksQuery.isLoading;

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
          <SearchInput
            type="text"
            placeholder="Search your library…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
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

            {!isLoading && allSongs.length === 0 && (
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
                  const albumArt = song.coverArt ? getCoverArtUrl(creds, song.coverArt) : null;
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
            {(albumsQuery.isLoading || !creds) && <AlbumsSkeleton />}
            {!albumsQuery.isLoading && creds && albums.length === 0 && (
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
                  const albumArtUrl = alb.coverArt ? getCoverArtUrl(creds, alb.coverArt) : null;
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
            {(artistsQuery.isLoading || !creds) && <ArtistsSkeleton />}
            {!artistsQuery.isLoading && creds && artists.length === 0 && (
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
        </Tabs>
      </Page>
    </Main>
  );
}
