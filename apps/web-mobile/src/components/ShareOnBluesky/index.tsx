import { useState } from "react";
import { IconShare3 } from "@tabler/icons-react";
import SignInModal from "../SignInModal/SignInModal";

interface Props {
  text: string;
  className?: string;
  variant?: "full" | "pill";
}

export default function ShareOnBluesky({ text, className = "", variant = "full" }: Props) {
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
      {variant === "pill" ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className={`flex items-center gap-1.5 px-5 py-2 rounded-full no-underline font-semibold text-sm !text-white ${className}`}
          style={{ backgroundColor: "var(--color-surface-2)", color: "#fff" }}
        >
          <IconShare3 size={14} />
          Share
        </a>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className={`flex items-center justify-center gap-2 py-3 rounded-2xl no-underline font-semibold text-sm !text-white ${className}`}
          style={{ backgroundColor: "var(--color-surface-2)", color: "#fff" }}
        >
          <IconShare3 size={16} />
          Share on Bluesky
        </a>
      )}
      <SignInModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  );
}
