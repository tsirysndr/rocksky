import { IconUser } from "@tabler/icons-react";
import { Avatar } from "baseui/avatar";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { NotificationView } from "../../api/notifications";
import Main from "../../layouts/Main";
import {
  useMarkSeenMutation,
  useNotificationListQuery,
} from "../../hooks/useNotifications";

const VERB: Record<string, string> = {
  like_scrobble: "liked your scrobble",
  follow: "followed you",
  comment_scrobble: "commented on your scrobble",
  comment_profile: "commented on your profile",
  reply: "replied to your comment",
  react_comment: "reacted to your comment",
  mention: "mentioned you",
};

/**
 * Where a notification navigates. Shouts render inline on their subject page,
 * so we turn the subject at-uri into that page's path and, when a shout is
 * involved, tack on a `#shout-<id>` hash that ShoutList scrolls to. Falls back
 * to the actor's profile for subject-less notifications (e.g. follows).
 */
const CONTENT_COLLECTIONS = new Set([
  "app.rocksky.scrobble",
  "app.rocksky.song",
  "app.rocksky.album",
  "app.rocksky.artist",
]);

function notificationTarget(n: NotificationView): string {
  const actor = n.actor;
  const [did, collection, rkey] = (n.subjectUri?.split("at://")[1] ?? "").split(
    "/",
  );
  let path: string;
  if (did && collection && CONTENT_COLLECTIONS.has(collection) && rkey) {
    // "<did>/app.rocksky.<collection>/<rkey>" -> "/<did>/<collection>/<rkey>"
    path = `/${did}/${collection.replace("app.rocksky.", "")}/${rkey}`;
  } else if (did) {
    // Profile subject ("at://<did>" or ".../app.bsky.actor.profile/self").
    path = `/profile/${did}`;
  } else {
    // Subject-less (e.g. follow) — fall back to the actor's profile.
    path = `/profile/${actor?.handle ?? actor?.did ?? ""}`;
  }
  return n.shoutId ? `${path}#shout-${n.shoutId}` : path;
}

const timeAgo = (iso: string): string => {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
};

function NotificationRow({ notification }: { notification: NotificationView }) {
  const actor = notification.actor;
  const name = actor?.displayName || actor?.handle || "Someone";
  const verb = VERB[notification.type] ?? "sent you a notification";
  const isJpegPlaceholder = actor?.avatar?.endsWith("/@jpeg");

  return (
    <Link
      to={notificationTarget(notification)}
      className="flex items-start gap-3 px-4 py-3 no-underline"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      {actor?.avatar && !isJpegPlaceholder ? (
        <Avatar src={actor.avatar} name={name} size="40px" />
      ) : (
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "var(--color-avatar-background)" }}
        >
          <IconUser size={22} color="#fff" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm m-0" style={{ color: "var(--color-text)" }}>
          <b>{name}</b> {verb}
          {notification.shoutContent ? `: "${notification.shoutContent}"` : ""}
        </p>
        <p
          className="text-xs m-0 mt-0.5"
          style={{ color: "var(--color-text-muted)" }}
        >
          {timeAgo(notification.createdAt)}
        </p>
      </div>
    </Link>
  );
}

export default function NotificationsPage() {
  const { data, isLoading } = useNotificationListQuery(true);
  const markSeen = useMarkSeenMutation();

  // Opening the screen marks everything as viewed.
  useEffect(() => {
    markSeen.mutate(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Main>
      <div className="pt-16 pb-24">
        <h1
          className="text-xl font-bold px-4 py-3 m-0"
          style={{ color: "var(--color-text)" }}
        >
          Notifications
        </h1>
        {!isLoading && (!data || data.notifications.length === 0) ? (
          <p
            className="text-center py-16 px-4"
            style={{ color: "var(--color-text-muted)" }}
          >
            No notifications yet
          </p>
        ) : (
          data?.notifications.map((n) => (
            <NotificationRow key={n.id} notification={n} />
          ))
        )}
      </div>
    </Main>
  );
}
