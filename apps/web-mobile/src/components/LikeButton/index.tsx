import { IconHeart, IconHeartFilled } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { like, unlike } from "../../api/likes";
import SignInModal from "../SignInModal";

type Props = {
  /** The song's AT-URI. Without one there is nothing to love. */
  uri?: string;
  liked?: boolean;
  /** Show "Like"/"Liked" next to the heart, for page headers. */
  withLabel?: boolean;
};

export default function LikeButton({ uri, liked, withLabel }: Props) {
  const [isLiked, setIsLiked] = useState(!!liked);
  const [pending, setPending] = useState(false);

  // The page renders before its query resolves, so `liked` arrives after mount
  // and useState's initial value is already stale. Adopt it when it changes —
  // but never mid-toggle, or an in-flight optimistic flip gets reverted.
  const lastLiked = useRef(liked);
  if (liked !== lastLiked.current) {
    lastLiked.current = liked;
    if (!pending && !!liked !== isLiked) setIsLiked(!!liked);
  }
  const [signInOpen, setSignInOpen] = useState(false);

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
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isLiked}
        aria-label={isLiked ? "Remove from loved songs" : "Add to loved songs"}
        className={
          withLabel
            ? "flex items-center justify-center gap-2 py-3 rounded-2xl border-none cursor-pointer font-semibold text-sm w-full"
            : "p-1.5 border-none bg-transparent cursor-pointer rounded-lg shrink-0"
        }
        style={
          withLabel
            ? {
                backgroundColor: "var(--color-surface-2)",
                color: "var(--color-text)",
              }
            : undefined
        }
      >
        {isLiked ? (
          <IconHeartFilled
            size={withLabel ? 18 : 20}
            color="var(--color-primary)"
          />
        ) : (
          <IconHeart
            size={withLabel ? 18 : 20}
            color={withLabel ? "currentColor" : "var(--color-text-muted)"}
          />
        )}
        {withLabel && (isLiked ? "Liked" : "Like")}
      </button>
      <SignInModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  );
}
