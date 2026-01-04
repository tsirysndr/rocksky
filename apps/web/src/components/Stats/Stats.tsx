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
    <Group mb={mb} className="!mb-[0px]">
      <div className="mr-[20px]">
        <b className="!text-[var(--color-text-muted)] text-[13px]">SCROBBLES</b>
        <HeadingSmall margin={0} className="!text-[var(--color-text)]">
          {numeral(stats?.scrobbles).format("0,0")}
        </HeadingSmall>
      </div>
      <div className="mr-[20px]">
        <b className="!text-[var(--color-text-muted)] text-[13px]">ARTISTS</b>
        <HeadingSmall margin={0} className="!text-[var(--color-text)]">
          {numeral(stats?.artists).format("0,0")}
        </HeadingSmall>
      </div>
      <div>
        <b className="!text-[var(--color-text-muted)] text-[13px]">
          LOVED TRACKS
        </b>
        <HeadingSmall margin={0} className="!text-[var(--color-text)]">
          {numeral(stats?.lovedTracks).format("0,0")}
        </HeadingSmall>
      </div>
    </Group>
  );
}

export default Stats;
