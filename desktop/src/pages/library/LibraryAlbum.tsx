import styled from "@emotion/styled";
import { shuffled } from "../../lib/shuffle";
import {
  IconArrowLeft,
  IconArrowsShuffle,
  IconDots,
  IconDownload,
  IconMusic,
  IconPlayerPlay,
  IconVinyl,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { Route } from "../../routes/library/album/$id";
import {
  downloadFromNavidrome,
  coverArtUrlOf,
  type NavidromeCredentials,
  type NavidromeSong,
} from "../../api/navidrome";
import { useNavidromeAlbumQuery, useNavidromeCredentials, songToQueueTrack } from "../../hooks/useNavidrome";
import { useDeleteUploadByTrackIdMutation, useDeleteAlbumByIdMutation } from "../../hooks/useUploads";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import type { QueueTrack } from "../../atoms/queue";
import Main from "../../layouts/Main";
import { DropdownPortal } from "../../components/DropdownPortal";
import { AddToPlaylistMenu } from "../../components/AddToPlaylistMenu";
import { WriteToNfcMenuItem } from "../../components/WriteToNfcMenuItem";
import { useWritable } from "../../hooks/useWritable";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDurationSecs(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTotalSecs(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

// ---------------------------------------------------------------------------
// Styled components
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

const AlbumArtistLink = styled.p`
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

const VolumeHeading = styled.div`
  font-family: RockfordSansMedium;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 20px 0 6px;
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
// Skeleton
// ---------------------------------------------------------------------------

function AlbumPageSkeleton() {
  return (
    <Main>
      <Page>
        <SkeletonBox w="80px" h="32px" radius="10px" style={{ marginBottom: 24 }} />
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
}

// ---------------------------------------------------------------------------
// Track context menu
// ---------------------------------------------------------------------------

function TrackMenu({
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
      <MenuDivider />
      <DangerMenuItem onClick={(e) => {
        e.stopPropagation();
        if (!window.confirm(`Delete "${song.title}"? This cannot be undone.`)) return;
        onDelete();
        onClose();
      }}>
        Delete track
      </DangerMenuItem>
    </DropdownPortal>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
// AlbumMenu
// ---------------------------------------------------------------------------

function AlbumMenu({
  album, songs, albumArtUrl, anchorEl, creds, onDelete, onClose,
}: {
  album: { id: string; name: string; artistId?: string; uri?: string };
  songs: NavidromeSong[];
  albumArtUrl: string | null;
  anchorEl: HTMLElement | null;
  creds: NavidromeCredentials;
  onDelete: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const { playNextAll, playLastAll } = useUploadPlayer();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const tracks = () => songs.map((s) => songToQueueTrack(s, creds, albumArtUrl));

  return (
    <DropdownPortal anchorEl={anchorEl} menuRef={menuRef}>
      <MenuItem onClick={(e) => { e.stopPropagation(); playNextAll(tracks()); onClose(); }}>Play next</MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); playLastAll(tracks()); onClose(); }}>Play last</MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); playNextAll(shuffled(tracks())); onClose(); }}>Insert shuffled</MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); playLastAll(shuffled(tracks())); onClose(); }}>Insert last shuffled</MenuItem>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); downloadFromNavidrome(creds, album.id); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconDownload size={14} /> Download album</span>
      </MenuItem>
      <WriteToNfcMenuItem target={{ kind: "album", id: album.id, uri: album.uri }} label={album.name} sublabel={songs[0]?.albumArtist ?? songs[0]?.artist} onDone={onClose} />
      {album.artistId && (
        <MenuItem onClick={(e) => { e.stopPropagation(); navigate({ to: "/library/artist/$id", params: { id: album.artistId! } }); onClose(); }}>
          Go to artist
        </MenuItem>
      )}
      <MenuDivider />
      <DangerMenuItem onClick={(e) => { e.stopPropagation(); if (!window.confirm(`Delete all tracks from "${album.name}"? This cannot be undone.`)) return; onDelete(); onClose(); }}>
        Delete album
      </DangerMenuItem>
    </DropdownPortal>
  );
}

// ---------------------------------------------------------------------------

