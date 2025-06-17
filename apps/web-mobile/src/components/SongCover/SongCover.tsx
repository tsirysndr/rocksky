import { css } from "@emotion/react";
import styled from "@emotion/styled";

const Cover = styled.img<{ size?: number; maxWith?: boolean }>`
  border-radius: 8px;
  height: 240px;
  width: 240px;
  margin-bottom: 10px;
  ${(props) =>
    props.size &&
    css`
      height: ${props.size}px;
      width: ${props.size}px;
    `}

  ${(props) =>
    props.maxWith &&
    css`
      width: 100%;
    `}
  ${(props) =>
    props.maxWith &&
    css`
      height: initial;
    `}
    ${(props) =>
    props.maxWith &&
    css`
      border-radius: 0px;
    `}
`;

const SongTitle = styled.div`
  color: #fff;
  font-size: 18px;
  text-decoration-color: rgb(255, 255, 255);
  text-decoration-line: none;
  text-decoration-style: solid;
  text-decoration-thickness: auto;
  text-size-adjust: 100%;
  font-weight: 600;
  font-family: RockfordSansRegular;
  text-shadow: rgba(0, 0, 0, 1) 0px 0px 12px;
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
`;

const Metadata = styled.div`
  position: absolute;
  bottom: 15px;
  padding: 15px;
`;

const CoverWrapper = styled.div`
  position: relative;
`;

export type SongCoverProps = {
  cover: string;
  title?: string;
  artist?: string;
  size?: number;
  maxWidth?: boolean;
};

function SongCover(props: SongCoverProps) {
  const { title, artist, cover, size, maxWidth } = props;
  return (
    <CoverWrapper>
      <Cover src={cover} size={size} maxWith={maxWidth} />
      <Metadata>
        <SongTitle>{title}</SongTitle>
        <Artist>{artist}</Artist>
      </Metadata>
    </CoverWrapper>
  );
}

export default SongCover;
