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
      setStats((prev) => ({
        ...prev,
        [did]: {
          scrobbles: stats.scrobbles,
          artists: stats.artists,
          lovedTracks: stats.lovedTracks,
        },
      }));
    };

    getProfileStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);

  return (
    <>
      {did && stats[did] && <Stats stats={stats[did]} />}
      <RecentTracks />
      <TopArtists />
      <TopAlbums />
      <TopTracks />
    </>
  );
}

export default Overview;
