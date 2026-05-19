/* eslint-disable @typescript-eslint/no-explicit-any */
import dayjs from "dayjs";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { Link } from "react-router";
import { profileAtom } from "../../../../atoms/profile";
import Heart from "../../../Icons/Heart";
import HeartOutline from "../../../Icons/HeartOutline";
import SignInModal from "../../../SignInModal";
import useLike from "../../../../hooks/useLike";
import useShout from "../../../../hooks/useShout";
import DeleteShoutModal from "./DeleteShoutModal";
import ReplyModal from "./ReplyModal";

interface ShoutProps {
  shout: {
    uri: string;
    message: string;
    date: string;
    liked: boolean;
    reported: boolean;
    likes: number;
    user: {
      did: string;
      avatar: string;
      displayName: string;
      handle: string;
    };
  };
  refetch: () => Promise<void>;
}

function Shout({ shout, refetch }: ShoutProps) {
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { like, unlike } = useLike();
  const [liked, setLiked] = useState(shout.liked);
  const [likes, setLikes] = useState(shout.likes);
  const profile = useAtomValue(profileAtom);
  const { reportShout, cancelReport } = useShout();

  const requireAuth = (cb: () => void) => {
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }
    cb();
  };

  const onLike = async () => {
    requireAuth(async () => {
      if (liked) {
        setLiked(false);
        setLikes((n) => n - 1);
        await unlike(shout.uri);
      } else {
        setLiked(true);
        setLikes((n) => n + 1);
        await like(shout.uri);
      }
      await refetch();
    });
  };

  const onReport = async () => {
    requireAuth(async () => {
      await reportShout(shout.uri);
      await refetch();
    });
  };

  const onCancelReport = async () => {
    await cancelReport(shout.uri);
    await refetch();
  };

  const isOwn = profile?.did === shout.user.did;

  if (shout.reported) {
    return (
      <div className="py-3 text-sm text-[var(--color-text-muted)]">
        You have reported this message.{" "}
        <span onClick={onCancelReport} className="cursor-pointer text-[var(--color-primary)]">
          Undo
        </span>
      </div>
    );
  }

  return (
    <div className="mb-1 flex gap-3 pb-5">
      {/* Avatar */}
      <Link to={`/profile/${shout.user.handle}`} className="shrink-0 no-underline">
        {shout.user.avatar ? (
          <img src={shout.user.avatar} className="block h-11 w-11 rounded-full" />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-avatar-background)]">
            <span className="text-lg text-white">♪</span>
          </div>
        )}
      </Link>

      {/* Body */}
      <div className="min-w-0 flex-1">
        {/* Header row */}
        <div className="mb-[3px] flex items-baseline justify-between">
          <Link
            to={`/profile/${shout.user.handle}`}
            className="text-sm font-semibold no-underline text-[var(--color-text)]"
          >
            {shout.user.displayName}
          </Link>
          <span
            title={dayjs(shout.date).format("MMMM D, YYYY [at] HH:mm")}
            className="ml-2 shrink-0 text-xs text-[var(--color-text-muted)]"
          >
            {dayjs(shout.date).fromNow()}
          </span>
        </div>

        {/* Message */}
        <p className="mb-2.5 mt-0 text-sm leading-[1.55] text-[var(--color-text)]">
          {shout.message}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-4">
          {/* Reply */}
          <button
            onClick={() => requireAuth(() => setIsReplyOpen(true))}
            className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[13px] text-[var(--color-text-muted)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 17 4 12 9 7" />
              <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
            </svg>
            Reply
          </button>

          {/* Like */}
          <button
            onClick={onLike}
            className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0"
          >
            {liked
              ? <Heart size={15} color="var(--color-primary)" />
              : <HeartOutline size={15} color="var(--color-text-muted)" />
            }
            {likes > 0 && (
              <span className={`text-xs ${liked ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"}`}>
                {likes}
              </span>
            )}
          </button>

          {/* Options menu */}
          <div className="relative flex flex-1 justify-end">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="cursor-pointer border-none bg-transparent px-1 text-[var(--color-text-muted)]"
            >
              •••
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-[30]" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-[31] min-w-[140px] overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
                  {isOwn && (
                    <button
                      onClick={() => { setMenuOpen(false); setIsDeleteOpen(true); }}
                      className="block w-full cursor-pointer border-none bg-transparent px-3.5 py-2.5 text-left text-sm text-[var(--color-primary)]"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    onClick={() => { setMenuOpen(false); onReport(); }}
                    className="block w-full cursor-pointer border-none bg-transparent px-3.5 py-2.5 text-left text-sm text-[var(--color-text-muted)]"
                  >
                    Report
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ReplyModal isOpen={isReplyOpen} close={() => setIsReplyOpen(false)} shout={shout} />
      <SignInModal isOpen={isSignInOpen} onClose={() => setIsSignInOpen(false)} />
      <DeleteShoutModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        shoutUri={shout.uri}
        refetch={refetch}
      />
    </div>
  );
}

export default Shout;
