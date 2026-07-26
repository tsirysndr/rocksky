import styled from "@emotion/styled";
import { Ellipsis } from "@styled-icons/fa-solid";
import { ArrowReplyDown } from "@styled-icons/fluentui-system-filled";
import { Link as DefaultLink } from "@tanstack/react-router";
import { ListItem } from "baseui/list";
import { NestedMenus, StatefulMenu } from "baseui/menu";
import { PLACEMENT, StatefulPopover } from "baseui/popover";
import { StatefulTooltip } from "baseui/tooltip";
import { LabelMedium, LabelSmall } from "baseui/typography";
import dayjs from "dayjs";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { profileAtom } from "../../../../atoms/profile";
import { type GifEmbed, isVideoUrl } from "../../../../api/klipy";
import type { Mention } from "../../../../lib/richtext";
import useLike from "../../../../hooks/useLike";
import useShout from "../../../../hooks/useShout";
import RichText from "../../RichText";
import HeartOutline from "../../../Icons/HeartOutline";
import SignInModal from "../../../SignInModal";
import DeleteShoutModal from "./DeleteShoutModal";
import ReplyModal from "./ReplyModal";
import scrollToTop from "../../../../lib/scrollToTop";

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const Header = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const Message = styled.p`
  font-family: RockfordSansLight;
  margin-top: 3px;
  margin-bottom: 0px;
`;

const ReplyLabel = styled.span`
  color: inherit;
  margin-left: 5px;
`;

const ReplyButton = styled.div`
  color: rgba(66, 87, 108, 0.65);
`;

const LikeButton = styled.div`
  color: rgba(66, 87, 108, 0.65);
  margin-left: 10px;
`;

const Actions = styled.div`
  display: flex;
  flex-direction: row;
  margin-top: 10px;
  cursor: pointer;
  align-items: center;
`;

const Undo = styled.span`
  color: rgb(255, 40, 118);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

const MediaEmbed = styled.div`
  margin-top: 8px;
  width: fit-content;
  max-width: 260px;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--color-input-background);

  & > img,
  & > video {
    display: block;
    width: 100%;
    height: auto;
  }
