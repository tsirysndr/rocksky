import styled from "@emotion/styled";
import { ArrowReplyDown } from "@styled-icons/fluentui-system-filled";
import { ListItem } from "baseui/list";
import { StatefulTooltip } from "baseui/tooltip";
import { LabelMedium } from "baseui/typography";
import dayjs from "dayjs";
import { useState } from "react";
import { Link as DefaultLink } from "react-router";
import useLike from "../../../../hooks/useLike";
import HeartOutline from "../../../Icons/HeartOutline";
import SignInModal from "../../../SignInModal";
import ReplyModal from "./ReplyModal";

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

interface ShoutProps {
  shout: {
    uri: string;
    message: string;
    date: string;
    liked: boolean;
    likes: number;
    user: {
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
  const { like, unlike } = useLike();
  const [liked, setLiked] = useState(shout.liked);
  const [likes, setLikes] = useState(shout.likes);

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

    if (shout.liked) {
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

  return (
    <div style={{ marginBottom: 40 }}>
      <ListItem
        overrides={{
          Root: {
            style: {
              display: "flex",
              alignItems: "start",
            },
          },
        }}
        artwork={(props) => (
          <div {...props}>
            <Link to={`/profile/${shout.user.handle}`}>
              <img
                src={shout.user.avatar}
                style={{
                  width: 65,
                  height: 65,
                  borderRadius: 35,
                }}
              />
            </Link>
          </div>
        )}
      >
        <div style={{ marginLeft: 20, width: "100%" }}>
          <Header>
            <div>
              <Link to={`/profile/${shout.user.handle}`}>
                <LabelMedium>{shout.user.displayName}</LabelMedium>
              </Link>
            </div>
            <div>
              <StatefulTooltip
                content={dayjs(shout.date).format("MMMM D, YYYY [at] HH:mm A")}
                returnFocus
                autoFocus
              >
                <LabelMedium
                  style={{
                    color: "rgba(66, 87, 108, 0.65)",
                    fontSize: "14px",
                  }}
                >
                  {dayjs(shout.date).fromNow()}
                </LabelMedium>
              </StatefulTooltip>
            </div>
          </Header>
          <Message>{shout.message}</Message>

          <Actions>
            <ReplyButton onClick={onReply}>
              <ArrowReplyDown size={28} style={{ color: "inherit" }} />
              <ReplyLabel>Reply</ReplyLabel>
            </ReplyButton>
            <LikeButton onClick={onLike}>
              {!liked && <HeartOutline color="rgba(66, 87, 108, 0.65)" />}
              {liked && <HeartOutline color="#ff2876" />}
            </LikeButton>
            {likes > 0 && (
              <span
                style={{
                  color: liked ? "#ff2876" : "rgba(66, 87, 108, 0.65)",
                  marginLeft: 5,
                  marginTop: -5,
                }}
              >
                {likes}
              </span>
            )}
          </Actions>
        </div>
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
    </div>
  );
}

export default Shout;
