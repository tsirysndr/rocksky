import type { Profile } from "../types/profile";
import type { Scrobble } from "../types/scrobble";

export type RecentScrobblesEmbedPageProps = {
  profile: Profile;
  scrobbles: Scrobble[];
};

export function RecentScrobblesEmbedPage(props: RecentScrobblesEmbedPageProps) {
  return (
    <div className="p-[15px]">
      <h2 className="m-[0px]">Recent Listens</h2>
    </div>
  );
}
