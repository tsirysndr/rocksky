import styled from "@emotion/styled";
import { ExternalLink } from "@styled-icons/evaicons-solid";
import { useParams, useSearch } from "@tanstack/react-router";
import { Avatar } from "baseui/avatar";
import { Tab, Tabs } from "baseui/tabs-motion";
import { HeadingMedium, LabelLarge } from "baseui/typography";
import dayjs from "dayjs";
import { useAtom, useSetAtom } from "jotai";
import { Key, useEffect, useState } from "react";
import { profilesAtom } from "../../atoms/profiles";
import { userAtom } from "../../atoms/user";
import Shout from "../../components/Shout/Shout";
import { useProfileByDidQuery } from "../../hooks/useProfile";
import Main from "../../layouts/Main";
import Library from "./library";
import LovedTracks from "./lovedtracks";
import Overview from "./overview";
import Playlists from "./playlists";

const Group = styled.div`
  display: flex;
  flex-direction: row;
  margin-top: 20px;
  margin-bottom: 50px;
`;

function Profile() {
  const [profiles, setProfiles] = useAtom(profilesAtom);
  const [activeKey, setActiveKey] = useState<Key>("0");
  const { did } = useParams({ strict: false });
  const profile = useProfileByDidQuery(did!);
  const setUser = useSetAtom(userAtom);
  const { tab } = useSearch({ strict: false });

  useEffect(() => {
    if (!tab) {
      return;
    }

    setActiveKey(1);
  }, [tab]);

  useEffect(() => {
    if (profile.isLoading || profile.isError) {
      return;
    }

    if (!profile.data || !did) {
      return;
    }

    setUser({
      avatar: profile.data.avatar,
      displayName: profile.data.displayName,
      handle: profile.data.handle,
      spotifyUser: {
        isBeta: profile.data.spotifyUser?.isBetaUser,
      },
      spotifyConnected: profile.data.spotifyConnected,
      did: profile.data.did,
    });

    setProfiles((profiles) => ({
      ...profiles,
      [did]: {
        avatar: profile.data.avatar,
        displayName: profile.data.displayName,
        handle: profile.data.handle,
        spotifyConnected: profile.data.spotifyConnected,
        createdAt: profile.data.createdat,
        did,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data, profile.isLoading, profile.isError, did]);

  if (!did) {
    return <></>;
  }

  return (
    <>
      <Main>
        <div className="pb-[100px] pt-[75px]">
          <Group>
            <div className="mr-[20px]">
              <Avatar
                name={profiles[did]?.displayName}
                src={profiles[did]?.avatar}
                size="150px"
              />
            </div>
            <div style={{ marginTop: profiles[did]?.displayName ? 10 : 30 }}>
              <HeadingMedium
                marginTop="0px"
                marginBottom={0}
                className="!text-[var(--color-text)]"
              >
                {profiles[did]?.displayName}
              </HeadingMedium>
              <LabelLarge>
                <a
                  href={`https://bsky.app/profile/${profiles[did]?.handle}`}
                  className="no-underline text-[var(--color-primary)]"
                >
                  @{profiles[did]?.handle}
                </a>
                <span className="text-[var(--color-text-muted)] text-[15px]">
                  {" "}
                  • scrobbling since{" "}
                  {dayjs(profiles[did]?.createdAt).format("DD MMM YYYY")}
                </span>
              </LabelLarge>
              <div className="flex-1 mt-[30px] mr-[10px]">
                <a
                  href={`https://pdsls.dev/at/${profiles[did]?.did}`}
                  target="_blank"
                  className="no-underline text-[var(--color-text)] bg-[var(--color-default-button)] p-[16px] rounded-[10px] pl-[25px] pr-[25px]"
                >
                  <ExternalLink size={24} style={{ marginRight: 10 }} />
                  View on PDSls
                </a>
              </div>
            </div>
          </Group>

          <Tabs
            activeKey={activeKey}
            onChange={({ activeKey }) => {
              setActiveKey(activeKey);
            }}
            overrides={{
              TabHighlight: {
                style: {
                  backgroundColor: "var(--color-purple)",
                },
              },
              TabBorder: {
                style: {
                  display: "none",
                },
              },
            }}
            activateOnFocus
          >
            <Tab
              title="Overview"
              overrides={{
                Tab: {
                  style: {
                    color: "var(--color-text)",
                    backgroundColor: "var(--color-background) !important",
                  },
                },
              }}
            >
              <Overview />
            </Tab>
            <Tab
              title="Library"
              overrides={{
                Tab: {
                  style: {
                    color: "var(--color-text)",
                    backgroundColor: "var(--color-background) !important",
                  },
                },
              }}
            >
              <Library />
            </Tab>
            <Tab
              title="Playlists"
              overrides={{
                Tab: {
                  style: {
                    color: "var(--color-text)",
                    backgroundColor: "var(--color-background) !important",
                  },
                },
              }}
            >
              <Playlists />
            </Tab>
            <Tab
              title="Loved Tracks"
              overrides={{
                Tab: {
                  style: {
                    color: "var(--color-text)",
                    backgroundColor: "var(--color-background) !important",
                  },
                },
              }}
            >
              <LovedTracks />
            </Tab>
            <Tab
              title="Tags"
              overrides={{
                Tab: {
                  style: {
                    color: "var(--color-text)",
                    backgroundColor: "var(--color-background) !important",
                  },
                },
              }}
            ></Tab>
          </Tabs>
          <Shout type="profile" />
        </div>
      </Main>
    </>
  );
}

export default Profile;
