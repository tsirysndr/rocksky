import styled from "@emotion/styled";
import { IconPlus } from "@tabler/icons-react";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { addToPlaylistSongAtom } from "../../atoms/addToPlaylist";
import SignInModal from "../SignInModal";

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;

  &:hover {
    background: var(--color-menu-hover);
    color: var(--color-text);
  }
`;

type Props = {
  /** The song's AT-URI. Without one it can't be referenced by a playlist entry. */
  uri?: string;
  title?: string;
};

function AddToPlaylistButton({ uri, title }: Props) {
  const setSong = useSetAtom(addToPlaylistSongAtom);
  const [signInOpen, setSignInOpen] = useState(false);

  if (!uri) return null;

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!localStorage.getItem("token")) {
      setSignInOpen(true);
      return;
    }
    setSong({ uri, title: title ?? "" });
  };

  return (
    <>
      <Button
        type="button"
        onClick={open}
        aria-label="Add to playlist"
        title="Add to playlist"
      >
        <IconPlus size={18} />
      </Button>
      <SignInModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  );
}

export default AddToPlaylistButton;
