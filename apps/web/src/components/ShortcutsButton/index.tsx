import styled from "@emotion/styled";
import { IconKeyboard } from "@tabler/icons-react";
import { useAtomValue, useSetAtom } from "jotai";
import { nowPlayingAtom } from "../../atoms/nowpaying";
import { shortcutsHelpOpenAtom } from "../../atoms/shortcuts";

// StickyPlayer is position: fixed with height 128px, and renders nothing when
// there is no now-playing — so the button clears it only while it is there.
const PLAYER_HEIGHT = 128;
const MARGIN = 24;

const Button = styled.button<{ raised: boolean }>`
  position: fixed;
  right: ${MARGIN}px;
  bottom: ${({ raised }) => (raised ? PLAYER_HEIGHT + MARGIN : MARGIN)}px;
  z-index: 2;

  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-background);
  color: var(--color-text-muted);
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  transition:
    bottom 0.2s ease,
    color 0.12s ease,
    background 0.12s ease;

  &:hover {
    background: var(--color-menu-hover);
    color: var(--color-text);
  }

  /* Nothing to show on a touch screen with no keyboard. */
  @media (hover: none) {
    display: none;
  }
`;

function ShortcutsButton() {
  const setHelpOpen = useSetAtom(shortcutsHelpOpenAtom);
  const nowPlaying = useAtomValue(nowPlayingAtom);

  return (
    <Button
      type="button"
      raised={!!nowPlaying}
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)"
      onClick={() => setHelpOpen(true)}
    >
      <IconKeyboard size={20} />
    </Button>
  );
}

export default ShortcutsButton;