`;

interface ShoutProps {
  shout: {
    uri: string;
    message: string;
    date: string;
    liked: boolean;
    reported: boolean;
    likes: number;
    gif?: GifEmbed;
    facets?: Mention[];
    user: {
      did: string;
      avatar: string;
      displayName: string;
      handle: string;
    };
  };
  refetch: () => Promise<void>;
}

function Shout(props: ShoutProps) {
  const { shout, refetch } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const { like, unlike } = useLike();
  const [liked, setLiked] = useState(shout.liked);
  const [likes, setLikes] = useState(shout.likes);
  const profile = useAtomValue(profileAtom);
  const { reportShout, cancelReport } = useShout();

  const onReply = () => {
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }
    setIsOpen(true);
  };

  const onLike = async () => {
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }

    if (liked) {
      setLiked(false);
      setLikes(likes - 1);
      await onUnlike();
      await refetch();
      return;
    }

    setLiked(true);
    setLikes(likes + 1);
    await like(shout.uri);
    await refetch();
  };

  const onUnlike = async () => {
    await unlike(shout.uri);
  };

  const onReport = async () => {
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }

    await reportShout(shout.uri);
    await refetch();
  };

  const onCancelReport = async () => {
    await cancelReport(shout.uri);
    await refetch();
  };

  return (
    <div style={{ marginBottom: 40 }}>
      <ListItem
        overrides={{
          Root: {
            style: {
              display: "flex",
              alignItems: "start",
              backgroundColor: "var(--color-background)",
            },
          },
        }}
        artwork={
          !shout.reported
            ? () => (
                <div>
                  <Link to={`/profile/${shout.user.handle}`}>
                    <img
                      src={shout.user.avatar}
                      className="w-[65px] h-[65px] rounded-full"
                    />
                  </Link>
                </div>
              )
            : undefined
        }
      >
        {shout.reported && (
          <span>
            You have reported this message.{" "}
            <Undo onClick={onCancelReport}>Undo</Undo>
          </span>
        )}
        {!shout.reported && (
          <div className="ml-[20px] w-full">
            <Header>
              <div>
                <Link
                  to={`/profile/${shout.user.handle}`}
                  className="flex no-underline"
                  style={{ textDecoration: "none" }}
                  onClick={() => scrollToTop()}
                >
                  <LabelMedium className="!text-[var(--color-text)] no-underline">
                    {shout.user.displayName}
                  </LabelMedium>
                  <LabelSmall
                    className="ml-[5px] mt-[4px] no-underline !text-[var(--color-text-muted)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    @{shout.user.handle}
                  </LabelSmall>
                </Link>
              </div>
              <div>
                <StatefulTooltip
                  content={dayjs(shout.date).format(
                    "MMMM D, YYYY [at] HH:mm A",
                  )}
                  returnFocus
                  autoFocus
                >
                  <LabelMedium
                    className="!text-[var(--color-text-muted)] text-[14px]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {dayjs(shout.date).fromNow()}
                  </LabelMedium>
                </StatefulTooltip>
              </div>
            </Header>
            {shout.message && (
              <Message>
                <RichText facets={shout.facets}>{shout.message}</RichText>
              </Message>
            )}

            {shout.gif && (
              <MediaEmbed>
                {isVideoUrl(shout.gif.url) ? (
                  <video
                    src={shout.gif.url}
                    poster={shout.gif.previewUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={shout.gif.previewUrl ?? shout.gif.url}
                    alt={shout.gif.alt ?? ""}
                  />
                )}
              </MediaEmbed>
            )}

            <Actions>
              <ReplyButton onClick={onReply}>
                <ArrowReplyDown
                  size={28}
                  className="!text-[var(--color-text-muted)]"
                />
                <ReplyLabel className="!text-[var(--color-text-muted)]">
                  Reply
                </ReplyLabel>
              </ReplyButton>
              <LikeButton onClick={onLike}>
                {!liked && <HeartOutline color="var(--color-text-muted)" />}
                {liked && <HeartOutline color="var(--color-primary)" />}
              </LikeButton>
              {likes > 0 && (
                <span
                  style={{
                    color: liked
                      ? "var(--color-primary)"
                      : "var(--color-text-muted)",
                    marginLeft: 5,
                    marginTop: -5,
                  }}
                >
                  {likes}
                </span>
              )}
              <div className="flex flex-1 justify-end">
                <StatefulPopover
                  placement={PLACEMENT.bottomRight}
                  overrides={{
                    Body: {
                      style: {
                        zIndex: 2,
                        boxShadow: "none",
                      },
                    },
                  }}
                  content={({ close }) => (
                    <div>
                      <NestedMenus>
                        <StatefulMenu
                          items={
                            profile?.did === shout.user.did
                              ? [
                                  {
                                    id: "delete",
                                    label: <LabelMedium>Delete</LabelMedium>,
                                  },
                                  {
                                    id: "report",
                                    label: (
                                      <LabelMedium>
                                        Report this shout
                                      </LabelMedium>
                                    ),
                                  },
                                ]
                              : [
                                  {
                                    id: "report",
                                    label: (
                                      <LabelMedium>
                                        Report this shout
                                      </LabelMedium>
                                    ),
                                  },
                                ]
                          }
                          onItemSelect={({ item }) => {
                            switch (item.id) {
                              case "delete":
                                setIsDeleteOpen(true);
                                break;
                              case "report":
                                onReport();
                                break;
                              default:
                                break;
                            }
                            close();
                          }}
                          overrides={{
                            List: { style: { width: "200px" } },
                          }}
                        />
                      </NestedMenus>
                    </div>
                  )}
                >
                  <button className="border-none cursor-pointer bg-[var(--color-background)]">
                    <Ellipsis
                      size={20}
                      style={{
                        color: "var(--color-text-muted)",
                        marginTop: -7,
                      }}
                    />
                  </button>
                </StatefulPopover>
              </div>
            </Actions>
          </div>
        )}
      </ListItem>
      <ReplyModal
        isOpen={isOpen}
        close={() => {
          setIsOpen(false);
        }}
        shout={shout}
      />
      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
      />
      <DeleteShoutModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        shoutUri={shout.uri}
        refetch={refetch}
      />
    </div>
  );
}

export default Shout;
