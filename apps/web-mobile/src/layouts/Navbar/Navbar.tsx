import styled from "@emotion/styled";
import { DURATION, useSnackbar } from "baseui/snackbar";
import { LabelMedium } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { profileAtom } from "../../atoms/profile";
import SignInModal from "../../components/SignInModal";

const Container = styled.div`
  position: fixed;
  top: 0;
  background-color: #fff;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  max-width: 770px;
  width: 100vw;
  align-items: center;
  margin-right: 20px;
  padding-left: 20px;
`;

function Navbar() {
  const setProfile = useSetAtom(profileAtom);
  const profile = useAtomValue(profileAtom);
  const jwt = localStorage.getItem("token");
  const { enqueue } = useSnackbar();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (profile?.spotifyConnected && !!localStorage.getItem("spotify")) {
      localStorage.removeItem("spotify");
      enqueue(
        {
          message: "Spotify account connected successfully!",
        },
        DURATION.long
      );
    }
  }, [enqueue, profile]);

  const onLogout = () => {
    setProfile(null);
    localStorage.removeItem("token");
    localStorage.removeItem("did");
    window.location.href = "/";
  };

  return (
    <Container>
      <div>
        <Link to="/" style={{ textDecoration: "none" }}>
          <h2 style={{ color: "#ff2876" }}>Rocksky</h2>
        </Link>
      </div>

      {(!profile || !jwt) && (
        <LabelMedium
          onClick={() => setIsOpen(true)}
          style={{ marginRight: 40, color: "#ff2876" }}
        >
          Sign In
        </LabelMedium>
      )}
      {profile && jwt && (
        <LabelMedium
          onClick={onLogout}
          style={{ marginRight: 40, color: "#ff2876" }}
        >
          Log Out
        </LabelMedium>
      )}
      <SignInModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </Container>
  );
}

export default Navbar;
