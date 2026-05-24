import styled from "@emotion/styled";
import {
  IconArrowLeft,
  IconArrowsShuffle,
  IconDots,
  IconMusic,
  IconPlayerPlay,
  IconVinyl,
} from "@tabler/icons-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { UploadedTrack } from "../../api/uploads";
import { useUploadsQuery } from "../../hooks/useUploads";
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
    songUri: item.track.uri ?? "",
    trackNumber: item.track.trackNumber,
    copyrightMessage: item.track.copyrightMessage,
    genre: item.track.genre,
    releaseDate: item.albumReleaseDate,
    year: item.albumYear,
  };
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Page = styled.div`
  margin-top: 70px;
  margin-bottom: 150px;
`;

const BackBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px 6px 8px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  border-radius: 10px;
  margin-bottom: 24px;
  &:hover { background: var(--color-menu-hover); color: var(--color-text); }
`;

const ArtistHeader = styled.div`
  display: flex;
  gap: 24px;
  align-items: flex-end;
  margin-bottom: 40px;
`;

const ArtistAvatar = styled.div`
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: var(--color-menu-hover);
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  font-family: RockfordSansBold;
  color: var(--color-text-muted);
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
`;

const ArtistMeta = styled.div`
  flex: 1;
  min-width: 0;
`;

const ArtistName = styled.h1`
  margin: 0 0 8px;
  font-size: 1.75rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const ArtistStats = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
`;

const PlayButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
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
  &:hover { opacity: 0.85; }
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
  &:hover { color: var(--color-text); }
`;

const SectionTitle = styled.h2`
  margin: 0 0 16px;
  font-size: 1rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const AlbumGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
  margin-bottom: 40px;
`;

const AlbumCard = styled.div`
  cursor: pointer;
  &:hover .alb-art { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.14); }
`;

const AlbumArtWrap = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  background: var(--color-menu-hover);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s, box-shadow 0.15s;
  margin-bottom: 8px;
`;

const AlbumName = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const AlbumTrackCount = styled.p`
  margin: 2px 0 0;
  font-size: 0.725rem;
  color: var(--color-text-muted);
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
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  &:hover { background: var(--color-menu-hover); }
  & .track-actions { opacity: 0; }
  &:hover .track-actions { opacity: 1; }
`;

const ArtworkBox = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: var(--color-menu-hover);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
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

const TrackAlbum = styled.p`
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
  &:hover { background: var(--color-menu-hover); }
