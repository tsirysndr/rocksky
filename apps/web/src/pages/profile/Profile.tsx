import styled from "@emotion/styled";
import { ExternalLink } from "@styled-icons/evaicons-solid";
import { useParams, useSearch } from "@tanstack/react-router";
import { Avatar } from "baseui/avatar";
import { Tab, Tabs } from "baseui/tabs-motion";
import { HeadingMedium, LabelLarge } from "baseui/typography";
import dayjs from "dayjs";
import { useAtom, useSetAtom } from "jotai";
import _ from "lodash";
import { useEffect, useMemo, useState } from "react";
import { profilesAtom } from "../../atoms/profiles";
import { userAtom } from "../../atoms/user";
import Shout from "../../components/Shout/Shout";
import { useProfileByDidQuery } from "../../hooks/useProfile";
import Main from "../../layouts/Main";
import Library from "./library";
import LovedTracks from "./lovedtracks";
import Overview from "./overview";
import Playlists from "./playlists";
import { Button } from "baseui/button";
import { IconPlus, IconCheck } from "@tabler/icons-react";
import { followsAtom } from "../../atoms/follows";
import SignInModal from "../../components/SignInModal";
import {
  useFollowAccountMutation,
  useFollowersQuery,
  useUnfollowAccountMutation,
} from "../../hooks/useGraph";
import Follows from "./follows";
import Followers from "./followers";
import { activeTabAtom } from "../../atoms/tab";
import Circles from "./circles";
import TopTrack from "./toptrack";
import { useArtistsQuery } from "../../hooks/useLibrary";
import { getLastDays } from "../../lib/date";
import { Link } from "@tanstack/react-router";

const Group = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  margin-top: 20px;
`;

const ProfileInfo = styled.div`
  display: flex;
  flex-direction: row;
  flex: 1;
