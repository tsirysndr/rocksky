import styled from "@emotion/styled";
import { ExternalLink } from "@styled-icons/evaicons-solid";
import { useParams, useSearch } from "@tanstack/react-router";
import { Avatar } from "baseui/avatar";
import { Tab, Tabs } from "baseui/tabs-motion";
import { HeadingMedium, LabelLarge } from "baseui/typography";
import dayjs from "dayjs";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import _ from "lodash";
import { useEffect, useMemo, useState } from "react";
import { profilesAtom } from "../../atoms/profiles";
import { profileAtom } from "../../atoms/profile";
import { userAtom } from "../../atoms/user";
import Shout from "../../components/Shout/Shout";
import {
  useProfileByDidQuery,
  useProfileStatsByDidQuery,
} from "../../hooks/useProfile";
import { NewUserGuide, OnboardingModal } from "../../components/Onboarding";
import Main from "../../layouts/Main";
import Library from "./library";
import LovedTracks from "./lovedtracks";
import Overview from "./overview";
import Playlists from "./playlists";
import { Button } from "baseui/button";
import { IconPlus, IconCheck, IconUser } from "@tabler/icons-react";
import { followsAtom } from "../../atoms/follows";
import SignInModal from "../../components/SignInModal";
import {
  useFollowAccountMutation,
  useFollowersQuery,
  useUnfollowAccountMutation,
} from "../../hooks/useGraph";
import Follows from "./follows";
import Followers from "./followers";
import { useProfileActiveTab } from "../../atoms/tab";
import Circles from "./circles";
import TopTrack from "./toptrack";
import { useArtistsQuery } from "../../hooks/useLibrary";
import { getLastDays } from "../../lib/date";
import { Link } from "@tanstack/react-router";
import ContentLoader from "react-content-loader";
import { PillLink } from "../../components/PillButton";
import ShareOnBluesky from "../../components/ShareOnBluesky";
import NowPlayingBar from "../../components/NowPlayingBar";

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
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [profiles, setProfiles] = useAtom(profilesAtom);
  const { did } = useParams({ strict: false });
  const profile = useProfileByDidQuery(did!);
  const [activeKey, setActiveKey] = useProfileActiveTab(profile.data?.did || did);
  const setUser = useSetAtom(userAtom);
  const { tab } = useSearch({ strict: false });
  const [range, setRange] = useState<[Date, Date] | []>(getLastDays(7));
  const { data: artists } = useArtistsQuery(did!, 0, 100, ...range);
  const { mutate: followAccount } = useFollowAccountMutation();
  const { mutate: unfollowAccount } = useUnfollowAccountMutation();
  const currentDid = localStorage.getItem("did");
  const loggedInProfile = useAtomValue(profileAtom);
  const profileStats = useProfileStatsByDidQuery(did!);
  // "My own profile" — match against the stored did OR the logged-in profile
  // (did/handle), since localStorage "did" is not always set for a session.
  const isOwnProfile =
    !!profile.data?.did &&
    (profile.data.did === currentDid ||
      profile.data.did === loggedInProfile?.did ||
      (!!loggedInProfile?.handle &&
        profile.data.handle === loggedInProfile.handle));
  const isNewUser =
    isOwnProfile &&
    profileStats.data !== undefined &&
    (profileStats.data?.scrobbles ?? 0) === 0;
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

  // A route that targets a specific tab (/profile/$did/library, ...) wins;
  // otherwise keep whatever tab was last selected for this profile.
  useEffect(() => {
    if (!props.activeKey) {
      return;
    }
    setActiveKey(props.activeKey.split("/")[0]);
  }, [props.activeKey, setActiveKey]);

  useEffect(() => {
    if (!data || isLoading) {
      return;
    }
    setFollows((prev) => {
      const newSet = new Set(prev);
      if (!profile.data) return newSet;
      if (
        data.followers.some((follower) => follower.did === currentDid)
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

  // Auto-open the onboarding modal once for a brand-new user (empty profile).
  const ownerId = currentDid || loggedInProfile?.did || profile.data?.did;
  useEffect(() => {
    if (!isNewUser || !ownerId) {
      return;
    }
    const seenKey = `rocksky:onboarding-seen:${ownerId}`;
    if (localStorage.getItem(seenKey)) {
      return;
    }
    setIsOnboardingOpen(true);
    localStorage.setItem(seenKey, "1");
  }, [isNewUser, ownerId]);

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
          {profile.isLoading && (
            <ContentLoader
              width="100%"
              height={200}
              viewBox="0 0 800 200"
              backgroundColor="var(--color-skeleton-background)"
              foregroundColor="var(--color-skeleton-foreground)"
            >
              {/* Avatar circle */}
              <circle cx="75" cy="75" r="75" />
              {/* Display name */}
              <rect x="180" y="30" rx="4" ry="4" width="250" height="24" />
              {/* Handle */}
              <rect x="180" y="70" rx="3" ry="3" width="180" height="16" />
              {/* Scrobbling since text */}
              <rect x="370" y="70" rx="3" ry="3" width="200" height="16" />
              {/* View on PDSls button */}
              <rect x="180" y="120" rx="8" ry="8" width="180" height="48" />
              {/* Follow button */}
              <rect x="680" y="30" rx="20" ry="20" width="120" height="40" />
            </ContentLoader>
          )}
          {!profile.isLoading && (
            <Group>
              <ProfileInfo>
                <div className="mr-[20px]">
                  {!profiles[did]?.avatar?.endsWith("/@jpeg") && (
                    <Avatar
                      name={profiles[did]?.displayName}
                      src={profiles[did]?.avatar}
                      size="150px"
                    />
                  )}
                  {profiles[did]?.avatar?.endsWith("/@jpeg") && (
                    <div className="w-[150px] h-[150px] rounded-full bg-[var(--color-avatar-background)] flex items-center justify-center">
                      <IconUser size={80} color="#fff" />
                    </div>
                  )}
                </div>
                <div
                  style={{ marginTop: profiles[did]?.displayName ? 10 : 30 }}
                >
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
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      @{profiles[did]?.handle}
                    </a>
                    <span className="text-[var(--color-text-muted)] text-[15px]">
                      {" "}
                      • scrobbling since{" "}
                      <span style={{ fontFamily: "var(--font-mono)" }}>
                        {dayjs(profiles[did]?.createdAt).format("DD MMM YYYY")}
                      </span>
                    </span>
                  </LabelLarge>
                  <div className="flex items-center gap-[12px] mt-[20px]">
                    <PillLink
                      href={`https://pdsls.dev/at/${profiles[did]?.did}`}
                      target="_blank"
                    >
                      <ExternalLink size={16} />
                      View on PDSls
                    </PillLink>
                    <ShareOnBluesky
                      text={`Check out ${profiles[did]?.displayName || profiles[did]?.handle}'s music taste on Rocksky 🎵\n${window.location.href}`}
                    />
                  </div>
                </div>
              </ProfileInfo>
              {!isOwnProfile && (
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
          )}
          {tags.length > 0 && (
            <div className="mt-[30px] mb-[35px] flex flex-wrap">
              {tags.map((genre) => (
                <Link
                  to={`/genre/${genre}` as string}
                  className="mr-[15px] mb-[5px] text-[var(--color-genre)] text-[13px] whitespace-nowrap no-underline"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  # {genre}
                </Link>
              ))}
            </div>
          )}
          {!profile.isLoading && (
            <NowPlayingBar did={profiles[did]?.did || did} />
          )}

          <div className="mt-[20px] flex justify-end">
            <TopTrack />
          </div>
        </div>

        {isNewUser ? (
          <NewUserGuide
            displayName={
              profiles[did]?.displayName || profile.data?.displayName
            }
            onShowSteps={() => setIsOnboardingOpen(true)}
          />
        ) : (
          <>
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
                  activeKey={_.get(props, "activeKey", "").split("/")[1]}
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
          </>
        )}
      </div>
      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        follow
      />
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        displayName={profiles[did]?.displayName || profile.data?.displayName}
      />
    </Main>
  );
}

export default Profile;
