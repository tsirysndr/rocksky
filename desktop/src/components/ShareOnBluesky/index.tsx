import { IconShare3 } from "@tabler/icons-react";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { WEB_URL } from "../../consts";
import { GhostLink } from "../PillButton";
import SignInModal from "../SignInModal/SignInModal";

interface Props {
  text: string;
  /** Overrides the shared link; defaults to the current route on the web app. */
  url?: string;
}

export default function ShareOnBluesky({ text, url }: Props) {
  const [signInOpen, setSignInOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const onClick = (e: React.MouseEvent) => {
    if (!localStorage.getItem("did")) {
      e.preventDefault();
      setSignInOpen(true);
    }
  };

  const shareUrl = url || `${WEB_URL}${pathname}`;
  const href = `https://bsky.app/intent/compose?text=${encodeURIComponent(
    `${text}\n${shareUrl}`,
  )}`;

  return (
    <>
      <GhostLink
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
      >
        <IconShare3 size={16} />
        Share on Bluesky
      </GhostLink>
      <SignInModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  );
}
