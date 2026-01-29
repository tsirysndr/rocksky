import styled from "@emotion/styled";
import { Copy } from "@styled-icons/ionicons-outline";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Avatar } from "baseui/avatar";
import { Checkbox, LABEL_PLACEMENT, STYLE_TYPE } from "baseui/checkbox";
import { NestedMenus, StatefulMenu } from "baseui/menu";
import { Modal, ModalBody, ModalHeader } from "baseui/modal";
import { PLACEMENT, StatefulPopover } from "baseui/popover";
import { DURATION, useSnackbar } from "baseui/snackbar";
import { StatefulTooltip } from "baseui/tooltip";
import { LabelMedium } from "baseui/typography";
import copy from "copy-to-clipboard";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import * as R from "ramda";
import { useEffect, useMemo, useState } from "react";
import { profileAtom } from "../../atoms/profile";
import { themeAtom } from "../../atoms/theme";
import { API_URL } from "../../consts";
import { useProfileStatsByDidQuery } from "../../hooks/useProfile";
import LogoDark from "../../assets/rocksky-logo-dark.png";
import LogoLight from "../../assets/rocksky-logo-light.png";
import { IconUser } from "@tabler/icons-react";

const Container = styled.div`
  position: fixed;
  top: 0;
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

const AnimatedLink = styled.span`
  position: relative;
  display: inline-block;
  cursor: pointer;

  &::after {
    content: "";
    position: absolute;
    bottom: -6px;
    left: 0;
    width: 0;
    height: 2px;
    background-color: var(--color-text);
    transition: width 0.3s ease;
  }

  &:hover::after {
    width: 100%;
  }
