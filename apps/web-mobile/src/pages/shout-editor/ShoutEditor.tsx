/* eslint-disable @typescript-eslint/no-explicit-any */
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { profileAtom } from "../../atoms/profile";
import { shoutsAtom } from "../../atoms/shouts";
import ShoutList from "../../components/Shout/ShoutList/ShoutList";
import SignInModal from "../../components/SignInModal";
import useShout from "../../hooks/useShout";

export default function ShoutEditor() {
  const navigate = useNavigate();
  const location = useLocation();
  const { uri, type, title } = (location.state || {}) as {
    uri: string;
    type: string;
    title?: string;
  };

  const profile = useAtomValue(profileAtom);
  const shouts = useAtomValue(shoutsAtom);
  const setShouts = useSetAtom(shoutsAtom);
  const { shout: postShout, getShouts } = useShout();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignInOpen, setIsSignInOpen] = useState(false);

  const processShouts = (data: any[]) => {
    const mapShouts = (parentId: string | null): any[] =>
      data
        .filter((x) => x.shouts.parent === parentId)
        .map((x) => ({
          id: x.shouts.id,
          uri: x.shouts.uri,
          message: x.shouts.content,
          date: x.shouts.createdAt,
          liked: x.shouts.liked,
          reported: x.shouts.reported,
          likes: x.shouts.likes,
          user: {
            did: x.users.did,
            avatar: x.users.avatar,
            displayName: x.users.displayName,
            handle: x.users.handle,
          },
          replies: mapShouts(x.shouts.id).reverse(),
        }));
    return mapShouts(null);
  };

  const handleSubmit = async () => {
    if (!message.trim() || !uri || loading) return;
    setLoading(true);
    try {
      await postShout(uri, message);
      const data = await getShouts(uri);
      setShouts({ ...shouts, [uri]: processShouts(data) });
      setMessage("");
    } finally {
      setLoading(false);
    }
  };

  const canPost = message.trim() && !loading;

  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-[calc(16px+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="border-none bg-transparent p-0 cursor-pointer text-[15px] text-[var(--color-primary)]"
        >
          ← Back
        </button>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-base font-semibold text-[var(--color-text)]">
            Shoutbox
          </p>
          {title && (
            <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--color-text-muted)]">
              {type} · {title}
            </p>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="p-4">
        {!profile && (
          <div className="py-4 text-center">
            <p className="mb-3 text-sm text-[var(--color-text-muted)]">
              Sign in to leave a shout
            </p>
            <button
              onClick={() => setIsSignInOpen(true)}
              className="cursor-pointer rounded-[20px] border-none bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white"
            >
              Sign In
            </button>
          </div>
        )}
        {profile && (
          <>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`@${profile.handle}, share your thoughts about this ${type}...`}
              maxLength={1000}
              className="w-full min-h-[80px] resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm font-[inherit] text-[var(--color-text)] outline-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)]">
                {message.length}/1000
              </span>
              <button
                onClick={handleSubmit}
                disabled={!canPost}
                className={`rounded-[20px] border-none px-5 py-2 text-sm font-semibold ${canPost ? "cursor-pointer bg-[var(--color-primary)] text-white" : "cursor-default bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"}`}
              >
                {loading ? "Posting..." : "Post Shout"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Existing shouts */}
      <div className="px-4">
        {uri && <ShoutList uri={uri} />}
      </div>

      <SignInModal isOpen={isSignInOpen} onClose={() => setIsSignInOpen(false)} />
    </div>
  );
}
