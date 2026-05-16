import { useState } from "react";
import { IconShare3 } from "@tabler/icons-react";
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
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="no-underline bg-[var(--color-default-button)] rounded-[10px] p-[16px] pl-[25px] pr-[25px] ml-[10px] inline-flex items-center gap-[10px]"
        style={{ color: "var(--color-text)" }}
      >
        <IconShare3 size={20} />
        Share on Bluesky
      </a>
      <SignInModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  );
}
