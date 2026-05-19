/* eslint-disable @typescript-eslint/no-explicit-any */
import { useAtomValue, useSetAtom } from "jotai";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { profileAtom } from "../../../../../atoms/profile";
import { shoutsAtom } from "../../../../../atoms/shouts";
import useShout from "../../../../../hooks/useShout";

interface ReplyModalProps {
  isOpen: boolean;
  close: () => void;
  shout: {
    uri: string;
    message: string;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (!message.trim() || loading) return;
    setLoading(true);
    await reply(shout.uri, message);

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
    close();
  };

  const canReply = message.trim() && !loading;

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
              {shout.message}
            </p>
          </div>
        </div>

        {/* Reply input */}
        <div className="flex gap-2.5">
          {profile?.avatar && (
            <img src={profile.avatar} className="h-9 w-9 shrink-0 rounded-full" />
          )}
          <textarea
            ref={textareaRef}
            autoFocus
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your reply..."
            maxLength={1000}
            className="min-h-[80px] flex-1 resize-none border-none bg-transparent font-[inherit] text-sm leading-relaxed outline-none text-[var(--color-text)]"
          />
        </div>
        <div className="mt-1 text-right text-[11px] text-[var(--color-text-muted)]">
          {message.length}/1000
        </div>
      </div>
    </div>
  );
}

export default ReplyModal;
