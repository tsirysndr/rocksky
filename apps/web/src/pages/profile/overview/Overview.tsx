import { useParams } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { statsAtom } from "../../../atoms/stats";
import Stats from "../../../components/Stats/Stats";
import { useProfileStatsByDidQuery } from "../../../hooks/useProfile";
import RecentTracks from "./recenttracks";
import TopAlbums from "./topalbums";
import TopArtists from "./topartists";
import TopTracks from "./toptracks";
import Compatibility from "./compatibility";

function Overview() {
  const { did } = useParams({ strict: false });
  const profileStats = useProfileStatsByDidQuery(did!);
  const setStats = useSetAtom(statsAtom);
  const stats = useAtomValue(statsAtom);

  useEffect(() => {
    if (profileStats.isLoading || profileStats.isError) {
      return;
    }

    if (!profileStats.data || !did) {
      return;
    }

    setStats((prev) => ({
      ...prev,
      [did]: {
        scrobbles: profileStats.data.scrobbles,
        artists: profileStats.data.artists,
        lovedTracks: profileStats.data.lovedTracks,
        albums: profileStats.data.albums,
        tracks: profileStats.data.tracks,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileStats.data, profileStats.isLoading, profileStats.isError, did]);

  return (
    <>
      <div className="flex flex-row mb-[50px]">
        {did && stats[did] && <Stats stats={stats[did]} />}
        <div className="flex-1">
          <Compatibility />
        </div>
      </div>
      <div className="mb-20">
        <RecentTracks />
      </div>
      <div className="mb-20">
        <TopArtists />
      </div>
      <div className="mb-20">
        <TopAlbums />
      </div>
      <div className="mb-20">
        <TopTracks />
      </div>
    </>
  );
}

export default Overview;
