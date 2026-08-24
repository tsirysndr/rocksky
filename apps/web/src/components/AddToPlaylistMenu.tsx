import styled from "@emotion/styled";
import { IconPlaylist, IconPlus } from "@tabler/icons-react";
import { useSetAtom } from "jotai";
import { useState } from "react";
import {
  addLibrarySongsTargetAtom,
  editingLibraryPlaylistAtom,
  libraryPlaylistModalOpenAtom,
  newLibraryPlaylistSeedSongsAtom,
} from "../atoms/libraryPlaylist";
import {
  useAddTrackToPlaylistMutation,
  useNavidromePlaylistsQuery,
} from "../hooks/useNavidrome";

// Inline "Add to playlist" section for the track context menus. Expands within
// the existing dropdown (no nested portal): pick an existing playlist or create
// a new one containing the track.

const Item = styled.button`
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
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &:hover {
    background: var(--color-menu-hover);
  }
`;

const SubHeader = styled.div`
  padding: 8px 12px 4px;
  font-size: 0.7rem;
  font-family: RockfordSansMedium;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const List = styled.div`
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Divider = styled.div`
  height: 1px;
  background: var(--color-menu-hover);
  margin: 2px 0;
`;

export function AddToPlaylistMenu({
  songId,
  onDone,
}: {
  songId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: playlists = [] } = useNavidromePlaylistsQuery();
  const addTrack = useAddTrackToPlaylistMutation();
  const setPlaylistModalOpen = useSetAtom(libraryPlaylistModalOpenAtom);
  const setEditingPlaylist = useSetAtom(editingLibraryPlaylistAtom);
  const setAddSongsTarget = useSetAtom(addLibrarySongsTargetAtom);
  const setSeedSongs = useSetAtom(newLibraryPlaylistSeedSongsAtom);

  const add = (playlistId: string) => {
    addTrack.mutate({ playlistId, songId });
    onDone();
  };

  // Hands off to the full modal, seeded with this track, rather than prompting
  // for a name inline: the menu dies with the dropdown, so there'd be nowhere
  // to report a failed create.
  const create = () => {
    setEditingPlaylist(null);
    setAddSongsTarget(null);
    setSeedSongs([songId]);
    setPlaylistModalOpen(true);
    onDone();
  };

  if (!open) {
    return (
      <Item
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <IconPlaylist size={14} /> Add to playlist…
      </Item>
    );
  }

  return (
    <>
      <SubHeader>Add to playlist</SubHeader>
      <Item
        onClick={(e) => {
          e.stopPropagation();
          create();
        }}
        style={{ color: "var(--color-primary)" }}
      >
        <IconPlus size={14} /> New playlist
      </Item>
      {playlists.length > 0 && <Divider />}
      <List>
        {playlists.map((pl) => (
          <Item
            key={pl.id}
            onClick={(e) => {
              e.stopPropagation();
              add(pl.id);
            }}
          >
            {pl.name}
          </Item>
        ))}
      </List>
    </>
  );
}
