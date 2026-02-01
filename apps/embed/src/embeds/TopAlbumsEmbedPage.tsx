import type { Album } from "../types/album";
import type { Profile } from "../types/profile";

export type TopAlbumEmbedPageProps = {
  profile: Profile;
  albums: Album[];
};

export function TopAlbumsEmbedPage(props: TopAlbumEmbedPageProps) {
  return (
    <div className="p-[15px]">
      <h2 className="m-[0px]">Top Albums</h2>
    </div>
  );
}
