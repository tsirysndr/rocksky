import styled from "@emotion/styled";
import { Copy } from "@styled-icons/ionicons-outline";
import { useQuery } from "@tanstack/react-query";
import { Avatar } from "baseui/avatar";
import { NestedMenus, StatefulMenu } from "baseui/menu";
import { Modal, ModalBody, ModalHeader } from "baseui/modal";
import { PLACEMENT, StatefulPopover } from "baseui/popover";
import { DURATION, useSnackbar } from "baseui/snackbar";
import { StatefulTooltip } from "baseui/tooltip";
import { LabelMedium } from "baseui/typography";
import copy from "copy-to-clipboard";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { profileAtom } from "../../atoms/profile";
import { API_URL } from "../../consts";

const Container = styled.div`
  position: fixed;
  top: 0;
  background-color: #fff;
  width: 1090px;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 80px;

  @media (max-width: 1152px) {
    width: 100%;
    padding: 0 20px;
  }
`;

export const Code = styled.div`
  background-color: #000;
  color: #fff;
  padding: 5px;
  display: inline-block;
  border-radius: 5px;
`;

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const setProfile = useSetAtom(profileAtom);
  const profile = useAtomValue(profileAtom);
  const navigate = useNavigate();
  const jwt = localStorage.getItem("token");
  const { enqueue } = useSnackbar();

  const { data } = useQuery({
    queryKey: ["webscrobbler"],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/webscrobbler`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      });
      return response.json();
    },
  });

  const webscrobblerWebhook = useMemo(() => {
    if (data) {
      return `https://webscrobbler.rocksky.app/${data.uuid}`;
    }
    return "";
  }, [data]);

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

  const close = () => {
    setIsOpen(false);
  };

  return (
    <Container>
      <div>
        <Link to="/" style={{ textDecoration: "none" }}>
          <h2 className="text-[#ff2876] text-[26px] font-bold">Rocksky</h2>
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
            <NestedMenus>
              <StatefulMenu
                items={[
                  {
                    id: "profile",
                    label: <LabelMedium>Profile</LabelMedium>,
                  },
                  {
                    id: "api-applications",
                    label: <LabelMedium>API Applications</LabelMedium>,
                  },
                  {
                    id: "webscrobbler",
                    label: <LabelMedium>Web Scrobbler</LabelMedium>,
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
                    case "api-applications":
                      navigate("/apikeys");
                      break;
                    case "signout":
                      setProfile(null);
                      localStorage.removeItem("token");
                      localStorage.removeItem("did");
                      window.location.href = "/";
                      break;
                    case "webscrobbler":
                      setIsOpen(true);
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
            </NestedMenus>
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

      <Modal
        onClose={close}
        isOpen={isOpen}
        overrides={{
          Root: {
            style: {
              zIndex: 1,
            },
          },
        }}
        size={650}
      >
        <ModalHeader>Setup Web Scrobbler</ModalHeader>
        <ModalBody>
          <LabelMedium>
            To use the Web Scrobbler, you need to install the browser extension
            and connect it to Rocksky.
          </LabelMedium>
          <div className="mt-[20px]">
            <a
              href="https://web-scrobbler.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "rgb(255, 40, 118)",
              }}
            >
              Install Web Scrobbler
            </a>
          </div>
          <div style={{ marginTop: 20 }}>
            <LabelMedium>
              After installing the extension, add the following URL to the
              extension settings as a custom API URL:
            </LabelMedium>
            <Code className="mt-[15px]">{webscrobblerWebhook}</Code>
            <StatefulTooltip content="Copy API Key">
              <Copy
                onClick={() => copy(webscrobblerWebhook)}
                size={18}
                color="#000000a0"
                style={{ marginLeft: 5, cursor: "pointer" }}
              />
            </StatefulTooltip>
          </div>
        </ModalBody>
      </Modal>
    </Container>
  );
}

export default Navbar;
