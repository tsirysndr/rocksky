import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useParams } from "react-router";
import { statsAtom } from "../../../atoms/stats";
import Stats from "../../../components/Stats/Stats";
import useProfile from "../../../hooks/useProfile";
import RecentTracks from "./recenttracks";
import TopAlbums from "./topalbums";
import TopArtists from "./topartists";
import TopTracks from "./toptracks";

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
      {stats && <Stats stats={stats} />}
      <RecentTracks />
      <TopArtists />
      <TopAlbums />
      <TopTracks />
    </>
  );
}

export default Overview;