export default function LibraryAlbum() {
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const { data: creds } = useNavidromeCredentials();
  const { playNow, playNext, playLast } = useUploadPlayer();
  const deleteTrack = useDeleteUploadByTrackIdMutation();
  const deleteAlbumById = useDeleteAlbumByIdMutation();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [albumMenuOpen, setAlbumMenuOpen] = useState(false);
  const [albumMenuAnchor, setAlbumMenuAnchor] = useState<HTMLElement | null>(null);

  const { data: album, isLoading } = useNavidromeAlbumQuery(id);

  const songs: NavidromeSong[] = album?.song ?? [];

  // What Shift+T writes on this page.
  useWritable(
    album?.id
      ? {
          target: { kind: "album", id: album.id, uri: album.uri },
          label: album.name,
          sublabel: songs[0]?.albumArtist ?? songs[0]?.artist,
        }
      : null,
  );

  // idx is the position in the flat list, which is what the queue and the
  // context menu index into — grouping must not renumber it.
  const discs = useMemo(() => {
    const byDisc = new Map<number, { song: NavidromeSong; idx: number }[]>();
    songs.forEach((song, idx) => {
      const disc = song.discNumber ?? 1;
      const bucket = byDisc.get(disc);
      if (bucket) bucket.push({ song, idx });
      else byDisc.set(disc, [{ song, idx }]);
    });
    return [...byDisc.entries()]
      .sort(([a], [b]) => a - b)
      .map(([disc, tracks]) => ({ disc, tracks }));
  }, [songs]);
  const albumArtUrl = creds && album?.coverArt ? coverArtUrlOf(album) : null;
  const totalSecs = songs.reduce((sum, s) => sum + s.duration, 0);

  const toTrack = useCallback(
    (s: NavidromeSong) => creds ? songToQueueTrack(s, creds, albumArtUrl) : null,
    [creds, albumArtUrl],
  );

  const handlePlay = useCallback(() => {
    playNow(songs.map(toTrack).filter(Boolean) as QueueTrack[]);
  }, [songs, toTrack, playNow]);

  const handleShuffle = useCallback(() => {
    playNow(shuffled(songs.map(toTrack).filter(Boolean) as QueueTrack[]));
  }, [songs, toTrack, playNow]);

  const handleTrackClick = useCallback((idx: number) => {
    playNow(songs.map(toTrack).filter(Boolean) as QueueTrack[], idx);
  }, [songs, toTrack, playNow]);

  if (isLoading || !album || !creds) return <AlbumPageSkeleton />;

  return (
    <Main>
      <Page>
        <BackBtn onClick={() => navigate({ to: "/library" })}>
          <IconArrowLeft size={16} /> Library
        </BackBtn>

        <AlbumHeader>
          <AlbumArt>
            {albumArtUrl
              ? <img src={albumArtUrl} alt={album.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <IconVinyl size={56} color="var(--color-text-muted)" />}
          </AlbumArt>
          <AlbumMeta>
            <AlbumTitle>{album.name}</AlbumTitle>
            <AlbumArtistLink onClick={() => album.artistId && navigate({ to: "/library/artist/$id", params: { id: album.artistId } })}>
              {album.artist}
            </AlbumArtistLink>
            <AlbumStats>
              <span style={{ fontFamily: "var(--font-mono)" }}>{songs.length}</span> track{songs.length !== 1 ? "s" : ""} · <span style={{ fontFamily: "var(--font-mono)" }}>{formatTotalSecs(totalSecs)}</span>
              {album.year ? <> · <span style={{ fontFamily: "var(--font-mono)" }}>{album.year}</span></> : ""}
            </AlbumStats>
            <PlayButtons>
              <PlayBtn onClick={handlePlay}><IconPlayerPlay size={15} /> Play</PlayBtn>
              <ShuffleBtn onClick={handleShuffle}><IconArrowsShuffle size={15} /> Shuffle</ShuffleBtn>
              <ShuffleBtn onClick={() => downloadFromNavidrome(creds, album.id)}><IconDownload size={15} /> Download</ShuffleBtn>
              <MenuWrap>
                <MenuBtn
                  aria-label="Album actions"
                  title="More"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (albumMenuOpen) { setAlbumMenuOpen(false); setAlbumMenuAnchor(null); }
                    else { setAlbumMenuOpen(true); setAlbumMenuAnchor(e.currentTarget); }
                  }}
                >
                  <IconDots size={15} />
                </MenuBtn>
                {albumMenuOpen && (
                  <AlbumMenu
                    album={album}
                    songs={songs}
                    albumArtUrl={albumArtUrl}
                    anchorEl={albumMenuAnchor}
                    creds={creds}
                    onDelete={() => deleteAlbumById.mutate(id, { onSuccess: () => navigate({ to: "/library" }) })}
                    onClose={() => { setAlbumMenuOpen(false); setAlbumMenuAnchor(null); }}
                  />
                )}
              </MenuWrap>
            </PlayButtons>
          </AlbumMeta>
        </AlbumHeader>

        {discs.map(({ disc, tracks }) => (
        <TrackList key={disc}>
          {discs.length > 1 && <VolumeHeading>Volume {disc}</VolumeHeading>}
          {tracks.map(({ song, idx }) => (
            <TrackRow key={song.id} onClick={() => handleTrackClick(idx)}>
              <TrackNum>{song.track ?? idx + 1}</TrackNum>
              <TrackInfo>
                <TrackTitle>{song.title}</TrackTitle>
                {song.artist !== album.artist && <TrackArtist>{song.artist}</TrackArtist>}
              </TrackInfo>
              <Duration>{formatDurationSecs(song.duration)}</Duration>
              <div className="track-actions">
                <MenuWrap>
                  <MenuBtn onClick={(e) => {
                    e.stopPropagation();
                    if (openMenuId === song.id) { setOpenMenuId(null); setMenuAnchor(null); }
                    else { setOpenMenuId(song.id); setMenuAnchor(e.currentTarget); }
                  }}>
                    <IconDots size={15} />
                  </MenuBtn>
                  {openMenuId === song.id && (
                    <TrackMenu
                      song={song}
                      albumArt={albumArtUrl}
                      anchorEl={menuAnchor}
                      creds={creds}
                      onPlay={() => handleTrackClick(idx)}
                      onPlayNext={playNext}
                      onPlayLast={playLast}
                      onDelete={() => deleteTrack.mutate(song.id)}
                      onClose={() => { setOpenMenuId(null); setMenuAnchor(null); }}
                    />
                  )}
                </MenuWrap>
              </div>
            </TrackRow>
          ))}
        </TrackList>
        ))}
      </Page>
    </Main>
  );
}
