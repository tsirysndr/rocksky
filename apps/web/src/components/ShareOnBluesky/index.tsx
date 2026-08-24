import { IconShare3 } from "@tabler/icons-react";
import { useState } from "react";
import { GhostLink } from "../PillButton";
import SignInModal from "../SignInModal/SignInModal";

interface Props {
  text: string;
}

export default function ShareOnBluesky({ text }: Props) {
  const [signInOpen, setSignInOpen] = useState(false);

  const onClick = (e: React.MouseEvent) => {
    if (!localStorage.getItem("did")) {
      e.preventDefault();
      setSignInOpen(true);
    }
  };

  const href = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;

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
