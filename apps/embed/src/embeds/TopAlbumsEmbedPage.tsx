import { v4 } from "uuid";
import Header from "../components/Header";
import type { Album } from "../types/album";
import type { Profile } from "../types/profile";

export type TopAlbumEmbedPageProps = {
  profile: Profile;
  albums: Album[];
};

export function TopAlbumsEmbedPage(props: TopAlbumEmbedPageProps) {
  return (
    <div className="p-[15px]">
      <Header profile={props.profile} />
      <h2 className="m-[0px]">Top Albums</h2>

      <div className="w-full overflow-x-auto">
        <table className="table-borderless table">
          <tbody>
            {props.albums.map((album, index) => (
              <tr key={v4()}>
                <td>
                  <div className="flex flex-row items-center">
                    <div className="mr-[20px] min-w-[30px]">{index + 1}</div>
                    <a
                      href={`https://rocksky.app/${album.uri?.split("at://")[1]?.replace("app.rocksky.", "")}`}
                      target="_blank"
                      className="flex flex-row items-center no-underline text-inherit"
                    >
                      {album.albumArt && (
                        <img
                          className="max-w-[60px] max-h-[60px] mr-[20px] rounded-[5px]"
                          src={album.albumArt!}
                        />
                      )}
                      {!album.albumArt && (
                        <div className="w-[60px] h-[60px] bg-[var(--color-avatar-background)] flex items-center justify-center mr-[20px]">
                          <div className="h-[30px] w-[30px]"></div>
                        </div>
                      )}
                      <div>
                        <div>{album.title}</div>
                        <a
                          href={`https://rocksky.app/${album.artistUri.split("at://")[1]?.replace("app.rocksky.", "")}`}
                          target="_blank"
                          className="no-underline text-inherit"
                        >
                          <div className="font-rockford-light opacity-60">
                            {album.artist}
                          </div>
                        </a>
                      </div>
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
