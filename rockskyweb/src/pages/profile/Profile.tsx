import styled from "@emotion/styled";
import { ExternalLink } from "@styled-icons/evaicons-solid";
import { Avatar } from "baseui/avatar";
import { Tab, Tabs } from "baseui/tabs-motion";
import { HeadingMedium, LabelLarge } from "baseui/typography";
import dayjs from "dayjs";
import { useAtom, useSetAtom } from "jotai";
import { Key, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
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
  const { did } = useParams<{ did: string }>();
  const profile = useProfileByDidQuery(did!);
  const setUser = useSetAtom(userAtom);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");

    if (!tab) {
      return;
    }

    setActiveKey(1);
  }, [searchParams]);

  useEffect(() => {
    if (profile.isLoading || profile.isError) {
      return;
    }

    if (!profile.data || !did) {
      return;
    }

    setUser({
      avatar: profile.data.avatar,
      displayName: profile.data.display_name,
      handle: profile.data.handle,
      spotifyUser: {
        isBeta: profile.data.spotifyUser?.is_beta_user,
      },
      spotifyConnected: profile.data.spotifyConnected,
      did: profile.data.did,
    });

    setProfiles((profiles) => ({
      ...profiles,
      [did]: {
        avatar: profile.data.avatar,
        displayName: profile.data.display_name,
        handle: profile.data.handle,
        spotifyConnected: profile.data.spotifyConnected,
        createdAt: profile.data.xata_createdat,
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
        <div style={{ paddingBottom: 100, paddingTop: 75 }}>
          <Group>
            <div style={{ marginRight: 20 }}>
              <Avatar
                name={profiles[did]?.displayName}
                src={profiles[did]?.avatar}
                size="150px"
              />
            </div>
            <div style={{ marginTop: profiles[did]?.displayName ? 10 : 30 }}>
              <HeadingMedium marginTop="0px" marginBottom={0}>
                {profiles[did]?.displayName}
              </HeadingMedium>
              <LabelLarge>
                <a
                  href={`https://bsky.app/profile/${profiles[did]?.handle}`}
                  style={{
                    textDecoration: "none",
                    color: "#ff2876",
                  }}
                >
                  @{profiles[did]?.handle}
                </a>
                <span style={{ color: "#42576ca6", fontSize: "15px" }}>
                  {" "}
                  • scrobbling since{" "}
                  {dayjs(profiles[did]?.createdAt).format("DD MMM YYYY")}
                </span>
              </LabelLarge>
              <div
                style={{
                  marginTop: 30,
                  flex: 1,
                  marginRight: 10,
                }}
              >
                <a
                  href={`https://pdsls.dev/at/${profiles[did]?.did}`}
                  target="_blank"
                  style={{
                    color: "#000",
                    textDecoration: "none",
                    padding: 16,
                    backgroundColor: "rgba(0, 0, 0, 0.05)",
                    fontWeight: 600,
                    borderRadius: 10,
                    paddingLeft: 25,
                    paddingRight: 25,
                  }}
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
            activateOnFocus
          >
            <Tab title="Overview">
              <Overview />
            </Tab>
            <Tab title="Library">
              <Library />
            </Tab>
            <Tab title="Playlists">
              <Playlists />
            </Tab>
            <Tab title="Loved Tracks">
              <LovedTracks />
            </Tab>
            <Tab title="Tags"></Tab>
          </Tabs>
          <Shout type="profile" />
        </div>
      </Main>
    </>
  );
}

export default Profile;
