import {
  IconChartBar,
  IconHome,
  IconSearch,
  IconUser,
  IconVinyl,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { useAtomValue } from "jotai";
import { Link, useLocation } from "react-router-dom";
import { profileAtom } from "../../atoms/profile";
import BellIcon from "../BellIcon";
import {
  useNotificationStream,
  useUnreadCountQuery,
} from "../../hooks/useNotifications";

type NavTab = {
  to: string;
  // Accepts both @tabler/icons-react and @styled-icons components.
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  badge?: number;
};

export default function BottomNav() {
  const location = useLocation();
  const profile = useAtomValue(profileAtom);
  const jwt = localStorage.getItem("token");

  // BottomNav is mounted on every screen, so it's the natural home for the
  // live notification subscription that keeps the badge up to date app-wide.
  useNotificationStream();
  const { data: unreadCount = 0 } = useUnreadCountQuery();

  const baseTabs: NavTab[] = [
    { to: "/", icon: IconHome, label: "Home" },
    { to: "/charts", icon: IconChartBar, label: "Charts" },
    { to: "/search", icon: IconSearch, label: "Search" },
    { to: "/library", icon: IconVinyl, label: "Library" },
    { to: "/me", icon: IconUser, label: "Profile" },
  ];

  const tabs =
    profile && jwt
      ? [
          baseTabs[0],
          {
            to: "/notifications",
            icon: BellIcon,
            label: "Alerts",
            badge: unreadCount,
          },
          baseTabs[1],
          baseTabs[2],
          baseTabs[3],
          baseTabs[4],
        ]
      : baseTabs;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex h-14">
        {tabs.map(({ to, icon: Icon, label, badge }) => {
          const active =
            to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 no-underline"
              style={{ color: active ? "var(--color-primary)" : "var(--color-text-muted)" }}
            >
              <span className="relative flex items-center justify-center">
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                {typeof badge === "number" && badge > 0 && (
                  <span
                    className="absolute flex items-center justify-center rounded-full font-bold text-white"
                    style={{
                      top: "-6px",
                      left: "12px",
                      minWidth: "16px",
                      height: "16px",
                      padding: "0 4px",
                      fontSize: "10px",
                      lineHeight: "16px",
                      backgroundColor: "#e0245e",
                    }}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
