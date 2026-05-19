import { useAtomValue } from "jotai";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { nowPlayingAtom } from "../atoms/nowpaying";
import SignInModal from "./SignInModal";

interface FloatingShoutBarProps {
  uri: string;
  type: "song" | "album" | "artist" | "profile" | "scrobble";
  title?: string;
}

export default function FloatingShoutBar({ uri, type, title }: FloatingShoutBarProps) {
  const navigate = useNavigate();
  const nowPlaying = useAtomValue(nowPlayingAtom);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const bottomClass = nowPlaying
    ? "bottom-[calc(56px+72px+env(safe-area-inset-bottom))]"
    : "bottom-[calc(56px+env(safe-area-inset-bottom))]";

  const handleClick = () => {
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }
    navigate("/shout-editor", { state: { uri, type, title } });
  };

  return (
    <>
      <div className={`fixed left-0 right-0 z-20 pointer-events-none px-4 py-2 ${bottomClass}`}>
        <div
          onClick={handleClick}
          className="flex cursor-pointer items-center gap-2 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-[10px] shadow-[0_4px_16px_rgba(0,0,0,0.4)] pointer-events-auto"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="flex-1 text-sm text-[var(--color-text-muted)]">
            Add a shout...
          </span>
        </div>
      </div>
      <SignInModal isOpen={isSignInOpen} onClose={() => setIsSignInOpen(false)} />
    </>
  );
}
