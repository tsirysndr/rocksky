import styled from "@emotion/styled";
import { ExternalLink } from "@styled-icons/evaicons-solid";
import { Avatar } from "baseui/avatar";
import { Tab, Tabs } from "baseui/tabs-motion";
import { HeadingMedium, LabelLarge } from "baseui/typography";
import dayjs from "dayjs";
import { useAtom, useSetAtom } from "jotai";
import { Key, useEffect, useState } from "react";
import { useParams } from "react-router";
import { profilesAtom } from "../../atoms/profiles";
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
  const [profiles, setProfiles] = useAtom(profilesAtom);
  const [activeKey, setActiveKey] = useState<Key>("0");
  const { did } = useParams<{ did: string }>();
  const setUser = useSetAtom(userAtom);

  useEffect(() => {
    if (!did) {
      return;
    }

    const getProfile = async () => {
      const data = await getProfileByDid(did);
      setUser({
        avatar: data.avatar,
        displayName: data.display_name,
        handle: data.handle,
        spotifyUser: {
          isBeta: data.spotifyUser?.is_beta_user,
        },
        spotifyConnected: data.spotifyConnected,
        did: data.did,
      });
      setProfiles((profiles) => ({
        ...profiles,
        [did]: {
          avatar: data.avatar,
          displayName: data.display_name,
          handle: data.handle,
          spotifyConnected: data.spotifyConnected,
          createdAt: data.xata_createdat,
          did: data.did,
        },
      }));
    };

    getProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);

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
