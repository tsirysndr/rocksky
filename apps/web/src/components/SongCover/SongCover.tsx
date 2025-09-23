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
	title?: string;
	artist?: string;
	size?: number;
};

function SongCover(props: SongCoverProps) {
	const { title, artist, cover, size } = props;
	return (
		<CoverWrapper>
			<Cover src={cover} size={size} />
			<div className="mb-[13px]">
				<SongTitle className="!text-[var(--color-text-primary)]">
					{title}
				</SongTitle>
				<Artist>{artist}</Artist>
			</div>
		</CoverWrapper>
	);
}

export default SongCover;
