import { css } from "@emotion/react";
import styled from "@emotion/styled";

const Cover = styled.img<{ size?: number }>`
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
  color: #fff;
  font-size: 14px;
  text-decoration-color: rgb(255, 255, 255);
  text-decoration-line: none;
  text-decoration-style: solid;
  text-decoration-thickness: auto;
  background-color: rgb(120 105 131 / 60%);
  text-size-adjust: 100%;
  font-family: RockfordSansRegular;
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
};

function SongCover(props: SongCoverProps) {
  const { title, artist, cover, size } = props;
  return (
    <CoverWrapper>
      <Cover src={cover} size={size} />
      <Metadata>
        <SongTitle>{title}</SongTitle>
        <Artist>{artist}</Artist>
      </Metadata>
    </CoverWrapper>
  );
}

export default SongCover;
