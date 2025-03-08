import styled from "@emotion/styled";
import { HeadingSmall, LabelMedium } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import { useEffect } from "react";
import { useParams } from "react-router";
import { statsAtom } from "../../../atoms/stats";
import useProfile from "../../../hooks/useProfile";
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
  const { did } = useParams<{ did: string }>();
  const { getProfileStatsByDid } = useProfile();
  const setStats = useSetAtom(statsAtom);
  const stats = useAtomValue(statsAtom);

  useEffect(() => {
    if (!did) {
      return;
    }

    const getProfileStats = async () => {
      const stats = await getProfileStatsByDid(did);
      setStats(stats);
    };

    getProfileStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);

  return (
    <>
      {stats && (
        <Group>
          <div style={{ marginRight: 20 }}>
            <LabelMedium>SCROBBLES</LabelMedium>
            <HeadingSmall margin={0}>
              {numeral(stats?.scrobbles).format("0,0")}
            </HeadingSmall>
          </div>
          <div style={{ marginRight: 20 }}>
            <LabelMedium>ARTISTS</LabelMedium>
            <HeadingSmall margin={0}>
              {numeral(stats?.artists).format("0,0")}
            </HeadingSmall>
          </div>
          <div style={{ marginRight: 20 }}>
            <LabelMedium>LOVED TRACKS</LabelMedium>
            <HeadingSmall margin={0}>
              {numeral(stats?.lovedTracks).format("0,0")}
            </HeadingSmall>
          </div>
        </Group>
      )}

      <RecentTracks />
      <TopArtists />
      <TopAlbums />
      <TopTracks />
    </>
  );
}

export default Overview;
