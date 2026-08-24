import styled from "@emotion/styled";
import { IconArrowLeft } from "@tabler/icons-react";
import { useCanGoBack, useRouter } from "@tanstack/react-router";

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-bottom: 8px;
  border: none;
  border-radius: 50%;
  background: var(--color-default-button);
  color: var(--color-text);
  cursor: pointer;

  &:hover {
    background: var(--color-menu-hover);
  }
`;

/**
 * Detail pages are reached from several places, so there is no single parent to
 * return to — this retraces the user's step. Renders nothing when the page was
 * opened directly and there is no history to go back to.
 */
function BackButton() {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  if (!canGoBack) return null;

  return (
    <Button
      type="button"
      aria-label="Go back"
      title="Go back"
      onClick={() => router.history.back()}
    >
      <IconArrowLeft size={20} />
    </Button>
  );
}

export default BackButton;
