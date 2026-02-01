import Header from "../components/Header";
import type { Profile } from "../types/profile";
import type { Track } from "../types/track";

export type TopTracksEmbedPageProps = {
  profile: Profile;
  tracks: Track[];
};

export function TopTracksEmbedPage(props: TopTracksEmbedPageProps) {
  return (
    <div className="p-[15px]">
      <Header profile={props.profile} />
      <h2 className="m-[0px]">Top Tracks</h2>
    </div>
  );
}
