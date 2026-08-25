import styled from "@emotion/styled";
import { useRef, useState } from "react";
import { likeTrackById, unlikeTrackById } from "../../api/likes";
import useLike from "../../hooks/useLike";
import HeartFilled from "../Icons/Heart";
import HeartOutline from "../Icons/HeartOutline";
import { GhostButton } from "../PillButton";
import SignInModal from "../SignInModal";

const IconOnly = styled.button`
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
  /** The song's AT-URI, when it has a record. */
  uri?: string;
  /**
   * Fallback identity: a track ingested from a scrobble has no song record
   * until one is published, and the like is keyed by sha256 either way.
   */
  trackId?: string;
  liked?: boolean;
  /** Show "Like"/"Liked" next to the heart, for page headers. */
  withLabel?: boolean;
};

function LikeButton({ uri, trackId, liked, withLabel }: Props) {
  const [isLiked, setIsLiked] = useState(!!liked);
  const [pending, setPending] = useState(false);

  // The page header renders before its query resolves, so `liked` arrives after
  // mount and useState's initial value is already stale. Adopt it when it
  // changes — but never mid-toggle, or an in-flight optimistic flip gets
  // reverted by the pre-toggle value.
  const lastLiked = useRef(liked);
  if (liked !== lastLiked.current) {
    lastLiked.current = liked;
    if (!pending && !!liked !== isLiked) setIsLiked(!!liked);
  }
  const [signInOpen, setSignInOpen] = useState(false);
  const { like, unlike } = useLike();

  if (!uri && !trackId) return null;

  const Control = withLabel ? GhostButton : IconOnly;

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
      if (uri) await (next ? like(uri) : unlike(uri));
      else if (trackId)
        await (next ? likeTrackById(trackId) : unlikeTrackById(trackId));
    } catch {
      setIsLiked(!next);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Control
        type="button"
        onClick={toggle}
        aria-pressed={isLiked}
        aria-label={isLiked ? "Remove from loved songs" : "Add to loved songs"}
        title={isLiked ? "Remove from loved songs" : "Add to loved songs"}
      >
        {isLiked ? (
          <HeartFilled
            size={withLabel ? 16 : 18}
            color="var(--color-primary)"
          />
        ) : (
          <HeartOutline
            size={withLabel ? 16 : 18}
            color={withLabel ? "currentColor" : "var(--color-text-muted)"}
          />
        )}
        {withLabel && (isLiked ? "Liked" : "Like")}
      </Control>
      <SignInModal
        isOpen={signInOpen}
        onClose={() => setSignInOpen(false)}
        like
      />
    </>
  );
}

export default LikeButton;
