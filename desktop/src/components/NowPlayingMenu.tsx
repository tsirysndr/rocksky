// The mini player's "…" menu — the track context menu, for whatever is playing.
//
// Shown only for the local engine and remote devices. Spotify playback is
// controlled by Spotify: the queue actions do not apply to it and the library
// ids these entries need do not exist for it, so the caller hides the button
// rather than opening a menu that could not act.

import styled from "@emotion/styled";
import { IconDownload, IconMusic } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { downloadFromNavidrome } from "../api/navidrome";
import type { QueueTrack } from "../atoms/queue";
import { useNavidromeCredentials } from "../hooks/useNavidrome";
import { useUploadPlayer } from "../hooks/useUploadPlayer";
import { AddToPlaylistMenu } from "./AddToPlaylistMenu";
import { DropdownPortal } from "./DropdownPortal";
import { atUriToPath } from "./StickyPlayer/StrickyPlayer";

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
  &:hover {
    background: var(--color-menu-hover);
  }
`;

export type NowPlayingMenuTrack = {
  title?: string;
  artist?: string;
  albumArt?: string;
  songUri?: string;
  artistUri?: string;
  albumUri?: string;
};

export function NowPlayingMenu({
  track,
  queued,
  anchorEl,
  onClose,
}: {
  track: NowPlayingMenuTrack;
  /**
   * The queue entry for what is playing, supplied by the caller.
   *
   * Not read from the queue atom here: that atom holds the *local* queue, and
   * when a remote device is the player its queue is the authoritative one. The
   * container knows which source applies, so it passes the entry in.
   */
  queued?: QueueTrack;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const { playNext, playLast } = useUploadPlayer();
  const { data: creds } = useNavidromeCredentials();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // The same mapping the player's title and artist links use.
  const songPath = atUriToPath(track.songUri);
  const artistPath = atUriToPath(track.artistUri);
  const albumPath = atUriToPath(track.albumUri);
  // Only an uploaded track has a library id, and only that can be downloaded
  // or put on a playlist.
  const uploadId = queued?.uploadId;
  const go = (to: string) => {
    navigate({ to });
    onClose();
  };

  return (
    <DropdownPortal anchorEl={anchorEl} menuRef={menuRef}>
      <MenuHeader>
        <MenuHeaderArt>
          {track.albumArt ? (
            <img
              src={track.albumArt}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <IconMusic size={16} color="var(--color-text-muted)" />
          )}
        </MenuHeaderArt>
        <MenuHeaderInfo>
          <MenuHeaderTitle>{track.title}</MenuHeaderTitle>
          <MenuHeaderArtist>{track.artist}</MenuHeaderArtist>
        </MenuHeaderInfo>
      </MenuHeader>

      {queued && (
        <>
          <MenuDivider />
          {/* Queueing what is already playing is not a no-op: it schedules the
              track again, which is the "play this again after" gesture. */}
          <MenuItem
            onClick={(e) => {
              e.stopPropagation();
              playNext(queued);
              onClose();
            }}
          >
            Play next
          </MenuItem>
          <MenuItem
            onClick={(e) => {
              e.stopPropagation();
              playLast(queued);
              onClose();
            }}
          >
            Add to queue
          </MenuItem>
        </>
      )}

      {uploadId && creds && (
        <>
          <MenuDivider />
          <MenuItem
            onClick={(e) => {
              e.stopPropagation();
              downloadFromNavidrome(creds, uploadId);
              onClose();
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <IconDownload size={14} /> Download
            </span>
          </MenuItem>
        </>
      )}

      {uploadId && (
        <>
          <MenuDivider />
          <AddToPlaylistMenu
            songId={uploadId}
            title={track.title}
            onDone={onClose}
          />
        </>
      )}

      {(songPath || artistPath || albumPath) && <MenuDivider />}
      {songPath && (
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            go(songPath);
          }}
        >
          Go to song
        </MenuItem>
      )}
      {artistPath && (
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            go(artistPath);
          }}
        >
          Go to artist
        </MenuItem>
      )}
      {albumPath && (
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            go(albumPath);
          }}
        >
          Go to album
        </MenuItem>
      )}
    </DropdownPortal>
  );
}
