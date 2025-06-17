import styled from "@emotion/styled";
import { Avatar } from "baseui/avatar";
import { Tab, Tabs } from "baseui/tabs-motion";
import { HeadingMedium, LabelLarge } from "baseui/typography";
import dayjs from "dayjs";
import { useSetAtom } from "jotai";
import { Key, useEffect, useState } from "react";
import { useParams } from "react-router";
import { userAtom } from "../../atoms/user";
import Shout from "../../components/Shout/Shout";
import useProfile from "../../hooks/useProfile";
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
  const { getProfileByDid } = useProfile();
  const [profile, setProfile] = useState<{
    handle: string;
    avatar: string;
    displayName: string;
    createdAt: string;
  } | null>(null);
  const [activeKey, setActiveKey] = useState<Key>("0");
  const { did } = useParams<{ did: string }>();
  const setUser = useSetAtom(userAtom);

  useEffect(() => {
    if (!did) {
      return;
    }

    const getProfile = async () => {
      const data = await getProfileByDid(did);
      setProfile({
        avatar: data.avatar,
        displayName: data.display_name,
        handle: data.handle,
        createdAt: data.xata_createdat,
      });
      setUser({
        avatar: data.avatar,
        displayName: data.displayName,
        handle: data.handle,
        spotifyUser: {
          isBeta: data.spotifyUser?.is_beta_user,
        },
        spotifyConnected: data.spotifyConnected,
      });
    };

    getProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);

  return (
    <>
      <Main>
        <div
          style={{
            paddingBottom: 100,
            paddingTop: 75,
            paddingLeft: 25,
            paddingRight: 25,
            maxWidth: "90vw",
            overflowX: "hidden",
          }}
        >
          <Group style={{ paddingLeft: "15px", paddingRight: "15px" }}>
            <div style={{ marginRight: 20 }}>
              <Avatar
                name={profile?.displayName}
                src={profile?.avatar}
                size="100px"
              />
            </div>
            <div>
              <HeadingMedium marginBottom={0} marginTop="8px">
                {profile?.displayName}
              </HeadingMedium>
              <LabelLarge>
                <div>
                  <a
                    href={`https://bsky.app/profile/${profile?.handle}`}
                    style={{
                      textDecoration: "none",
                      color: "#ff2876",
                    }}
                  >
                    @{profile?.handle}
                  </a>
                </div>
                <div>
                  <span style={{ color: "#42576ca6", fontSize: "15px" }}>
                    {" "}
                    scrobbling since{" "}
                    {dayjs(profile?.createdAt).format("DD MMM YYYY")}
                  </span>
                </div>
              </LabelLarge>
            </div>
          </Group>
          <div style={{ maxWidth: "95vw" }}>
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
            </Tabs>
          </div>
          <Shout type="profile" />
        </div>
      </Main>
    </>
  );
}

export default Profile;
