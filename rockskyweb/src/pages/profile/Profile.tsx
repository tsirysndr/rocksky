import styled from "@emotion/styled";
import { Avatar } from "baseui/avatar";
import { Tab, Tabs } from "baseui/tabs-motion";
import { HeadingMedium, LabelLarge } from "baseui/typography";
import { useAtomValue } from "jotai";
import { Key, useState } from "react";
import { profileAtom } from "../../atoms/profile";
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
  const profile = useAtomValue(profileAtom);
  const [activeKey, setActiveKey] = useState<Key>("0");

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
