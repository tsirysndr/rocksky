import styled from "@emotion/styled";
import {
  IconArrowsShuffle,
  IconDots,
  IconMusic,
  IconPlayerPlay,
  IconUpload,
  IconUser,
  IconVinyl,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { Tab, Tabs } from "baseui/tabs-motion";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import ContentLoader from "react-content-loader";
import type { UploadedTrack } from "../../api/uploads";
import {
  useInfiniteUploadsQuery,
} from "../../hooks/useUploads";
import { useArtistQuery } from "../../hooks/useLibrary";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import type { QueueTrack } from "../../atoms/queue";
import Main from "../../layouts/Main";
import { DropdownPortal } from "../../components/DropdownPortal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function albumKey(albumArtist: string, album: string) {
  return `${albumArtist}|||${album}`;
}

export function parseAtUri(uri: string | null | undefined) {
  if (!uri) return null;
  const m = uri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  return m ? { did: m[1], rkey: m[2] } : null;
}

function toQueueTrack(item: UploadedTrack): QueueTrack {
  return {
    uploadId: item.upload.id,
    title: item.track.title,
    artist: item.track.artist,
    albumArtist: item.track.albumArtist,
    album: item.track.album,
    albumArt: item.track.albumArt,
    duration: item.track.duration,
    sha256: item.track.sha256,
  };
}

// ---------------------------------------------------------------------------
// Layout
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
  &:hover {
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
  }
`;

// ---------------------------------------------------------------------------
// Tab overrides (matches profile page style)
// ---------------------------------------------------------------------------

const tabOverrides = {
  Tab: {
    style: {
      color: "var(--color-text)",
      backgroundColor: "var(--color-background) !important",
    },
  },
  TabPanel: {
    style: {
      paddingTop: "16px",
      paddingBottom: "0",
      paddingLeft: "0",
      paddingRight: "0",
    },
  },
};

const tabsOverrides = {
  TabHighlight: { style: { backgroundColor: "var(--color-purple)" } },
  TabBorder: { style: { display: "none" } },
};

// ---------------------------------------------------------------------------
// Track list
// ---------------------------------------------------------------------------

const TrackList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const TrackRow = styled.div<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  background: ${({ active }) =>
    active ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "transparent"};
  &:hover {
    background: ${({ active }) =>
      active
        ? "color-mix(in srgb, var(--color-primary) 10%, transparent)"
        : "var(--color-menu-hover)"};
  }
  & .track-actions {
    opacity: 0;
  }
  &:hover .track-actions {
    opacity: 1;
  }
  &:hover .artwork-overlay {
    opacity: 1;
  }
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
  background: rgba(0, 0, 0, 0.45);
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

const TrackTitle = styled.p<{ active: boolean }>`
  margin: 0;
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ active }) => (active ? "var(--color-primary)" : "var(--color-text)")};
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

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

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
  &:hover {
    background: var(--color-menu-hover);
    color: var(--color-text);
  }
`;


const MenuItem = styled.button`
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  border-radius: 8px;
  cursor: pointer;
  &:hover {
    background: var(--color-menu-hover);
  }
`;

const MenuDivider = styled.div`
  height: 1px;
  background: var(--color-menu-hover);
  margin: 2px 0;
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

// ---------------------------------------------------------------------------
// Album grid
// ---------------------------------------------------------------------------

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 20px;
`;

const AlbumCard = styled.div`
  cursor: pointer;
  &:hover .album-art-wrap {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  }
  &:hover .album-actions {
    opacity: 1;
    pointer-events: auto;
  }
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
  & > * {
    flex: 1;
    display: flex;
    justify-content: center;
  }
`;

const AlbumFloatBtn = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(4px);
  flex-shrink: 0;
  &:hover {
    background: rgba(0, 0, 0, 0.8);
  }
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

const AlbumArtist = styled.p`
  margin: 2px 0 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// ---------------------------------------------------------------------------
// Artist grid
// ---------------------------------------------------------------------------

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
  &:hover .artist-avatar {
    transform: scale(1.04);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  }
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

