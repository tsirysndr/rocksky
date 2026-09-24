import { storeSessionToken } from "../../../shared/browser-session";
import { DURATION, useSnackbar } from "baseui/snackbar";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { nowPlayingAtom } from "../atoms/nowpaying";
import BottomNav from "../components/BottomNav";
import { API_URL } from "../consts";
import useProfile from "../hooks/useProfile";
import Navbar from "./Navbar";

function Main({ children }: { children: React.ReactNode }) {
  const { search } = useLocation();
  const nowPlaying = useAtomValue(nowPlayingAtom);
  const jwt = localStorage.getItem("token");
  const [token, setToken] = useState<string | null>(null);
  const { enqueue } = useSnackbar();

  // The session guard signs the user out on a `pds_session_expired` 401 and
  // lands them here; say why, otherwise the logout looks like a random bug.
  useEffect(() => {
    if (new URLSearchParams(search).get("session") !== "expired") return;
    enqueue(
      {
        message:
          "Your session with your PDS expired. Please sign in again to keep scrobbling.",
      },
      DURATION.long,
    );
  }, [enqueue, search]);

  useEffect(() => {
    const query = new URLSearchParams(search);
    const did = query.get("did");
    if (!did || did === "null") return;
    localStorage.setItem("did", did);
    const fetchToken = async () => {
      try {
        const response = await fetch(`${API_URL}/token`, {
          method: "GET",
          headers: { "session-did": did },
        });
        const data = await response.json();
        storeSessionToken(data.token);
        setToken(data.token);
        if (!jwt && data.token) window.location.href = "/";
      } catch (e) {
        console.error(e);
      }
    };
    fetchToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useProfile(token || localStorage.getItem("token"));

  const bottomPad = nowPlaying
    ? "calc(56px + 72px + env(safe-area-inset-bottom))"
    : "calc(56px + env(safe-area-inset-bottom))";

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <Navbar />
      <main style={{ paddingTop: "56px", paddingBottom: bottomPad }}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

export default Main;
