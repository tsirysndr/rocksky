import styled from "@emotion/styled";
import { HeadingSmall, LabelMedium } from "baseui/typography";
import numeral from "numeral";
import RecentTracks from "./recenttracks";
import TopAlbums from "./topalbums";
import TopArtists from "./topartists";
import TopTracks from "./toptracks";

const Group = styled.div`
  display: flex;
  flex-direction: row;
  margin-top: 20px;
  margin-bottom: 50px;
`;

function Overview() {
  return (
    <>
      <Group>
        <div style={{ marginRight: 20 }}>
          <LabelMedium>SCROBBLES</LabelMedium>
          <HeadingSmall margin={0}>{numeral(21523).format("0,0")}</HeadingSmall>
        </div>
        <div style={{ marginRight: 20 }}>
          <LabelMedium>ARTISTS</LabelMedium>
          <HeadingSmall margin={0}>{numeral(46).format("0,0")}</HeadingSmall>
        </div>
        <div style={{ marginRight: 20 }}>
          <LabelMedium>LOVED TRACKS</LabelMedium>
          <HeadingSmall margin={0}>{numeral(117).format("0,0")}</HeadingSmall>
        </div>
      </Group>

      <RecentTracks />
      <TopArtists />
      <TopAlbums />
      <TopTracks />
    </>
  );
}

export default Overview;
