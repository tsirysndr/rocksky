import { useState } from "react";
import { IconX } from "@tabler/icons-react";

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function SignInModal({ isOpen, onClose }: SignInModalProps) {
  const [handle, setHandle] = useState("");

  if (!isOpen) return null;

  const onLogin = () => {
    if (!handle.trim()) return;
    onClose();
    window.location.href = `https://rocksky.pages.dev/loading?handle=${handle}`;
  };

  const onCreateAccount = () => {
    onClose();
    window.location.href = "https://rocksky.pages.dev/loading?prompt=create";
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onLogin();
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Sheet */}
      <div
        className="relative w-full rounded-t-3xl px-6 pt-6 pb-10"
        style={{ backgroundColor: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="w-10 h-1 rounded-full mx-auto mb-6" style={{ backgroundColor: "var(--color-border)" }} />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 border-none bg-transparent cursor-pointer p-1"
        >
          <IconX size={20} style={{ color: "var(--color-text-muted)" }} />
        </button>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center m-0 mb-1" style={{ color: "var(--color-primary)" }}>
          Rocksky
        </h2>
        <p className="text-sm text-center mb-6 m-0" style={{ color: "var(--color-text-muted)" }}>
          Sign in to join the conversation
        </p>

        {/* Handle input */}
        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--color-text-muted)" }}>
          Handle
        </label>
        <div
          className="flex items-center rounded-xl overflow-hidden mb-4"
          style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
        >
          <span className="px-3 text-sm" style={{ color: "var(--color-text-muted)" }}>@</span>
          <input
            type="text"
            placeholder="username.bsky.social"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            className="flex-1 py-3 pr-3 bg-transparent border-none outline-none text-sm"
            style={{ color: "var(--color-text)" }}
          />
        </div>

        {/* Sign in button */}
        <button
          onClick={onLogin}
          className="w-full py-3 rounded-xl font-semibold text-sm border-none cursor-pointer mb-5"
          style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}
        >
          Sign In
        </button>

        {/* Sign up link */}
        <p className="text-xs text-center m-0" style={{ color: "var(--color-text-muted)" }}>
          Don't have an atproto handle yet?{" "}
          You can create one at{" "}
          <span
            onClick={onCreateAccount}
            className="no-underline font-semibold cursor-pointer"
            style={{ color: "var(--color-primary)" }}
          >
            selfhosted.social
          </span>
          ,{" "}
          <a
            href="https://bsky.app"
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            Bluesky
          </a>
          {" "}or any other AT Protocol service.
        </p>
      </div>
    </div>
  );
}

export default SignInModal;
