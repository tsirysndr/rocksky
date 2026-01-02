import { HeadingSmall, LabelMedium, LabelSmall } from "baseui/typography";
import {
  useFollowAccountMutation,
  useFollowersInfiniteQuery,
  useFollowsQuery,
  useUnfollowAccountMutation,
} from "../../../hooks/useGraph";
import { useProfileByDidQuery } from "../../../hooks/useProfile";
import { Link, useParams } from "@tanstack/react-router";
import { Avatar } from "baseui/avatar";
import { useAtom } from "jotai";
import { activeTabAtom } from "../../../atoms/tab";
import { followsAtom } from "../../../atoms/follows";
import { Button } from "baseui/button";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import SignInModal from "../../../components/SignInModal";
import { useState, useEffect, useRef } from "react";
import numeral from "numeral";

function Followers() {
  const [, setActiveKey] = useAtom(activeTabAtom);
  const [follows, setFollows] = useAtom(followsAtom);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const { did } = useParams({ strict: false });
  const profile = useProfileByDidQuery(did!);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFollowersInfiniteQuery(profile.data?.did!, 20);
  const { mutate: followAccount } = useFollowAccountMutation();
  const { mutate: unfollowAccount } = useUnfollowAccountMutation();

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allFollowers = data?.pages.flatMap((page) => page.followers) ?? [];

  const { data: followsData } = useFollowsQuery(
    localStorage.getItem("did")!,
    allFollowers.length,
    allFollowers
      .map((follower) => follower.did)
      .filter((x) => x !== localStorage.getItem("did")),
  );

  useEffect(() => {
    if (!followsData) return;
    setFollows((prev) => {
      const newSet = new Set(prev);
      followsData.follows.forEach((follow: { did: string }) => {
        newSet.add(follow.did);
      });
      return newSet;
    });
  }, [followsData, setFollows]);

  const onFollow = (followerDid: string) => {
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }
    setFollows((prev) => new Set(prev).add(followerDid));
    followAccount(followerDid);
  };

  const onUnfollow = (followerDid: string) => {
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }
    setFollows((prev) => {
      const newSet = new Set(prev);
      newSet.delete(followerDid);
      return newSet;
    });
    unfollowAccount(followerDid);
  };

  const count = data?.pages?.flatMap((page) => page.count)[0];

  return (
    <>
      <HeadingSmall className="!text-[var(--color-text)]">
        Followers {count > 0 ? `(${numeral(count).format("0,0")})` : ""}
      </HeadingSmall>

      {allFollowers.length === 0 && data && (
        <div className="text-center py-8">
          <LabelMedium className="!text-[var(--color-text)] opacity-60">
            No followers yet
          </LabelMedium>
        </div>
      )}

      {allFollowers.length > 0 && (
        <div>
          {allFollowers.map((follower: any) => (
            <div
              key={follower.did}
              className="flex items-start justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <Link
                  to={`/profile/${follower.handle}` as any}
                  className="no-underline"
                  onClick={() => setActiveKey(0)}
                >
                  <Avatar
                    src={follower.avatar}
                    name={follower.displayName}
                    size={"60px"}
                  />
                </Link>
                <div className="ml-[16px]">
                  <Link
                    to={`/profile/${follower.handle}` as any}
                    className="no-underline"
                    onClick={() => setActiveKey(0)}
                  >
                    <LabelMedium
                      marginTop={"10px"}
                      className="!text-[var(--color-text)]"
                    >
                      {follower.displayName}
                    </LabelMedium>
                  </Link>
                  <a
                    href={`https://bsky.app/profile/${follower.handle}`}
                    className="no-underline text-[var(--color-primary)]"
                    target="_blank"
                  >
                    <LabelSmall className="!text-[var(--color-primary)] mt-[3px] mb-[25px]">
                      @{follower.handle}
                    </LabelSmall>
                  </a>
                </div>
              </div>
              {(follower.did !== localStorage.getItem("did") ||
                !localStorage.getItem("did")) && (
                <div className="ml-auto mt-[10px]">
                  {!follows.has(follower.did) && (
                    <Button
                      shape="pill"
                      size="mini"
                      startEnhancer={<IconPlus size={16} />}
                      onClick={() => onFollow(follower.did)}
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
                  {follows.has(follower.did) && (
                    <Button
                      shape="pill"
                      size="mini"
                      startEnhancer={<IconCheck size={16} />}
                      onClick={() => onUnfollow(follower.did)}
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
          ))}

          {/* Infinite scroll trigger */}
          <div ref={loadMoreRef} className="h-[20px] w-full" />

          {isFetchingNextPage && (
            <div className="text-center py-4">
              <LabelSmall className="!text-[var(--color-text)]">
                Loading more...
              </LabelSmall>
            </div>
          )}
        </div>
      )}
      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        follow
      />
    </>
  );
}

export default Followers;