`;

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [{ darkMode }, setTheme] = useAtom(themeAtom);
  const setProfile = useSetAtom(profileAtom);
  const profile = useAtomValue(profileAtom);
  const navigate = useNavigate();
  const jwt = localStorage.getItem("token");
  const { enqueue } = useSnackbar();
  const profileStats = useProfileStatsByDidQuery(
    R.propOr(undefined, "did", profile),
  );

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

  const [tooltipContent, setTooltipContent] = useState("Copy API Key");

  const handleCopyClick = () => {
    copy(webscrobblerWebhook);

    setTooltipContent("Copied!");

    setTimeout(() => {
      setTooltipContent("Copy API Key");
    }, 1500);
  };

  useEffect(() => {
    if (profile?.spotifyConnected && !!localStorage.getItem("spotify")) {
      localStorage.removeItem("spotify");
      enqueue(
        {
          message: "Spotify account connected successfully!",
        },
        DURATION.long,
      );
    }
  }, [enqueue, profile]);

  const close = () => {
    setIsOpen(false);
  };

  return (
    <Container className="bg-[var(--color-background)] text-[var(--color-text)]">
      <div className="flex">
        <Link to="/" style={{ textDecoration: "none" }}>
          <img
            src={darkMode ? LogoDark : LogoLight}
            className="max-h-[25px] max-w-[30px] mr-[5px] mt-[28px]"
          />
        </Link>
        <Link to="/" style={{ textDecoration: "none" }}>
          <h2 className="text-[var(--color-text)] text-[26px] font-bold">
            Rocksky
          </h2>
        </Link>
      </div>
      <div className="flex-1"></div>
      <div>
        <Link
          to="/charts"
          className="text-[var(--color-text)] text-[16px] opacity-90 hover:opacity-100"
          style={{ textDecoration: "none" }}
        >
          <AnimatedLink>
            <b>Charts</b>
          </AnimatedLink>
        </Link>
      </div>

      {profile && jwt && (
        <StatefulPopover
          placement={PLACEMENT.bottomRight}
          overrides={{
            Body: {
              style: {
                zIndex: 2,
                backgroundColor: "var(--color-background)",
                width: "282px",
              },
            },
          }}
          content={({ close }) => (
            <div className="border-[var(--color-border)] border-[1px] pt-[20px] pb-[20px] bg-[var(--color-background)] rounded-[6px]">
              <div>
                <div className="flex items-center justify-center bg-[var(--color-background)] pl-[20px] pr-[20px]">
                  <div className="flex flex-col items-center">
                    <div className="mb-[5px]">
                      <Link to="/profile/$did" params={{ did: profile.handle }}>
                        {!profile?.avatar?.endsWith("/@jpeg") && (
                          <Avatar
                            src={profile.avatar}
                            name={profile.displayName}
                            size="80px"
                          />
                        )}
                        {profile?.avatar?.endsWith("/@jpeg") && (
                          <div className="w-[80px] h-[80px] rounded-full bg-[var(--color-avatar-background)] flex items-center justify-center">
                            <IconUser size={40} color="#fff" />
                          </div>
                        )}
                      </Link>
                    </div>

                    <Link
                      to="/profile/$did"
                      params={{ did: profile.handle }}
                      className="no-underline"
                    >
                      <LabelMedium className="text-center text-[20px] !text-[var(--color-text)]">
                        {profile.displayName}
                      </LabelMedium>
                    </Link>
                    <a
                      href={`https://bsky.app/profile/${profile.handle}`}
                      target="_blank"
                      className="no-underline"
                    >
                      <LabelMedium
                        color="var(--color-primary)"
                        className="text-center"
                      >
                        @{profile.handle}
                      </LabelMedium>
                    </a>

                    <div className="flex flex-row mt-[5px]">
                      <LabelMedium
                        margin={0}
                        color="var(--color-text-muted)"
                        className="text-center !mr-[5px]"
                      >
                        {numeral(profileStats?.data?.scrobbles).format("0,0")}
                      </LabelMedium>
                      <LabelMedium color="var(--color-text-muted)">
                        scrobbles
                      </LabelMedium>
                    </div>
                  </div>
                </div>
              </div>
              <NestedMenus>
                <StatefulMenu
                  items={[
                    {
                      id: "api-applications",
                      label: (
                        <LabelMedium className="!text-[var(--color-text)]">
                          API Applications
                        </LabelMedium>
                      ),
                    },
                    {
                      id: "webscrobbler",
                      label: (
                        <LabelMedium className="!text-[var(--color-text)]">
                          Web Scrobbler
                        </LabelMedium>
                      ),
                    },
                    {
                      id: "dark-mode",
                      label: (
                        <div className="flex flex-row items-center">
                          <LabelMedium className="!text-[var(--color-text)] flex-1">
                            Dark Mode
                          </LabelMedium>
                          <Checkbox
                            checked={darkMode}
                            checkmarkType={STYLE_TYPE.toggle_round}
                            onChange={(e) => {
                              setTheme({
                                darkMode: e.target.checked,
                              });
                              localStorage.setItem(
                                "darkMode",
                                e.target.checked ? "true" : "false",
                              );
                            }}
                            labelPlacement={LABEL_PLACEMENT.right}
                            overrides={{
                              Toggle: {
                                style: {
                                  backgroundColor: "#fff",
                                },
                              },
                              ToggleTrack: {
                                style: {
                                  backgroundColor: "var(--color-toggle-track)",
                                },
                              },
                            }}
                          />
                        </div>
                      ),
                    },
                    {
                      id: "signout",
                      label: (
                        <LabelMedium className="!text-[var(--color-text)]">
                          Sign out
                        </LabelMedium>
                      ),
                    },
                  ]}
                  onItemSelect={({ item }) => {
                    switch (item.id) {
                      case "profile":
                        navigate({
                          to: "/profile/$did",
                          params: { did: profile.handle },
                        });
                        break;
                      case "api-applications":
                        navigate({
                          to: "/apikeys",
                        });
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
                      case "dark-mode":
                        return;
                      default:
                        break;
                    }
                    close();
                  }}
                  overrides={{
                    List: {
                      style: {
                        boxShadow: "none",
                        backgroundColor: "var(--color-background)",
                      },
                    },
                    Option: {
                      style: {
                        height: "44px",
                      },
                    },
                    ListItem: {
                      style: ({ $isHighlighted }) => ({
                        backgroundColor: $isHighlighted
                          ? "var(--color-menu-hover)"
                          : "var(--color-background)",
                        color: "var(--color-text)",
                      }),
                    },
                  }}
                />
              </NestedMenus>
            </div>
          )}
        >
          <button className="ml-[15px] border-none bg-transparent cursor-pointer">
            {!profile?.avatar?.endsWith("/@jpeg") && (
              <Avatar
                src={profile.avatar}
                name={profile.displayName}
                size="scale1200"
              />
            )}
            {profile?.avatar?.endsWith("/@jpeg") && (
              <div className="w-[48px] h-[48px] rounded-full bg-[var(--color-avatar-background)] flex items-center justify-center">
                <IconUser size={24} color="#fff" />
              </div>
            )}
          </button>
        </StatefulPopover>
      )}

      <Modal
        onClose={close}
        isOpen={isOpen}
        overrides={{
          Root: {
            style: {
              zIndex: 50,
            },
          },
          Dialog: {
            style: {
              backgroundColor: "var(--color-background)",
            },
          },
          Close: {
            style: {
              color: "var(--color-text)",
              ":hover": {
                color: "var(--color-text)",
                opacity: 0.8,
              },
            },
          },
        }}
        size={650}
      >
        <ModalHeader className="!text-[var(--color-text)]">
          Setup Web Scrobbler
        </ModalHeader>
        <ModalBody>
          <LabelMedium className="!text-[var(--color-text)]">
            To use the Web Scrobbler, you need to install the browser extension
            and connect it to Rocksky.
          </LabelMedium>
          <div className="mt-[20px]">
            <a
              href="https://github.com/web-scrobbler/web-scrobbler"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-primary)]"
            >
              Install Web Scrobbler
            </a>
          </div>
          <div className="mt-[20px]">
            <LabelMedium className="!text-[var(--color-text)]">
              After installing the extension, add the following URL to the
              extension settings as a custom API URL:
            </LabelMedium>
            <Code className="mt-[15px]">{webscrobblerWebhook}</Code>
            <StatefulTooltip
              content={tooltipContent}
              overrides={{
                Body: {
                  style: {
                    zIndex: 2,
                  },
                },
              }}
            >
              <Copy
                onClick={handleCopyClick}
                size={18}
                color="var(--color-text)"
                className="ml-[5px] cursor-pointer"
              />
            </StatefulTooltip>
          </div>
        </ModalBody>
      </Modal>
    </Container>
  );
}

export default Navbar;
