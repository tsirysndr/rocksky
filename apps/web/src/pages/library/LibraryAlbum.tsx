import dayjs from "dayjs";
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
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import type { QueueTrack } from "../../atoms/queue";
import Main from "../../layouts/Main";
import { DropdownPortal } from "../../components/DropdownPortal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatReleaseDate(raw: string | null | undefined, year: number | null | undefined): string | null {
  if (raw) {
    const parts = raw.split("-");
    if (parts.length === 3) {
      const d = dayjs(raw);
      if (d.isValid()) return d.format("D MMMM YYYY");
    }
    if (parts.length === 2) {
      const d = dayjs(`${raw}-01`);
      if (d.isValid()) return d.format("MMMM YYYY");
    }
  }
  if (year) return String(year);
  return null;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTotalDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
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

const AlbumHeader = styled.div`
  display: flex;
  gap: 24px;
  align-items: flex-end;
  margin-bottom: 32px;
`;

const AlbumArt = styled.div`
  width: 160px;
  height: 160px;
  border-radius: 16px;
  background: var(--color-menu-hover);
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
`;

const AlbumMeta = styled.div`
  flex: 1;
  min-width: 0;
`;

const AlbumTitle = styled.h1`
  margin: 0 0 6px;
  font-size: 1.75rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const AlbumArtist = styled.p`
  margin: 0 0 8px;
  font-size: 1rem;
  font-family: RockfordSansMedium;
  color: var(--color-primary);
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

const AlbumStats = styled.p`
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

const TrackNum = styled.span`
  width: 24px;
  text-align: right;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
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

const TrackArtist = styled.p`
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

const CopyrightText = styled.p`
  margin: 0;
  font-size: 0.725rem;
  color: var(--color-text-muted);
  opacity: 0.7;
`;

const AlbumReleaseDate = styled.p`
  margin: 0 0 6px;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
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

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function LibraryAlbum() {
  const navigate = useNavigate();
  const { did, rkey } = useParams({ strict: false });
  const { playNow, playNext, playLast } = useUploadPlayer();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const albumUri = `at://${did}/app.rocksky.album/${rkey}`;

  const { data: allUploads = [], isLoading } = useUploadsQuery(0, 1000);

  const tracks = useMemo(
    () =>
      allUploads
        .filter((item) => item.track.albumUri === albumUri)
        .sort((a, b) => (a.track.trackNumber ?? 0) - (b.track.trackNumber ?? 0)),
    [allUploads, albumUri],
  );

  const albumArt = tracks[0]?.track.albumArt ?? null;
  const album = tracks[0]?.track.album ?? "";
  const albumArtist = tracks[0]?.track.albumArtist ?? "";
  const totalDuration = tracks.reduce((sum, t) => sum + t.track.duration, 0);
  const releaseDate = formatReleaseDate(tracks[0]?.albumReleaseDate, tracks[0]?.albumYear);
  const copyrightMessage = tracks[0]?.track.copyrightMessage ?? null;

  const handlePlay = useCallback(() => {
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
        <AlbumHeader>
          <SkeletonBox w="160px" h="160px" radius="16px" />
          <AlbumMeta>
            <SkeletonBox w="220px" h="28px" radius="8px" style={{ marginBottom: 10 }} />
            <SkeletonBox w="140px" h="18px" radius="6px" style={{ marginBottom: 8 }} />
            <SkeletonBox w="100px" h="14px" radius="6px" style={{ marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 12 }}>
              <SkeletonBox w="90px" h="38px" radius="999px" />
              <SkeletonBox w="80px" h="38px" radius="999px" />
            </div>
          </AlbumMeta>
        </AlbumHeader>
        <TrackList>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px" }}>
              <SkeletonBox w="24px" h="14px" radius="4px" />
              <div style={{ flex: 1 }}>
                <SkeletonBox w={`${60 + (i % 3) * 15}%`} h="14px" radius="6px" />
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

        <AlbumHeader>
          <AlbumArt>
            {albumArt ? (
              <img src={albumArt} alt={album} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <IconVinyl size={56} color="var(--color-text-muted)" />
            )}
          </AlbumArt>
          <AlbumMeta>
            <AlbumTitle>{album}</AlbumTitle>
            <AlbumArtist
              onClick={() => {
                const artistUri = tracks[0]?.track.artistUri;
                const m = artistUri?.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
                if (m) navigate({ to: "/library/$did/artist/$rkey", params: { did: m[1], rkey: m[2] } });
              }}
            >
              {albumArtist}
            </AlbumArtist>
            <AlbumStats>
              {tracks.length} track{tracks.length !== 1 ? "s" : ""} · {formatTotalDuration(totalDuration)}
            </AlbumStats>
            <PlayButtons>
              <PlayBtn onClick={handlePlay}>
                <IconPlayerPlay size={15} /> Play
              </PlayBtn>
              <ShuffleBtn onClick={handleShuffle}>
                <IconArrowsShuffle size={15} /> Shuffle
              </ShuffleBtn>
            </PlayButtons>
          </AlbumMeta>
        </AlbumHeader>

        <TrackList>
          {tracks.map((item, idx) => (
            <TrackRow key={item.upload.id} onClick={() => handleTrackClick(item)}>
              <TrackNum>{item.track.trackNumber ?? idx + 1}</TrackNum>

              <TrackInfo>
                <TrackTitle>{item.track.title}</TrackTitle>
                {item.track.artist !== albumArtist && (
                  <TrackArtist>{item.track.artist}</TrackArtist>
                )}
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

        {(releaseDate || copyrightMessage) && (
          <div style={{ marginTop: 32 }}>
            {releaseDate && <AlbumReleaseDate>{releaseDate}</AlbumReleaseDate>}
            {copyrightMessage && <CopyrightText>{copyrightMessage}</CopyrightText>}
          </div>
        )}
      </Page>
    </Main>
  );
}

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
      {item.track.artistUri && (
        <MenuItem onClick={(e) => {
          e.stopPropagation();
          const m = item.track.artistUri!.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
          if (m) navigate({ to: "/library/$did/artist/$rkey", params: { did: m[1], rkey: m[2] } });
          onClose();
        }}>Go to artist</MenuItem>
      )}
    </DropdownPortal>
  );
}