const ArtistName = styled.p`
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

// ---------------------------------------------------------------------------
// Empty + skeleton
// ---------------------------------------------------------------------------

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

const Sentinel = styled.div`
  height: 1px;
`;

function TrackRowSkeleton() {
  return (
    <ContentLoader
      width="100%"
      height={62}
      viewBox="0 0 600 62"
      backgroundColor="var(--color-skeleton-background)"
      foregroundColor="var(--color-skeleton-foreground)"
      style={{ display: "block" }}
    >
      <rect x="8" y="24" rx="3" ry="3" width="20" height="14" />
      <rect x="44" y="11" rx="8" ry="8" width="40" height="40" />
      <rect x="96" y="14" rx="4" ry="4" width="180" height="14" />
      <rect x="96" y="36" rx="3" ry="3" width="120" height="11" />
      <rect x="536" y="23" rx="3" ry="3" width="40" height="14" />
    </ContentLoader>
  );
}

function LibrarySkeleton() {
  return (
    <div>
      {Array.from({ length: 8 }).map((_, i) => (
        <TrackRowSkeleton key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ArtistPictureAvatar
// ---------------------------------------------------------------------------

function ArtistPictureAvatar({
  artistUri,
  name,
}: {
  artistUri: string | null;
  name: string;
}) {
  const parsed = parseAtUri(artistUri);
  const { data } = useArtistQuery(parsed?.did ?? "", parsed?.rkey ?? "");
  const picture = data?.picture ?? null;

  return (
    <ArtistAvatar className="artist-avatar">
      {picture ? (
        <img
          src={picture}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </ArtistAvatar>
  );
}

// ---------------------------------------------------------------------------
// TrackContextMenu
// ---------------------------------------------------------------------------

interface TrackContextMenuProps {
  item: UploadedTrack;
  anchorEl: HTMLElement | null;
  onPlay: () => void;
  onClose: () => void;
}

function TrackContextMenu({ item, anchorEl, onPlay, onClose }: TrackContextMenuProps) {
  const navigate = useNavigate();
  const { playNext, playLast } = useUploadPlayer();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <DropdownPortal anchorEl={anchorEl} menuRef={menuRef}>
      <MenuHeader>
        <MenuHeaderArt>
          {item.track.albumArt ? (
            <img src={item.track.albumArt} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <IconMusic size={16} color="var(--color-text-muted)" />
          )}
        </MenuHeaderArt>
        <MenuHeaderInfo>
          <MenuHeaderTitle>{item.track.title}</MenuHeaderTitle>
          <MenuHeaderArtist>{item.track.artist}</MenuHeaderArtist>
        </MenuHeaderInfo>
      </MenuHeader>
      <MenuDivider />
      <MenuItem
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
          onClose();
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IconPlayerPlay size={14} /> Play
        </span>
      </MenuItem>
      <MenuDivider />
      <MenuItem
        onClick={(e) => {
          e.stopPropagation();
          playNext(toQueueTrack(item));
          onClose();
        }}
      >
        Play next
      </MenuItem>
      <MenuItem
        onClick={(e) => {
          e.stopPropagation();
          playLast(toQueueTrack(item));
          onClose();
        }}
      >
        Add to queue
      </MenuItem>
      <MenuDivider />
      {parseAtUri(item.track.artistUri) && (
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            const p = parseAtUri(item.track.artistUri)!;
            navigate({ to: "/library/$did/artist/$rkey", params: { did: p.did, rkey: p.rkey } });
            onClose();
          }}
        >
          Go to artist
        </MenuItem>
      )}
      {parseAtUri(item.track.albumUri) && (
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            const p = parseAtUri(item.track.albumUri)!;
            navigate({ to: "/library/$did/album/$rkey", params: { did: p.did, rkey: p.rkey } });
            onClose();
          }}
        >
          Go to album
        </MenuItem>
      )}
    </DropdownPortal>
  );
}

// ---------------------------------------------------------------------------
// AlbumContextMenu
// ---------------------------------------------------------------------------

interface AlbumInfo {
  album: string;
  albumArtist: string;
  albumArt: string | null;
  albumUri: string | null;
  artistUri?: string | null;
}

interface AlbumContextMenuProps {
  alb: AlbumInfo;
  albumTracks: QueueTrack[];
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

function AlbumContextMenu({ alb, albumTracks, anchorEl, onClose }: AlbumContextMenuProps) {
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

  const shuffled = () => [...albumTracks].sort(() => Math.random() - 0.5);

  return (
    <DropdownPortal anchorEl={anchorEl} menuRef={menuRef}>
      <MenuHeader>
        <MenuHeaderArt>
          {alb.albumArt ? (
            <img src={alb.albumArt} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <IconVinyl size={16} color="var(--color-text-muted)" />
          )}
        </MenuHeaderArt>
        <MenuHeaderInfo>
          <MenuHeaderTitle>{alb.album}</MenuHeaderTitle>
          <MenuHeaderArtist>{alb.albumArtist}</MenuHeaderArtist>
        </MenuHeaderInfo>
      </MenuHeader>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); playNow(albumTracks); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconPlayerPlay size={14} /> Play</span>
      </MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); playNow(shuffled()); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconArrowsShuffle size={14} /> Play shuffled</span>
      </MenuItem>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); playNextAll(albumTracks); onClose(); }}>Play next</MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); playLastAll(albumTracks); onClose(); }}>Play last</MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); playLastAll(shuffled()); onClose(); }}>Add shuffled</MenuItem>
      {alb.artistUri && parseAtUri(alb.artistUri) && (
        <>
          <MenuDivider />
          <MenuItem onClick={(e) => {
            e.stopPropagation();
            const p = parseAtUri(alb.artistUri!)!;
            navigate({ to: "/library/$did/artist/$rkey", params: { did: p.did, rkey: p.rkey } });
            onClose();
          }}>Go to artist</MenuItem>
        </>
      )}
    </DropdownPortal>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Library() {
  const navigate = useNavigate();
  const { playNow } = useUploadPlayer();


  const [activeKey, setActiveKey] = useState<string | number>("0");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [openAlbumMenuKey, setOpenAlbumMenuKey] = useState<string | null>(null);
  const [albumMenuAnchor, setAlbumMenuAnchor] = useState<HTMLElement | null>(null);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteUploadsQuery();

  const allTracks: UploadedTrack[] = useMemo(
    () => data?.pages.flat() ?? [],
    [data],
  );

  // Derived: albums
  const albums = useMemo(() => {
    const map = new Map<
      string,
      { albumArtist: string; album: string; albumArt: string | null; albumUri: string | null; artistUri: string | null; count: number }
    >();
    for (const item of allTracks) {
      const key = albumKey(item.track.albumArtist, item.track.album);
      if (!map.has(key)) {
        map.set(key, {
          albumArtist: item.track.albumArtist,
          album: item.track.album,
          albumArt: item.track.albumArt,
          albumUri: item.track.albumUri ?? null,
          artistUri: item.track.artistUri ?? null,
          count: 0,
        });
      }
      map.get(key)!.count++;
    }
    return Array.from(map.values()).sort((a, b) => a.album.localeCompare(b.album));
  }, [allTracks]);

  // Derived: artists
  const artists = useMemo(() => {
    const map = new Map<
      string,
      { name: string; artistUri: string | null; trackCount: number; albumCount: number }
    >();
    for (const item of allTracks) {
      const name = item.track.albumArtist;
      if (!map.has(name)) {
        map.set(name, { name, artistUri: item.track.artistUri ?? null, trackCount: 0, albumCount: 0 });
      }
      map.get(name)!.trackCount++;
    }
    // Count albums per artist
    for (const alb of albums) {
      const entry = map.get(alb.albumArtist);
      if (entry) entry.albumCount++;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allTracks, albums]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleTrackClick = useCallback(
    (item: UploadedTrack) => {
      const queue = allTracks.map(toQueueTrack);
      const idx = allTracks.findIndex((t) => t.upload.id === item.upload.id);
      playNow(queue, idx >= 0 ? idx : 0);
    },
    [allTracks, playNow],
  );

  return (
    <Main>
      <Page>
        <Header>
          <Title>My Library</Title>
          <UploadButton onClick={() => navigate({ to: "/library/upload" })}>
            <IconUpload size={15} />
            Upload Music
          </UploadButton>
        </Header>

        <Tabs
          activeKey={activeKey}
          onChange={({ activeKey }) => setActiveKey(activeKey as string | number)}
          overrides={tabsOverrides}
          activateOnFocus
        >
          <Tab title="Tracks" overrides={tabOverrides}>
            {isLoading && <LibrarySkeleton />}

            {!isLoading && allTracks.length === 0 && (
              <EmptyState>
                <IconVinyl size={48} color="var(--color-text-muted)" />
                <div style={{ textAlign: "center" }}>
                  <EmptyTitle>Your library is empty</EmptyTitle>
                  <EmptySubtitle>Upload your music files to start listening</EmptySubtitle>
                </div>
                <PrimaryButton onClick={() => navigate({ to: "/library/upload" })}>
                  <IconUpload size={15} />
                  Upload your first track
                </PrimaryButton>
              </EmptyState>
            )}

            {allTracks.length > 0 && (
              <TrackList>
                {allTracks.map((item, idx) => (
                  <TrackRow
                    key={item.upload.id}
                    active={false}
                    onClick={() => handleTrackClick(item)}
                  >
                    <TrackNum>{idx + 1}</TrackNum>
                    <ArtworkBox>
                      {item.track.albumArt ? (
                        <>
                          <img
                            src={item.track.albumArt}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                          <ArtworkOverlay className="artwork-overlay">
                            <IconPlayerPlay size={16} color="#fff" fill="#fff" />
                          </ArtworkOverlay>
                        </>
                      ) : (
                        <IconMusic size={18} color="var(--color-text-muted)" />
                      )}
                    </ArtworkBox>

                    <TrackInfo>
                      <TrackTitle active={false}>{item.track.title}</TrackTitle>
                      <TrackMeta>
                        {item.track.artist}
                        {item.track.album && ` — ${item.track.album}`}
                      </TrackMeta>
                    </TrackInfo>

                    <Duration>{formatDuration(item.track.duration)}</Duration>

                    <div className="track-actions" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <MenuWrap>
                        <MenuBtn
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openMenuId === item.upload.id) {
                              setOpenMenuId(null);
                              setMenuAnchor(null);
                            } else {
                              setOpenMenuId(item.upload.id);
                              setMenuAnchor(e.currentTarget);
                            }
                          }}
                        >
                          <IconDots size={15} />
                        </MenuBtn>
                        {openMenuId === item.upload.id && (
                          <TrackContextMenu
                            item={item}
                            anchorEl={menuAnchor}
                            onPlay={() => handleTrackClick(item)}
                            onClose={() => { setOpenMenuId(null); setMenuAnchor(null); }}
                          />
                        )}
                      </MenuWrap>
                    </div>
                  </TrackRow>
                ))}

                <Sentinel ref={sentinelRef} />
                {isFetchingNextPage && <TrackRowSkeleton />}
              </TrackList>
            )}
          </Tab>

          <Tab title="Albums" overrides={tabOverrides}>
            {isLoading && <LibrarySkeleton />}
            {!isLoading && albums.length === 0 && (
              <EmptyState>
                <IconVinyl size={48} color="var(--color-text-muted)" />
                <div style={{ textAlign: "center" }}>
                  <EmptyTitle>No albums yet</EmptyTitle>
                  <EmptySubtitle>Upload tagged music files to see albums</EmptySubtitle>
                </div>
              </EmptyState>
            )}
            {albums.length > 0 && (
              <Grid>
                {albums.map((alb) => {
                  const key = albumKey(alb.albumArtist, alb.album);
                  const albParsed = parseAtUri(alb.albumUri);
                  const albumTracks = allTracks
                    .filter((t) =>
                      alb.albumUri
                        ? t.track.albumUri === alb.albumUri
                        : t.track.albumArtist === alb.albumArtist && t.track.album === alb.album,
                    )
                    .map(toQueueTrack);
                  return (
                    <AlbumCard
                      key={key}
                      onClick={() => {
                        if (!albParsed) return;
                        navigate({
                          to: "/library/$did/album/$rkey",
                          params: { did: albParsed.did, rkey: albParsed.rkey },
                        });
                      }}
                      style={{ opacity: albParsed ? 1 : 0.5, cursor: albParsed ? "pointer" : "default" }}
                    >
                      <AlbumArtContainer>
                        <AlbumArtWrap className="album-art-wrap">
                          {alb.albumArt ? (
                            <img
                              src={alb.albumArt}
                              alt={alb.album}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <IconVinyl size={40} color="var(--color-text-muted)" />
                          )}
                        </AlbumArtWrap>
                        <AlbumActionsOverlay className="album-actions">
                          <AlbumFloatBtn
                            onClick={(e) => {
                              e.stopPropagation();
                              playNow(albumTracks);
                            }}
                          >
                            <IconPlayerPlay size={16} fill="#fff" />
                          </AlbumFloatBtn>
                          <MenuWrap>
                            <AlbumFloatBtn
                              onClick={(e) => {
                                e.stopPropagation();
                                if (openAlbumMenuKey === key) {
                                  setOpenAlbumMenuKey(null);
                                  setAlbumMenuAnchor(null);
                                } else {
                                  setOpenAlbumMenuKey(key);
                                  setAlbumMenuAnchor(e.currentTarget);
                                }
                              }}
                            >
                              <IconDots size={16} />
                            </AlbumFloatBtn>
                            {openAlbumMenuKey === key && (
                              <AlbumContextMenu
                                alb={alb}
                                albumTracks={albumTracks}
                                anchorEl={albumMenuAnchor}
                                onClose={() => { setOpenAlbumMenuKey(null); setAlbumMenuAnchor(null); }}
                              />
                            )}
                          </MenuWrap>
                        </AlbumActionsOverlay>
                      </AlbumArtContainer>
                      <AlbumName title={alb.album}>{alb.album}</AlbumName>
                      <AlbumArtist title={alb.albumArtist}>{alb.albumArtist}</AlbumArtist>
                    </AlbumCard>
                  );
                })}
              </Grid>
            )}
          </Tab>

          <Tab title="Artists" overrides={tabOverrides}>
            {isLoading && <LibrarySkeleton />}
            {!isLoading && artists.length === 0 && (
              <EmptyState>
                <IconUser size={48} color="var(--color-text-muted)" />
                <div style={{ textAlign: "center" }}>
                  <EmptyTitle>No artists yet</EmptyTitle>
                  <EmptySubtitle>Upload tagged music files to see artists</EmptySubtitle>
                </div>
              </EmptyState>
            )}
            {artists.length > 0 && (
              <ArtistGrid>
                {artists.map((art) => {
                  const artParsed = parseAtUri(art.artistUri);
                  return (
                  <ArtistCard
                    key={art.name}
                    onClick={() => {
                      if (!artParsed) return;
                      navigate({
                        to: "/library/$did/artist/$rkey",
                        params: { did: artParsed.did, rkey: artParsed.rkey },
                      });
                    }}
                    style={{ opacity: artParsed ? 1 : 0.5, cursor: artParsed ? "pointer" : "default" }}
                  >
                    <ArtistPictureAvatar artistUri={art.artistUri} name={art.name} />
                    <ArtistName title={art.name}>{art.name}</ArtistName>
                  </ArtistCard>
                  );
                })}
              </ArtistGrid>
            )}
          </Tab>
        </Tabs>
      </Page>
    </Main>
  );
}
