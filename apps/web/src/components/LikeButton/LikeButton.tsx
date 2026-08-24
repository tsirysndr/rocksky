import styled from "@emotion/styled";
import { useState } from "react";
import useLike from "../../hooks/useLike";
import HeartFilled from "../Icons/Heart";
import HeartOutline from "../Icons/HeartOutline";
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
};

function LikeButton({ uri, liked }: Props) {
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
        onClick={toggle}
        aria-pressed={isLiked}
        aria-label={isLiked ? "Remove from loved songs" : "Add to loved songs"}
        title={isLiked ? "Remove from loved songs" : "Add to loved songs"}
      >
        {isLiked ? (
          <HeartFilled size={18} />
        ) : (
          <HeartOutline size={18} color="var(--color-text-muted)" />
        )}
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
