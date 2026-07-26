import styled from "@emotion/styled";
import { IconUser } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import BellIcon from "./BellIcon";
import { Avatar } from "baseui/avatar";
import { PLACEMENT, Popover } from "baseui/popover";
import { useState } from "react";
import type { NotificationView } from "../../api/notifications";
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

const VERB: Record<string, string> = {
  like_scrobble: "liked your scrobble",
  follow: "followed you",
  comment_scrobble: "commented on your scrobble",
  comment_profile: "commented on your profile",
  reply: "replied to your comment",
  react_comment: "reacted to your comment",
};

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

function NotificationRow({
  notification,
  onNavigate,
}: {
  notification: NotificationView;
  onNavigate: () => void;
}) {
  const actor = notification.actor;
  const name = actor?.displayName || actor?.handle || "Someone";
  const verb = VERB[notification.type] ?? "sent you a notification";
  const isJpegPlaceholder = actor?.avatar?.endsWith("/@jpeg");

  return (
    <Row
      to="/profile/$did"
      params={{ did: actor?.handle ?? actor?.did ?? "" }}
      onClick={onNavigate}
    >
      {actor?.avatar && !isJpegPlaceholder ? (
        <Avatar src={actor.avatar} name={name} size="36px" />
      ) : (
        <AvatarFallback>
          <IconUser size={20} color="#fff" />
        </AvatarFallback>
      )}
      <div style={{ flex: 1 }}>
        <RowText>
          <b>{name}</b> {verb}
          {notification.shoutContent ? `: "${notification.shoutContent}"` : ""}
        </RowText>
        <RowTime>{timeAgo(notification.createdAt)}</RowTime>
      </div>
    </Row>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  useNotificationStream();
  const { data: unreadCount = 0 } = useUnreadCountQuery();
  const { data: list } = useNotificationListQuery(open);
  const markSeen = useMarkSeenMutation();

  const handleOpen = () => {
    setOpen(true);
    if (unreadCount > 0) {
      markSeen.mutate(undefined);
    }
  };

  return (
    <Popover
      isOpen={open}
      onClickOutside={() => setOpen(false)}
      onEsc={() => setOpen(false)}
      placement={PLACEMENT.bottomRight}
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
      content={() => (
        <Dropdown>
          <DropdownHeader>Notifications</DropdownHeader>
          {!list || list.notifications.length === 0 ? (
            <EmptyState>No notifications yet</EmptyState>
          ) : (
            list.notifications.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onNavigate={() => setOpen(false)}
              />
            ))
          )}
        </Dropdown>
      )}
    >
      <BellButton
        onClick={() => (open ? setOpen(false) : handleOpen())}
        aria-label="Notifications"
      >
        <BellIcon size={24} color="var(--color-text)" />
        {unreadCount > 0 && (
          <Badge>{unreadCount > 99 ? "99+" : unreadCount}</Badge>
        )}
      </BellButton>
    </Popover>
  );
}

export default NotificationBell;
