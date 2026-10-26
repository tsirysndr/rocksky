import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { IconMusic } from "@tabler/icons-react";
import InteractionBar from "./InteractionBar";
import useLike from "../../hooks/useLike";
import SignInModal from "../SignInModal";
import { useEffect, useState } from "react";

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
  cover?: string | null;
  uri?: string;
  title?: string;
  artist?: string;
  size?: number;
  liked?: boolean;
  likesCount?: number;
  withLikeButton?: boolean;
};

function SongCover(props: SongCoverProps) {
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [liked, setLiked] = useState(props.liked);
  const { like, unlike } = useLike();
  const [likesCount, setLikesCount] = useState(props.likesCount);
  const { title, artist, cover, size, uri, withLikeButton } = props;
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setLiked(props.liked);
    setLikesCount(props.likesCount);
  }, [uri, props.liked, props.likesCount]);
  const handleLike = async () => {
    if (!uri) return;
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }
    if (pending) return;
    setPending(true);
    setLiked(!liked);
    if (likesCount !== undefined) setLikesCount(Math.max(0, likesCount + (liked ? -1 : 1)));
    try {
      await (liked ? unlike(uri) : like(uri));
    } catch {
      setLiked(liked);
      setLikesCount(likesCount);
    } finally {
      setPending(false);
    }
  };
  return (
    <CoverWrapper>
      <div className={`relative h-[100%] w-[92%]`}>
        {withLikeButton && (
          <InteractionBar
            liked={!!liked}
            likesCount={likesCount || 0}
            onLike={handleLike}
          />
        )}
        {cover ? (
          <Cover src={cover} size={size} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("style"); }} />
        ) : null}
        <div
          style={{ display: cover ? "none" : "flex", width: size ?? 240, height: size ?? 240 }}
          className="rounded-[8px] bg-[var(--color-menu-hover)] items-center justify-center text-[var(--color-text-muted)] text-4xl"
        >
          {/* Scale with the cover: a fixed 32px icon is lost in a 240px tile. */}
          <IconMusic size={Math.round((size ?? 240) * 0.32)} />
        </div>
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
