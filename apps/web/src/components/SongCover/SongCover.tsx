import { css } from "@emotion/react";
import styled from "@emotion/styled";
import InteractionBar from "./InteractionBar";
import useLike from "../../hooks/useLike";
import SignInModal from "../SignInModal";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { feedGeneratorUriAtom } from "../../atoms/feed";

const Cover = styled.img<{ size?: number }>`
  border-radius: 8px;
  height: 240px;
  width: 240px;
  margin-bottom: -5px;
  ${(props) =>
    props.size &&
    css`
      height: ${props.size}px;
      width: ${props.size}px;
    `}
`;

const SongTitle = styled.div`
  font-size: 16px;
  text-decoration-line: none;
  text-size-adjust: 100%;
  font-weight: 400;
  font-family: RockfordSansRegular;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 210px;
`;
const Artist = styled.div`
  color: #000;
  font-size: 14px;
  text-decoration-color: rgb(255, 255, 255);
  text-decoration-line: none;
  text-decoration-style: solid;
  text-decoration-thickness: auto;
  background-color: #00fff3;
  text-size-adjust: 100%;
  font-family: RockfordSansRegular;
  width: fit-content;
  padding-left: 2px;
  padding-right: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 210px;
`;

const CoverWrapper = styled.div`
  position: relative;
`;

export type SongCoverProps = {
  cover: string;
  uri?: string;
  title?: string;
  artist?: string;
  size?: number;
  liked?: boolean;
  likesCount?: number;
  withLikeButton?: boolean;
};

function SongCover(props: SongCoverProps) {
  const queryClient = useQueryClient();
  const feedUri = useAtomValue(feedGeneratorUriAtom);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [liked, setLiked] = useState(props.liked);
  const { like, unlike } = useLike();
  const [likesCount, setLikesCount] = useState(props.likesCount);
  const { title, artist, cover, size, uri, withLikeButton } = props;
  const handleLike = async () => {
    if (!uri) return;
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }
    if (liked) {
      setLiked(false);
      if (likesCount !== undefined && likesCount > 0) {
        setLikesCount(likesCount - 1);
      }
      await unlike(uri);
    } else {
      setLiked(true);
      if (likesCount !== undefined) {
        setLikesCount(likesCount + 1);
      }
      await like(uri);
    }

    await queryClient.invalidateQueries({
      queryKey: ["infiniteFeed", feedUri],
    });
  };
  return (
    <CoverWrapper onClick={(e) => e.stopPropagation()}>
      <div className={`relative h-[100%] w-[92%]`}>
        {withLikeButton && (
          <InteractionBar
            liked={!!liked}
            likesCount={likesCount || 0}
            onLike={handleLike}
          />
        )}
        <Cover src={cover} size={size} />
      </div>
      <div className="mb-[13px] mt-[10px]">
        <SongTitle className="!text-[var(--color-text-primary)]">
          {title}
        </SongTitle>
        <Artist>{artist}</Artist>
      </div>
      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        like
      />
    </CoverWrapper>
  );
}

export default SongCover;
