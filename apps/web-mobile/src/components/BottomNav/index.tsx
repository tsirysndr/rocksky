import {
  IconChartBar,
  IconHome,
  IconSearch,
  IconSparkles,
  IconUser,
  IconVinyl,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { Link, useLocation } from "react-router-dom";
import { profileAtom } from "../../atoms/profile";

export default function BottomNav() {
  const location = useLocation();
  const profile = useAtomValue(profileAtom);
  const jwt = localStorage.getItem("token");

  const baseTabs = [
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
          { to: "/recommendations", icon: IconSparkles, label: "For You" },
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
        {tabs.map(({ to, icon: Icon, label }) => {
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
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
