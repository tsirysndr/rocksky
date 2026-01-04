import { HeadingSmall, LabelMedium, LabelSmall } from "baseui/typography";
import {
  useActorNeighboursQuery,
  useProfileByDidQuery,
} from "../../../hooks/useProfile";
import { Link, useParams } from "@tanstack/react-router";
import { Neighbour } from "../../../types/neighbour";
import { Avatar } from "baseui/avatar";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { Button } from "baseui/button";
import { useAtom } from "jotai";
import { followsAtom } from "../../../atoms/follows";
import {
  useFollowAccountMutation,
  useUnfollowAccountMutation,
} from "../../../hooks/useGraph";
import { useState } from "react";
import SignInModal from "../../../components/SignInModal";
import { activeTabAtom } from "../../../atoms/tab";

function Circles() {
  const [, setActiveKey] = useAtom(activeTabAtom);
  const [follows, setFollows] = useAtom(followsAtom);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const { did } = useParams({ strict: false });
  const profile = useProfileByDidQuery(did!);
  const { data, isLoading } = useActorNeighboursQuery(did!);
  const { mutate: followAccount } = useFollowAccountMutation();
  const { mutate: unfollowAccount } = useUnfollowAccountMutation();

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

  return (
    <>
      <HeadingSmall className="!text-[var(--color-text)] mb-[15px]">
        Circles
      </HeadingSmall>
      <p>
        People on Rocksky with similar music taste to @{profile.data?.handle}
      </p>
      {!isLoading && data?.neighbours.length === 0 && (
        <div className="mt-[40px] text-center py-[60px]">
          <LabelMedium className="!text-[var(--color-text-muted)]">
            No circles found yet. Check back later!
          </LabelMedium>
        </div>
      )}
      {!isLoading && (data?.neighbours || []).length > 0 && (
        <div className="mt-[40px]">
          {data?.neighbours.map((neighbour: Neighbour) => (
            <div
              key={neighbour.did}
              className="flex items-start justify-between gap-2 mb-[40px]"
            >
              <div className="flex items-center gap-2">
                <Link
                  to={`/profile/${neighbour.handle}` as string}
                  className="no-underline mt-[10px]"
                  onClick={() => setActiveKey(0)}
                >
                  <Avatar
                    src={neighbour.avatar}
                    name={neighbour.displayName}
                    size={"60px"}
                  />
                </Link>
                <div className="ml-[16px]">
                  <div className="flex ">
                    <Link
                      to={`/profile/${neighbour.handle}` as string}
                      className="no-underline"
                      onClick={() => setActiveKey(0)}
                    >
                      <LabelMedium
                        marginTop={"0px"}
                        className="!text-[var(--color-text)]"
                      >
                        {neighbour.displayName}
                      </LabelMedium>
                    </Link>
                    <a
                      href={`https://bsky.app/profile/${neighbour.handle}`}
                      className="no-underline text-[var(--color-primary)] ml-[5px]"
                      target="_blank"
                    >
                      <LabelSmall className="!text-[var(--color-primary)] mt-[3px] mb-[5px]">
                        @{neighbour.handle}
                      </LabelSmall>
                    </a>
                  </div>
                  <p className="mt-[0px] mb-[0px] text-[14px]">
                    They both listen to{" "}
                    {neighbour.topSharedArtistsDetails.map((artist, index) => (
                      <div key={artist.id} className="inline">
                        <a
                          href={`/${artist.uri.split("at://")[1].replace("app.rocksky.", "")}`}
                          className="no-underline"
                        >
                          <span className="mt-[0px] mb-[0px] text-[14px] !text-[var(--color-primary)]">
                            {artist.name}
                          </span>
                        </a>
                        {index !==
                          neighbour.topSharedArtistsDetails.length - 1 &&
                          (index ===
                          neighbour.topSharedArtistsDetails.length - 2
                            ? " and "
                            : ", ")}
                      </div>
                    ))}
                  </p>
                </div>
              </div>
              {(neighbour.did !== localStorage.getItem("did") ||
                !localStorage.getItem("did")) && (
                <div className="ml-[10px] mt-[10px]">
                  {!follows.has(neighbour.did) && (
                    <Button
                      shape="pill"
                      size="mini"
                      startEnhancer={<IconPlus size={16} />}
                      onClick={() => onFollow(neighbour.did)}
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
                  {follows.has(neighbour.did) && (
                    <Button
                      shape="pill"
                      size="mini"
                      startEnhancer={<IconCheck size={16} />}
                      onClick={() => onUnfollow(neighbour.did)}
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

export default Circles;
