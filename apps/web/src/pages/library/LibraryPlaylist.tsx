import styled from "@emotion/styled";
import {
  IconArrowLeft,
  IconArrowsShuffle,
  IconDots,
  IconMusic,
  IconPlayerPlay,
  IconPlaylist,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Route } from "../../routes/library/playlist/$id";
import {
  getCoverArtUrl,
  type NavidromeSong,
  type NavidromeCredentials,
} from "../../api/navidrome";
import {
  useNavidromeCredentials,
  useNavidromePlaylistQuery,
  useRemoveTrackFromPlaylistMutation,
  songToQueueTrack,
} from "../../hooks/useNavidrome";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import type { QueueTrack } from "../../atoms/queue";
import Main from "../../layouts/Main";
import { DropdownPortal } from "../../components/DropdownPortal";
import { AddToPlaylistMenu } from "../../components/AddToPlaylistMenu";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTotalSecs(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
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

const Header = styled.div`
  display: flex;
  gap: 24px;
  align-items: flex-end;
  margin-bottom: 32px;
`;

const Cover = styled.div`
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

const Meta = styled.div`
  flex: 1;
  min-width: 0;
`;

const Name = styled.h1`
  margin: 0 0 8px;
  font-size: 1.75rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const Stats = styled.p`
  margin: 0 0 16px;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
`;

const PlayButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
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
  &:hover { color: var(--color-text); }
  &:disabled { opacity: 0.4; cursor: default; }
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

const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 0;
  color: var(--color-text-muted);
`;

// ---------------------------------------------------------------------------
// TrackContextMenu
// ---------------------------------------------------------------------------

function TrackContextMenu({
  song, index, albumArt, anchorEl, creds, onPlay, onPlayNext, onPlayLast, onRemove, onClose,
}: {
  song: NavidromeSong;
  index: number;
  albumArt: string | null;
  anchorEl: HTMLElement | null;
  creds: NavidromeCredentials;
  onPlay: () => void;
  onPlayNext: (t: QueueTrack) => void;
  onPlayLast: (t: QueueTrack) => void;
  onRemove: (index: number) => void;
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <MenuHeaderTitle>{song.title}</MenuHeaderTitle>
          <MenuHeaderArtist>{song.artist}</MenuHeaderArtist>
        </div>
      </MenuHeader>
      <MenuDivider />
      <MenuItem onClick={(e) => { e.stopPropagation(); onPlay(); onClose(); }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconPlayerPlay size={14} /> Play</span>
      </MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); onPlayNext(track); onClose(); }}>Play next</MenuItem>
      <MenuItem onClick={(e) => { e.stopPropagation(); onPlayLast(track); onClose(); }}>Add to queue</MenuItem>
      <MenuDivider />
      <AddToPlaylistMenu songId={song.id} onDone={onClose} />
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
      <DangerMenuItem onClick={(e) => { e.stopPropagation(); onRemove(index); onClose(); }}>
        Remove from playlist
      </DangerMenuItem>
    </DropdownPortal>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LibraryPlaylist() {
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const { data: creds } = useNavidromeCredentials();
  const { playNow, playNext, playLast } = useUploadPlayer();
  const { data: playlist, isLoading } = useNavidromePlaylistQuery(id);
  const removeTrack = useRemoveTrackFromPlaylistMutation();

  const [openMenuIdx, setOpenMenuIdx] = useState<number | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const songs: NavidromeSong[] = useMemo(() => playlist?.entry ?? [], [playlist]);
  const totalDuration = playlist?.duration ?? songs.reduce((sum, s) => sum + s.duration, 0);

  const coverUrl = useCallback(
    (coverArt?: string) => (creds && coverArt ? getCoverArtUrl(creds, coverArt) : null),
    [creds],
  );

  const queue = useCallback(
    (): QueueTrack[] => (creds ? songs.map((s) => songToQueueTrack(s, creds, coverUrl(s.coverArt))) : []),
    [creds, songs, coverUrl],
  );

  const handlePlay = useCallback(() => playNow(queue()), [queue, playNow]);
  const handleShuffle = useCallback(() => playNow([...queue()].sort(() => Math.random() - 0.5)), [queue, playNow]);
  const handleTrackPlay = useCallback((idx: number) => playNow(queue(), idx), [queue, playNow]);

  if (isLoading || !creds || !playlist) {
    return (
      <Main>
        <Page>
          <BackBtn onClick={() => navigate({ to: "/library" })}>
            <IconArrowLeft size={16} /> Library
          </BackBtn>
          <Empty>
            <IconPlaylist size={40} />
            Loading…
          </Empty>
        </Page>
      </Main>
    );
  }

  return (
    <Main>
      <Page>
        <BackBtn onClick={() => navigate({ to: "/library" })}>
          <IconArrowLeft size={16} /> Library
        </BackBtn>

        <Header>
          <Cover>
            {coverUrl(playlist.coverArt)
              ? <img src={coverUrl(playlist.coverArt)!} alt={playlist.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <IconPlaylist size={56} color="var(--color-text-muted)" />}
          </Cover>
          <Meta>
            <Name>{playlist.name}</Name>
            <Stats>
              {songs.length} track{songs.length !== 1 ? "s" : ""} · {formatTotalSecs(totalDuration)}
            </Stats>
            <PlayButtons>
              <PlayBtn onClick={handlePlay} disabled={songs.length === 0}><IconPlayerPlay size={15} /> Play</PlayBtn>
              <ShuffleBtn onClick={handleShuffle} disabled={songs.length === 0}><IconArrowsShuffle size={15} /> Shuffle</ShuffleBtn>
            </PlayButtons>
          </Meta>
        </Header>

        {songs.length === 0 ? (
          <Empty>
            <IconPlaylist size={40} />
            This playlist is empty.
          </Empty>
        ) : (
          <TrackList>
            {songs.map((song, idx) => {
              const albumArt = coverUrl(song.coverArt);
              return (
                <TrackRow key={`${song.id}-${idx}`} onClick={() => handleTrackPlay(idx)}>
                  <TrackNum>{idx + 1}</TrackNum>
                  <ArtworkBox>
                    {albumArt
                      ? <img src={albumArt} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <IconMusic size={18} color="var(--color-text-muted)" />}
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
                        if (openMenuIdx === idx) { setOpenMenuIdx(null); setMenuAnchor(null); }
                        else { setOpenMenuIdx(idx); setMenuAnchor(e.currentTarget); }
                      }}>
                        <IconDots size={15} />
                      </MenuBtn>
                      {openMenuIdx === idx && (
                        <TrackContextMenu
                          song={song}
                          index={idx}
                          albumArt={albumArt}
                          anchorEl={menuAnchor}
                          creds={creds}
                          onPlay={() => handleTrackPlay(idx)}
                          onPlayNext={playNext}
                          onPlayLast={playLast}
                          onRemove={(i) => removeTrack.mutate({ playlistId: playlist.id, index: i })}
                          onClose={() => { setOpenMenuIdx(null); setMenuAnchor(null); }}
                        />
                      )}
                    </MenuWrap>
                  </div>
                </TrackRow>
              );
            })}
          </TrackList>
        )}
      </Page>
    </Main>
  );
}
