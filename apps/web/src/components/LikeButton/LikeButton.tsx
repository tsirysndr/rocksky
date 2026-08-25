import styled from "@emotion/styled";
import { useState } from "react";
import useLike from "../../hooks/useLike";
import HeartFilled from "../Icons/Heart";
import HeartOutline from "../Icons/HeartOutline";
import SignInModal from "../SignInModal";

const Button = styled.button<{ withLabel?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: ${({ withLabel }) => (withLabel ? "auto" : "32px")};
  height: 32px;
  padding: ${({ withLabel }) => (withLabel ? "10px 4px" : "0")};
  border: none;
  border-radius: ${({ withLabel }) => (withLabel ? "999px" : "50%")};
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  background: transparent;
  cursor: pointer;

  &:hover {
    background: var(--color-menu-hover);
  }

  &:disabled {
    cursor: default;
  }
`;

type Props = {
  /** The song's AT-URI. Without one there is nothing to love, so nothing renders. */
  uri?: string;
  liked?: boolean;
  /** Show "Like"/"Liked" next to the heart, for page headers. */
  withLabel?: boolean;
};

function LikeButton({ uri, liked, withLabel }: Props) {
  const [isLiked, setIsLiked] = useState(!!liked);
  const [pending, setPending] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const { like, unlike } = useLike();

  if (!uri) return null;

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!localStorage.getItem("token")) {
      setSignInOpen(true);
      return;
    }
    if (pending) return;

    const next = !isLiked;
    setIsLiked(next);
    setPending(true);
    try {
      await (next ? like(uri) : unlike(uri));
    } catch {
      setIsLiked(!next);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        withLabel={withLabel}
        onClick={toggle}
        aria-pressed={isLiked}
        aria-label={isLiked ? "Remove from loved songs" : "Add to loved songs"}
        title={isLiked ? "Remove from loved songs" : "Add to loved songs"}
      >
        {isLiked ? (
          <HeartFilled size={18} color="var(--color-primary)" />
        ) : (
          <HeartOutline size={18} color="var(--color-text-muted)" />
        )}
        {withLabel && (isLiked ? "Liked" : "Like")}
      </Button>
      <SignInModal
        isOpen={signInOpen}
        onClose={() => setSignInOpen(false)}
        like
      />
    </>
  );
}

export default LikeButton;
