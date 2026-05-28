import { IconUser } from "@tabler/icons-react";
import { Avatar } from "baseui/avatar";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { Link } from "react-router-dom";
import { profileAtom } from "../../atoms/profile";
import SignInModal from "../../components/SignInModal";

function Navbar() {
  const setProfile = useSetAtom(profileAtom);
  const profile = useAtomValue(profileAtom);
  const jwt = localStorage.getItem("token");
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const onLogout = () => {
    setProfile(null);
    localStorage.removeItem("token");
    localStorage.removeItem("did");
    window.location.href = "/";
  };

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-40 flex items-center px-4 h-14"
        style={{
          backgroundColor: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <Link to="/" className="flex items-center gap-1.5 no-underline">
          <span className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Rocksky</span>
        </Link>

        <div className="flex-1" />

        {profile && jwt ? (
          <button
            onClick={() => setMenuOpen(true)}
            className="border-none bg-transparent cursor-pointer p-1"
          >
            {!profile.avatar?.endsWith("/@jpeg") ? (
              <Avatar src={profile.avatar} name={profile.displayName} size="32px" />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "var(--color-avatar-background)" }}
              >
                <IconUser size={16} color="#fff" />
              </div>
            )}
          </button>
        ) : (
          <button
            onClick={() => setIsSignInOpen(true)}
            className="text-sm font-semibold px-4 py-1.5 rounded-full border-none cursor-pointer"
            style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}
          >
            Sign in
          </button>
        )}
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          onClick={() => setMenuOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative rounded-t-2xl p-6 pb-10"
            style={{ backgroundColor: "var(--color-surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-6" style={{ backgroundColor: "var(--color-border)" }} />

            <div className="flex items-center gap-3 mb-6">
              {!profile?.avatar?.endsWith("/@jpeg") ? (
                <Avatar src={profile?.avatar} name={profile?.displayName} size="56px" />
              ) : (
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--color-avatar-background)" }}>
                  <IconUser size={28} color="#fff" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-base m-0 truncate" style={{ color: "var(--color-text)" }}>{profile?.displayName}</p>
                <a
                  href={`https://bsky.app/profile/${profile?.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm no-underline"
                  style={{ color: "var(--color-primary)" }}
                >
                  @{profile?.handle}
                </a>
              </div>
            </div>

            <div className="flex flex-col">
              {profile && (
                <Link
                  to={`/profile/${profile.handle}`}
                  className="py-3.5 px-2 no-underline font-medium text-base block"
                  style={{ color: "var(--color-text)" }}
                  onClick={() => setMenuOpen(false)}
                >
                  My Profile
                </Link>
              )}
              <Link
                to="/wrapped"
                className="py-3.5 px-2 no-underline font-medium text-base block"
                style={{ color: "var(--color-text)" }}
                onClick={() => setMenuOpen(false)}
              >
                Wrapped
              </Link>
              <Link
                to="/apikeys"
                className="py-3.5 px-2 no-underline font-medium text-base block"
                style={{ color: "var(--color-text)" }}
                onClick={() => setMenuOpen(false)}
              >
                API Keys
              </Link>
              {profile?.did === "did:plc:7vdlgi2bflelz7mmuxoqjfcr" && (
                <Link
                  to="/storage"
                  className="py-3.5 px-2 no-underline font-medium text-base block"
                  style={{ color: "var(--color-text)" }}
                  onClick={() => setMenuOpen(false)}
                >
                  Storage
                </Link>
              )}
              <button
                onClick={onLogout}
                className="py-3.5 px-2 border-none bg-transparent cursor-pointer text-base font-medium text-left w-full"
                style={{ color: "var(--color-primary)" }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <SignInModal isOpen={isSignInOpen} onClose={() => setIsSignInOpen(false)} />
    </>
  );
}

export default Navbar;
