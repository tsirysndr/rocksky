import styled from "@emotion/styled";
import { Avatar } from "baseui/avatar";
import { StatefulMenu } from "baseui/menu";
import { PLACEMENT, StatefulPopover } from "baseui/popover";
import { LabelMedium } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import { Link, useNavigate } from "react-router";
import { profileAtom } from "../../atoms/profile";

const Container = styled.div`
  position: fixed;
  top: 0;
  background-color: #fff;
  width: 1090px;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;

  @media (max-width: 1152px) {
    width: 100%;
    padding: 0 20px;
  }
`;

function Navbar() {
  const setProfile = useSetAtom(profileAtom);
  const profile = useAtomValue(profileAtom);
  const navigate = useNavigate();
  const jwt = localStorage.getItem("token");

  return (
    <Container>
      <div>
        <Link to="/" style={{ textDecoration: "none" }}>
          <h2 style={{ color: "#ff2876" }}>Rocksky</h2>
        </Link>
      </div>

      {profile && jwt && (
        <StatefulPopover
          placement={PLACEMENT.bottomRight}
          overrides={{
            Body: {
              style: {
                zIndex: 2,
                boxShadow: "none",
              },
            },
          }}
          content={({ close }) => (
            <div>
              <StatefulMenu
                items={[
                  {
                    id: "profile",
                    label: <LabelMedium>Profile</LabelMedium>,
                  },
                  {
                    id: "signout",
                    label: <LabelMedium>Sign out</LabelMedium>,
                  },
                ]}
                onItemSelect={({ item }) => {
                  switch (item.id) {
                    case "profile":
                      navigate(`/profile/${profile.handle}`);
                      break;
                    case "signout":
                      setProfile(null);
                      localStorage.removeItem("token");
                      localStorage.removeItem("did");
                      window.location.href = "/";
                      break;
                    default:
                      break;
                  }
                  close();
                }}
                overrides={{
                  List: { style: { width: "200px" } },
                }}
              />
            </div>
          )}
        >
          <button
            style={{
              border: "none",
              backgroundColor: "transparent",
              cursor: "pointer",
            }}
          >
            <Avatar
              src={profile.avatar}
              name={profile.displayName}
              size="scale1200"
            />
          </button>
        </StatefulPopover>
      )}
    </Container>
  );
}

export default Navbar;
