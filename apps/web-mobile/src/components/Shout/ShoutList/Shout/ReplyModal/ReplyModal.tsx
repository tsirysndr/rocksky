/* eslint-disable @typescript-eslint/no-explicit-any */
import { PLACEMENT, StatefulPopover } from "baseui/popover";
import { IconGif, IconX } from "@tabler/icons-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { isVideoUrl, type MediaResult } from "../../../../../api/klipy";
import { type Mention, resolveMentionFacets } from "../../../../../lib/richtext";
import { profileAtom } from "../../../../../atoms/profile";
import { shoutsAtom } from "../../../../../atoms/shouts";
import useShout from "../../../../../hooks/useShout";
import MediaPicker from "../../../MediaPicker";
import MentionTextarea from "../../../MentionTextarea";
import RichText from "../../../RichText";

interface ReplyModalProps {
  isOpen: boolean;
  close: () => void;
  shout: {
    uri: string;
    message: string;
    facets?: Mention[];
    user: {
      avatar: string;
      displayName: string;
      handle: string;
    };
  };
}

function ReplyModal({ isOpen, close, shout }: ReplyModalProps) {
  const { reply, getShouts } = useShout();
  const profile = useAtomValue(profileAtom);
  const shouts = useAtomValue(shoutsAtom);
  const setShouts = useSetAtom(shoutsAtom);
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [gif, setGif] = useState<MediaResult | null>(null);

  if (!isOpen) return null;

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

  const onReply = async () => {
    if ((!message.trim() && !gif) || loading) return;
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
    const facets = message.trim() ? await resolveMentionFacets(message) : [];
    await reply(shout.uri, message, gifEmbed, facets.length ? facets : undefined);

    let uri = "";
    if (location.pathname.startsWith("/profile")) uri = `at://${did}`;
    else if (location.pathname.includes("app.rocksky.scrobble")) uri = `at://${did}/app.rocksky.scrobble/${rkey}`;
    else if (location.pathname.includes("app.rocksky.song")) uri = `at://${did}/app.rocksky.song/${rkey}`;
    else if (location.pathname.includes("app.rocksky.album")) uri = `at://${did}/app.rocksky.album/${rkey}`;
    else if (location.pathname.includes("app.rocksky.artist")) uri = `at://${did}/app.rocksky.artist/${rkey}`;

    if (uri) {
      const data = await getShouts(uri);
      setShouts({ ...shouts, [location.pathname]: processShouts(data) });
    }

    setLoading(false);
    setMessage("");
    setGif(null);
    close();
  };

  const canReply = (message.trim() || gif) && !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={close}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full rounded-t-[20px] bg-[var(--color-surface)] px-4 pb-8 pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={close}
            className="border-none bg-transparent p-0 text-sm cursor-pointer text-[var(--color-text-muted)]"
          >
            Cancel
          </button>
          <button
            onClick={onReply}
            disabled={!canReply}
            className={`rounded-full border-none px-[18px] py-1.5 text-sm font-semibold ${canReply ? "cursor-pointer bg-[var(--color-primary)] text-white" : "cursor-default bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"}`}
          >
            {loading ? "Posting..." : "Reply"}
          </button>
        </div>

        {/* Original shout */}
        <div className="mb-4 flex gap-2.5 border-b border-[var(--color-border)] pb-4">
          {shout.user.avatar && (
            <Link to={`/profile/${shout.user.handle}`} onClick={close} className="shrink-0 no-underline">
              <img src={shout.user.avatar} className="block h-9 w-9 rounded-full" />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <p className="mb-[3px] text-[13px] font-semibold text-[var(--color-text)]">
              {shout.user.displayName}
            </p>
            <p className="m-0 text-[13px] leading-snug text-[var(--color-text-muted)]">
              <RichText facets={shout.facets}>{shout.message}</RichText>
            </p>
          </div>
        </div>

        {/* Reply input */}
        <div className="flex gap-2.5">
          {profile?.avatar && (
            <img src={profile.avatar} className="h-9 w-9 shrink-0 rounded-full" />
          )}
          <div className="flex-1">
            <MentionTextarea
              value={message}
              onChange={setMessage}
              autoFocus
              placeholder="Write your reply..."
              maxLength={1000}
              resize="vertical"
              overrides={{
                Root: {
                  style: {
                    border: "none",
                    width: "100%",
                  },
                },
                InputContainer: {
                  style: {
                    border: "none",
                    backgroundColor: "transparent",
                  },
                },
                Input: {
                  style: {
                    border: "none",
                    backgroundColor: "transparent",
                    color: "var(--color-text)",
                    caretColor: "var(--color-primary)",
                    fontFamily: "inherit",
                  },
                },
              }}
            />
          </div>
        </div>
        {gif && (
          <div className="ml-[46px] mt-[10px] relative w-fit max-w-[220px] overflow-hidden rounded-[12px] border border-[var(--color-input-background)]">
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
          <StatefulPopover
            placement={PLACEMENT.topLeft}
            overrides={{ Body: { style: { zIndex: 60 } } }}
            content={({ close: closePopover }) => (
              <MediaPicker
                onSelect={(m) => {
                  setGif(m);
                  closePopover();
                }}
                onClose={closePopover}
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
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {message.length}/1000
          </span>
        </div>
      </div>
    </div>
  );
}

export default ReplyModal;
