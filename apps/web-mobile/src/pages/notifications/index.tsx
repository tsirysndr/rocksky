import { IconMusic, IconUser } from "@tabler/icons-react";
import { Avatar } from "baseui/avatar";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import type {
  NotificationActor,
  NotificationGroup,
  NotificationView,
} from "../../api/notifications";
import { groupNotifications } from "../../api/notifications";
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

const actorName = (a: NotificationActor): string =>
  a.displayName || a.handle || "Someone";

function ActorAvatar({ actor }: { actor: NotificationActor }) {
  const isJpegPlaceholder = actor.avatar?.endsWith("/@jpeg");
  return actor.avatar && !isJpegPlaceholder ? (
    <Avatar src={actor.avatar} name={actorName(actor)} size="40px" />
  ) : (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: "var(--color-avatar-background)" }}
    >
      <IconUser size={22} color="#fff" />
    </div>
  );
}

/** "A liked", "A and B liked", "A, B and 3 others liked" — names bolded. */
function ActorSummary({
  actors,
  verb,
}: {
  actors: NotificationActor[];
  verb: string;
}) {
  if (actors.length === 0) return <>Someone {verb}</>;
  if (actors.length === 1) {
    return (
      <>
        <b>{actorName(actors[0])}</b> {verb}
      </>
    );
  }
  if (actors.length === 2) {
    return (
      <>
        <b>{actorName(actors[0])}</b> and <b>{actorName(actors[1])}</b> {verb}
      </>
    );
  }
  const others = actors.length - 2;
  return (
    <>
      <b>{actorName(actors[0])}</b>, <b>{actorName(actors[1])}</b> and {others}{" "}
      {others === 1 ? "other" : "others"} {verb}
    </>
  );
}

function NotificationRow({ group }: { group: NotificationGroup }) {
  const verb = VERB[group.type] ?? "sent you a notification";
  const { latest } = group;
  const avatars = group.actors.slice(0, 3);
  const subject = latest.subject;

  return (
    <Link
      to={notificationTarget(latest)}
      className="flex items-start gap-3 px-4 py-3 no-underline"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      {avatars.length > 1 ? (
        <div className="flex flex-shrink-0">
          {avatars.map((a, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                marginLeft: i === 0 ? 0 : -14,
                border: "2px solid var(--color-background)",
                zIndex: avatars.length - i,
              }}
            >
              <ActorAvatar actor={a} />
            </div>
          ))}
        </div>
      ) : (
        <ActorAvatar actor={group.actors[0] ?? {}} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm m-0" style={{ color: "var(--color-text)" }}>
          <ActorSummary actors={group.actors} verb={verb} />
          {latest.shoutContent ? `: "${latest.shoutContent}"` : ""}
        </p>
        {subject && (subject.title || subject.albumArt) ? (
          <div
            className="flex items-center gap-2 mt-1.5 p-1.5 rounded-md"
            style={{ border: "1px solid var(--color-border)" }}
          >
            {subject.albumArt ? (
              <img
                src={subject.albumArt}
                alt=""
                className="w-9 h-9 rounded object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--color-avatar-background)" }}
              >
                <IconMusic size={18} color="var(--color-text-muted)" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              {subject.title ? (
                <p
                  className="text-sm font-semibold m-0 truncate"
                  style={{ color: "var(--color-text)" }}
                >
                  {subject.title}
                </p>
              ) : null}
              {subject.artist ? (
                <p
                  className="text-xs m-0 truncate"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {subject.artist}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        <p
          className="text-xs m-0 mt-0.5"
          style={{
            color: "var(--color-text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {timeAgo(latest.createdAt)}
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
          groupNotifications(data?.notifications ?? []).map((g) => (
            <NotificationRow key={g.key} group={g} />
          ))
        )}
      </div>
    </Main>
  );
}
