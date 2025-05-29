import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { HeadingSmall, LabelMedium } from "baseui/typography";
import numeral from "numeral";

const Group = styled.div<{ mb?: number }>`
  display: flex;
  flex-direction: row;
  margin-top: 20px;
  margin-bottom: 50px;
  ${({ mb }) =>
    mb &&
    css`
      margin-bottom: ${mb}px;
    `}
`;

export type StatsProps = {
  stats: {
    scrobbles: number;
    artists: number;
    lovedTracks: number;
  };
  mb?: number;
};

function Stats(props: StatsProps) {
  const { stats, mb } = props;
  return (
    <Group mb={mb}>
      <div className="mr-[20px]">
        <LabelMedium className="!text-[var(--color-text-muted)]">
          SCROBBLES
        </LabelMedium>
        <HeadingSmall margin={0} className="!text-[var(--color-text)]">
          {numeral(stats?.scrobbles).format("0,0")}
        </HeadingSmall>
      </div>
      <div className="mr-[20px]">
        <LabelMedium className="!text-[var(--color-text-muted)]">
          ARTISTS
        </LabelMedium>
        <HeadingSmall margin={0} className="!text-[var(--color-text)]">
          {numeral(stats?.artists).format("0,0")}
        </HeadingSmall>
      </div>
      <div className="mr-[20px]">
        <LabelMedium className="!text-[var(--color-text-muted)]">
          LOVED TRACKS
        </LabelMedium>
        <HeadingSmall margin={0} className="!text-[var(--color-text)]">
          {numeral(stats?.lovedTracks).format("0,0")}
        </HeadingSmall>
      </div>
    </Group>
  );
}

export default Stats;
