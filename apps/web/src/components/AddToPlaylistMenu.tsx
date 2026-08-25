import styled from "@emotion/styled";
import { IconPlaylist } from "@tabler/icons-react";
import { useSetAtom } from "jotai";
import { addToLibraryPlaylistSongAtom } from "../atoms/addToLibraryPlaylist";

// Opens the add-to-playlist palette. The picking used to happen inline in the
// dropdown, which had nowhere to report a failure and no way to search.

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

export function AddToPlaylistMenu({
  songId,
  title,
  onDone,
}: {
  songId: string;
  title?: string;
  onDone: () => void;
}) {
  const setSong = useSetAtom(addToLibraryPlaylistSongAtom);

  return (
    <Item
      onClick={(e) => {
        e.stopPropagation();
        setSong({ id: songId, title: title ?? "" });
        onDone();
      }}
    >
      <IconPlaylist size={14} /> Add to playlist…
    </Item>
  );
}
