import {
  IconChartBar,
  IconHome,
  IconSearch,
  IconUser,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { Link, useLocation } from "react-router-dom";
import { nowPlayingAtom } from "../../atoms/nowpaying";

const tabs = [
  { to: "/", icon: IconHome, label: "Home" },
  { to: "/charts", icon: IconChartBar, label: "Charts" },
  { to: "/search", icon: IconSearch, label: "Search" },
  { to: "/me", icon: IconUser, label: "Profile" },
];

export default function BottomNav() {
  const location = useLocation();
  const nowPlaying = useAtomValue(nowPlayingAtom);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {nowPlaying && <div style={{ height: "var(--player-height)" }} />}
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
