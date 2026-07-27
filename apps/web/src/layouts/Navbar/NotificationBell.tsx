import styled from "@emotion/styled";
import { IconMusic, IconUser } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import BellIcon from "./BellIcon";
import { Avatar } from "baseui/avatar";
import { PLACEMENT, StatefulPopover } from "baseui/popover";
import { useState } from "react";
import type {
  NotificationActor,
  NotificationGroup,
  NotificationView,
} from "../../api/notifications";
import { groupNotifications } from "../../api/notifications";
import {
  useMarkSeenMutation,
  useNotificationListQuery,
  useNotificationStream,
  useUnreadCountQuery,
} from "../../hooks/useNotifications";

const BellButton = styled.button`
  position: relative;
  margin-left: 15px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
`;

const Badge = styled.span`
  position: absolute;
  top: 0;
  right: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #e0245e;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  box-sizing: border-box;
`;

const Dropdown = styled.div`
  width: 360px;
  max-height: 460px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
`;

const DropdownHeader = styled.div`
  padding: 14px 16px;
  font-weight: 700;
  font-size: 16px;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
`;

const EmptyState = styled.div`
  padding: 32px 16px;
  text-align: center;
  color: var(--color-text-muted);
`;

const Row = styled(Link)`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  text-decoration: none;
  border-bottom: 1px solid var(--color-border);

  &:hover {
    background: var(--color-menu-hover);
  }
`;

const RowText = styled.div`
  flex: 1;
  color: var(--color-text);
  font-size: 14px;
`;

const RowTime = styled.div`
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: 12px;
`;

const AvatarFallback = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--color-avatar-background);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const AvatarStack = styled.div`
  display: flex;
  flex-shrink: 0;
`;

const AvatarStackItem = styled.div`
  border-radius: 999px;
  border: 2px solid var(--color-background);

  &:not(:first-of-type) {
    margin-left: -12px;
  }
`;

const SubjectBlock = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
`;

const SubjectArt = styled.img`
  width: 32px;
  height: 32px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
`;

const SubjectArtFallback = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: var(--color-avatar-background);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const SubjectText = styled.div`
  min-width: 0;
  flex: 1;
`;

const SubjectTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const SubjectArtist = styled.div`
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

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

function notificationTarget(n: NotificationView): { to: string; hash?: string } {
  const actor = n.actor;
  const [did, collection, rkey] = (n.subjectUri?.split("at://")[1] ?? "").split(
    "/",
  );
  let to: string;
  if (did && collection && CONTENT_COLLECTIONS.has(collection) && rkey) {
    // "<did>/app.rocksky.<collection>/<rkey>" -> "/<did>/<collection>/<rkey>"
    to = `/${did}/${collection.replace("app.rocksky.", "")}/${rkey}`;
  } else if (did) {
    // Profile subject ("at://<did>" or ".../app.bsky.actor.profile/self").
    to = `/profile/${did}`;
  } else {
    // Subject-less (e.g. follow) — fall back to the actor's profile.
    to = `/profile/${actor?.handle ?? actor?.did ?? ""}`;
  }
  return { to, hash: n.shoutId ? `shout-${n.shoutId}` : undefined };
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
    <Avatar src={actor.avatar} name={actorName(actor)} size="36px" />
  ) : (
    <AvatarFallback>
      <IconUser size={20} color="#fff" />
    </AvatarFallback>
  );
}

/** "A liked", "A and B liked", "A, B and 3 others liked" — names bolded. */
function ActorSummary({ actors, verb }: { actors: NotificationActor[]; verb: string }) {
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

function NotificationRow({
  group,
  onNavigate,
}: {
  group: NotificationGroup;
  onNavigate: () => void;
}) {
  const verb = VERB[group.type] ?? "sent you a notification";
  const { latest } = group;
  const { to, hash } = notificationTarget(latest);
  const avatars = group.actors.slice(0, 3);
  const subject = latest.subject;

  return (
    <Row to={to} hash={hash} onClick={onNavigate}>
      {avatars.length > 1 ? (
        <AvatarStack>
          {avatars.map((a, i) => (
            <AvatarStackItem key={i} style={{ zIndex: avatars.length - i }}>
              <ActorAvatar actor={a} />
            </AvatarStackItem>
          ))}
        </AvatarStack>
      ) : (
        <ActorAvatar actor={group.actors[0] ?? {}} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <RowText>
          <ActorSummary actors={group.actors} verb={verb} />
          {latest.shoutContent ? `: "${latest.shoutContent}"` : ""}
        </RowText>
        {subject && (subject.title || subject.albumArt) ? (
          <SubjectBlock>
            {subject.albumArt ? (
              <SubjectArt src={subject.albumArt} alt="" />
            ) : (
              <SubjectArtFallback>
                <IconMusic size={16} color="var(--color-text-muted)" />
              </SubjectArtFallback>
            )}
            <SubjectText>
              {subject.title ? <SubjectTitle>{subject.title}</SubjectTitle> : null}
              {subject.artist ? (
                <SubjectArtist>{subject.artist}</SubjectArtist>
              ) : null}
            </SubjectText>
          </SubjectBlock>
        ) : null}
        <RowTime>{timeAgo(latest.createdAt)}</RowTime>
      </div>
    </Row>
  );
}

function NotificationBell() {
  const [opened, setOpened] = useState(false);
  useNotificationStream();
  const { data: unreadCount = 0 } = useUnreadCountQuery();
  const { data: list } = useNotificationListQuery(opened);
  const markSeen = useMarkSeenMutation();

  return (
    <StatefulPopover
      placement={PLACEMENT.bottomRight}
      dismissOnClickOutside
      dismissOnEsc
      onOpen={() => {
        setOpened(true);
        if (unreadCount > 0) {
          markSeen.mutate(undefined);
        }
      }}
      overrides={{
        Body: {
          style: {
            zIndex: 2,
            backgroundColor: "var(--color-background)",
          },
        },
        Inner: {
          style: {
            backgroundColor: "var(--color-background)",
          },
        },
      }}
      content={({ close }) => (
        <Dropdown>
          <DropdownHeader>Notifications</DropdownHeader>
          {!list || list.notifications.length === 0 ? (
            <EmptyState>No notifications yet</EmptyState>
          ) : (
            groupNotifications(list.notifications).map((g) => (
              <NotificationRow key={g.key} group={g} onNavigate={close} />
            ))
          )}
        </Dropdown>
      )}
    >
      <BellButton aria-label="Notifications">
        <BellIcon size={24} color="var(--color-text)" />
        {unreadCount > 0 && (
          <Badge>{unreadCount > 99 ? "99+" : unreadCount}</Badge>
        )}
      </BellButton>
    </StatefulPopover>
  );
}

export default NotificationBell;