`;

const shimmer = `
  @keyframes shimmer {
    0% { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
`;

const SkeletonBox = styled.div<{ w?: string; h?: string; radius?: string }>`
  ${shimmer}
  width: ${({ w }) => w ?? "100%"};
  height: ${({ h }) => h ?? "16px"};
  border-radius: ${({ radius }) => radius ?? "8px"};
  background: linear-gradient(
    90deg,
    var(--color-menu-hover) 25%,
    color-mix(in srgb, var(--color-menu-hover) 60%, var(--color-text-muted) 10%) 50%,
    var(--color-menu-hover) 75%
  );
  background-size: 800px 100%;
  animation: shimmer 1.4s infinite linear;
  flex-shrink: 0;
`;

// ---------------------------------------------------------------------------
// TrackContextMenu
// ---------------------------------------------------------------------------

function TrackContextMenu({
  item,
  anchorEl,
  onPlay,
  playNext,
  playLast,
  onClose,
}: {
  item: UploadedTrack;
  anchorEl: HTMLElement | null;
  onPlay: () => void;
  playNext: (t: QueueTrack) => void;
  playLast: (t: QueueTrack) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

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
      <MenuItem onClick={(e) => { e.stopPropagation(); onPlay(); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconPlayerPlay size={14} /> Play</span>
      </MenuItem>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); playNext(toQueueTrack(item)); onClose(); }}>Play next</MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); playLast(toQueueTrack(item)); onClose(); }}>Add to queue</MenuItem>
      {item.track.albumUri && (
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            const m = item.track.albumUri!.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
            if (m) navigate({ to: "/library/$did/album/$rkey", params: { did: m[1], rkey: m[2] } });
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
// Page
// ---------------------------------------------------------------------------

export default function LibraryArtist() {
  const navigate = useNavigate();
  const { did, rkey } = useParams({ strict: false });
  const { playNow, playNext, playLast } = useUploadPlayer();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const artistUri = `at://${did}/app.rocksky.artist/${rkey}`;

  const { data: allUploads = [], isLoading } = useUploadsQuery(0, 1000);

  const tracks = useMemo(
    () => allUploads.filter((item) => item.track.artistUri === artistUri),
    [allUploads, artistUri],
  );

  // Fetch real artist picture + name from Rocksky API
  const { data: artistData } = useArtistQuery(did ?? "", rkey ?? "");
  const artistName = artistData?.name ?? tracks[0]?.track.albumArtist ?? "";
  const artistPicture = artistData?.picture ?? null;

  const albums = useMemo(() => {
    const map = new Map<
      string,
      { album: string; albumArt: string | null; albumUri: string | null; count: number }
    >();
    for (const item of tracks) {
      if (!map.has(item.track.album)) {
        map.set(item.track.album, { album: item.track.album, albumArt: item.track.albumArt, albumUri: item.track.albumUri ?? null, count: 0 });
      }
      map.get(item.track.album)!.count++;
    }
    return Array.from(map.values()).sort((a, b) => a.album.localeCompare(b.album));
  }, [tracks]);

  const avatarArt = artistPicture;

  const handlePlayAll = useCallback(() => {
    playNow(tracks.map(toQueueTrack));
  }, [tracks, playNow]);

  const handleShuffle = useCallback(() => {
    const queue = [...tracks.map(toQueueTrack)].sort(() => Math.random() - 0.5);
    playNow(queue);
  }, [tracks, playNow]);

  const handleTrackClick = useCallback(
    (item: UploadedTrack) => {
      const queue = tracks.map(toQueueTrack);
      const idx = tracks.findIndex((t) => t.upload.id === item.upload.id);
      playNow(queue, idx >= 0 ? idx : 0);
    },
    [tracks, playNow],
  );

  if (isLoading) return (
    <Main>
      <Page>
        <BackBtn onClick={() => navigate({ to: "/library" })}>
          <IconArrowLeft size={16} /> Library
        </BackBtn>
        <ArtistHeader>
          <SkeletonBox w="120px" h="120px" radius="50%" />
          <ArtistMeta>
            <SkeletonBox w="200px" h="28px" radius="8px" style={{ marginBottom: 10 }} />
            <SkeletonBox w="120px" h="14px" radius="6px" style={{ marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 12 }}>
              <SkeletonBox w="90px" h="38px" radius="999px" />
              <SkeletonBox w="80px" h="38px" radius="999px" />
            </div>
          </ArtistMeta>
        </ArtistHeader>
        <SkeletonBox w="80px" h="18px" radius="6px" style={{ marginBottom: 16 }} />
        <AlbumGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <SkeletonBox w="100%" h="0" radius="10px" style={{ paddingBottom: "100%", marginBottom: 8 }} />
              <SkeletonBox w="80%" h="13px" radius="5px" style={{ marginBottom: 4 }} />
              <SkeletonBox w="50%" h="11px" radius="5px" />
            </div>
          ))}
        </AlbumGrid>
        <SkeletonBox w="60px" h="18px" radius="6px" style={{ marginBottom: 16 }} />
        <TrackList>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px" }}>
              <SkeletonBox w="36px" h="36px" radius="6px" />
              <div style={{ flex: 1 }}>
                <SkeletonBox w={`${55 + (i % 3) * 15}%`} h="14px" radius="6px" style={{ marginBottom: 4 }} />
                <SkeletonBox w="40%" h="11px" radius="5px" />
              </div>
              <SkeletonBox w="32px" h="14px" radius="4px" />
            </div>
          ))}
        </TrackList>
      </Page>
    </Main>
  );

  return (
    <Main>
      <Page>
        <BackBtn onClick={() => navigate({ to: "/library" })}>
          <IconArrowLeft size={16} /> Library
        </BackBtn>

        <ArtistHeader>
          <ArtistAvatar>
            {avatarArt ? (
              <img src={avatarArt} alt={artistName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              artistName.charAt(0).toUpperCase()
            )}
          </ArtistAvatar>
          <ArtistMeta>
            <ArtistName>{artistName}</ArtistName>
            <ArtistStats>
              {albums.length} album{albums.length !== 1 ? "s" : ""} · {tracks.length} track{tracks.length !== 1 ? "s" : ""}
            </ArtistStats>
            <PlayButtons>
              <PlayBtn onClick={handlePlayAll}>
                <IconPlayerPlay size={15} /> Play
              </PlayBtn>
              <ShuffleBtn onClick={handleShuffle}>
                <IconArrowsShuffle size={15} /> Shuffle
              </ShuffleBtn>
            </PlayButtons>
          </ArtistMeta>
        </ArtistHeader>

        {albums.length > 0 && (
          <>
            <SectionTitle>Albums</SectionTitle>
            <AlbumGrid>
              {albums.map((alb) => (
                <AlbumCard
                  key={alb.album}
                  onClick={() => {
                    if (!alb.albumUri) return;
                    const m = alb.albumUri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
                    if (m) navigate({ to: "/library/$did/album/$rkey", params: { did: m[1], rkey: m[2] } });
                  }}
                >
                  <AlbumArtWrap className="alb-art">
                    {alb.albumArt ? (
                      <img src={alb.albumArt} alt={alb.album} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <IconVinyl size={36} color="var(--color-text-muted)" />
                    )}
                  </AlbumArtWrap>
                  <AlbumName title={alb.album}>{alb.album}</AlbumName>
                  <AlbumTrackCount>{alb.count} track{alb.count !== 1 ? "s" : ""}</AlbumTrackCount>
                </AlbumCard>
              ))}
            </AlbumGrid>
          </>
        )}

        <SectionTitle>Tracks</SectionTitle>
        <TrackList>
          {tracks.map((item) => (
            <TrackRow key={item.upload.id} onClick={() => handleTrackClick(item)}>
              <ArtworkBox>
                {item.track.albumArt ? (
                  <img src={item.track.albumArt} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <IconMusic size={16} color="var(--color-text-muted)" />
                )}
              </ArtworkBox>

              <TrackInfo>
                <TrackTitle>{item.track.title}</TrackTitle>
                <TrackAlbum>{item.track.album}</TrackAlbum>
              </TrackInfo>

              <Duration>{formatDuration(item.track.duration)}</Duration>

              <div className="track-actions">
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
                      playNext={playNext}
                      playLast={playLast}
                      onClose={() => { setOpenMenuId(null); setMenuAnchor(null); }}
                    />
                  )}
                </MenuWrap>
              </div>
            </TrackRow>
          ))}
        </TrackList>
      </Page>
    </Main>
  );
}
