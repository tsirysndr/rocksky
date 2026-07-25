/* eslint-disable @typescript-eslint/no-explicit-any */
import { PLACEMENT, StatefulPopover } from "baseui/popover";
import { IconGif, IconX } from "@tabler/icons-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isVideoUrl, type MediaResult } from "../../api/klipy";
import { resolveMentionFacets } from "../../lib/richtext";
import { profileAtom } from "../../atoms/profile";
import { shoutsAtom } from "../../atoms/shouts";
import MediaPicker from "../../components/Shout/MediaPicker";
import MentionTextarea from "../../components/Shout/MentionTextarea";
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
  const [gif, setGif] = useState<MediaResult | null>(null);
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
          gif: x.shouts.gifUrl
            ? {
                url: x.shouts.gifUrl,
                previewUrl: x.shouts.gifPreviewUrl,
                alt: x.shouts.gifAlt,
                width: x.shouts.gifWidth,
                height: x.shouts.gifHeight,
              }
            : undefined,
          facets: x.shouts.facets ?? undefined,
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
    if ((!message.trim() && !gif) || !uri || loading) return;
    setLoading(true);
    const gifEmbed = gif
      ? {
          url: gif.url,
          previewUrl: gif.previewUrl,
          alt: gif.alt,
          width: gif.width,
          height: gif.height,
        }
      : undefined;
    try {
      const facets = message.trim() ? await resolveMentionFacets(message) : [];
      await postShout(uri, message, gifEmbed, facets.length ? facets : undefined);
      const data = await getShouts(uri);
      setShouts({ ...shouts, [uri]: processShouts(data) });
      setMessage("");
      setGif(null);
    } finally {
      setLoading(false);
    }
  };

  const canPost = (message.trim() || gif) && !loading;

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
            <MentionTextarea
              value={message}
              onChange={setMessage}
              placeholder={`@${profile.handle}, share your thoughts about this ${type}...`}
              maxLength={1000}
              resize="vertical"
              overrides={{
                Root: {
                  style: {
                    width: "100%",
                    borderRadius: "12px",
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-surface-2)",
                  },
                },
                InputContainer: {
                  style: {
                    backgroundColor: "var(--color-surface-2)",
                  },
                },
                Input: {
                  style: {
                    minHeight: "80px",
                    backgroundColor: "var(--color-surface-2)",
                    color: "var(--color-text)",
                    caretColor: "var(--color-text)",
                    fontFamily: "inherit",
                    fontSize: "14px",
                  },
                },
              }}
            />

            {gif && (
              <div className="mt-[10px] relative w-fit max-w-[220px] overflow-hidden rounded-[12px] border border-[var(--color-input-background)]">
                {isVideoUrl(gif.url) ? (
                  <video
                    src={gif.url}
                    className="block h-auto w-full"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={gif.previewUrl ?? gif.url}
                    alt={gif.alt ?? ""}
                    className="block h-auto w-full"
                  />
                )}
                <button
                  type="button"
                  aria-label="Remove media"
                  onClick={() => setGif(null)}
                  className="absolute right-[6px] top-[6px] flex h-[24px] w-[24px] items-center justify-center rounded-full border-none bg-black/60 text-white cursor-pointer hover:bg-black/80"
                >
                  <IconX size={14} />
                </button>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatefulPopover
                  placement={PLACEMENT.topLeft}
                  overrides={{ Body: { style: { zIndex: 60 } } }}
                  content={({ close }) => (
                    <MediaPicker
                      onSelect={(m) => {
                        setGif(m);
                        close();
                      }}
                      onClose={close}
                    />
                  )}
                >
                  <button
                    type="button"
                    aria-label="Add a GIF, sticker or clip"
                    className="flex items-center gap-[4px] rounded-full border-none bg-transparent px-[10px] py-[5px] text-[13px] text-[var(--color-text-muted)] cursor-pointer hover:bg-[var(--color-input-background)] hover:text-[var(--color-text)]"
                  >
                    <IconGif size={20} />
                    GIF
                  </button>
                </StatefulPopover>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {message.length}/1000
                </span>
              </div>
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
