import { Link } from "@tanstack/react-router";
import { Avatar } from "baseui/avatar";
import { Block } from "baseui/block";
import { StatefulPopover, TRIGGER_TYPE } from "baseui/popover";
import { LabelMedium, LabelSmall } from "baseui/typography";
import { useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { profilesAtom } from "../../atoms/profiles";
import { statsAtom } from "../../atoms/stats";
import {
  useProfileByDidQuery,
  useProfileStatsByDidQuery,
} from "../../hooks/useProfile";
import Stats from "../Stats";
import NowPlaying from "./NowPlaying";
import { followsAtom } from "../../atoms/follows";
import { IconCheck, IconPlus, IconUser } from "@tabler/icons-react";
import { Button } from "baseui/button";
import SignInModal from "../SignInModal";
import {
  useFollowAccountMutation,
  useFollowersQuery,
  useUnfollowAccountMutation,
} from "../../hooks/useGraph";
import { getLastDays } from "../../lib/date";
import { useArtistsQuery } from "../../hooks/useLibrary";

export type HandleProps = {
  link: string;
  did: string;
};

function Handle(props: HandleProps) {
  const [follows, setFollows] = useAtom(followsAtom);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const { link, did } = props;
  const [profiles, setProfiles] = useAtom(profilesAtom);
  const profile = useProfileByDidQuery(did);
  const profileStats = useProfileStatsByDidQuery(did);
  const [stats, setStats] = useAtom(statsAtom);
  const { mutate: followAccount } = useFollowAccountMutation();
  const { mutate: unfollowAccount } = useUnfollowAccountMutation();
  const [range, setRange] = useState<[Date, Date] | []>(getLastDays(7));
  const { data: artists } = useArtistsQuery(did, 0, 100, ...range);
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
    ).slice(0, 10);
  }, [artists]);

  const onFollow = () => {
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }
    if (!profile.data?.did) {
      return;
    }
    setFollows((prev) => new Set(prev).add(profile.data?.did));
    followAccount(profile.data?.did);
  };

  const onUnfollow = () => {
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }
    if (!profile.data?.did) {
      return;
    }

    setFollows((prev) => {
      if (!profile.data?.did) {
        return prev;
      }
      const newSet = new Set(prev);
      newSet.delete(profile.data?.did);
      return newSet;
    });
    unfollowAccount(profile.data?.did);
  };

  useEffect(() => {
    if (!data || isLoading) {
      return;
    }
    setFollows((prev) => {
      const newSet = new Set(prev);
      if (!profile.data?.did) {
        return newSet;
      }
      if (
        data.followers.some(
          (follower: { did: string }) => follower.did === currentDid,
        )
      ) {
        newSet.add(profile.data?.did);
      } else {
        newSet.delete(profile.data?.did);
      }
      return newSet;
    });
  }, [data, isLoading, currentDid, setFollows, profile.data?.did]);

  useEffect(() => {
    if (profile.isLoading || profile.isError) {
      return;
    }

    if (!profile.data || !did) {
      return;
    }

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

  useEffect(() => {
    if (profileStats.isLoading || profileStats.isError) {
      return;
    }

    if (!profileStats.data || !did) {
      return;
    }

    setStats((prev) => ({
      ...prev,
      [did]: {
        scrobbles: profileStats.data.scrobbles,
        artists: profileStats.data.artists,
        lovedTracks: profileStats.data.lovedTracks,
        albums: profileStats.data.albums,
        tracks: profileStats.data.tracks,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileStats.data, profileStats.isLoading, profileStats.isError, did]);

  return (
    <>
      <StatefulPopover
        content={() => (
          <Block className="!bg-[var(--color-background)] !text-[var(--color-text)] p-[15px] w-[480px] rounded-[6px] border-[1px] border-[var(--color-border)]">
            <div className="flex flex-row items-start justify-between">
              <div className="flex flex-row items-center">
                <Link to={link} className="no-underline">
                  {!profiles[did]?.avatar.endsWith("/@jpeg") && (
                    <Avatar
                      src={profiles[did]?.avatar}
                      name={profiles[did]?.displayName}
                      size={"60px"}
                    />
                  )}
                  {profiles[did]?.avatar.endsWith("/@jpeg") && (
                    <div className="w-[60px] h-[60px] rounded-full bg-[var(--color-avatar-background)] flex items-center justify-center">
                      <IconUser size={30} color="#fff" />
                    </div>
                  )}
                </Link>
                <div className="ml-[16px]">
                  <Link to={link} className="no-underline">
                    <LabelMedium
                      marginTop={"10px"}
                      className="!text-[var(--color-text)]"
                    >
                      {profiles[did]?.displayName}
                    </LabelMedium>
                  </Link>
                  <a
                    href={`https://bsky.app/profile/${profiles[did]?.handle}`}
                    className="no-underline text-[var(--color-primary)]"
                    target="_blank"
                  >
                    <LabelSmall className="!text-[var(--color-primary)] mt-[3px] mb-[25px]">
                      @{did}
                    </LabelSmall>
                  </a>
                </div>
              </div>

              {(profile.data?.did !== localStorage.getItem("did") ||
                !localStorage.getItem("did")) && (
                <div className="ml-auto mt-[10px]">
                  {!follows.has(profile.data?.did || "") && !isLoading && (
                    <Button
                      shape="pill"
                      size="mini"
                      startEnhancer={<IconPlus size={16} />}
                      onClick={onFollow}
                      overrides={{
                        BaseButton: {
                          style: {
                            minWidth: "90px",
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
                      size="mini"
                      startEnhancer={<IconCheck size={16} />}
                      onClick={onUnfollow}
                      overrides={{
                        BaseButton: {
                          style: {
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
                </div>
              )}
            </div>

            {tags.length > 0 && (
              <div className="mt-[5px] flex flex-wrap gap-y-[2px]">
                {tags.map((genre) => (
                  <Link
                    to={`/genre/${genre}` as string}
                    className="mr-[15px] text-[var(--color-genre)] text-[13px] whitespace-nowrap no-underline"
                    style={{ fontFamily: "RockfordSansRegular" }}
                  >
                    # {genre}
                  </Link>
                ))}
              </div>
            )}

            {stats[did] && <Stats stats={stats[did]} mb={1} />}

            <NowPlaying did={did} />
          </Block>
        )}
        triggerType={TRIGGER_TYPE.hover}
        autoFocus={false}
        focusLock={false}
        overrides={{
          Body: {
            style: {
              zIndex: 60,
            },
          },
        }}
      >
        <Link to={link} className="no-underline">
          <LabelMedium className="!text-[var(--color-primary)] !overflow-hidden !text-ellipsis !max-w-[220px] !text-[14px]">
            @{did}
          </LabelMedium>
        </Link>
      </StatefulPopover>
      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        follow
      />
    </>
  );
}

export default Handle;