`;

export type ProfileProps = {
  activeKey?: string;
};

function Profile(props: ProfileProps) {
  const [follows, setFollows] = useAtom(followsAtom);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [profiles, setProfiles] = useAtom(profilesAtom);
  const [activeKey, setActiveKey] = useAtom(activeTabAtom);
  const { did } = useParams({ strict: false });
  const profile = useProfileByDidQuery(did!);
  const setUser = useSetAtom(userAtom);
  const { tab } = useSearch({ strict: false });
  const [range, setRange] = useState<[Date, Date] | []>(getLastDays(7));
  const { data: artists } = useArtistsQuery(did!, 0, 100, ...range);
  const { mutate: followAccount } = useFollowAccountMutation();
  const { mutate: unfollowAccount } = useUnfollowAccountMutation();
  const currentDid = localStorage.getItem("did");
  const { data, isLoading } = useFollowersQuery(
    profile.data?.did,
    1,
    currentDid ? [currentDid] : undefined,
  );
  const tags = useMemo(() => {
    if (!artists) {
      return [];
    }

    if (artists.length === 0) {
      setRange([]);
    }

    return Array.from(
      new Set(
        artists
          .filter((x) => x.tags)
          .map((x) => x.tags)
          .flat(),
      ),
    ).slice(0, 20);
  }, [artists]);

  const onFollow = () => {
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }

    if (!profile.data) return;

    setFollows((prev) => new Set(prev).add(profile.data.did));
    followAccount(profile.data.did);
  };

  const onUnfollow = () => {
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }
    if (!profile.data) return;

    setFollows((prev) => {
      const newSet = new Set(prev);
      newSet.delete(profile.data.did);
      return newSet;
    });
    unfollowAccount(profile.data.did);
  };

  useEffect(() => {
    if (!props.activeKey) {
      setActiveKey("0");
      return;
    }
    setActiveKey(_.get(props, "activeKey", "0").split("/")[0]);
  }, [props.activeKey, setActiveKey, props]);

  useEffect(() => {
    if (!data || isLoading) {
      return;
    }
    setFollows((prev) => {
      const newSet = new Set(prev);
      if (!profile.data) return newSet;
      if (
        data.followers.some(
          (follower: { did: string }) => follower.did === currentDid,
        )
      ) {
        newSet.add(profile.data.did);
      } else {
        newSet.delete(profile.data.did);
      }
      return newSet;
    });
  }, [
    data,
    isLoading,
    currentDid,
    setFollows,
    profile.data?.did,
    profile.data,
  ]);

  useEffect(() => {
    if (tab === undefined) {
      return;
    }

    setActiveKey(1);
  }, [tab, setActiveKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <reason>want to run only on profile.data changes</reason>
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
        createdAt: profile.data.createdAt,
        did,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data, profile.isLoading, profile.isError, did]);

  if (!did) {
    return;
  }

  return (
    <Main>
      <div className="pb-[100px] pt-[75px]">
        <div className="mb-[50px]">
          <Group>
            <ProfileInfo>
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
                    target="_blank"
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
            </ProfileInfo>
            {(profile.data?.did !== localStorage.getItem("did") ||
              !localStorage.getItem("did")) && (
              <>
                {!follows.has(profile.data?.did || "") && !isLoading && (
                  <Button
                    shape="pill"
                    size="compact"
                    startEnhancer={<IconPlus size={18} />}
                    onClick={onFollow}
                    overrides={{
                      BaseButton: {
                        style: {
                          marginTop: "12px",
                          minWidth: "120px",
                          backgroundColor: "#ff2876",
                          ":hover": {
                            backgroundColor: "#ff2876",
                          },
                          ":focus": {
                            backgroundColor: "#ff2876",
                          },
                        },
                      },
                    }}
                  >
                    Follow
                  </Button>
                )}
                {follows.has(profile.data?.did || "") && !isLoading && (
                  <Button
                    shape="pill"
                    size="compact"
                    startEnhancer={<IconCheck size={18} />}
                    onClick={onUnfollow}
                    overrides={{
                      BaseButton: {
                        style: {
                          marginTop: "12px",
                          minWidth: "120px",
                          backgroundColor: "var(--color-default-button)",
                          color: "var(--color-text)",
                          ":hover": {
                            backgroundColor: "var(--color-default-button)",
                          },
                          ":focus": {
                            backgroundColor: "var(--color-default-button)",
                          },
                        },
                      },
                    }}
                  >
                    Following
                  </Button>
                )}
              </>
            )}
          </Group>
          {tags.length > 0 && (
            <div className="mt-[30px] mb-[35px] flex flex-wrap">
              {tags.map((genre) => (
                <Link
                  to={`/genre/${genre}` as string}
                  className="mr-[15px] mb-[5px] text-[var(--color-genre)] text-[13px] whitespace-nowrap no-underline"
                  style={{ fontFamily: "RockfordSansRegular" }}
                >
                  # {genre}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-[20px] flex justify-end">
            <TopTrack />
          </div>
        </div>

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
            <Library
              activeKey={_.get(props, "activeKey", "0").split("/")[1] || "0"}
            />
          </Tab>
          <Tab
            title="Followers"
            overrides={{
              Tab: {
                style: {
                  color: "var(--color-text)",
                  backgroundColor: "var(--color-background) !important",
                },
              },
            }}
          >
            <Followers />
          </Tab>
          <Tab
            title="Following"
            overrides={{
              Tab: {
                style: {
                  color: "var(--color-text)",
                  backgroundColor: "var(--color-background) !important",
                },
              },
            }}
          >
            <Follows />
          </Tab>
          <Tab
            title="Circles"
            overrides={{
              Tab: {
                style: {
                  color: "var(--color-text)",
                  backgroundColor: "var(--color-background) !important",
                },
              },
            }}
          >
            <Circles />
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
        </Tabs>
        <Shout type="profile" />
      </div>
      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        follow
      />
    </Main>
  );
}

export default Profile;
