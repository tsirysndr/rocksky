import styled from "@emotion/styled";
import {
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
} from "@tabler/icons-react";
import { useAtom } from "jotai";
import { rightPaneHiddenAtom } from "../../atoms/rightPane";

const Button = styled.button`
  position: fixed;
  top: 26px;
  right: 24px;
  z-index: 3;

  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;

  &:hover {
    background: var(--color-menu-hover);
    color: var(--color-text);
  }

  /* The pane itself is hidden below this width, so the toggle has nothing to do. */
  @media (max-width: 1152px) {
    display: none;
  }
`;

function RightPaneToggle() {
  const [hidden, setHidden] = useAtom(rightPaneHiddenAtom);

  return (
    <Button
      type="button"
      aria-label={hidden ? "Show side panel" : "Hide side panel"}
      title={`${hidden ? "Show" : "Hide"} side panel (\\)`}
      aria-pressed={!hidden}
      onClick={() => setHidden(!hidden)}
    >
      {hidden ? (
        <IconLayoutSidebarRightExpand size={20} />
      ) : (
        <IconLayoutSidebarRightCollapse size={20} />
      )}
    </Button>
  );
}

export default RightPaneToggle;
