import styled from "@emotion/styled";
import { Avatar } from "baseui/avatar";
import { Tab, Tabs } from "baseui/tabs-motion";
import { HeadingMedium, LabelLarge } from "baseui/typography";
import dayjs from "dayjs";
import { Key, useEffect, useState } from "react";
import { useParams } from "react-router";
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
    };

    getProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);

  return (
    <>
      <Main>
        <div style={{ paddingBottom: 100, paddingTop: 75 }}>
          <Group>
            <div style={{ marginRight: 20 }}>
              <Avatar
                name={profile?.displayName}
                src={profile?.avatar}
                size="150px"
              />
            </div>
            <div>
              <HeadingMedium marginBottom={0}>
                {profile?.displayName}
              </HeadingMedium>
              <LabelLarge>
                <a
                  href={`https://bsky.app/profile/${profile?.handle}`}
                  style={{
                    textDecoration: "none",
                    color: "#ff2876",
                  }}
                >
                  @{profile?.handle}
                </a>
                <span style={{ color: "#42576ca6", fontSize: "15px" }}>
                  {" "}
                  • scrobbling since{" "}
                  {dayjs(profile?.createdAt).format("DD MMM YYYY")}
                </span>
              </LabelLarge>
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
        </div>
      </Main>
    </>
  );
}

export default Profile;
