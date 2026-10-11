import { useState, type ElementType } from "react";
import { useAtomValue } from "jotai";
import { Link, useLocation } from "react-router-dom";
import { profileAtom } from "../../atoms/profile";
import BellIcon from "../BellIcon";
import {
  useNotificationStream,
  useUnreadCountQuery,
} from "../../hooks/useNotifications";
import { HomeIcon, LibraryIcon, ProfileIcon, SearchIcon } from "./TabIcons";
import "./style.css";

type NavTab = { to: string; icon: ElementType; label: string; badge?: number };

export default function BottomNav() {
  const { pathname } = useLocation();
  const profile = useAtomValue(profileAtom);
  const jwt = localStorage.getItem("token");
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const avatar =
    jwt &&
    profile?.avatar &&
    !profile.avatar.endsWith("/@jpeg") &&
    profile.avatar !== failedAvatar
      ? profile.avatar
      : undefined;
  useNotificationStream();
  const { data: unreadCount = 0 } = useUnreadCountQuery();
  const tabs: NavTab[] = [
    { to: "/", icon: HomeIcon, label: "Home" },
    {
      to: "/notifications",
      icon: BellIcon,
      label: "Alerts",
      badge: jwt ? unreadCount : 0,
    },
    { to: "/library", icon: LibraryIcon, label: "Library" },
    { to: "/search", icon: SearchIcon, label: "Search" },
    { to: "/me", icon: ProfileIcon, label: "Profile" },
  ];
  const ownProfile =
    profile &&
    [profile.handle, profile.did].some(
      (id) =>
        id &&
        (pathname === `/profile/${id}` ||
          pathname === `/profile/${encodeURIComponent(id)}`),
    );
  return (
    <nav className="mobile-bottom-nav" aria-label="Main navigation">
      <div className="mobile-bottom-tabs">
        {tabs.map(({ to, icon: Icon, label, badge }) => {
          const active =
            to === "/"
              ? pathname === "/"
              : to === "/me"
                ? pathname === "/me" || !!ownProfile
                : pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              to={to}
              className="mobile-bottom-tab"
              aria-label={label}
              aria-current={active ? "page" : undefined}
            >
              <span className="mobile-tab-icon">
                {to === "/me" && avatar ? (
                  <span className="mobile-tab-avatar">
                    <img
                      src={avatar}
                      alt=""
                      width="28"
                      height="28"
                      onError={() => setFailedAvatar(avatar)}
                    />
                  </span>
                ) : (
                  <Icon size={28} />
                )}
                {typeof badge === "number" && badge > 0 && (
                  <span
                    className="mobile-tab-badge"
                    aria-label={`${badge} unread notifications`}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
